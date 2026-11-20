import { readdirSync } from "node:fs";
import { errors, ExecutionBindingSchema, HuhuError, isHuhuError, type ExecutionBinding } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskDispatchExecutor } from "./dispatch.js";
import { fingerprint } from "./dispatch-store.js";
import type { TaskReceiptInbox } from "./receipt-inbox.js";
import type { TasksService } from "./service.js";

const DIRECTORY = "tasks/replies";
const Id = z.string().min(1).max(256).regex(/\S/);
const Question = z.strictObject({
  taskId: Id,
  runId: Id,
  sessionId: Id,
  requestId: Id,
  requestVersion: z.int().positive(),
});
export const TaskReplyLookup = Question.extend({ replyId: Id });
export const TaskReplyInput = TaskReplyLookup.extend({ answer: z.string().min(1).max(20_000).regex(/\S/) });
export const AgentReplyResult = z.strictObject({
  status: z.enum(["accepted", "not_sent", "unknown", "stale", "unsupported"]),
});
export type AgentReplyResult = z.infer<typeof AgentReplyResult>;
export type ReplyAvailability = "open" | "stopping" | "closed";
export type AgentReplyInput = {
  execution: ExecutionBinding;
  requestId: string;
  requestVersion: number;
  nativeRequestId: string;
  replyId: string;
  answer: string;
};
export const TaskReplyView = TaskReplyLookup.extend({
  acceptedAt: z.iso.datetime(),
  status: z.enum(["pending", "sending", "unknown", "accepted", "expired", "not_sent", "unsupported"]),
});
const Entry = z.strictObject({
  input: TaskReplyInput,
  execution: ExecutionBindingSchema,
  nativeRequestId: z.string().regex(/\S/),
  acceptedAt: z.iso.datetime(),
  status: TaskReplyView.shape.status,
});
const Ledger = z.strictObject({ format: z.literal(1), entries: z.array(Entry) });
type Input = z.infer<typeof TaskReplyInput>;
type Lookup = z.infer<typeof TaskReplyLookup>;
type Entry = z.infer<typeof Entry>;
type View = z.infer<typeof TaskReplyView>;

function view({ input, acceptedAt, status }: Entry): View {
  const { answer: _answer, ...identity } = input;
  return { ...identity, acceptedAt, status };
}

function sameQuestion(a: Lookup, b: Lookup): boolean {
  return a.taskId === b.taskId && a.runId === b.runId && a.sessionId === b.sessionId && a.requestId === b.requestId && a.requestVersion === b.requestVersion;
}

/** 先受理原回答，再投影评论并继续原生请求。发送边界一旦划过，仅对账。 */
export class TaskNativeReplies {
  constructor(
    private readonly files: VaultFiles,
    private readonly tasks: TasksService,
    private readonly inbox: TaskReceiptInbox,
    private readonly now: () => Date,
    private readonly executor?: TaskDispatchExecutor,
  ) {}

  private file(taskId: string): string {
    return `${DIRECTORY}/${fingerprint(taskId)}.json`;
  }

  private read(file: string) {
    const saved = this.files.read(file);
    if (!saved) return { entries: [] as Entry[], version: null };
    try {
      const { entries } = Ledger.parse(JSON.parse(saved.bytes.toString("utf8")));
      for (const { input, execution } of entries) {
        if (this.file(input.taskId) !== file || input.taskId !== execution.taskId || input.runId !== execution.runId || input.sessionId !== execution.sessionBinding.sessionId || !execution.sessionBinding.nativeSessionId) {
          throw new Error("Reply identity mismatch");
        }
      }
      return { entries, version: saved.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "任务回答记录损坏");
    }
  }

  private write(file: string, entries: Entry[], version: string | null) {
    return this.files.write(file, Buffer.from(JSON.stringify({ format: 1, entries }) + "\n"), { expectedVersion: version });
  }

  readReply(input: Lookup, bound: (execution: ExecutionBinding) => boolean): View {
    this.tasks.read(input.taskId);
    const entry = this.read(this.file(input.taskId)).entries.find(({ input: prior, execution }) => prior.replyId === input.replyId && sameQuestion(prior, input) && bound(execution));
    if (!entry) throw errors.notFound("没有这条任务回答记录");
    return view(entry);
  }

  list(taskId: string, bound: (execution: ExecutionBinding) => boolean): View[] {
    return this.read(this.file(taskId))
      .entries.filter(({ execution }) => bound(execution))
      .map(view);
  }

