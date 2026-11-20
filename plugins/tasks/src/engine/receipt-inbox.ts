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
export const TaskQuestionView = z.strictObject({
  runId: z.string(),
  sessionId: z.string(),
  requestId: z.string(),
  requestVersion: z.int().positive(),
  mode: z.enum(["normal", "native_deferred"]),
  status: z.enum(["awaiting", "closed"]),
  text: z.string(),
  options: z.array(z.string()),
  at: z.iso.datetime(),
});
type QuestionView = z.infer<typeof TaskQuestionView>;
type StoredQuestion = { view: QuestionView; receipt: Extract<ExecutionReceipt, { kind: "question" }>; payloadHash: string };

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

  private filesInInbox(): string[] {
    try {
      return readdirSync(this.files.abs(DIRECTORY))
        .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
        .map((file) => `${DIRECTORY}/${file}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  questions(taskId: string, bound: (execution: ExecutionBinding) => boolean, onError: (error: unknown) => void = () => {}): QuestionView[] {
    return this.currentQuestions(taskId, bound, onError)
      .map(({ view }) => view)
      .sort((a, b) => a.at.localeCompare(b.at) || a.runId.localeCompare(b.runId) || a.requestId.localeCompare(b.requestId));
  }

  question(taskId: string, runId: string, requestId: string, bound: (execution: ExecutionBinding) => boolean): StoredQuestion | undefined {
    return this.currentQuestions(taskId, bound).find(({ view }) => view.runId === runId && view.requestId === requestId);
  }

  private currentQuestions(taskId: string, bound: (execution: ExecutionBinding) => boolean, onError?: (error: unknown) => void): StoredQuestion[] {
    const questions = new Map<string, StoredQuestion>();
    const finished = new Set<string>();
    for (const file of this.filesInInbox()) {
      try {
        const value = this.read(file);
        if (!value) continue;
        const { receipt, at } = value.record;
        const { execution } = receipt;
        if (execution.taskId !== taskId || !bound(execution)) continue;
        if (receipt.kind !== "question") {
          if (receipt.kind !== "progress") finished.add(execution.runId);
          continue;
        }
        const { requestId, requestVersion, mode, text, options } = receipt.payload;
        const key = fingerprint([execution.runId, requestId]);
        const previous = questions.get(key);
        const view: QuestionView = { runId: execution.runId, sessionId: execution.sessionBinding.sessionId, requestId, requestVersion, mode, text, options, at, status: "awaiting" };
        const payloadHash = fingerprint(receipt.payload);
        if (!previous || requestVersion > previous.view.requestVersion) questions.set(key, { view, receipt, payloadHash });
        else if (requestVersion === previous.view.requestVersion && payloadHash !== previous.payloadHash) {
          // Counterparts supplied the same version with conflicting content. This question cannot be answered.
          questions.set(key, { ...previous, view: { ...previous.view, status: "closed" } });
        }
      } catch (error) {
        if (!onError) throw error;
        onError(error);
      }
    }
    return [...questions.values()].map((question) => {
      const { view } = question;
      if (view.mode === "native_deferred" && finished.has(view.runId)) return { ...question, view: { ...view, status: "closed" } };
      return question;
    });
  }

  async replay(tasks: TasksService, bound: (execution: ExecutionBinding) => boolean, signal: AbortSignal, onError?: (error: unknown) => void): Promise<void> {
    for (const file of this.filesInInbox()) {
      if (signal.aborted) return;
      try {
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
