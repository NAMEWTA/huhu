import { randomUUID } from "node:crypto";
import { HuhuError, errors, type Caller, type CapabilityRequest, type CapabilityResult } from "@huhu/contracts";
import type { CapabilityDefinition, CapabilityRegistry } from "./capabilities/define.js";
import type { GatewayAudit } from "./gateway-audit.js";
import { IdempotencyStore } from "./idempotency.js";
import { permissionsAllow } from "./permissions.js";

export interface DispatcherDeps {
  registry: CapabilityRegistry;
  /** 插件是否已启用。 */
  isPluginEnabled(plugin: string): boolean;
  /** 外部入口：用户是否开放该能力（未配置返回 undefined → 用默认值）。 */
  exposureOverride(capability: string): boolean | undefined;
  /** plugin:<id> 已授予的权限。 */
  grantedPermissions(pluginId: string): readonly string[];
  idempotency: IdempotencyStore;
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

  constructor(private readonly d: DispatcherDeps) {}

  /** 进入关闭流程：此后的写/执行类调用返回 ENGINE_CLOSING。 */
  beginClose(): void {
    this.closing = true;
  }

  async call(caller: Caller, req: CapabilityRequest, signal: AbortSignal = new AbortController().signal): Promise<CapabilityResult<unknown>> {
    const started = (this.d.now ?? Date.now)();
    const result = await this.run(caller, req, signal);
    if (caller !== "desktop" && !caller.startsWith("plugin:")) {
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

  private async run(caller: Caller, req: CapabilityRequest, signal: AbortSignal): Promise<CapabilityResult<unknown>> {
    const def = this.d.registry.get(req.capability);
    if (!def) return this.fail(errors.capabilityNotFound(req.capability));
    if (!this.d.isPluginEnabled(def.plugin)) return this.fail(errors.pluginDisabled(def.plugin));

    const denied = this.authorize(caller, def);
    if (denied) return this.fail(denied);

    if (this.closing && def.scope !== "read") return this.fail(errors.engineClosing());

    const parsed = def.input.safeParse(req.input);
    if (!parsed.success) return this.fail(errors.invalidInput("输入不符合要求", parsed.error.issues));

    if (!NEEDS_IDEMPOTENCY.has(def.scope)) return this.execute(def, caller, req, parsed.data, signal);
    if (req.idempotencyKey === undefined) return this.fail(errors.invalidInput("写入与执行类能力必须提供 idempotencyKey"));
    const key = req.idempotencyKey;

    const hit = this.d.idempotency.lookup(caller, def.name, key, req.input);
    if (hit.hit) return hit.mismatch ? this.fail(errors.idempotencyMismatch()) : hit.result;

    const flightKey = `${caller}|${def.name}|${key}`;
    const running = this.inflight.get(flightKey);
    if (running) {
      const sameInput = IdempotencyStore.hashInput(req.input) === this.inflightHash.get(flightKey);
      const again = await running;
      return sameInput ? again : this.fail(errors.idempotencyMismatch());
    }
    const p = (async () => {
      const result = await this.execute(def, caller, req, parsed.data, signal);
      // 可重试的失败不缓存，允许同 key 重试
      if (result.ok || !result.error.retryable) {
        try {
          this.d.idempotency.record(caller, def.name, key, req.input, result);
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

  private authorize(caller: Caller, def: CapabilityDefinition): HuhuError | null {
    if (caller === "desktop") return null;
    if (caller.startsWith("plugin:")) {
      const id = caller.slice("plugin:".length);
      return def.exposable && permissionsAllow(this.d.grantedPermissions(id), def.name, def.scope) ? null : errors.permissionDenied(def.name);
    }
    const exposed = this.d.exposureOverride(def.name) ?? def.defaultExposed;
    return def.exposable && exposed ? null : errors.capabilityNotExposed(def.name);
  }

  private async execute(def: CapabilityDefinition, caller: Caller, req: CapabilityRequest, input: unknown, outer: AbortSignal): Promise<CapabilityResult<unknown>> {
    const timeoutMs = def.timeoutMs ?? this.d.defaultTimeoutMs ?? 60_000;
    const ac = new AbortController();
    const onAbort = () => ac.abort(outer.reason);
    if (outer.aborted) ac.abort(outer.reason);
    else outer.addEventListener("abort", onAbort, { once: true });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ac.abort(new Error("timeout"));
        reject(new Error(`能力 ${def.name} 超时`));
      }, timeoutMs);
      const rejectOnAbort = () => reject(new Error(`能力 ${def.name} 已取消`));
      if (outer.aborted) rejectOnAbort();
      else outer.addEventListener("abort", rejectOnAbort, { once: true });
    });
    timeout.catch(() => undefined); // 避免 handler 先完成时的未处理拒绝
    try {
      const data = await Promise.race([Promise.resolve(def.handler({ signal: ac.signal, caller, requestId: req.requestId }, input)), timeout]);
      return { ok: true, data };
    } catch (e) {
      if (e instanceof HuhuError) return this.fail(e);
      const correlationId = randomUUID();
      this.d.log?.("error", `能力 ${def.name} 失败`, { correlationId, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
      return this.fail(errors.internal(correlationId));
    } finally {
      if (timer) clearTimeout(timer);
      outer.removeEventListener("abort", onAbort);
    }
  }
}
