import { HuhuError, errors, isHuhuError, isTaskAvailable, newId, type ExecutionBinding, type ExecutionReceipt, type TaskDto } from "@huhu/contracts";
import { AgentDispatchInputSchema, type AgentNativeStopInputSchema, type AgentNativeStopStatusSchema } from "@huhu/plugin-agent-cli/engine";
import {
  DispatchInput,
  DispatchLookup,
  DispatchStore,
  ReplySource,
  RuleSource,
  SupplementSource,
  eventIdOf,
  fingerprint,
  holdsTask,
  sameInput,
  type DispatchReceipt,
  type DispatchRecord,
  type DispatchSnapshot,
  type DispatchSource,
  type OwnedRecord,
  type StopLookup,
  type StopReceipt,
} from "./dispatch-store.js";
import { agentDispatchBlocker, type TasksService } from "./service.js";
import type { RunOutcome, TaskReceiptInbox } from "./receipt-inbox.js";
import {
  type AgentReplyInput,
  type AgentReplyResult,
  type ReplyAvailability,
  type TaskNativeReplies,
  type TaskReplyInput,
  type TaskReplyLookup,
  type TaskReplyView,
  type TaskSupplementInput,
  type TaskSupplementLookup,
  type TaskSupplementView,
} from "./native-replies.js";
import { WriteQueue } from "./write-queue.js";
import type { z } from "zod";

export type TaskDispatchWork = Readonly<{
  eventId: string;
  dispatchId: string;
  runId: string;
  attempt: number;
  snapshot: DispatchSnapshot;
  snapshotHash: string;
  agentTarget?: NonNullable<DispatchRecord["agentTarget"]>;
}>;

export type TaskDispatchReadiness = "ready" | "busy" | "unavailable" | "unsupported" | { state: "ready" | "busy"; target: NonNullable<DispatchRecord["agentTarget"]> };
export type TaskDispatchResult = "accepted" | "not_sent" | "unknown" | "unsupported" | { state: "accepted"; execution: ExecutionBinding };
type NativeStopInput = z.infer<typeof AgentNativeStopInputSchema>;
type NativeStopStatus = z.infer<typeof AgentNativeStopStatusSchema>;
type StopRecord = NonNullable<OwnedRecord["stop"]>;
type RuleSlots = Map<string, Set<string>>;
type ReplyInput = z.infer<typeof TaskReplyInput>;
type ReplyLookup = z.infer<typeof TaskReplyLookup>;
type ReplyView = z.infer<typeof TaskReplyView>;
type SupplementInput = z.infer<typeof TaskSupplementInput>;
type SupplementLookup = z.infer<typeof TaskSupplementLookup>;
type SupplementView = z.infer<typeof TaskSupplementView>;
type ContinuationSource = z.infer<typeof ReplySource> | z.infer<typeof SupplementSource>;

const normalDispatchId = ({ taskId, replyId }: ReplyLookup) => `reply-${fingerprint([taskId, replyId])}`;
const supplementDispatchId = ({ taskId, supplementId }: SupplementLookup) => `supplement-${fingerprint([taskId, supplementId])}`;

function continuationStatus(receipt: DispatchReceipt): ReplyView["status"] {
  const statusByState: Record<DispatchReceipt["state"], ReplyView["status"]> = {
    pending: "pending",
    claimed: "pending",
    sending: "sending",
    running: "accepted",
    unknown: "unknown",
    cancelled: "expired",
    stale_input: "expired",
    expired: "expired",
    blocked: receipt.reason === "target_unsupported" ? "unsupported" : "not_sent",
  };
  return statusByState[receipt.state];
}

function normalReplyView(record: DispatchRecord): ReplyView | undefined {
  const {
    receipt,
    snapshot: { source },
  } = record;
  if (source.kind !== "reply") return undefined;
  return {
    taskId: receipt.taskId,
    runId: source.parent.runId,
    sessionId: source.parent.sessionBinding.sessionId,
    requestId: source.requestId,
    requestVersion: source.requestVersion,
    replyId: source.replyId,
    acceptedAt: receipt.acceptedAt,
    status: continuationStatus(receipt),
    followUpRunId: receipt.runId,
  };
}

function supplementView(record: DispatchRecord): SupplementView | undefined {
  const {
    receipt,
    snapshot: { source },
  } = record;
  if (source.kind !== "supplement") return undefined;
  return {
    taskId: receipt.taskId,
    runId: source.parent.runId,
    sessionId: source.parent.sessionBinding.sessionId,
    supplementId: source.supplementId,
    acceptedAt: receipt.acceptedAt,
    status: continuationStatus(receipt),
    followUpRunId: receipt.runId,
    messageIds: source.messageIds,
  };
}

function selectedInput(task: TaskDto, text: string | undefined, messageIds: readonly string[]): string {
  const selected = [...new Set(messageIds)].map((id) => task.comments.find((comment) => comment.id === id));
  if (selected.length !== messageIds.length || selected.some((comment) => !comment)) throw errors.invalidInput("所选任务消息不存在或重复");
  const context = selected.map((comment) => comment!.body).join("\n\n");
  const body = text && context ? `${text}\n\n附带的任务消息\n\n${context}` : (text ?? context);
  if (!AgentDispatchInputSchema.shape.input.safeParse(body.replaceAll("\r\n", "\n")).success) throw errors.invalidInput("输入与所选消息不符合发送格式");
  return body;
}

