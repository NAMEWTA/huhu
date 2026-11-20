import { createHash } from "node:crypto";
import {
  ExecutionReceiptAckSchema,
  ExecutionReceiptSchema,
  TasksReceiptConsumptionSchema,
  type ExecutionBinding,
  type ExecutionReceipt,
  type ExecutionReceiptAck,
  type ExecutionReceiptAckStage,
  type ExecutionReceiptIdentity,
} from "./execution-receipt.js";

// 与 Kernel 的 canonicalJson 使用相同键顺序。此处输入已过严格 JSON schema，数组保持原顺序。
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const members = Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 仅对已通过 schema 的回执取指纹。身份保留执行绑定，指纹覆盖 kind 与原 payload。 */
export function executionReceiptIdentity(receipt: ExecutionReceipt): ExecutionReceiptIdentity {
  const { version, receiptId, execution, kind, payload } = receipt;
  const payloadSha256 = createHash("sha256").update(canonicalJson({ kind, payload })).digest("hex");
  return { version, receiptId, execution, payloadSha256 };
}

type ReceiptValidation = { status: "new" | "duplicate"; receipt: ExecutionReceipt; identity: ExecutionReceiptIdentity } | { status: "rejected"; reason: "invalid_receipt" | "binding_mismatch" | "receipt_conflict" };

/** expectedExecution 来自本地权威运行记录，recorded 来自以收到的 receiptId 查询的接收记录。 */
export function validateExecutionReceipt(input: unknown, expectedExecution: ExecutionBinding, recorded?: ExecutionReceiptIdentity): ReceiptValidation {
  const parsed = ExecutionReceiptSchema.safeParse(input);
  if (!parsed.success) return { status: "rejected", reason: "invalid_receipt" };

  const receipt = parsed.data;
  if (canonicalJson(receipt.execution) !== canonicalJson(expectedExecution)) {
    return { status: "rejected", reason: "binding_mismatch" };
  }

  const identity = executionReceiptIdentity(receipt);
  if (recorded && canonicalJson(recorded) !== canonicalJson(identity)) {
    return { status: "rejected", reason: "receipt_conflict" };
  }
  return { status: recorded ? "duplicate" : "new", receipt, identity };
}

type ReceiptAckDecision = { status: "ack"; ack: ExecutionReceiptAck } | { status: "pending"; reason: "missing_durable_receipt" | "missing_durable_consumption" };

/** 回读接收方已提交的原回执后签发 ACK。Tasks 还须回读原运行绑定及能重建投递的记录。 */
export function createExecutionReceiptAck(receipt: ExecutionReceipt, stage: ExecutionReceiptAckStage, durableReceipt: unknown, durableConsumption?: unknown): ReceiptAckDecision {
  const identity = executionReceiptIdentity(receipt);
  const received = ExecutionReceiptSchema.safeParse(durableReceipt);
  if (!received.success || canonicalJson(executionReceiptIdentity(received.data)) !== canonicalJson(identity)) {
    return { status: "pending", reason: "missing_durable_receipt" };
  }

  if (stage === "tasks_consumed") {
    const consumption = TasksReceiptConsumptionSchema.safeParse(durableConsumption);
    if (!consumption.success || canonicalJson(consumption.data.execution) !== canonicalJson(identity.execution) || canonicalJson(consumption.data.delivery.receipt) !== canonicalJson(identity)) {
      return { status: "pending", reason: "missing_durable_consumption" };
    }
  }

  return { status: "ack", ack: { stage, receipt: identity } };
}

/** 在可信传输完成鉴权后，比对 ACK 与发送方仍持有的原回执及预期阶段。 */
export function validateExecutionReceiptAck(input: unknown, expectedStage: ExecutionReceiptAckStage, expected: ExecutionReceiptIdentity): boolean {
  const parsed = ExecutionReceiptAckSchema.safeParse(input);
  return parsed.success && parsed.data.stage === expectedStage && canonicalJson(parsed.data.receipt) === canonicalJson(expected);
}
