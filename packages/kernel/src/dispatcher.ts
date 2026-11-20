import { randomUUID } from "node:crypto";
import { HuhuError, errors, isWorkbenchCaller, type Caller, type CapabilityOperationLookup, type CapabilityRequest, type CapabilityResult, type ToolAccessSnapshot } from "@huhu/contracts";
import type { CapabilityDefinition, CapabilityRegistry } from "./capabilities/define.js";
import { toolSelection } from "./exposure.js";
import type { GatewayAudit } from "./gateway-audit.js";
import { IdempotencyStore } from "./idempotency.js";
import type { OperationReceipts } from "./operation-receipts.js";
import { permissionsAllow } from "./permissions.js";

export interface DispatcherDeps {
  registry: CapabilityRegistry;
  /** 插件是否已启用。 */
  isPluginEnabled(plugin: string): boolean;
  /** 来自当前 Vault 的工具开放策略。 */
  toolAccess(): ToolAccessSnapshot;
  /** plugin:<id> 已授予的权限。 */
  grantedPermissions(pluginId: string): readonly string[];
  /** 插件来源：内置插件与第三方插件的授权规则不同（见 permissionsAllow）。 */
  pluginOrigin(pluginId: string): "builtin" | "external";
  idempotency: IdempotencyStore;
  operations?: { ledger: OperationReceipts; vaultInstance: string };
  audit: GatewayAudit;
  log?: (level: "error" | "warn", msg: string, extra?: Record<string, unknown>) => void;
  defaultTimeoutMs?: number;
  now?: () => number;
}

const NEEDS_IDEMPOTENCY = new Set(["write", "execute"]);

/** 所有能力调用的唯一入口（interfaces.md §1 的 8 步）。 */
export class Dispatcher {
  private closing = false;
  /** 进行中的幂等调用，合并同 key 并发。 */
  private readonly inflight = new Map<string, Promise<CapabilityResult<unknown>>>();
  private readonly inflightHash = new Map<string, string>();
  private readonly activeOperation = new Map<string, Promise<CapabilityResult<unknown>>>();

  constructor(private readonly d: DispatcherDeps) {}

  /** 进入关闭流程：此后的写/执行类调用返回 ENGINE_CLOSING。 */
  beginClose(): void {
    this.closing = true;
  }

  discover(caller: Caller): CapabilityDefinition[] {
    const policy = isWorkbenchCaller(caller) || caller.startsWith("plugin:") ? undefined : this.d.toolAccess();
    if (policy?.state === "error") return [];
    return this.d.registry.list().filter((def) => this.d.isPluginEnabled(def.plugin) && (!this.closing || def.scope === "read") && !this.authorize(caller, def, policy));
  }

  supportsDurableIntent(def: CapabilityDefinition): boolean {
    return def.idempotency === "durable" && this.d.operations?.ledger.available === true;
  }

  async call(caller: Caller, req: CapabilityRequest, signal: AbortSignal = new AbortController().signal, subject: string = caller): Promise<CapabilityResult<unknown>> {
    const started = (this.d.now ?? Date.now)();
    const result = await this.run(caller, req, signal, subject);
    if (!isWorkbenchCaller(caller) && !caller.startsWith("plugin:")) {
      try {
        this.d.audit.add({
          at: new Date(started).toISOString(),
          entry: caller,
          capability: req.capability,
          code: result.ok ? "OK" : result.error.code,
          ms: (this.d.now ?? Date.now)() - started,
        });
      } catch (e) {
        this.d.log?.("warn", "网关审计写入失败", { error: String(e) });
      }
    }
    return result;
  }

  private fail(e: HuhuError): CapabilityResult<never> {
    return { ok: false, error: e.toJSON() };
  }

  private operationOwner(caller: Caller, subject: string): string {
    return JSON.stringify([this.d.operations?.vaultInstance, caller, subject]);
  }

  readOperation(caller: Caller, subject: string, lookup: CapabilityOperationLookup): CapabilityResult<unknown> {
    const entry = this.d.operations?.ledger.lookup(this.operationOwner(caller, subject), lookup);
    const def = entry && this.d.registry.get(entry.capability);
    if (!entry || !def || !this.d.isPluginEnabled(def.plugin)) return this.fail(errors.notFound("调用操作"));
    const denied = this.authorize(caller, def);
    if (denied) return this.fail(denied);
    const { operationId, capability } = entry;
    const state = entry.phase === "accepted" && !this.activeOperation.has(operationId) ? "unknown" : entry.phase;
    return { ok: true, opId: operationId, data: { operationId, capability, state, ...(entry.phase !== "accepted" && { result: entry.result }) } };
  }