export interface TaskDispatchExecutor {
  /** 只读目标/资源预检。实际输入所有权仍须由执行者在派遣时核验。 */
  ready(work: TaskDispatchWork, signal: AbortSignal): Promise<TaskDispatchReadiness>;
  /** accepted 表示目标实例已接收本轮输入；仅保存启动意图仍须对账。 */
  dispatch(work: TaskDispatchWork, signal: AbortSignal): Promise<TaskDispatchResult>;
  /** not_sent 必须是可证明未送达；空列表或离线只能返回 unknown。 */
  inspect(work: TaskDispatchWork, signal: AbortSignal): Promise<Exclude<TaskDispatchResult, "unsupported">>;
  answer?(input: AgentReplyInput, signal: AbortSignal): Promise<AgentReplyResult>;
  inspectAnswer?(input: AgentReplyInput, signal: AbortSignal): Promise<AgentReplyResult>;
  stop?(input: NativeStopInput, signal: AbortSignal): Promise<NativeStopStatus>;
  inspectStop?(input: NativeStopInput, signal: AbortSignal): Promise<NativeStopStatus>;
}

type Rejection = NonNullable<DispatchReceipt["reason"]> | "stale_input" | "not_due" | "expired" | ReturnType<DispatchStore["ownerIssue"]>;

function rejectDispatch(reason: Rejection, message: string, existing?: DispatchReceipt): never {
  const code = reason === "stale_input" ? "VERSION_CONFLICT" : "INVALID_INPUT";
  throw new HuhuError(code, message, { details: { reason, ...(existing ? { dispatchId: existing.dispatchId, eventId: existing.eventId, runId: existing.runId } : {}) } });
}

function maySend(task: TaskDto, receipt: DispatchReceipt, now: Date): boolean {
  return isTaskAvailable(task.availableAt, now) || task.availableAt === receipt.overriddenAvailableAt;
}

function holdsRun(record: DispatchRecord, outcomes: ReadonlyMap<string, RunOutcome>, task: TaskDto | null): boolean {
  if (!holdsTask(record.receipt)) return false;
  const outcome = outcomes.get(record.receipt.runId);
  if (record.receipt.state !== "running" || (record.stop?.status !== "stopped" && !outcome?.finishedAt)) return true;
  // The terminal receipt can race the initial task link. Keep that accepted input occupied until linked.
  return task !== null && task.status === "not_started" && sameInput(task, record.snapshot);
}

function stopView({ receipt }: DispatchRecord, stop: StopRecord): StopReceipt {
  const { taskId, dispatchId, runId } = receipt;
  return { taskId, dispatchId, runId, ...stop };
}

export class TaskDispatch {
  private readonly acceptance = new WriteQueue();
  private readonly abort = new AbortController();
  private checking = false;

  constructor(
    private readonly tasks: TasksService,
    private readonly store: DispatchStore,
    private readonly receipts: TaskReceiptInbox,
    private readonly replies: TaskNativeReplies,
    private readonly now: () => Date,
    private readonly machineId: string,
    private readonly executor?: TaskDispatchExecutor,
    private readonly onError?: (error: unknown) => void,
  ) {}

  async close(): Promise<void> {
    this.abort.abort();
    await this.tasks.drainWrites();
  }

  consumeReceipt(receipt: ExecutionReceipt, signal: AbortSignal) {
    const stopped = AbortSignal.any([signal, this.abort.signal]);
    return this.tasks.withTaskWrite(receipt.execution.taskId, () => {
      stopped.throwIfAborted();
      const expected = this.boundExecution(receipt.execution);
      if (!expected) throw new HuhuError("RUN_UNKNOWN", "任务仍在等待已确认的执行绑定", { retryable: true });
      return this.receipts.consume(receipt, expected, stopped);
    });
  }

  reply(input: ReplyInput, signal: AbortSignal): Promise<ReplyView> {
    const stopped = AbortSignal.any([signal, this.abort.signal]);
    const prior = this.store.read(eventIdOf(normalDispatchId(input)));
    const question = this.receipts.question(input.taskId, input.runId, input.requestId, this.matchesExecution);
    if (prior || question?.receipt.payload.mode === "normal") return this.acceptNormalReply(input, stopped);
    return this.replies.accept(input, this.matchesExecution, this.replyAvailability, stopped);
  }

  readReply(input: ReplyLookup): ReplyView {
    this.tasks.read(input.taskId);
    const record = this.store.read(eventIdOf(normalDispatchId(input)))?.record;
    const normal = record && normalReplyView(record);
    if (
      normal &&
      record &&
      record.snapshot.source.kind === "reply" &&
      this.store.owns(record) &&
      normal.runId === input.runId &&
      normal.sessionId === input.sessionId &&
      normal.requestId === input.requestId &&
      normal.requestVersion === input.requestVersion
    )
      return normal;
    return this.replies.readReply(input, this.matchesExecution);
  }

