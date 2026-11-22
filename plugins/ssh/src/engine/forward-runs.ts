import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import type { ForwardRevision, ForwardRule, ForwardRun, SaveForward } from "../shared/forwarding.js";
import type { ConnectionStatus } from "../shared/trust.js";
import { ForwardListener } from "./forward-listener.js";
import type { ForwardRules, ForwardRuleScope } from "./forward-rules.js";
import type { ForwardLease, SshManager } from "./manager.js";

type Run = {
  view: ForwardRun;
  rule: ForwardRule;
  abort: AbortController;
  task?: Promise<void>;
  closing?: Promise<void>;
  lease?: ForwardLease;
  listener?: ForwardListener;
  offTransport?: () => void;
  routeIdentity?: string;
  lost?: boolean;
};

const live = new Set<ForwardRun["state"]>(["starting", "waiting", "running", "stopping", "stop-failed"]);
const empty = { active: 0, accepted: 0, uploaded: 0, downloaded: 0 };
const reason = (error: unknown) => (error instanceof Error ? error.message : "转发操作失败");
const publicForwardRun = (run: ForwardRun) => ({
  id: run.id,
  ruleId: run.ruleId,
  revision: run.revision,
  state: run.state,
  listener: run.listener,
  connectionKind: run.connection?.kind,
  active: run.active,
  accepted: run.accepted,
  uploaded: run.uploaded,
  downloaded: run.downloaded,
});

