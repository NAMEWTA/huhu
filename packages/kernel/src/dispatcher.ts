import { createHash, randomUUID } from "node:crypto";
import {
  HuhuError,
  errors,
  isWorkbenchCaller,
  mcpSessionSubject,
  CapabilityIntentKeySchema,
  type Caller,
  type CapabilityOperationLookup,
  type CapabilityRequest,
  type CapabilityResult,
  type McpSessionPrincipal,
  type McpSessionIdentity,
  type ToolAccessSnapshot,
} from "@huhu/contracts";
import type { CapabilityContext, CapabilityDefinition, CapabilityRegistry } from "./capabilities/define.js";
import { toolResourceIds, toolSelection } from "./exposure.js";
import type { GatewayAudit } from "./gateway-audit.js";
import { canonicalJson, IdempotencyStore } from "./idempotency.js";
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

type Invocation = {
  caller: Caller;
  subject: string;
  session?: McpSessionIdentity | undefined;
  recovered?: true;
  forwarder?: CapabilityDefinition | undefined;
  delegatedBy?: CapabilityContext["delegatedBy"];
};
type ActiveContext = Invocation & { def: CapabilityDefinition; request: CapabilityRequest };

const intentDigest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

/** 所有能力调用的唯一入口（interfaces.md §1 的 8 步）。 */
export class Dispatcher {
  private closing = false;
  /** 进行中的幂等调用，合并同 key 并发。 */
  private readonly inflight = new Map<string, Promise<CapabilityResult<unknown>>>();
  private readonly inflightHash = new Map<string, string>();
  private readonly contexts = new WeakMap<CapabilityContext, ActiveContext>();
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
    return (def.idempotency === "durable" || def.commandInvocation === "forward") && this.d.operations?.ledger.available === true;
  }

  async call(caller: Caller, req: CapabilityRequest, signal: AbortSignal = new AbortController().signal, principal: string | McpSessionPrincipal = caller): Promise<CapabilityResult<unknown>> {
    if (typeof principal !== "string" && (principal.signal.aborted || principal.identity.caller !== caller)) return this.fail(errors.permissionDenied("MCP 会话已关闭"));
    if (typeof principal !== "string" && signal.aborted) return this.fail(errors.invalidInput("调用在受理前已取消"));
    const session = typeof principal === "string" ? undefined : principal.identity;
    const subject = typeof principal === "string" ? principal : mcpSessionSubject(principal.identity);
    const lifetime = typeof principal === "string" ? signal : AbortSignal.any([signal, principal.signal]);
    return this.dispatch({ caller, subject, session, ...(typeof principal !== "string" && principal.recovered && { recovered: true }) }, req, lifetime);
  }

  private async dispatch(invocation: Invocation, req: CapabilityRequest, signal: AbortSignal): Promise<CapabilityResult<unknown>> {
    const { caller } = invocation;
    const started = (this.d.now ?? Date.now)();
    const result = await this.run(invocation, req, signal);
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

  readOperation(caller: Caller, principal: string | McpSessionPrincipal, lookup: CapabilityOperationLookup): CapabilityResult<unknown> {
    if (typeof principal !== "string" && (principal.signal.aborted || principal.identity.caller !== caller)) return this.fail(errors.permissionDenied("MCP 会话已关闭"));
    const subject = typeof principal === "string" ? principal : mcpSessionSubject(principal.identity);
    const entry = this.d.operations?.ledger.lookup(this.operationOwner(caller, subject), lookup);
    const def = entry && this.d.registry.get(entry.capability);
    if (!entry || !def || !this.d.isPluginEnabled(def.plugin)) return this.fail(errors.notFound("调用操作"));
    const denied = this.authorize(caller, def) ?? this.commandDependencies(caller, def);
    if (denied) return this.fail(denied);
    const { operationId, capability } = entry;
    let result = entry.phase === "accepted" ? undefined : entry.result;
    if (result?.ok && typeof def.commandInvocation === "object") {
      const projected = def.output.safeParse(result.data);
      if (!projected.success) return this.uncertain(operationId, { verification: "invalid-output" });
      result = { ...result, data: projected.data };
    }
    const state = this.activeOperation.has(operationId) ? "accepted" : entry.phase === "accepted" ? "unknown" : entry.phase;
    return { ok: true, opId: operationId, data: { operationId, capability, state, ...(result && { result }) } };
  }

  private uncertain(operationId?: string, extra?: Record<string, unknown>) {
    return this.fail(new HuhuError("INTERNAL", "调用结果待核实", { retryable: false, details: { ...extra, ...(operationId && { operationId }), outcome: "unknown" } }));
  }

  private replayRecovered(def: CapabilityDefinition, owner: string, intentKey: string, input: unknown): CapabilityResult<unknown> {
    const entry = this.d.operations?.ledger.lookup(owner, { capability: def.name, intentKey });
    if (!entry) return this.uncertain();
    if (entry.input !== intentDigest(input)) return this.fail(errors.idempotencyMismatch());
    if (entry.phase === "accepted" || entry.phase === "paused") return this.uncertain(entry.operationId);
    if (!entry.result.ok) return entry.result;
    const result = def.output.safeParse(entry.result.data);
    return result.success ? { ...entry.result, data: result.data } : this.uncertain(entry.operationId, { verification: "invalid-output" });
  }

  private async durable(
    def: CapabilityDefinition,
    claim: { owner: string; capability: string; key: string; input: unknown },
    signal: AbortSignal,
    execute: (operationId: string) => Promise<CapabilityResult<unknown>>,
    mode: "ordinary" | "command" | "step" = "ordinary",
  ): Promise<CapabilityResult<unknown>> {
    const ledger = this.d.operations?.ledger;
    if (!ledger) return this.fail(errors.invalidInput("此能力需要可写的持久操作记录"));
    if (signal.aborted) return this.fail(errors.invalidInput("调用在受理前已取消"));
    try {
      const { entry, mismatch, fresh } = ledger.claim(claim.owner, claim.capability, claim.key, claim.input);
      const { operationId } = entry;
      if (mismatch) return this.fail(errors.idempotencyMismatch());
      const processing = this.activeOperation.get(operationId);
      if (processing) return processing;
      if (entry.phase === "accepted" && !fresh) return this.uncertain(operationId);
      if (entry.phase !== "accepted" && (entry.phase !== "paused" || mode === "ordinary")) {
        if (!entry.result.ok || mode === "ordinary") return entry.result;
        const projected = def.output.safeParse(entry.result.data);
        return projected.success ? { ...entry.result, data: projected.data } : this.uncertain(operationId, { verification: "invalid-output" });
      }
      const admitted = entry.phase === "accepted" ? entry : ledger.resume(entry);
      const task = Promise.resolve().then(async () => {
        if (signal.aborted) return ledger.complete(admitted, "failed", this.fail(new HuhuError("INVALID_INPUT", "调用在执行前已取消", { details: { operationId } }))).result;
        const executed = await execute(operationId);
        if (!executed.ok) {
          const failure = { ...executed.error, details: { ...executed.error.details, operationId } };
          const outcome = executed.error.details?.["outcome"];
          const known = outcome !== "unknown" && failure.code !== "INTERNAL" && (mode !== "step" || failure.code !== "WRITE_PARTIAL" || outcome === "not-accepted");
          const pause = known && mode !== "ordinary" && (executed.error.details?.["extensionStep"] === "not-admitted" || outcome === "not-accepted");

          return ledger.complete(admitted, pause ? "paused" : known ? "failed" : "unknown", known ? { ok: false, error: failure } : this.uncertain(operationId, failure.details)).result;
        }
        const projected = def.output.safeParse(executed.data);
        if (!projected.success) return ledger.complete(admitted, "invalid-output", this.uncertain(operationId, { verification: "invalid-output" })).result;
        return ledger.complete(admitted, "completed", { ok: true, data: projected.data, opId: operationId }).result;
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

  /** Forward an already authenticated proxy request through the specific command's Dispatcher entry. */
  forwardCommand(context: CapabilityContext, capability: string, input: unknown): Promise<CapabilityResult<unknown>> {
    const prior = this.contexts.get(context);
    if (!prior || prior.def.commandInvocation !== "forward" || context.signal.aborted) return Promise.resolve(this.fail(errors.permissionDenied(capability)));
    const command = this.d.registry.get(capability)?.commandInvocation ?? this.d.registry.getDescriptor(capability)?.commandInvocation;
    if (typeof command !== "object") return Promise.resolve(this.fail(errors.capabilityNotFound(capability)));
    return this.dispatch({ ...prior, forwarder: prior.def }, { ...prior.request, capability, input }, context.signal);
  }

  private currentAuthorization(caller: Caller, def: CapabilityDefinition): HuhuError | null {
    if (!this.d.isPluginEnabled(def.plugin)) return errors.pluginDisabled(def.plugin);
    if (this.d.registry.get(def.name) !== def) return errors.capabilityNotFound(def.name);
    return this.authorize(caller, def);
  }

  private targetDenial(caller: Caller, command: CapabilityDefinition, target: CapabilityDefinition | undefined, name: string): HuhuError | null {
    if (
      !target?.exposable ||
      target.desktopOnly ||
      target.commandInvocation ||
      target.resourceGuarded ||
      (command.scope === "read" && target.scope !== "read") ||
      !permissionsAllow(this.d.grantedPermissions(command.plugin), name, target.scope)
    ) {
      return errors.permissionDenied(name);
    }
    return this.currentAuthorization(caller, target);
  }

  private commandDependencies(caller: Caller, def: CapabilityDefinition): HuhuError | null {
    if (typeof def.commandInvocation !== "object") return null;
    for (const name of def.commandInvocation.dependencies) {
      const denied = this.targetDenial(caller, def, this.d.registry.get(name), name);
      if (denied) return denied;
    }
    return null;
  }

  assertCommandCurrent(context: CapabilityContext): void {
    const prior = this.contexts.get(context);
    if (!prior || typeof prior.def.commandInvocation !== "object" || context.signal.aborted) throw errors.permissionDenied("扩展命令已结束");
    const { caller, def, forwarder } = prior;
    const denied = (forwarder && this.currentAuthorization(caller, forwarder)) || this.currentAuthorization(caller, def) || this.commandDependencies(caller, def);
    if (denied) throw new HuhuError(denied.code, denied.message, { details: { ...denied.details, extensionStep: "not-admitted" } });
  }

  /** Child IPC only supplies arguments and a step name. The active command context owns all authority. */
  async invokeCommandStep(context: CapabilityContext, name: string, input: unknown, step: unknown, { signal, vaultInstance }: { signal: AbortSignal; vaultInstance: string }): Promise<CapabilityResult<unknown>> {
    const prior = this.contexts.get(context);
    const reject = (error: HuhuError) => this.fail(new HuhuError(error.code, error.message, { retryable: error.retryable, details: { ...error.details, extensionStep: "not-admitted" } }));
    if (!prior || signal.aborted || this.closing) return reject(errors.permissionDenied(name));
    const { caller, def, forwarder } = prior;
    if (typeof def.commandInvocation !== "object" || !def.commandInvocation.dependencies.includes(name)) return reject(errors.permissionDenied(name));
    const target = this.d.registry.get(name);
    const denied = (forwarder && this.currentAuthorization(caller, forwarder)) || this.currentAuthorization(caller, def) || this.targetDenial(caller, def, target, name);
    if (denied || !target) return reject(denied ?? errors.permissionDenied(name));
    const parsed = target.input.safeParse(input);
    if (!parsed.success) return this.fail(errors.invalidInput("子调用输入不符合要求", parsed.error.issues));
    const { parentOperationId } = context;
    const req = { capability: name, requestId: randomUUID(), input: parsed.data };
    // A desktop command has the user's authorization to run, but its child has only
    // the external grant. This also prevents workbench-only input variants.
    const actor = isWorkbenchCaller(caller) ? (`plugin:${def.plugin}` as const) : caller;
    const delegated: Invocation = { ...prior, caller: actor, delegatedBy: { pluginId: def.plugin, command: def.name, caller, subject: prior.subject, vaultInstance } };
    if (target.scope === "read" && step === undefined) {
      const result = await this.execute(target, delegated, req, parsed.data, signal, parentOperationId);
      if (!result.ok) return result;
      const projected = target.output.safeParse(result.data);
      return projected.success ? { ok: true, data: projected.data } : this.fail(errors.invalidInput("子调用输出不符合要求"));
    }
    const slot = CapabilityIntentKeySchema.safeParse(step);
    if (!parentOperationId || !slot.success) return this.fail(errors.invalidInput("持久步骤需要写入命令的父意图和稳定的步骤标识"));
    const key = intentDigest([parentOperationId, slot.data]);
    const owner = JSON.stringify(["extension-step", this.d.operations?.vaultInstance, parentOperationId]);
    return this.durable(target, { owner, capability: def.name, key, input: [target.name, parsed.data] }, signal, () => this.execute(target, delegated, { ...req, idempotencyKey: key }, parsed.data, signal, parentOperationId), "step");
  }

  private async run(invocation: Invocation, req: CapabilityRequest, signal: AbortSignal): Promise<CapabilityResult<unknown>> {
    const { caller, subject, forwarder } = invocation;
    const def = this.d.registry.get(req.capability);
    if (!def) {
      const owner = this.d.registry.knownPlugin(req.capability);
      if (!owner) return this.fail(errors.capabilityNotFound(req.capability));
      if (!this.d.isPluginEnabled(owner)) return this.fail(errors.pluginDisabled(owner));
      return this.fail(new HuhuError("CAPABILITY_NOT_FOUND", `能力处理函数尚未注册：${req.capability}`, { details: { reason: "handler-missing", plugin: owner } }));
    }
    if (!this.d.isPluginEnabled(def.plugin)) return this.fail(errors.pluginDisabled(def.plugin));

    const denied = (forwarder && this.currentAuthorization(caller, forwarder)) || this.authorize(caller, def) || this.commandDependencies(caller, def);
    if (denied) return this.fail(denied);

    if (this.closing && def.scope !== "read") return this.fail(errors.engineClosing());

    const parsed = def.input.safeParse(req.input);
    if (!parsed.success) return this.fail(errors.invalidInput("输入不符合要求", parsed.error.issues));
    if (def.externalIntentRequired && req.intentKey === undefined && !isWorkbenchCaller(caller) && !caller.startsWith("plugin:")) {
      return this.fail(errors.invalidInput('此能力的外部调用必须提供稳定意图键：CLI 使用 --intent-key，MCP 使用 _meta["huhu.dev/intent-key"]'));
    }
    const command = typeof def.commandInvocation === "object" ? def.commandInvocation : undefined;
    if (invocation.recovered && def.commandInvocation !== "forward" && (def.scope !== "read" || req.intentKey !== undefined)) {
      if (def.idempotency !== "durable" || req.intentKey === undefined) return this.uncertain();
      return this.replayRecovered(def, this.operationOwner(caller, subject), req.intentKey, command ? [command.revision, parsed.data] : parsed.data);
    }
    if (def.commandInvocation !== "forward" && (req.intentKey !== undefined || (command && def.scope === "write"))) {
      if (def.idempotency !== "durable") return this.fail(errors.invalidInput("此能力未启用通用持久意图，请使用业务入口的操作标识"));
      const key = req.intentKey ?? (req.idempotencyKey && intentDigest(["invocation", req.idempotencyKey]));
      if (!key) return this.fail(errors.invalidInput("写入命令需要意图键"));
      const claim = { owner: this.operationOwner(caller, subject), capability: def.name, key, input: command ? [command.revision, parsed.data] : parsed.data };
      return this.durable(def, claim, signal, (operationId) => this.execute(def, invocation, req, parsed.data, signal, operationId), command ? "command" : "ordinary");
    }

    if (!NEEDS_IDEMPOTENCY.has(def.scope)) return this.execute(def, invocation, req, parsed.data, signal);
    if (req.idempotencyKey === undefined) return this.fail(errors.invalidInput("写入与执行类能力必须提供 idempotencyKey"));
    const key = req.idempotencyKey;

    if (def.idempotency === "handler" || def.resourceGuarded) return this.execute(def, invocation, req, parsed.data, signal);
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
      const result = await this.execute(def, invocation, req, parsed.data, signal);
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

  private async execute(def: CapabilityDefinition, invocation: Invocation, req: CapabilityRequest, input: unknown, outer: AbortSignal, parentOperationId?: string): Promise<CapabilityResult<unknown>> {
    const { caller, subject, session, delegatedBy } = invocation;
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
    const context: CapabilityContext = {
      signal: ac.signal,
      caller,
      subject,
      requestId: req.requestId,
      toolResourceIds: (group) => toolResourceIds(this.d.toolAccess(), group),
      assertCapabilityCurrent: () => {
        ac.signal.throwIfAborted();
        const denied = (invocation.forwarder && this.currentAuthorization(caller, invocation.forwarder)) || this.currentAuthorization(caller, def) || this.commandDependencies(caller, def);
        if (denied) throw denied;
      },
      ...(session && { session }),
      ...(delegatedBy && { delegatedBy }),
      ...(parentOperationId && { parentOperationId }),
      ...(req.idempotencyKey !== undefined && { idempotencyKey: req.idempotencyKey }),
    };
    this.contexts.set(context, { ...invocation, def, request: req });
    try {
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
      this.contexts.delete(context);
      if (timer) clearTimeout(timer);
      outer.removeEventListener("abort", onAbort);
      if (rejectOnAbort) outer.removeEventListener("abort", rejectOnAbort);
    }
  }
}
