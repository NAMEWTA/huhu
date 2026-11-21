import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import type { CapabilityContext, OperationReceipts } from "@huhu/kernel";
import { mailActor } from "./tool-access.js";

/** Persist the domain's safe references and status in the local runtime. */
export function mailIntents(ledger: OperationReceipts | undefined) {
  const active = new Map<string, Promise<unknown>>();
  return async function once<T, Receipt>(
    context: CapabilityContext,
    capability: string,
    key: string | undefined,
    input: unknown,
    apply: () => T | Promise<T>,
    project: (result: T) => Receipt,
    read: (receipt: Receipt) => T | Promise<T>,
  ): Promise<T> {
    if (isWorkbenchCaller(context.caller)) return apply();
    const owner = mailActor(context, capability);
    if (!key) throw errors.invalidInput("此操作需要固定的 requestId。");
    if (!ledger) throw errors.invalidInput("此 Vault 的邮件操作记录不可用。");
    context.signal.throwIfAborted();
    const { entry, mismatch, fresh } = ledger.claim(owner, capability, key, input);
    if (mismatch) throw errors.idempotencyMismatch();
    const running = active.get(entry.operationId);
    if (running) return running as Promise<T>;
    if (entry.phase === "completed" && entry.result.ok) return read(entry.result.data as Receipt);
    if (!fresh || entry.phase !== "accepted") throw mailUnknown(entry.operationId);
    const task = Promise.resolve().then(async () => {
      const data = await apply();
      ledger.complete(entry, "completed", { ok: true, data: project(data) });
      return data;
    });
    active.set(entry.operationId, task);
    try {
      return await task;
    } finally {
      active.delete(entry.operationId);
    }
  };
}

export type MailIntents = ReturnType<typeof mailIntents>;

export function mailUnknown(operationId?: string) {
  return new HuhuError("RUN_UNKNOWN", "原邮件操作结果待核实。", { retryable: false, details: { ...(operationId && { operationId }), outcome: "unknown" } });
}