  acceptSupplement(input: SupplementInput, outer: AbortSignal): Promise<SupplementView> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      AbortSignal.any([outer, this.abort.signal]).throwIfAborted();
      const task = this.tasks.read(input.taskId);
      const dispatchId = supplementDispatchId(input);
      const prior = this.store.read(eventIdOf(dispatchId))?.record;
      if (prior) {
        const source = prior.snapshot.source;
        const view = supplementView(prior);
        if (!view || source.kind !== "supplement" || !this.store.owns(prior)) throw new HuhuError("VERSION_CONFLICT", "补充轮次的归属不匹配");
        if (view.runId !== input.runId || view.sessionId !== input.sessionId || source.text !== input.text || fingerprint(source.messageIds) !== fingerprint(input.messageIds)) throw errors.idempotencyMismatch();
        return view;
      }
      this.store.assertWritable();
      if (task.type !== "agent" || task.status === "completed") throw errors.invalidInput("当前任务无法发送补充信息");
      const records = this.store.list().filter(({ receipt }) => receipt.taskId === task.id);
      const parent = records.find(({ receipt }) => receipt.runId === input.runId);
      const execution = parent?.boundExecution;
      if (!parent || !execution || execution.sessionBinding.sessionId !== input.sessionId || !this.matchesExecution(execution)) throw new HuhuError("RUN_UNKNOWN", "无法确认补充信息的原会话");
      this.assertContinuationSlot(task, records, input.runId);
      const source = SupplementSource.parse({ kind: "supplement", parent: execution, supplementId: input.supplementId, text: input.text, messageIds: input.messageIds });
      const body = selectedInput(task, input.text, input.messageIds);
      return supplementView(await this.saveContinuation(task, parent, source, dispatchId, body))!;
    });
  }

  readSupplement(input: SupplementLookup): SupplementView {
    this.tasks.read(input.taskId);
    const record = this.store.read(eventIdOf(supplementDispatchId(input)))?.record;
    const view = record && this.store.owns(record) ? supplementView(record) : undefined;
    if (!view || view.runId !== input.runId || view.sessionId !== input.sessionId) throw errors.notFound("没有这条任务补充记录");
    return view;
  }

  private acceptNormalReply(input: ReplyInput, signal: AbortSignal): Promise<ReplyView> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      signal.throwIfAborted();
      const task = this.tasks.read(input.taskId);
      const dispatchId = normalDispatchId(input);
      const eventId = eventIdOf(dispatchId);
      const messageIds = input.messageIds ?? [];
      const prior = this.store.read(eventId)?.record;
      if (prior) {
        const source = prior.snapshot.source;
        if (source.kind !== "reply" || !this.store.owns(prior)) throw new HuhuError("VERSION_CONFLICT", "后续任务轮次的归属不匹配");
        const previous = normalReplyView(prior)!;
        if (
          previous.runId !== input.runId ||
          previous.sessionId !== input.sessionId ||
          previous.requestId !== input.requestId ||
          previous.requestVersion !== input.requestVersion ||
          source.answer !== input.answer ||
          fingerprint(source.messageIds) !== fingerprint(messageIds)
        )
          throw errors.idempotencyMismatch();
        return previous;
      }
      this.store.assertWritable();
      if (this.replies.list(task.id, this.matchesExecution).some(({ replyId }) => replyId === input.replyId)) throw errors.idempotencyMismatch();
      const question = this.receipts.question(task.id, input.runId, input.requestId, this.matchesExecution);
      if (
        task.type !== "agent" ||
        task.status === "completed" ||
        question?.receipt.payload.mode !== "normal" ||
        question.view.status !== "awaiting" ||
        question.view.requestVersion !== input.requestVersion ||
        question.view.sessionId !== input.sessionId
      ) {
        throw new HuhuError("VERSION_CONFLICT", "任务问题已变化，请重新读取");
      }
      const parent = this.store.read(eventIdOf(question.receipt.execution.dispatchId))?.record;
      if (!parent) throw new HuhuError("RUN_UNKNOWN", "缺少原会话的派遣记录");
      const records = this.store.list().filter(({ receipt }) => receipt.taskId === task.id);
      if (records.some(({ snapshot }) => snapshot.source.kind === "reply" && snapshot.source.parent.runId === input.runId && snapshot.source.requestId === input.requestId && snapshot.source.requestVersion === input.requestVersion)) {
        throw new HuhuError("VERSION_CONFLICT", "该任务问题已有一条回答");
      }
      this.assertContinuationSlot(task, records, input.runId);
      const body = selectedInput(task, input.answer, messageIds);
      const source = ReplySource.parse({ kind: "reply", parent: question.receipt.execution, requestId: input.requestId, requestVersion: input.requestVersion, replyId: input.replyId, answer: input.answer, messageIds });
      return normalReplyView(await this.saveContinuation(task, parent, source, dispatchId, body))!;
    });
  }

  private assertContinuationSlot(task: TaskDto, records: DispatchRecord[], parentRunId: string): void {
    const { outcomes } = this.receipts.history(task.id, this.matchesExecution, this.onError);
    if (records.some((record) => record.receipt.runId !== parentRunId && holdsRun(record, outcomes, task))) rejectDispatch("task_occupied", "该任务已有待派或活动运行");
  }

  private saveContinuation(task: TaskDto, parent: DispatchRecord, source: ContinuationSource, dispatchId: string, body: string) {
    const acceptedAt = this.now();
    const launch = parent.snapshot.execution;
    const spaceId = launch.spaceId;
    if (!spaceId) throw new HuhuError("RUN_UNKNOWN", "缺少原会话的工作区");
    const binding = source.parent.sessionBinding;
    const snapshot: DispatchSnapshot = {
      taskId: task.id,
      expectedVersion: task.version,
      taskVersion: task.version,
      inputRevision: task.inputRevision,
      inputHash: task.inputHash,
      body,
      execution: { ...launch, target: { mode: "existing", sessionId: binding.sessionId } },
      references: [],
      source,
    };
    const intent: DispatchInput = {
      taskId: task.id,
      dispatchId,
      expectedVersion: task.version,
      inputRevision: task.inputRevision,
      inputHash: task.inputHash,
    };
    const receipt: DispatchReceipt = {
      taskId: task.id,
      dispatchId,
      eventId: eventIdOf(dispatchId),
      runId: newId("run", acceptedAt.getTime()),
      attempt: 1,
      acceptedAt: acceptedAt.toISOString(),
      state: "pending",
      reason: null,
      cancelRequested: false,
      parentRunId: parent.receipt.runId,
    };
    const spaceRevision = parent.agentTarget?.mode === "resume" ? undefined : parent.agentTarget?.spaceRevision;
    return this.store.create({
      receipt,
      requestHash: fingerprint({ input: intent, source }),
      snapshot,
      snapshotHash: fingerprint(snapshot),
      agentTarget: { mode: "existing", spaceId, ...(spaceRevision !== undefined && { spaceRevision }), binding },
      claim: null,
      startedAt: null,
      finishedAt: null,
    });
  }

  async acceptStop(input: StopLookup, signal: AbortSignal): Promise<StopReceipt> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      AbortSignal.any([signal, this.abort.signal]).throwIfAborted();
      const { record, version } = this.lookup(input);
      if (record.receipt.runId !== input.runId) throw errors.notFound("没有这条任务运行");
      if (record.stop) {
        if (record.stop.stopId !== input.stopId) throw new HuhuError("VERSION_CONFLICT", "该任务运行已有停止记录");
        return stopView(record, record.stop);
      }
      this.store.assertWritable();
      if (!this.store.owns(record) || !record.boundExecution || !this.matchesExecution(record.boundExecution) || record.receipt.state !== "running") {
        throw new HuhuError("RUN_UNKNOWN", "现有记录无法确认原任务执行");
      }
      const now = this.now().toISOString();
      const { outcomes } = this.receipts.history(input.taskId, this.matchesExecution, this.onError);
      const stop: StopRecord = { stopId: input.stopId, status: outcomes.get(input.runId)?.finishedAt ? "completed" : "pending", acceptedAt: now, updatedAt: now };
      const saved = await this.store.write({ ...record, stop }, version);
      return stopView(saved, stop);
    });
  }

  readStop(input: StopLookup): StopReceipt {
    const { record } = this.lookup(input);
    if (record.receipt.runId !== input.runId || record.stop?.stopId !== input.stopId) throw errors.notFound("没有这条停止记录");
    return stopView(record, record.stop);
  }

  private boundExecution({ dispatchId, taskId }: ExecutionBinding): ExecutionBinding | undefined {
    const stored = this.store.read(eventIdOf(dispatchId));
    if (!stored || stored.record.receipt.taskId !== taskId || !this.store.owns(stored.record) || stored.record.claim?.machineId !== this.machineId) return undefined;
    return stored.record.boundExecution;
  }

  private matchesExecution = (execution: ExecutionBinding): boolean => {
    const expected = this.boundExecution(execution);
    return expected !== undefined && fingerprint(expected) === fingerprint(execution);
  };

  private replyAvailability = (execution: ExecutionBinding): ReplyAvailability => {
    const status = this.store.read(eventIdOf(execution.dispatchId))?.record.stop?.status;
    if (status === "stopped" || status === "completed") return "closed";
    if (status === "pending" || status === "sending" || status === "unknown") return "stopping";
    return "open";
  };

  questions(taskId: string) {
    this.tasks.read(taskId);
    return this.history(taskId).questions;
  }

  private history(taskId: string) {
    const normal = this.store
      .list()
      .filter((record) => record.receipt.taskId === taskId && this.store.owns(record))
      .flatMap((record) => normalReplyView(record) ?? []);
    const replies = [...this.replies.list(taskId, this.matchesExecution), ...normal];
    const history = this.receipts.history(taskId, this.matchesExecution, this.onError);
    const closed = new Set(
      this.store
        .list()
        .filter(({ receipt, stop }) => receipt.taskId === taskId && (stop?.status === "stopped" || stop?.status === "completed"))
        .map(({ receipt }) => receipt.runId),
    );
    const questions = history.questions.map((question) => {
      const reply = replies.find((reply) => reply.runId === question.runId && reply.requestId === question.requestId && reply.requestVersion === question.requestVersion);
      const status = question.mode === "native_deferred" && closed.has(question.runId) ? "closed" : question.status;
      return { ...question, status, ...(reply && { reply }) };
    });
    return { ...history, questions };
  }

  hasHold(taskId: string): boolean {
    const candidates = this.store.list().filter(({ receipt }) => receipt.taskId === taskId && holdsTask(receipt));
    if (!candidates.length) return false;
    const { outcomes } = this.receipts.history(taskId, this.matchesExecution, this.onError);
    const task = this.task(taskId);
    return candidates.some((record) => holdsRun(record, outcomes, task));
  }

  hasActiveRun(taskId: string): boolean {
    const running = this.store.list().filter((record) => record.receipt.taskId === taskId && record.receipt.state === "running" && this.store.owns(record));
    if (!running.length) return false;
    const { outcomes } = this.receipts.history(taskId, this.matchesExecution, this.onError);
    return running.some(({ receipt, stop }) => stop?.status !== "stopped" && !outcomes.get(receipt.runId)?.finishedAt);
  }

  runs(taskId: string): Array<ReturnType<TasksService["runs"]>[number] & { parentRunId?: string }> {
    const { questions, outcomes } = this.history(taskId);
    return this.store.list().flatMap(({ receipt, claim, snapshot, startedAt, finishedAt, stop }) => {
      if (receipt.taskId !== taskId || (!claim && !receipt.parentRunId)) return [];
      const open = questions.filter(({ runId, status }) => runId === receipt.runId && status === "awaiting");
      const outcome = outcomes.get(receipt.runId);
      let state = "queued";
      if (stop?.status === "stopped" && !outcome) state = "cancelled";
      else if (outcome) state = outcome.state;
      else if (stop?.status === "unknown" || stop?.status === "completed") state = "unknown";
      else if (receipt.state === "running") state = open.some(({ reply }) => reply?.status !== "accepted") ? "waiting_input" : "running";
      else if (receipt.state === "unknown") state = "unknown";
      else if (["cancelled", "stale_input", "expired", "blocked"].includes(receipt.state)) state = "cancelled";
      return [
        {
          id: receipt.runId,
          state,
          startedAt,
          finishedAt: outcome ? outcome.finishedAt : stop?.status === "stopped" ? stop.updatedAt : finishedAt,
          model: snapshot.execution.model,
          questions: open.filter(({ reply }) => !reply).length,
          ...(receipt.parentRunId && { parentRunId: receipt.parentRunId }),
        },
      ];
    });
  }

  acceptRule(input: DispatchInput, source: RuleSource): Promise<DispatchReceipt> {
    return this.accept(DispatchInput.parse(input), RuleSource.parse(source));
  }

  async accept(input: DispatchInput, source: DispatchSource): Promise<DispatchReceipt> {
    const eventId = eventIdOf(input.dispatchId);
    const requestHash = fingerprint({ input, source });
    return this.acceptance.run(eventId, () =>
      this.tasks.withTaskWrite(input.taskId, async () => {
        this.abort.signal.throwIfAborted();
        const prior = this.store.read(eventId);
        if (prior) {
          if (prior.record.requestHash !== requestHash) throw errors.idempotencyMismatch();
          return prior.record.receipt;
        }
        this.store.assertWritable();
        const task = this.tasks.read(input.taskId);
        const acceptedAt = this.now();
        const { outcomes } = this.receipts.history(task.id, this.matchesExecution, this.onError);
        const existing = this.store.list().find((record) => record.receipt.taskId === task.id && holdsRun(record, outcomes, task));
        if (existing || this.tasks.hasLegacyRun(task.id)) rejectDispatch("task_occupied", "该任务已有待派或活动运行", existing?.receipt);
        if (!sameInput(task, input)) rejectDispatch("stale_input", "任务输入已变化，请重新读取任务");
        const execution = this.dispatchable(task);
        if (!execution) rejectDispatch("task_unavailable", "只有配置齐全且未开始的 Agent 任务可以派遣");
        const early = !isTaskAvailable(task.availableAt, acceptedAt);
        if (early && (source.kind !== "desktop" || input.allowEarly !== true)) rejectDispatch("not_due", "尚未到最早派遣时间");
        if (source.kind === "automation") {
          if (source.notBefore && Date.parse(source.notBefore) > acceptedAt.getTime()) rejectDispatch("not_due", "派遣时刻尚未到达");
          if (source.expiresAt && Date.parse(source.expiresAt) <= acceptedAt.getTime()) rejectDispatch("expired", "派遣窗口已结束");
        }
        const snapshot: DispatchSnapshot = {
          taskId: task.id,
          expectedVersion: input.expectedVersion,
          taskVersion: task.version,
          inputRevision: task.inputRevision,
          inputHash: task.inputHash,
          body: task.body,
          execution,
          references: task.references.filter((ref) => ref.from === "task").map((ref) => ref.path),
          source,
          ...(input.allowEarly !== undefined && { allowEarly: input.allowEarly }),
        };
        const receipt: DispatchReceipt = {
          taskId: task.id,
          dispatchId: input.dispatchId,
          eventId,
          runId: newId("run", acceptedAt.getTime()),
          attempt: 1,
          acceptedAt: acceptedAt.toISOString(),
          state: "pending",
          reason: null,
          cancelRequested: false,
          ...(early && task.availableAt && { overriddenAvailableAt: task.availableAt }),
        };
        // 只要求旧版本的执行输入仍一致。评论或不参与执行的字段可在新文件版本上受理。
        return (await this.store.create({ receipt, requestHash, snapshot, snapshotHash: fingerprint(snapshot), claim: null, startedAt: null, finishedAt: null })).receipt;
      }),
    );
  }

  read(input: DispatchLookup): DispatchReceipt {
    const { record } = this.lookup(input);
    if (holdsTask(record.receipt) && record.claim && record.claim.machineId !== this.machineId) return { ...record.receipt, reason: "foreign_machine" };
    return record.receipt;
  }

  async cancel(input: DispatchLookup): Promise<DispatchReceipt> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      this.abort.signal.throwIfAborted();
      const { record, version } = this.lookup(input);
      const { receipt } = record;
      if (receipt.cancelRequested || !holdsTask(receipt)) return receipt;
      if (!this.store.owns(record)) rejectDispatch(this.store.ownerIssue(record), "该派遣记录只能作为历史查看");
      const canCancel = receipt.state === "pending" || (receipt.state === "claimed" && record.claim?.machineId === this.machineId);
      const next = { ...receipt, cancelRequested: true };
      if (canCancel) {
        next.state = "cancelled";
        next.reason = null;
      }
      return (await this.store.write({ ...record, receipt: next, finishedAt: canCancel ? this.now().toISOString() : null }, version)).receipt;
    });
  }

  /** 受理成功后与重开都走相同的领取路径。 */
  async check(): Promise<void> {
    if (this.store.readOnly || this.checking || this.abort.signal.aborted) return;
    this.checking = true;
    try {
      await this.receipts.replay(this.tasks, this.matchesExecution, this.abort.signal, this.onError);
      const events = this.store
        .list((error) => this.onError?.(error))
        .filter(({ receipt }) => holdsTask(receipt))
        .sort((a, b) => a.receipt.acceptedAt.localeCompare(b.receipt.acceptedAt) || a.receipt.eventId.localeCompare(b.receipt.eventId));
      const slots: RuleSlots = new Map();
      for (const event of events) this.updateRuleSlots(slots, event);
      await this.replies.replay(
        this.matchesExecution,
        this.replyAvailability,
        (execution) => {
          const stored = this.store.read(eventIdOf(execution.dispatchId));
          return stored !== null && this.takeRuleSlot(slots, stored.record);
        },
        this.abort.signal,
        this.onError,
      );
      for (const event of events) {
        if (this.abort.signal.aborted) break;
        try {
          await this.advance(event, slots);
        } catch (error) {
          if (!this.abort.signal.aborted) this.onError?.(error);
        } finally {
          if (event.snapshot.source.kind === "automation") {
            const latest = this.store.read(event.receipt.eventId);
            if (latest) this.updateRuleSlots(slots, latest.record);
          }
        }
      }
    } catch (error) {
      this.onError?.(error);
    } finally {
      this.checking = false;
    }
  }

  private updateRuleSlots(slots: RuleSlots, record: DispatchRecord): void {
    const { source } = record.snapshot;
    if (source.kind !== "automation" || !this.store.owns(record)) return;
    const active = slots.get(source.ruleId) ?? new Set<string>();
    const { eventId } = record.receipt;
    let occupied = true;
    try {
      occupied = this.usesRuleSlot(record);
    } catch (error) {
      this.onError?.(error);
    }
    if (occupied) active.add(eventId);
    else active.delete(eventId);
    slots.set(source.ruleId, active);
  }

  private usesRuleSlot({ receipt, stop }: OwnedRecord): boolean {
    const { state, taskId, runId } = receipt;
    if (state === "claimed" || state === "sending" || state === "unknown") return true;
    if (state !== "running" || stop?.status === "stopped" || stop?.status === "completed") return false;
    const { questions, outcomes } = this.receipts.history(taskId, this.matchesExecution, this.onError);
    if (outcomes.get(runId)?.finishedAt) return false;
    if (stop?.status === "unknown") return true;
    const paused = questions.filter((question) => question.runId === runId && question.mode === "native_deferred" && question.status === "awaiting");
    if (!paused.length) return true;
    const replies = this.replies.list(taskId, this.matchesExecution);
    return paused.some((question) =>
      replies.some((reply) => reply.runId === runId && reply.requestId === question.requestId && reply.requestVersion === question.requestVersion && (reply.status === "sending" || reply.status === "unknown" || reply.status === "accepted")),
    );
  }

  private takeRuleSlot(slots: RuleSlots, record: DispatchRecord): boolean {
    const { source } = record.snapshot;
    if (source.kind !== "automation") return true;
    const active = slots.get(source.ruleId) ?? new Set<string>();
    const { eventId } = record.receipt;
    if (source.maxConcurrent !== undefined && !active.has(eventId) && active.size >= source.maxConcurrent) return false;
    active.add(eventId);
    slots.set(source.ruleId, active);
    return true;
  }

  private lookup(input: DispatchLookup) {
    const stored = this.store.read(eventIdOf(input.dispatchId));
    if (!stored || stored.record.receipt.taskId !== input.taskId) throw errors.notFound("没有这条任务派遣记录");
    return stored;
  }

  private current(event: OwnedRecord) {
    const { record, version } = this.lookup(event.receipt);
    if (!this.store.owns(record) || record.identityHash !== event.identityHash || (record.claim && record.claim.machineId !== this.machineId)) return null;
    return { record, version };
  }

  private dispatchable(task: TaskDto): DispatchSnapshot["execution"] | null {
    const config = task.execution;
    if (!config || agentDispatchBlocker(task)) return null;
    return { ...config, target: config.target ?? { mode: "new" } };
  }

  private task(taskId: string): TaskDto | null {
    try {
      return this.tasks.read(taskId);
    } catch (error) {
      if (isHuhuError(error) && error.code === "NOT_FOUND") return null;
      throw error;
    }
  }

  private continuation(source: ContinuationSource): "ready" | "waiting" | "stale" {
    const { parent } = source;
    if (!this.matchesExecution(parent)) return "stale";
    const route = this.replyAvailability(parent);
    if (route === "closed") return "stale";
    if (route === "stopping") return "waiting";
    if (source.kind === "reply") {
      const question = this.receipts.question(parent.taskId, parent.runId, source.requestId, this.matchesExecution);
      if (question?.receipt.payload.mode !== "normal" || question.view.status !== "awaiting" || question.view.requestVersion !== source.requestVersion || fingerprint(question.receipt.execution) !== fingerprint(parent)) return "stale";
    }
    const { outcomes } = this.receipts.history(parent.taskId, this.matchesExecution, this.onError);
    return outcomes.get(parent.runId)?.finishedAt ? "ready" : "waiting";
  }

  private async projectContinuation(record: OwnedRecord, source: ContinuationSource): Promise<void> {
    const { receipt } = record;
    try {
      await this.tasks.addComment(receipt.taskId, {
        id: receipt.dispatchId,
        at: receipt.acceptedAt,
        source: "human",
        author: "我",
        run: source.parent.runId,
        session: source.parent.sessionBinding.sessionId,
        ...(source.kind === "reply" ? { ask: source.requestId, event: "answer", body: source.answer } : { event: "supplement", body: record.snapshot.body }),
      });
    } catch (error) {
      if (!isHuhuError(error) || error.code !== "NOT_FOUND") throw error;
    }
  }

  private async advance(event: DispatchRecord, slots: RuleSlots): Promise<void> {
    if (!this.store.owns(event)) return;
    const current = this.current(event);
    if (!current) return;
    const { record } = current;
    const { receipt, snapshot, snapshotHash, agentTarget } = record;
    const signal = this.abort.signal;
    const executor = this.executor;
    if (receipt.state === "running") {
      await this.linkTask(record);
      await this.advanceStop(record);
      return;
    }
    const work: TaskDispatchWork = { eventId: receipt.eventId, dispatchId: receipt.dispatchId, runId: receipt.runId, attempt: receipt.attempt, snapshot, snapshotHash, ...(agentTarget && { agentTarget }) };
    if (receipt.state === "pending" || receipt.state === "claimed") {
      if ("parent" in snapshot.source) await this.projectContinuation(record, snapshot.source);
      // 重开后先检查原快照有效性，过期或已关闭的任务不做目标预检。
      if (!(await this.prepare(record, "check")) || !executor) return;
      const next = this.current(record)?.record.receipt.state;
      if (signal.aborted || (next !== "pending" && next !== "claimed")) return;
      if (!this.takeRuleSlot(slots, record)) {
        await this.prepare(record, "busy");
        return;
      }
      const ready = await executor.ready(work, signal);
      if (!(await this.prepare(record, ready))) return;
      // claimed 独立落盘。进程在此中断时，可以证明尚未开始派遣。
      if (!(await this.beginSending(record))) return;
      const prepared = !work.agentTarget && typeof ready === "object" ? { ...work, agentTarget: ready.target } : work;
      await this.finishSending(record, () => executor.dispatch(prepared, signal));
      return;
    }
    if (executor && (receipt.state === "sending" || receipt.state === "unknown")) await this.finishSending(record, () => executor.inspect(work, signal));
  }

  private async advanceStop(record: OwnedRecord): Promise<void> {
    const { stop, boundExecution: execution, receipt } = record;
    const signal = this.abort.signal;
    if (!stop || !execution || signal.aborted) return;
    const send = stop.status === "pending";
    if (!send && stop.status !== "sending" && stop.status !== "unknown") return;
    const executor = this.executor;
    const started = send
      ? await this.writeStop(record, stop.status, () => {
          const { outcomes } = this.receipts.history(receipt.taskId, this.matchesExecution, this.onError);
          if (outcomes.get(receipt.runId)?.finishedAt) return "completed";
          return executor?.stop ? "sending" : "unsupported";
        })
      : stop.status;
    if (signal.aborted || (started !== "sending" && started !== "unknown")) return;
    let status: NativeStopStatus = "unknown";
    try {
      const request = { execution, stopId: stop.stopId };
      const operation = send ? executor?.stop : executor?.inspectStop;
      if (operation) status = await operation(request, signal);
    } catch {
      // Reopen and inspect the original intent when the transport cannot prove its result.
    }
    await this.writeStop(record, started, () => status);
  }

  private writeStop(record: OwnedRecord, previous: StopRecord["status"], decide: () => StopRecord["status"]): Promise<StopRecord["status"] | undefined> {
    return this.tasks.withTaskWrite(record.receipt.taskId, async () => {
      if (this.abort.signal.aborted) return;
      const current = this.current(record);
      const stop = current?.record.stop;
      if (!current || !stop || stop.stopId !== record.stop?.stopId || stop.status !== previous) return;
      const status = decide();
      if (status !== stop.status) await this.store.write({ ...current.record, stop: { ...stop, status, updatedAt: this.now().toISOString() } }, current.version);
      return status;
    });
  }

  private async prepare(event: OwnedRecord, readiness: "check" | TaskDispatchReadiness): Promise<boolean> {
    const { taskId } = event.receipt;
    return this.tasks.withTaskWrite(taskId, async () => {
      if (this.abort.signal.aborted) return false;
      const current = this.current(event);
      if (!current) return false;
      const { record, version } = current;
      const { receipt, snapshot } = record;
      if (receipt.state !== "pending" && receipt.state !== "claimed") return false;
      const task = this.task(taskId);
      const now = this.now();
      const source = snapshot.source;
      const continuation = "parent" in source ? this.continuation(source) : null;
      const next = { ...receipt };
      let claim = record.claim;
      let agentTarget = record.agentTarget;
      const state = typeof readiness === "object" ? readiness.state : readiness;
      if (receipt.cancelRequested) Object.assign(next, { state: "cancelled", reason: null });
      else if (source.kind === "automation" && source.expiresAt && Date.parse(source.expiresAt) <= now.getTime()) Object.assign(next, { state: "expired", reason: null });
      else if (task?.status === "completed") Object.assign(next, { state: "cancelled", reason: "task_closed" });
      else if (continuation === "stale" || (continuation === null && task && !sameInput(task, snapshot))) Object.assign(next, { state: "stale_input", reason: null });
      else if (!task || (continuation === null ? !this.dispatchable(task) : task.type !== "agent")) Object.assign(next, { state: "blocked", reason: "task_unavailable" });
      else if (continuation === "waiting") next.reason = "waiting_resource";
      else if (continuation === null && !maySend(task, receipt, now)) next.reason = "waiting_schedule";
      else if (this.tasks.hasLegacyRun(taskId)) next.reason = "task_occupied";
      else if (state === "unavailable" || state === "unsupported") Object.assign(next, { state: "blocked", reason: state === "unsupported" ? "target_unsupported" : "target_unavailable" });
      else if (state === "busy" || state === "ready") {
        if (typeof readiness === "object") agentTarget ??= readiness.target;
        if (state === "busy") next.reason = "waiting_resource";
        else {
          next.state = "claimed";
          next.reason = null;
          claim ??= { machineId: this.machineId, at: now.toISOString() };
        }
      } else return true;
      const changed = next.reason !== receipt.reason || next.state !== receipt.state || agentTarget !== record.agentTarget;
      if (changed) await this.store.write({ ...record, receipt: next, claim, ...(agentTarget && { agentTarget }), finishedAt: holdsTask(next) ? null : now.toISOString() }, version);
      return next.state === "claimed" && next.reason === null;
    });
  }

  private async beginSending(event: OwnedRecord): Promise<boolean> {
    const { taskId } = event.receipt;
    return this.tasks.withTaskWrite(taskId, async () => {
      if (this.abort.signal.aborted) return false;
      const current = this.current(event);
      if (!current) return false;
      const { record, version } = current;
      if (record.receipt.state !== "claimed" || record.receipt.cancelRequested) return false;
      // 任务编辑可以在领取落盘与本步骤之间取得写锁。
      const task = this.task(taskId);
      const source = record.snapshot.source;
      if (!task || this.tasks.hasLegacyRun(taskId)) return false;
      if ("parent" in source ? task.type !== "agent" || task.status === "completed" || this.continuation(source) !== "ready" : !sameInput(task, record.snapshot) || !this.dispatchable(task)) return false;
      const now = this.now();
      if ((!("parent" in source) && !maySend(task, record.receipt, now)) || (source.kind === "automation" && source.expiresAt && Date.parse(source.expiresAt) <= now.getTime())) return false;
      await this.store.write({ ...record, receipt: { ...record.receipt, state: "sending" } }, version);
      return !this.abort.signal.aborted;
    });
  }

  private async finishSending(event: OwnedRecord, send: () => Promise<TaskDispatchResult>): Promise<void> {
    if (this.abort.signal.aborted) return;
    const state = this.current(event)?.record.receipt.state;
    if (state !== "sending" && state !== "unknown") return;
    let result: TaskDispatchResult;
    try {
      result = await send();
    } catch {
      result = "unknown";
    }
    const record = await this.tasks.withTaskWrite(event.receipt.taskId, async () => {
      if (this.abort.signal.aborted) return null;
      const current = this.current(event);
      if (!current) return null;
      const { record, version } = current;
      const receipt = { ...record.receipt };
      if (receipt.state !== "sending" && receipt.state !== "unknown") return null;
      const source = record.snapshot.source;
      if ("parent" in source && (result === "accepted" || (typeof result === "object" && fingerprint(result.execution.sessionBinding) !== fingerprint(source.parent.sessionBinding)))) result = "unknown";
      const now = this.now().toISOString();
      if (result === "accepted" || typeof result === "object") {
        receipt.state = "running";
        receipt.reason = null;
        return this.store.write({ ...record, receipt, startedAt: now, ...(typeof result === "object" && { boundExecution: result.execution }) }, version);
      }
      if (result === "unsupported" || (result === "not_sent" && receipt.cancelRequested)) {
        receipt.state = receipt.cancelRequested ? "cancelled" : "blocked";
        receipt.reason = receipt.cancelRequested ? null : "target_unsupported";
        return this.store.write({ ...record, receipt, finishedAt: now }, version);
      }
      receipt.state = result === "not_sent" ? "claimed" : "unknown";
      receipt.reason = result === "not_sent" ? "waiting_resource" : "awaiting_confirmation";
      if (receipt.state === record.receipt.state && receipt.reason === record.receipt.reason) return null;
      return this.store.write({ ...record, receipt }, version);
    });
    if (record?.receipt.state === "running") await this.linkTask(record);
  }

  private async linkTask(event: OwnedRecord): Promise<void> {
    if (this.abort.signal.aborted) return;
    const record = this.current(event)?.record;
    if (!record || record.receipt.state !== "running") return;
    const { receipt, snapshot } = record;
    const task = this.task(receipt.taskId);
    if (task && sameInput(task, snapshot) && task.status === "not_started") await this.tasks.markDispatched(task.id, snapshot, receipt.runId, { signal: this.abort.signal });
  }
}
