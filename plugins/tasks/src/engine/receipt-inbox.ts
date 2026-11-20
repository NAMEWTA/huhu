import { readdirSync } from "node:fs";
import { errors, ExecutionReceiptSchema, HuhuError, isHuhuError, TasksReceiptConsumptionSchema, type ExecutionBinding, type ExecutionReceipt } from "@huhu/contracts";
import { createExecutionReceiptAck, validateExecutionReceipt } from "@huhu/contracts/execution-receipt/engine";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { fingerprint } from "./dispatch-store.js";
import type { TasksService } from "./service.js";

const DIRECTORY = "tasks/receipts";
const RecordSchema = z.strictObject({
  format: z.literal(1),
  receipt: ExecutionReceiptSchema,
  consumption: TasksReceiptConsumptionSchema,
  at: z.iso.datetime(),
  status: z.enum(["pending", "delivered", "target_missing"]),
});
type DeliveryRecord = z.infer<typeof RecordSchema>;

function encode(record: DeliveryRecord): Buffer {
  return Buffer.from(JSON.stringify(record) + "\n");
}

/** Receipt IDs are unique within this Vault. The ACK is derived from the bytes read back. */
export class TaskReceiptInbox {
  constructor(
    private readonly files: VaultFiles,
    private readonly now: () => Date,
  ) {}

  private read(file: string) {
    const read = this.files.read(file);
    if (!read) return null;
    try {
      const record = RecordSchema.parse(JSON.parse(read.bytes.toString("utf8")));
      const { receipt, consumption } = record;
      if (file !== this.file(receipt.receiptId) || createExecutionReceiptAck(receipt, "tasks_consumed", receipt, consumption).status !== "ack") throw new Error("Receipt identity mismatch");
      return { record, version: read.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "任务回执记录损坏");
    }
  }

  private file(receiptId: string): string {
    return `${DIRECTORY}/${fingerprint(receiptId)}.json`;
  }

  async consume(input: ExecutionReceipt, expected: ExecutionBinding, signal: AbortSignal) {
    this.files.assertWritable();
    signal.throwIfAborted();
    if (input.kind === "question" || input.kind === "progress") throw new HuhuError("RUN_UNKNOWN", "该类型的回执正在等待任务消费", { retryable: true });
    const file = this.file(input.receiptId);
    const previous = this.read(file);
    const result = validateExecutionReceipt(input, expected, previous?.record.consumption.delivery.receipt);
    if (result.status === "rejected") throw errors.invalidInput("任务回执身份或载荷不匹配", [{ reason: result.reason }]);
    if (result.status === "new") {
      const key = fingerprint(input.receiptId);
      const record: DeliveryRecord = {
        format: 1,
        receipt: result.receipt,
        consumption: { execution: expected, delivery: { receipt: result.identity, deliveryId: `delivery-${key}`, messageId: `receipt-${key}` } },
        at: this.now().toISOString(),
        status: "pending",
      };
      try {
        await this.files.write(file, encode(record), { expectedVersion: null });
      } catch (error) {
        if (!isHuhuError(error) || error.code !== "NAME_CONFLICT") throw error;
      }
    }
    const durable = this.read(file);
    const ack = createExecutionReceiptAck(input, "tasks_consumed", durable?.record.receipt, durable?.record.consumption);
    if (ack.status !== "ack") {
      if (durable) throw errors.invalidInput("任务回执与先前保存的内容冲突");
      throw new HuhuError("WRITE_PARTIAL", "未能回读任务回执");
    }
    return ack.ack;
  }

  async replay(tasks: TasksService, bound: (execution: ExecutionBinding) => boolean, signal: AbortSignal, onError?: (error: unknown) => void): Promise<void> {
    let files: string[];
    try {
      files = readdirSync(this.files.abs(DIRECTORY));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const name of files.filter((file) => /^[a-f0-9]{64}\.json$/.test(file))) {
      if (signal.aborted) return;
      try {
        const file = `${DIRECTORY}/${name}`;
        const previous = this.read(file);
        if (!previous || previous.record.status !== "pending") continue;
        const { record } = previous;
        const { receipt, consumption } = record;
        if (!bound(receipt.execution)) continue;
        let status: DeliveryRecord["status"] = "delivered";
        if (receipt.kind === "result" || receipt.kind === "failed") {
          try {
            await tasks.addComment(receipt.execution.taskId, {
              id: consumption.delivery.messageId,
              at: record.at,
              source: "agent",
              author: receipt.execution.sessionBinding.provider,
              run: receipt.execution.runId,
              session: receipt.execution.sessionBinding.sessionId,
              event: receipt.kind,
              body: receipt.payload.message,
            });
          } catch (error) {
            if (!isHuhuError(error) || error.code !== "NOT_FOUND") throw error;
            status = "target_missing";
          }
        }
        if (!signal.aborted) await this.files.write(file, encode({ ...record, status }), { expectedVersion: previous.version });
      } catch (error) {
        onError?.(error);
      }
    }
  }
}
