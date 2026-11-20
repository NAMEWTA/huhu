import { z } from "zod";
import { TaskRunAttemptSchema } from "./kinds/task-run.js";

export const EXECUTION_RECEIPT_VERSION = 1;

const nonBlank = z.string().regex(/\S/);
const version = z.literal(EXECUTION_RECEIPT_VERSION);

export const ExecutionSessionBindingSchema = z.strictObject({
  machineId: nonBlank,
  sessionId: nonBlank,
  coreId: nonBlank,
  coreAddress: nonBlank,
  processGeneration: nonBlank,
  provider: nonBlank,
  nativeSessionId: nonBlank.nullable(),
});

export const ExecutionBindingSchema = z.strictObject({
  vaultId: nonBlank,
  taskId: nonBlank,
  runId: nonBlank,
  attempt: TaskRunAttemptSchema,
  dispatchId: nonBlank,
  sessionBinding: ExecutionSessionBindingSchema,
});
export type ExecutionBinding = z.infer<typeof ExecutionBindingSchema>;

const questionFields = {
  requestId: nonBlank,
  requestVersion: z.number().int().min(1),
  text: nonBlank,
  options: z.array(nonBlank),
};

const receiptEnvelope = { version, receiptId: nonBlank, execution: ExecutionBindingSchema };
const questionEnvelope = { ...receiptEnvelope, kind: z.literal("question") };
const nativeExecution = ExecutionBindingSchema.extend({ sessionBinding: ExecutionSessionBindingSchema.extend({ nativeSessionId: nonBlank }) });

export const ExecutionReceiptSchema = z.union([
  z.strictObject({ ...receiptEnvelope, kind: z.literal("progress"), payload: z.strictObject({ message: nonBlank }) }),
  z.strictObject({ ...questionEnvelope, payload: z.strictObject({ mode: z.literal("normal"), ...questionFields }) }),
  z.strictObject({
    ...questionEnvelope,
    execution: nativeExecution,
    payload: z.strictObject({ mode: z.literal("native_deferred"), ...questionFields, nativeRequestId: nonBlank }),
  }),
  z.strictObject({ ...receiptEnvelope, kind: z.literal("result"), payload: z.strictObject({ message: nonBlank }) }),
  z.strictObject({ ...receiptEnvelope, kind: z.literal("no_update"), payload: z.strictObject({}) }),
  z.strictObject({ ...receiptEnvelope, kind: z.literal("failed"), payload: z.strictObject({ code: nonBlank, message: nonBlank }) }),
]);
export type ExecutionReceipt = z.infer<typeof ExecutionReceiptSchema>;

export const ExecutionReceiptIdentitySchema = z.strictObject({
  ...receiptEnvelope,
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ExecutionReceiptIdentity = z.infer<typeof ExecutionReceiptIdentitySchema>;

export const ExecutionReceiptAckStageSchema = z.enum(["agent_received", "tasks_consumed"]);
export type ExecutionReceiptAckStage = z.infer<typeof ExecutionReceiptAckStageSchema>;

export const ExecutionReceiptAckSchema = z.strictObject({ stage: ExecutionReceiptAckStageSchema, receipt: ExecutionReceiptIdentitySchema });
export type ExecutionReceiptAck = z.infer<typeof ExecutionReceiptAckSchema>;

// Vault 的 Markdown 评论属性编码会改写引号和 CR/LF，回读 ID 用原始属性值做去重。
const commentMessageId = nonBlank.regex(/^[^"\r\n]+$/);

/** Tasks 权威接收记录的回读投影，供原 payload 重建 delivery。 */
export const TasksReceiptConsumptionSchema = z.strictObject({
  execution: ExecutionBindingSchema,
  delivery: z.strictObject({ receipt: ExecutionReceiptIdentitySchema, deliveryId: nonBlank, messageId: commentMessageId }),
});
export type TasksReceiptConsumption = z.infer<typeof TasksReceiptConsumptionSchema>;