  private uncertain(operationId: string, extra?: Record<string, unknown>) {
    return this.fail(new HuhuError("INTERNAL", "调用结果待核实", { retryable: false, details: { ...extra, operationId, outcome: "unknown" } }));
  }

  private async durable(def: CapabilityDefinition, caller: Caller, subject: string, req: CapabilityRequest, input: unknown, signal: AbortSignal) {
    const ledger = this.d.operations?.ledger;
    if (!ledger || def.idempotency !== "durable" || !req.intentKey) return this.fail(errors.invalidInput("此能力未启用通用持久意图，请使用业务入口的操作标识"));
    if (signal.aborted) return this.fail(errors.invalidInput("调用在受理前已取消"));
    try {
      const { entry, mismatch, fresh } = ledger.claim(this.operationOwner(caller, subject), def.name, req.intentKey, input);
      const { operationId } = entry;
      if (mismatch) return this.fail(errors.idempotencyMismatch());
      if (entry.phase !== "accepted") return entry.result;
      if (!fresh) return this.activeOperation.get(operationId) ?? this.uncertain(operationId);
      const task = Promise.resolve().then(async () => {
        if (signal.aborted) return ledger.complete(entry, "failed", this.fail(new HuhuError("INVALID_INPUT", "调用在执行前已取消", { details: { operationId } }))).result;
        const executed = await this.execute(def, caller, req, input, signal, subject);
        if (!executed.ok) {
          const failure = { ...executed.error, details: { ...executed.error.details, operationId } };
          const known = executed.error.details?.["outcome"] !== "unknown" && failure.code !== "INTERNAL";
          return ledger.complete(entry, known ? "failed" : "unknown", known ? { ok: false, error: failure } : this.uncertain(operationId, failure.details)).result;
        }
        const projected = def.output.safeParse(executed.data);
        if (!projected.success) return ledger.complete(entry, "invalid-output", this.uncertain(operationId, { verification: "invalid-output" })).result;
        return ledger.complete(entry, "completed", { ok: true, data: projected.data, opId: operationId }).result;
      });
      this.activeOperation.set(operationId, task);
      try {
        return await task;
      } finally {
        this.activeOperation.delete(operationId);
      }
    } catch (error) {
      return this.fail(error instanceof HuhuError ? error : new HuhuError("INTERNAL", "无法核实持久操作", { retryable: false, details: { outcome: "unknown" } }));
    }
  }

  private async run(caller: Caller, req: CapabilityRequest, signal: AbortSignal, subject: string): Promise<CapabilityResult<unknown>> {
    const def = this.d.registry.get(req.capability);
    if (!def) {
      const owner = this.d.registry.knownPlugin(req.capability);
      if (!owner) return this.fail(errors.capabilityNotFound(req.capability));
      if (!this.d.isPluginEnabled(owner)) return this.fail(errors.pluginDisabled(owner));
      return this.fail(new HuhuError("CAPABILITY_NOT_FOUND", `能力处理函数尚未注册：${req.capability}`, { details: { reason: "handler-missing", plugin: owner } }));
    }
    if (!this.d.isPluginEnabled(def.plugin)) return this.fail(errors.pluginDisabled(def.plugin));

    const denied = this.authorize(caller, def);
    if (denied) return this.fail(denied);

    if (this.closing && def.scope !== "read") return this.fail(errors.engineClosing());

    const parsed = def.input.safeParse(req.input);
    if (!parsed.success) return this.fail(errors.invalidInput("输入不符合要求", parsed.error.issues));
    if (req.intentKey !== undefined) return this.durable(def, caller, subject, req, parsed.data, signal);

    if (!NEEDS_IDEMPOTENCY.has(def.scope)) return this.execute(def, caller, req, parsed.data, signal, subject);
    if (req.idempotencyKey === undefined) return this.fail(errors.invalidInput("写入与执行类能力必须提供 idempotencyKey"));
    const key = req.idempotencyKey;

    if (def.idempotency === "handler") return this.execute(def, caller, req, parsed.data, signal, subject);
    const owner = subject === caller ? caller : JSON.stringify([caller, subject]);
    const hit = this.d.idempotency.lookup(owner, def.name, key, req.input);
    if (hit.hit) return hit.mismatch ? this.fail(errors.idempotencyMismatch()) : hit.result;
    if (owner !== caller && this.d.idempotency.lookup(caller, def.name, key, req.input).hit) {
      return this.fail(new HuhuError("INTERNAL", "旧调用结果缺少可核实的持有者", { retryable: false, details: { outcome: "unknown" } }));
    }

    const flightKey = `${owner}|${def.name}|${key}`;
    const running = this.inflight.get(flightKey);
    if (running) {
      const sameInput = IdempotencyStore.hashInput(req.input) === this.inflightHash.get(flightKey);
      const again = await running;
      return sameInput ? again : this.fail(errors.idempotencyMismatch());
    }
    const p = (async () => {
      const result = await this.execute(def, caller, req, parsed.data, signal, subject);
      // 可重试的失败不缓存，允许同 key 重试
      if (result.ok || !result.error.retryable) {
        try {
          this.d.idempotency.record(owner, def.name, key, req.input, result);
        } catch (e) {
          this.d.log?.("error", "幂等记录写入失败", { error: String(e) });
        }
      }
      return result;
    })();
    this.inflightHash.set(flightKey, IdempotencyStore.hashInput(req.input));
    this.inflight.set(flightKey, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(flightKey);
      this.inflightHash.delete(flightKey);
    }
  }

