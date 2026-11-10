import { CapabilityError, useEngine, useQueryClient } from "@huhu/workbench";

export type CallResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; details?: Record<string, unknown> };

/** 调用写能力并刷新本 Vault 的查询；业务错误以结果返回（保留错误码与 details），不抛出。 */
export function useCall() {
  const engine = useEngine();
  const qc = useQueryClient();
  return async function call<T>(cap: string, input: unknown = {}): Promise<CallResult<T>> {
    try {
      const data = await engine.call<T>(cap, input, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
      return { ok: true, data };
    } catch (e) {
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
      if (e instanceof CapabilityError) return { ok: false, code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) };
      return { ok: false, code: "INTERNAL", message: e instanceof Error ? e.message : String(e) };
    }
  };
}
