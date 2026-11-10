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

  constructor(private readonly d: DispatcherDeps) {}

  /** 进入关闭流程：此后的写/执行类调用返回 ENGINE_CLOSING。 */
  beginClose(): void {
    this.closing = true;
  }

  async call(caller: Caller, req: CapabilityRequest, signal: AbortSignal = new AbortController().signal): Promise<CapabilityResult<unknown>> {
    const started = (this.d.now ?? Date.now)();
    const result = await this.run(caller, req, signal);
    if (caller !== "desktop" && !caller.startsWith("plugin:")) {
      this.d.audit.add({
        at: new Date(started).toISOString(),
        entry: caller,
        capability: req.capability,
        code: result.ok ? "OK" : result.error.code,
        ms: (this.d.now ?? Date.now)() - started,
      });
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

    const key = req.idempotencyKey;
    const useIdem = NEEDS_IDEMPOTENCY.has(def.scope) && key !== undefined;
    if (useIdem) {
      const hit = this.d.idempotency.lookup(caller, def.name, key, req.input);
      if (hit.hit) return hit.mismatch ? this.fail(errors.idempotencyMismatch()) : hit.result;
    }

    const result = await this.execute(def, caller, req, parsed.data, signal);
    if (useIdem) this.d.idempotency.record(caller, def.name, key, req.input, result);
    return result;
  }

  private authorize(caller: Caller, def: CapabilityDefinition): HuhuError | null {
    if (caller === "desktop") return null;
    if (caller.startsWith("plugin:")) {
      const id = caller.slice("plugin:".length);
      return permissionsAllow(this.d.grantedPermissions(id), def.name, def.scope) ? null : errors.permissionDenied(def.name);
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
    });
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
