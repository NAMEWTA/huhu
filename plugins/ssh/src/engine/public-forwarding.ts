import { randomUUID } from "node:crypto";
import { CapabilityIntentKeySchema, errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext, HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { ForwardRevision, type ForwardRun } from "../shared/forwarding.js";
import { ForwardListener } from "./forward-listener.js";
import type { ForwardRules } from "./forward-rules.js";
import type { HostIntents } from "./host-intents.js";
import { OwnedConnection, type PublicSshProbes } from "./public-probes.js";
import { assertSshHosts, externalSshOwner, hasSshHosts, readBoundRoute, selectedSshHosts } from "./public-resources.js";

const intentKey = CapabilityIntentKeySchema;
export const RunId = z.strictObject({ runId: z.uuid() });
export const StartOwnedForward = ForwardRevision.extend({ ...OwnedConnection.shape, intentKey });
export const ResumeOwnedForward = StartOwnedForward.extend(RunId.shape);
export const StopOwnedForward = ForwardRevision.extend({ ...RunId.shape, intentKey });
const Receipt = z.strictObject({ id: z.uuid() });
const live = new Set<ForwardRun["state"]>(["starting", "running", "stopping"]);

type Owned = {
  owner: string;
  binding: z.infer<typeof OwnedConnection>;
  hostIds: readonly string[];
  authorized(): boolean;
  resume: boolean;
  revoked?: true;
  view: ForwardRun;
  listener: ForwardListener;
  opening: ReturnType<ForwardListener["open"]>;
  transport: AbortSignal;
  detach(): void;
  closing?: Promise<void>;
};

export class PublicForwarding {
  private readonly runs = new Map<string, Owned>();

  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly rules: ForwardRules,
    private readonly connections: PublicSshProbes,
    private readonly intents: HostIntents | undefined,
    private readonly changed: (id: string) => void,
  ) {}

  async start(context: CapabilityContext, input: z.infer<typeof StartOwnedForward> & { runId?: string }, resume = false) {
    const { id, expectedRevision, hostId, routeRevision, attemptId, runId, intentKey } = input;
    const binding = { hostId, routeRevision, attemptId };
    const owner = externalSshOwner(context);
    const authorize = () => {
      const connection = this.connections.connection(context, binding);
      const rule = this.rules.require({ id, expectedRevision });
      if (rule.hostId !== hostId || rule.boundTarget !== connection.targetIdentity) throw errors.notFound("当前授权内的原 SSH 转发规则");
      return { connection, rule };
    };
    const { hostIds } = authorize().connection;
    const receipt = await this.intentStore().run(context, resume ? "ssh.forwarding.runs.resume" : "ssh.forwarding.runs.start", {
      hosts: hostIds,
      intentKey,
      input: { id, expectedRevision, ...binding, runId },
      output: Receipt,
      authorize: () => authorize().connection.hostIds,
      run: async (check) => {
        if (resume) {
          const prior = runId && this.owned(context, runId, input);
          if (!prior || prior.view.state !== "interrupted" || !prior.resume || prior.binding.routeRevision !== routeRevision || prior.binding.attemptId === attemptId) {
            throw errors.notFound("原可恢复的 SSH 转发");
          }
        }
        const existing = [...this.runs.values()].filter((run) => live.has(run.view.state));
        if (existing.some((run) => run.owner === owner && run.view.ruleId === id && run.binding.attemptId === attemptId)) throw errors.invalidInput("此连接已运行该 SSH 转发规则");
        if (existing.length >= 16 || existing.filter((run) => run.owner === owner).length >= 4) throw errors.invalidInput("SSH 转发运行数量已达上限");
        if (this.runs.size >= 64) {
          for (const [key, run] of this.runs) {
            if (!live.has(run.view.state) && run.view.state !== "interrupted") this.runs.delete(key);
            if (this.runs.size < 64) break;
          }
          if (this.runs.size >= 64) throw errors.invalidInput("SSH 转发历史已满");
        }
        const { connection, rule } = authorize();
        const listener = new ForwardListener(rule.mode === "remote" ? rule : { ...rule, listenPort: 0 }, connection.client);
        const view: ForwardRun = { id: randomUUID(), ruleId: id, revision: expectedRevision, source: "external", state: "starting", active: 0, accepted: 0, uploaded: 0, downloaded: 0 };
        const opening = listener.open(AbortSignal.any([connection.signal, context.signal]));
        const lost = () => {
          if (!hasSshHosts(context, hostIds)) run.revoked = true;
          void this.close(run, run.revoked || !run.resume ? "stopped" : "interrupted").catch(() => undefined);
        };
        const run: Owned = {
          owner,
          binding,
          hostIds,
          authorized: () => hasSshHosts(context, hostIds),
          view,
          resume: rule.resume,
          listener,
          opening,
          transport: connection.signal,
          detach: () => connection.signal.removeEventListener("abort", lost),
        };
        this.runs.set(view.id, run);
        connection.signal.addEventListener("abort", lost, { once: true });
        this.changed(view.id);
        try {
          const address = await opening;
          check();
          if (run.closing) throw new HuhuError("SSH_DISCONNECTED", "SSH 转发已关闭");
          listener.enable();
          run.view = { ...view, state: "running", listener: address };
          this.changed(view.id);
          return { id: view.id };
        } catch (error) {
          await this.close(run, "failed");
          if (error instanceof HuhuError) throw error;
          throw new HuhuError("INTERNAL", "SSH 转发启动结果待核实", { retryable: false, details: { outcome: "unknown" } });
        }
      },
    });
    const run = this.runs.get(receipt.id);
    if (!run) throw new HuhuError("INTERNAL", "原 SSH 转发结果待核实", { retryable: false, details: { outcome: "unknown" } });
    return this.snapshot(this.owned(context, receipt.id, input));
  }

  async stop(context: CapabilityContext, input: z.infer<typeof StopOwnedForward>) {
    const { runId, intentKey, ...rule } = input;
    const run = this.owned(context, runId, rule);
    await this.intentStore().run(context, "ssh.forwarding.runs.stop", {
      hosts: run.hostIds,
      intentKey,
      input: { runId, ...rule },
      output: Receipt,
      authorize: () => this.owned(context, runId, rule).hostIds,
      run: async () => {
        await this.close(run, "stopped");
        return { id: runId };
      },
    });
    return this.snapshot(this.owned(context, runId, rule));
  }

  list(context: CapabilityContext) {
    const owner = externalSshOwner(context);
    const selected = selectedSshHosts(context);
    return [...this.runs.values()].flatMap((run) => {
      if (run.owner !== owner || run.revoked || run.hostIds.some((id) => !selected.has(id))) return [];
      try {
        this.owned(context, run.view.id, { id: run.view.ruleId, expectedRevision: run.view.revision });
        return [this.snapshot(run)];
      } catch (error) {
        if (!(error instanceof HuhuError)) throw error;
        return [];
      }
    });
  }

  workbenchList() {
    return [...this.runs.values()].map((run) => this.snapshot(run));
  }

  async stopWorkbench(id: string) {
    const run = this.runs.get(id);
    if (!run) throw errors.notFound("外部 SSH 转发");
    await this.close(run, "stopped");
    return this.snapshot(run);
  }

  assertInactive(ruleId: string) {
    if ([...this.runs.values()].some((run) => run.view.ruleId === ruleId && live.has(run.view.state))) throw errors.permissionDenied("转发规则仍在使用");
  }

  revalidateRules() {
    const revisions = new Map(this.rules.list().map(({ id, revision }) => [id, revision]));
    for (const run of this.runs.values()) {
      if (revisions.get(run.view.ruleId) !== run.view.revision) void this.close(run, "stopped").catch(() => undefined);
    }
  }

  revokeUnauthorized() {
    for (const run of this.runs.values()) {
      if (run.revoked || run.authorized()) continue;
      run.revoked = true;
      void this.close(run, "stopped").catch(() => undefined);
    }
  }

  dispose() {
    for (const run of this.runs.values()) void this.close(run, "stopped").catch(() => undefined);
    this.runs.clear();
  }

  private owned(context: CapabilityContext, runId: string, rule: z.infer<typeof ForwardRevision>): Owned {
    const run = this.runs.get(runId);
    if (run?.owner !== externalSshOwner(context) || run.view.ruleId !== rule.id || run.view.revision !== rule.expectedRevision) throw errors.notFound("SSH 转发运行");
    assertSshHosts(context, run.hostIds);
    if (run.revoked) throw errors.permissionDenied("SSH 主机授权");
    readBoundRoute(this.files, context, run.binding);
    this.rules.require(rule);
    return run;
  }

  private close(run: Owned, state: "stopped" | "interrupted" | "failed"): Promise<void> {
    if (run.closing)
      return run.closing.then(() => {
        if (state === "stopped" && run.view.state === "interrupted") {
          run.view.state = "stopped";
          this.changed(run.view.id);
        }
      });
    run.detach();
    run.view.state = "stopping";
    this.changed(run.view.id);
    run.closing = run.opening
      .catch(() => undefined)
      .then(async () => {
        try {
          await run.listener.close(run.transport.aborted);
        } catch (error) {
          // Closing the owner’s transport releases any remote listener whose cancellation was not acknowledged.
          if (!run.transport.aborted) this.connections.closeWorkbench(run.binding.attemptId, run.binding.hostId);
          await run.listener.close(true);
          if (state !== "stopped" || run.revoked) return;
          throw error;
        } finally {
          delete run.view.listener;
          run.view.state = state;
          this.changed(run.view.id);
        }
      });
    return run.closing;
  }

  private snapshot(run: Owned): ForwardRun {
    const { lastError: _, ...stats } = run.listener.stats();
    return { ...run.view, ...stats };
  }

  private intentStore(): HostIntents {
    if (!this.intents) throw errors.invalidInput("此 Vault 无法保存 SSH 转发意图");
    return this.intents;
  }
}
