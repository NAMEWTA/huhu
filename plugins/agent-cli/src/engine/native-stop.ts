import { ExecutionBindingSchema } from "@huhu/contracts";
import { z } from "zod";
import { launchHash } from "./launch-binding.js";

const StopId = z
  .string()
  .min(1)
  .max(256)
  .regex(/\S/)
  .refine((id) => Buffer.from(id).toString("utf8") === id);
export const NativeStop = z.strictObject({ execution: ExecutionBindingSchema, stopId: StopId });
export type NativeStop = z.infer<typeof NativeStop>;
export const NativeStopStatus = z.enum(["stopped", "completed", "not_sent", "unknown", "stale", "unsupported"]);
export type NativeStopStatus = z.infer<typeof NativeStopStatus>;
export const NativeStopIntent = z.strictObject({ executionHash: z.string().regex(/^[a-f0-9]{64}$/), stopId: StopId });

export function stopFingerprint({ execution, stopId }: NativeStop): string {
  const { vaultId, taskId, runId, attempt, dispatchId, sessionBinding: b } = execution;
  return launchHash([vaultId, taskId, runId, attempt, dispatchId, b.machineId, b.sessionId, b.coreId, b.coreAddress, b.processGeneration, b.provider, b.nativeSessionId, stopId]);
}
