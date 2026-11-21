import { createHash } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import { OperationReceipts, type CapabilityContext } from "@huhu/kernel";
import type { z } from "zod";

export function automationToolOwner({ caller, subject }: CapabilityContext): string {
  if ((caller !== "cli" && caller !== "mcp" && caller !== "http") || !subject) throw errors.permissionDenied("需要已认证的自动化工具调用者");
  return createHash("sha256")
    .update(JSON.stringify([caller, subject]))
    .digest("hex");
}

export function automationReceipts(file: string) {
  const receipts = new OperationReceipts(file);
  // Callers serialize admission with their domain's configuration queue.
  return async <T>(owner: string, capability: string, key: string, input: unknown, output: z.ZodType<T>, apply: () => Promise<T> | T, validate?: () => void): Promise<T> => {
    if (!receipts.lookup(owner, { capability, intentKey: key })) validate?.();
    const { entry, mismatch, fresh } = receipts.claim(owner, capability, key, input);
    if (mismatch) throw errors.idempotencyMismatch();
    if (entry.phase !== "accepted" && entry.result.ok) return output.parse(entry.result.data);
    if (!fresh || entry.phase !== "accepted") {
      throw new HuhuError("RUN_UNKNOWN", "原自动化操作结果待核实", { details: { operationId: entry.operationId, outcome: "unknown" } });
    }
    const result = output.parse(await apply());
    receipts.complete(entry, "completed", { ok: true, data: result });
    return result;
  };
}
