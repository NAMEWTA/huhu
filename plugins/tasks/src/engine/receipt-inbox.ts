import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors, ExecutionReceiptSchema, HuhuError, isHuhuError, TasksReceiptConsumptionSchema, type ExecutionBinding, type ExecutionReceipt, type ExecutionReceiptAck } from "@huhu/contracts";
import { createExecutionReceiptAck, validateExecutionReceipt } from "@huhu/contracts/execution-receipt/engine";
import { nativeTerminalCodes } from "@huhu/plugin-agent-cli/engine";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { fingerprint, type TaskRunSummary } from "./dispatch-store.js";
import type { TasksService } from "./service.js";

const DIRECTORY = "tasks/receipts";
const RecordSchema = z.strictObject({
  format: z.literal(1),
  receipt: ExecutionReceiptSchema,
  consumption: TasksReceiptConsumptionSchema,
  at: z.iso.datetime(),
  status: z.enum(["pending", "delivered", "target_missing", "superseded"]),
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
export type RunOutcome = { state: "succeeded" | "failed"; finishedAt: string; result: NonNullable<TaskRunSummary["result"]> } | { state: "unknown" | "interrupted" | "cancelled"; finishedAt: string | null };

const nativeTerminalStates = new Map<string, "unknown" | "interrupted" | "cancelled">([
  [nativeTerminalCodes.unconfirmed, "unknown"],
  [nativeTerminalCodes.interrupted, "interrupted"],
  [nativeTerminalCodes.stopped, "cancelled"],
]);

function hasResultMessage(receipt: ExecutionReceipt): receipt is Extract<ExecutionReceipt, { kind: "result" | "failed" }> {
  return receipt.kind === "result" || (receipt.kind === "failed" && !nativeTerminalStates.has(receipt.payload.code));
}

function encode(record: DeliveryRecord): Buffer {
  return Buffer.from(JSON.stringify(record) + "\n");
}

/** Only the explicitly selected synthetic dispatch participates in packaged fault injection. */
function fixtureGate(input: ExecutionReceipt): string | undefined {
  const gate = process.env["HUHU_E2E_TASK_RECEIPT_ACK_GATE"];
  if (!gate || !path.isAbsolute(gate) || (input.kind !== "result" && input.kind !== "failed")) return;
  try {
    return readFileSync(path.join(gate, "dispatch-id"), "utf8") === input.execution.dispatchId ? gate : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

function holdFixtureReceipt(input: ExecutionReceipt): void {
  const gate = fixtureGate(input);
  if (!gate || !existsSync(path.join(gate, "before-consume")) || existsSync(path.join(gate, "consume-release"))) return;
  try {
    writeFileSync(path.join(gate, "pending.json"), JSON.stringify(input), { flag: "wx", flush: true, mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  throw new HuhuError("INTERNAL", "验收夹具在 Tasks 接收前中断", { retryable: true });
}

/** Packaged acceptance can cut the internal response after the real inbox has committed it. */
function holdFixtureAck(input: ExecutionReceipt, ack: ExecutionReceiptAck): void {
  const gate = fixtureGate(input);
  if (!gate || existsSync(path.join(gate, "release"))) return;
  try {
    writeFileSync(path.join(gate, "held.json"), JSON.stringify(ack), { flag: "wx", flush: true, mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (existsSync(path.join(gate, "drop-once"))) return;
  }
  throw new HuhuError("INTERNAL", "验收夹具已截断 Tasks 消费 ACK", { retryable: true });
}

/** Receipt IDs are unique within this Vault. The ACK is derived from the bytes read back. */
export class TaskReceiptInbox {
  constructor(
    private readonly files: VaultFiles,
    private readonly now: () => Date,
    private readonly changed: (runId: string) => void,
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

  async consume(input: ExecutionReceipt, expected: ExecutionBinding, signal: AbortSignal, superseded: boolean) {
    this.files.assertWritable();
    signal.throwIfAborted();
    const file = this.file(input.receiptId);
    const previous = this.read(file);
    const result = validateExecutionReceipt(input, expected, previous?.record.consumption.delivery.receipt);
    if (result.status === "rejected") throw errors.invalidInput("任务回执身份或载荷不匹配", [{ reason: result.reason }]);
    holdFixtureReceipt(input);
    if (result.status === "new") {
      const key = fingerprint(input.receiptId);
      const record: DeliveryRecord = {
        format: 1,
        receipt: result.receipt,
        consumption: { execution: expected, delivery: { receipt: result.identity, deliveryId: `delivery-${key}`, messageId: `receipt-${key}` } },
        at: this.now().toISOString(),
        status: superseded ? "superseded" : "pending",
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
    holdFixtureAck(input, ack.ack);
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

  history(taskId: string, bound: (execution: ExecutionBinding) => boolean, onError: (error: unknown) => void = () => {}) {
    const { questions, outcomes } = this.currentHistory(taskId, bound, onError);
    return {
      outcomes,
      questions: questions.map(({ view }) => view).sort((a, b) => a.at.localeCompare(b.at) || a.runId.localeCompare(b.runId) || a.requestId.localeCompare(b.requestId)),
    };
  }

  confirmedFailure(execution: ExecutionBinding): boolean {
    return this.currentHistory(execution.taskId, (candidate) => fingerprint(candidate) === fingerprint(execution)).outcomes.get(execution.dispatchId)?.state === "failed";
  }

  question(taskId: string, runId: string, requestId: string, bound: (execution: ExecutionBinding) => boolean): StoredQuestion | undefined {
    return this.currentHistory(taskId, bound)
      .questions.filter(({ view }) => view.runId === runId && view.requestId === requestId)
      .sort((a, b) => b.receipt.execution.attempt - a.receipt.execution.attempt)[0];
  }

  private currentHistory(taskId: string, bound: (execution: ExecutionBinding) => boolean, onError?: (error: unknown) => void) {
    const questions = new Map<string, StoredQuestion>();
    const terminal = new Map<string, { outcome: RunOutcome; payloadHash: string }>();
    for (const file of this.filesInInbox()) {
      try {
        const value = this.read(file);
        if (!value) continue;
        const { receipt, at, status } = value.record;
        const { execution } = receipt;
        if (status === "superseded" || execution.taskId !== taskId || !bound(execution)) continue;
        if (receipt.kind !== "question") {
          if (receipt.kind !== "progress") {
            const payloadHash = fingerprint([receipt.kind, receipt.payload]);
            const previous = terminal.get(execution.dispatchId);
            if (previous && previous.payloadHash !== payloadHash) {
              terminal.set(execution.dispatchId, { payloadHash: "", outcome: { state: "unknown", finishedAt: null } });
            } else if (!previous || (previous.outcome.finishedAt && at < previous.outcome.finishedAt)) {
              const state = receipt.kind === "failed" ? nativeTerminalStates.get(receipt.payload.code) : undefined;
              const outcome: RunOutcome = state
                ? { state, finishedAt: at }
                : { state: receipt.kind === "failed" ? "failed" : "succeeded", finishedAt: at, result: { kind: receipt.kind, delivery: status } };
              terminal.set(execution.dispatchId, { payloadHash, outcome });
            }
          }
          continue;
        }
        const { requestId, requestVersion, mode, text, options } = receipt.payload;
        const key = fingerprint([execution.dispatchId, requestId]);
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
    const outcomes = new Map([...terminal].map(([runId, { outcome }]) => [runId, outcome]));
    return {
      outcomes,
      questions: [...questions.values()].map((question): StoredQuestion => {
        const { view } = question;
        if (view.mode === "native_deferred" && outcomes.has(question.receipt.execution.dispatchId)) return { ...question, view: { ...view, status: "closed" } };
        return question;
      }),
    };
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
        const hasMessage = hasResultMessage(receipt);
        if (hasMessage) {
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
        if (!signal.aborted) {
          await this.files.write(file, encode({ ...record, status }), { expectedVersion: previous.version });
          if (hasMessage) this.changed(receipt.execution.runId);
        }
      } catch (error) {
        onError?.(error);
      }
    }
  }
}