  async accept(input: Input, bound: (execution: ExecutionBinding) => boolean, availability: (execution: ExecutionBinding) => ReplyAvailability, signal: AbortSignal): Promise<View> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      signal.throwIfAborted();
      const task = this.tasks.read(input.taskId);
      const file = this.file(task.id);
      const { entries, version } = this.read(file);
      const prior = entries.find((entry) => entry.input.replyId === input.replyId);
      if (prior) {
        if (fingerprint(prior.input) !== fingerprint(input)) throw errors.idempotencyMismatch();
        if (!bound(prior.execution)) throw new HuhuError("VERSION_CONFLICT", "原任务执行绑定已失效");
        return view(prior);
      }
      this.files.assertWritable();
      const question = this.inbox.question(task.id, input.runId, input.requestId, bound);
      if (task.status === "completed" || !question || question.view.status !== "awaiting" || question.view.requestVersion !== input.requestVersion || question.view.sessionId !== input.sessionId) {
        throw new HuhuError("VERSION_CONFLICT", "任务问题已变化，请重新读取");
      }
      if (entries.some((entry) => sameQuestion(entry.input, input))) throw new HuhuError("VERSION_CONFLICT", "该任务问题已有一条回答");
      const { execution, payload } = question.receipt;
      if (payload.mode !== "native_deferred") throw errors.invalidInput("普通问题需要通过后续轮次回答");
      if (availability(execution) !== "open") throw new HuhuError("VERSION_CONFLICT", "原任务运行正在停止或已经结束");
      if (!payload.options.includes(input.answer)) throw errors.invalidInput("回答必须匹配原问题的选项");
      const entry: Entry = { input, execution, nativeRequestId: payload.nativeRequestId, acceptedAt: this.now().toISOString(), status: "pending" };
      await this.write(file, [...entries, entry], version);
      return this.readReply(input, bound);
    });
  }

  private filesInLedger(): string[] {
    try {
      return readdirSync(this.files.abs(DIRECTORY))
        .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
        .map((file) => `${DIRECTORY}/${file}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async replay(
    bound: (execution: ExecutionBinding) => boolean,
    availability: (execution: ExecutionBinding) => ReplyAvailability,
    takeSlot: (execution: ExecutionBinding) => boolean,
    signal: AbortSignal,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    for (const file of this.filesInLedger()) {
      if (signal.aborted) return;
      try {
        for (const entry of this.read(file).entries) {
          if (signal.aborted) return;
          if (bound(entry.execution) && (entry.status === "pending" || entry.status === "sending" || entry.status === "unknown")) await this.advance(file, entry, bound, availability, takeSlot, signal);
        }
      } catch (error) {
        if (!signal.aborted) onError?.(error);
      }
    }
  }

  private async advance(
    file: string,
    entry: Entry,
    bound: (execution: ExecutionBinding) => boolean,
    availability: (execution: ExecutionBinding) => ReplyAvailability,
    takeSlot: (execution: ExecutionBinding) => boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const { input, execution, nativeRequestId, acceptedAt, status } = entry;
    const { taskId, runId, requestId, requestVersion, sessionId, replyId, answer } = input;
    const pending = status === "pending";
    if (pending) {
      try {
        await this.tasks.addComment(taskId, {
          id: `reply-${fingerprint([taskId, replyId])}`,
          at: acceptedAt,
          source: "human",
          author: "我",
          run: runId,
          session: sessionId,
          ask: requestId,
          event: "answer",
          body: answer,
        });
      } catch (error) {
        if (!isHuhuError(error) || error.code !== "NOT_FOUND") throw error;
        await this.change(file, entry, signal, () => "expired");
        return;
      }
      const sending = await this.change(file, entry, signal, () => {
        const route = availability(execution);
        if (route === "stopping") return "pending";
        if (route === "closed") return "expired";
        try {
          if (this.tasks.read(taskId).status === "completed") return "expired";
        } catch (error) {
          if (isHuhuError(error) && error.code === "NOT_FOUND") return "expired";
          throw error;
        }
        const question = this.inbox.question(taskId, runId, requestId, bound);
        if (
          question?.view.status !== "awaiting" ||
          question.view.requestVersion !== requestVersion ||
          question.receipt.payload.mode !== "native_deferred" ||
          question.receipt.payload.nativeRequestId !== nativeRequestId ||
          fingerprint(question.receipt.execution) !== fingerprint(execution)
        )
          return "expired";
        if (!this.executor?.answer) return "unsupported";
        return takeSlot(execution) ? "sending" : "pending";
      });
      if (sending !== "sending") return;
    }
    if (signal.aborted) return;
    let outcome: AgentReplyResult["status"] = "unknown";
    try {
      const send = pending ? this.executor?.answer : this.executor?.inspectAnswer;
      if (send) outcome = (await send({ execution, requestId, requestVersion, nativeRequestId, replyId, answer }, signal)).status;
    } catch {
      // A lost response never permits another write to the original native request.
    }
    const current = pending ? { ...entry, status: "sending" as const } : entry;
    await this.change(file, current, signal, () => (outcome === "stale" ? "expired" : outcome));
  }

  private change(file: string, entry: Entry, signal: AbortSignal, decide: () => Entry["status"]): Promise<Entry["status"] | undefined> {
    return this.tasks.withTaskWrite(entry.input.taskId, async () => {
      if (signal.aborted) return;
      const { entries, version } = this.read(file);
      const index = entries.findIndex((candidate) => candidate.input.replyId === entry.input.replyId);
      const current = entries[index];
      if (!current || fingerprint(current) !== fingerprint(entry)) return;
      const status = decide();
      if (status !== current.status) {
        entries[index] = { ...current, status };
        await this.write(file, entries, version);
      }
      return status;
    });
  }
}