export class ForwardRuns {
  private readonly runs = new Map<string, Run>();
  private tail: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly rules: ForwardRules,
    private readonly manager: SshManager,
    private readonly changed: (id: string) => void,
  ) {}

  list() {
    return [...this.runs.values()].map((run) => this.snapshot(run));
  }

  visibleRuns(rules: ReadonlyMap<string, { revision: string; connectionIdentity: string }>) {
    return [...this.runs.values()].flatMap((run) => {
      const rule = rules.get(run.rule.id);
      if (!rule || rule.revision !== run.rule.revision || rule.connectionIdentity !== run.routeIdentity) return [];
      return [publicForwardRun(this.snapshot(run))];
    });
  }

  save(input: SaveForward, signal: AbortSignal, scope?: ForwardRuleScope) {
    return this.serial(async () => {
      const saved = await this.rules.save(input, signal, (old) => this.stopRule(old), scope && this.inactiveScope(scope));
      this.runs.delete(saved.id);
      return saved;
    });
  }

  delete(input: ForwardRevision, signal: AbortSignal, scope?: ForwardRuleScope) {
    return this.serial(async () => {
      const result = await this.rules.delete(input, signal, (old) => this.stopRule(old), scope && this.inactiveScope(scope));
      this.runs.delete(input.id);
      return result;
    });
  }

  private inactiveScope(scope: ForwardRuleScope): ForwardRuleScope {
    return (rule) => {
      scope(rule);
      const run = this.runs.get(rule.id);
      if (run && (live.has(run.view.state) || run.view.state === "interrupted" || run.lease)) throw errors.permissionDenied("转发规则仍在使用");
    };
  }

  start(input: ForwardRevision, signal: AbortSignal, resume = false) {
    return this.serial(async () => {
      signal.throwIfAborted();
      if (this.disposed) throw errors.notFound("转发规则所属 Vault 已关闭");
      const rule = this.rules.require(input);
      const previous = this.runs.get(rule.id);
      if (previous && live.has(previous.view.state)) {
        if (previous.view.state === "stop-failed") throw errors.invalidInput("请先确认旧实例已释放监听");
        return this.snapshot(previous);
      }
      if (resume ? !rule.resume || previous?.view.state !== "interrupted" : previous?.view.state === "interrupted") throw errors.invalidInput("请使用当前规则允许的启动或恢复操作");
      if ([...this.runs.values()].filter((run) => live.has(run.view.state)).length >= 32) throw errors.invalidInput("最多允许运行 32 条转发规则");
      const view: ForwardRun = { id: randomUUID(), ruleId: rule.id, revision: rule.revision, state: "starting", ...empty };
      const run: Run = { view, rule, abort: new AbortController() };
      this.runs.set(rule.id, run);
      this.changed(rule.id);
      run.task = this.launch(run);
      return this.snapshot(run);
    });
  }

  stop(input: ForwardRevision, signal: AbortSignal) {
    return this.serial(async () => {
      signal.throwIfAborted();
      const rule = this.rules.require(input);
      return this.stopRule(rule);
    });
  }

  dispose() {
    this.disposed = true;
    for (const run of this.runs.values()) {
      run.abort.abort();
      run.lost = true;
      void Promise.resolve(run.task)
        .then(() => this.close(run))
        .catch(() => undefined);
    }
  }

  private serial<T>(operation: () => Promise<T>) {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private snapshot(run: Run): ForwardRun {
    const { view, listener, lease } = run;
    return {
      ...view,
      ...listener?.stats(),
      ...(lease && { connection: { id: lease.id, kind: lease.kind, holders: lease.holders() } }),
    };
  }

  private update(run: Run, patch: Partial<ForwardRun>) {
    Object.assign(run.view, patch);
    if (!this.disposed) this.changed(run.rule.id);
  }

  private async launch(run: Run): Promise<void> {
    const { rule, abort } = run;
    const report = (status: ConnectionStatus) => {
      if (abort.signal.aborted) return;
      if (status.state === "waiting") this.update(run, { state: "waiting", prompt: status.prompt });
      else if (status.state === "key-changed") this.update(run, { state: "starting", prompt: status.prompt, message: "主机密钥发生变化，已拒绝连接" });
      else this.update(run, { state: "starting", prompt: undefined });
    };
    try {
      const lease = await this.manager.acquireForward(rule.hostId, rule.boundTarget, abort.signal, report);
      if (abort.signal.aborted) {
        lease.release();
        return;
      }
      run.lease = lease;
      run.routeIdentity = lease.routeIdentity;
      const disconnected = () => {
        run.lost = true;
        void this.serial(async () => {
          const phase = run.view.state;
          if (phase !== "running" && phase !== "stop-failed") return;
          await this.close(run);
          this.update(run, { state: phase === "running" && rule.resume ? "interrupted" : "stopped", listener: undefined, message: "原 SSH 连接或跳板已断开，监听已释放" });
        }).catch(() => undefined);
      };
      lease.client.once("close", disconnected);
      run.offTransport = () => lease.client.off("close", disconnected);
      const listener = new ForwardListener(rule, lease.client);
      run.listener = listener;
      const listenerView = await listener.open(abort.signal);
      await lease.validate();
      abort.signal.throwIfAborted();
      if (run.lost) throw new HuhuError("SSH_DISCONNECTED", "原转发连接已关闭");
      listener.enable();
      this.update(run, { state: "running", prompt: undefined, message: undefined, listener: listenerView });
    } catch (error) {
      if (abort.signal.aborted) return;
      try {
        await this.close(run);
        this.update(run, { state: "failed", message: reason(error) });
      } catch (cleanup) {
        this.update(run, { state: "stop-failed", message: `${reason(error)}。${reason(cleanup)}` });
      }
    }
  }

  private async stopRule(rule: ForwardRule): Promise<ForwardRun | null> {
    const run = this.runs.get(rule.id);
    if (!run) return null;
    if (!live.has(run.view.state) && run.view.state !== "interrupted") return this.snapshot(run);
    this.update(run, { state: "stopping", prompt: undefined });
    run.abort.abort();
    await run.task;
    try {
      await this.close(run);
    } catch (error) {
      this.update(run, { state: "stop-failed", message: reason(error) });
      throw error;
    }
    this.update(run, { state: "stopped", listener: undefined, message: undefined });
    return this.snapshot(run);
  }

  private close(run: Run) {
    run.closing ??= this.closeResources(run).finally(() => {
      delete run.closing;
    });
    return run.closing;
  }

  private async closeResources(run: Run) {
    const { listener, lease } = run;
    try {
      await listener?.close(run.lost);
    } catch (error) {
      if (!run.lost && !(lease?.kind === "dedicated" && lease.holders() === 1)) throw error;
      await listener?.close(true);
    }
    if (lease) {
      run.offTransport?.();
      lease.release();
      run.view.connection = { id: lease.id, kind: lease.kind, holders: 0 };
      delete run.lease;
      delete run.offTransport;
    }
  }
}