  private authorize(caller: Caller, def: CapabilityDefinition, policy?: ToolAccessSnapshot): HuhuError | null {
    if (isWorkbenchCaller(caller)) return def.desktopOnly && caller !== "desktop" ? errors.permissionDenied(def.name) : null;
    if (caller.startsWith("plugin:")) {
      const id = caller.slice("plugin:".length);
      const origin = this.d.pluginOrigin(id);
      // 内置插件按权限组授权（内部能力不必 exposable）；第三方插件必须是 exposable 的能力，且只能是 read / write
      return (origin === "builtin" || def.exposable) && permissionsAllow(this.d.grantedPermissions(id), def.name, def.scope, origin) ? null : errors.permissionDenied(def.name);
    }
    if (!def.exposable) return errors.capabilityNotExposed(def.name);
    const access = policy ?? this.d.toolAccess();
    if (access.state === "error") return new HuhuError("CAPABILITY_NOT_EXPOSED", "工具开放配置不可用", { details: { reason: access.reason } });
    return toolSelection(access, def.name) === true ? null : errors.capabilityNotExposed(def.name);
  }

  private async execute(def: CapabilityDefinition, caller: Caller, req: CapabilityRequest, input: unknown, outer: AbortSignal, subject: string): Promise<CapabilityResult<unknown>> {
    const timeoutMs = def.timeoutMs ?? this.d.defaultTimeoutMs ?? 60_000;
    const ac = new AbortController();
    const onAbort = () => ac.abort(outer.reason);
    if (outer.aborted) ac.abort(outer.reason);
    else outer.addEventListener("abort", onAbort, { once: true });
    let timer: NodeJS.Timeout | undefined;
    let interrupted = false;
    let rejectOnAbort: (() => void) | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        interrupted = true;
        ac.abort(new Error("timeout"));
        reject(new Error(`能力 ${def.name} 超时`));
      }, timeoutMs);
      rejectOnAbort = () => {
        interrupted = true;
        reject(new Error(`能力 ${def.name} 已取消`));
      };
      if (outer.aborted) rejectOnAbort();
      else outer.addEventListener("abort", rejectOnAbort, { once: true });
    });
    timeout.catch(() => undefined); // 避免 handler 先完成时的未处理拒绝
    try {
      const context = { signal: ac.signal, caller, subject, requestId: req.requestId, ...(req.idempotencyKey !== undefined && { idempotencyKey: req.idempotencyKey }) };
      const data = await Promise.race([Promise.resolve(def.handler(context, input)), timeout]);
      return { ok: true, data };
    } catch (e) {
      if (e instanceof HuhuError) return this.fail(e);
      const correlationId = randomUUID();
      this.d.log?.("error", `能力 ${def.name} 失败`, { correlationId, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
      // 写入/执行类超时或取消后 handler 可能仍在完成副作用：结果未知，不可重试，也不自动重放
      if (interrupted && def.scope !== "read") {
        return this.fail(new HuhuError("INTERNAL", "调用被中断，结果未知", { retryable: false, details: { correlationId, outcome: "unknown" } }));
      }
      return this.fail(errors.internal(correlationId));
    } finally {
      if (timer) clearTimeout(timer);
      outer.removeEventListener("abort", onAbort);
      if (rejectOnAbort) outer.removeEventListener("abort", rejectOnAbort);
    }
  }
}
