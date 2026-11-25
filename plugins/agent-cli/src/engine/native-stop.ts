import { ExecutionBindingSchema, NativeStopIdSchema, NativeStopStatusSchema } from "@huhu/contracts";
import { z } from "zod";
import { launchHash } from "./launch-binding.js";

export const NativeStop = z.strictObject({ execution: ExecutionBindingSchema, stopId: NativeStopIdSchema });
export type NativeStop = z.infer<typeof NativeStop>;
export const NativeStopStatus = NativeStopStatusSchema;
export type NativeStopStatus = z.infer<typeof NativeStopStatus>;
export const NativeStopIntent = z.strictObject({ executionHash: z.string().regex(/^[a-f0-9]{64}$/), stopId: NativeStopIdSchema });

export function stopFingerprint({ execution, stopId }: NativeStop): string {
  const { vaultId, taskId, runId, attempt, dispatchId, sessionBinding: b } = execution;
  return launchHash([vaultId, taskId, runId, attempt, dispatchId, b.machineId, b.sessionId, b.coreId, b.coreAddress, b.processGeneration, b.provider, b.nativeSessionId, stopId]);
}
