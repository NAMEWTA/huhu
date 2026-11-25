import { HuhuError, errors, isHuhuError, isTaskAvailable, newId, type ExecutionBinding, type ExecutionReceipt, type TaskActivity, type TaskDto, type TaskExecution } from "@huhu/contracts";
import { AgentDispatchInputSchema, type AgentNativeStopInputSchema, type AgentNativeStopStatusSchema } from "@huhu/plugin-agent-cli/engine";
import type { DeviceDispatchBudget } from "@huhu/vault";
import {
  DispatchInput,
  DispatchLookup,
  DispatchStore,
  FollowUpDispatch,
  FollowUpSource,
  ReplySource,
  RuleSource,
  SupplementSource,
  dispatchSnapshotText,
  eventIdOf,
  fingerprint,
  holdsTask,
  retryDispatchId,
  sameInput,
  type DispatchReceipt,
  type DispatchRecord,
  type DispatchSnapshot,
  type DispatchSource,
  type OwnedRecord,
  type RecentTaskRun,
  type RetryDispatch,
  type StopLookup,
  type StopReceipt,
  type TaskDispatchView,
  type TaskRunSummary,
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
import { responseCommentActor, sameResponseActor, type ResponseActor } from "./response-actor.js";
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
type Occupancy = "active" | "none" | { waitingSince: string };
const noBacklog = () => ({ pending: 0, active: 0, waitingNative: 0, unknown: 0, oldestPendingAt: null as string | null, oldestNativeWaitAt: null as string | null, oldestUnknownAt: null as string | null });
const earlier = (previous: string | null, next: string) => previous === null || next < previous ? next : previous;
type ReplyInput = z.infer<typeof TaskReplyInput>;
type ReplyLookup = z.infer<typeof TaskReplyLookup>;
type ReplyView = z.infer<typeof TaskReplyView>;
type SupplementInput = z.infer<typeof TaskSupplementInput>;
type SupplementLookup = z.infer<typeof TaskSupplementLookup>;
type SupplementView = z.infer<typeof TaskSupplementView>;
type ContinuationSource = z.infer<typeof ReplySource> | z.infer<typeof SupplementSource> | (z.infer<typeof FollowUpSource> & { parent: ExecutionBinding });
type FollowUpInput = z.infer<typeof FollowUpDispatch>;

function hasParent(source: DispatchSource): source is ContinuationSource {
  return "parent" in source && source.parent !== undefined;
}

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
  if (source.kind !== "reply" || record.retryOf) return undefined;
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
  if (source.kind !== "supplement" || record.retryOf) return undefined;
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
  resumeEligibility?(execution: TaskExecution, body: string, instructions: string | undefined, signal: AbortSignal): Promise<{ state: "ready" | "busy" | "unavailable" | "unsupported"; reason?: string }>;
  prepareResume?(work: TaskDispatchWork, signal: AbortSignal): Promise<"ready" | "busy" | "unavailable" | "unsupported">;
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
  const outcome = outcomes.get(record.receipt.dispatchId);
  if (record.receipt.state !== "running" || (record.stop?.status !== "stopped" && !outcome?.finishedAt)) return true;
  // The terminal receipt can race the initial task link. Keep that accepted input occupied until linked.
  return task !== null && task.status === "not_started" && sameInput(task, record.retryOf?.taskInput ?? record.snapshot);
}

function stopView({ receipt }: DispatchRecord, stop: StopRecord): StopReceipt {
  const { taskId, dispatchId, runId } = receipt;
  const { toolOwner: _, ...visible } = stop;
  return { taskId, dispatchId, runId, ...visible };
}

export class TaskDispatch {
  private readonly acceptance = new WriteQueue();
  private readonly abort = new AbortController();
  private checking = false;
  private receiptCheckQueued = false;
  private receiptCheckImmediate: NodeJS.Immediate | undefined;
  private resourceCounts = noBacklog();

  constructor(
    private readonly tasks: TasksService,
    private readonly store: DispatchStore,
    private readonly receipts: TaskReceiptInbox,
    private readonly replies: TaskNativeReplies,
    private readonly now: () => Date,
    private readonly machineId: string,
    private readonly executor?: TaskDispatchExecutor,
    private readonly onError?: (error: unknown) => void,
    private readonly readArtifact?: (path: string) => { version: string; text: string } | null,
    private readonly budget?: DeviceDispatchBudget,
  ) {}

  resources(retained: number | null) {
    const unconfigured = { limit: null, occupied: null };
    return {
      vault: { ...this.resourceCounts, retained },
      device: { active: this.budget?.status("active") ?? unconfigured, retained: this.budget?.status("retained") ?? unconfigured },
    };
  }

  async close(): Promise<void> {
    this.abort.abort();
    clearImmediate(this.receiptCheckImmediate);
    await this.tasks.drainWrites();
  }

  consumeReceipt(receipt: ExecutionReceipt, signal: AbortSignal) {
    const stopped = AbortSignal.any([signal, this.abort.signal]);
    return this.tasks.withTaskWrite(receipt.execution.taskId, () => {
      stopped.throwIfAborted();
      const expected = this.boundExecution(receipt.execution);
      if (!expected) throw new HuhuError("RUN_UNKNOWN", "任务仍在等待已确认的执行绑定", { retryable: true });
      const retry = this.store.read(eventIdOf(retryDispatchId(expected.dispatchId)))?.record;
      return this.receipts.consume(receipt, expected, stopped, retry?.retryOf?.intent.dispatchId === expected.dispatchId);
    });
  }

  reply(input: ReplyInput, actor: ResponseActor, signal: AbortSignal, authorize: () => void): Promise<ReplyView> {
    const stopped = AbortSignal.any([signal, this.abort.signal]);
    const normalEvent = eventIdOf(normalDispatchId(input));
    const bound = (execution: ExecutionBinding) => this.readableExecution(execution, actor.owner);
    const prior = this.store.read(normalEvent);
    const question = this.receipts.question(input.taskId, input.runId, input.requestId, bound);
    if (prior || question?.receipt.payload.mode === "normal") return this.acceptNormalReply(input, actor, stopped, authorize);
    return this.replies.accept(input, actor, bound, this.replyAvailability, stopped, () => {
      authorize();
      if (this.store.read(normalEvent)) throw errors.idempotencyMismatch();
    });
  }

  readReply(input: ReplyLookup, readerOwner?: string): ReplyView {
    this.tasks.read(input.taskId);
    const record = this.store.read(eventIdOf(normalDispatchId(input)))?.record;
    const normal = record && normalReplyView(record);
    if (
      normal &&
      record &&
      record.snapshot.source.kind === "reply" &&
      (!readerOwner || !record.snapshot.source.actor || record.snapshot.source.actor.owner === readerOwner) &&
      this.readableExecution(record.snapshot.source.parent, readerOwner) &&
      this.store.owns(record) &&
      normal.runId === input.runId &&
      normal.sessionId === input.sessionId &&
      normal.requestId === input.requestId &&
      normal.requestVersion === input.requestVersion
    )
      return normal;
    return this.replies.readReply(input, (execution) => this.readableExecution(execution, readerOwner), readerOwner);
  }

  acceptSupplement(input: SupplementInput, actor: ResponseActor, outer: AbortSignal, authorize: () => void): Promise<SupplementView> {
    const toolOwner = actor.owner;
    return this.tasks.withTaskWrite(input.taskId, async () => {
      AbortSignal.any([outer, this.abort.signal]).throwIfAborted();
      authorize();
      const task = this.tasks.read(input.taskId);
      const dispatchId = supplementDispatchId(input);
      const prior = this.store.read(eventIdOf(dispatchId))?.record;
      if (prior) {
        const source = prior.snapshot.source;
        const view = supplementView(prior);
        if (!view || source.kind !== "supplement" || !this.store.owns(prior)) throw new HuhuError("VERSION_CONFLICT", "补充轮次的归属不匹配");
        if (toolOwner !== undefined && source.toolOwner !== toolOwner) throw errors.notFound("没有这条任务补充记录");
        if (!sameResponseActor(source.actor, actor)) throw errors.idempotencyMismatch();
        if (view.runId !== input.runId || view.sessionId !== input.sessionId || source.text !== input.text || fingerprint(source.messageIds) !== fingerprint(input.messageIds)) throw errors.idempotencyMismatch();
        return view;
      }
      this.store.assertWritable();
      if (task.type !== "agent" || task.status === "completed") throw errors.invalidInput("当前任务无法发送补充信息");
      const records = this.store.list().filter(({ receipt }) => receipt.taskId === task.id);
      const parent = records.filter(({ receipt }) => receipt.runId === input.runId).sort((a, b) => b.receipt.attempt - a.receipt.attempt)[0];
      if (parent && !this.visibleDispatch(parent, toolOwner)) throw errors.notFound("没有这条任务运行");
      const execution = parent?.boundExecution;
      if (!parent || !execution || execution.sessionBinding.sessionId !== input.sessionId || !this.matchesExecution(execution)) throw new HuhuError("RUN_UNKNOWN", "无法确认补充信息的原会话");
      this.assertContinuationSlot(task, records, parent.receipt.dispatchId);
      const source = SupplementSource.parse({ kind: "supplement", parent: execution, supplementId: input.supplementId, ...(toolOwner && { toolOwner }), actor, text: input.text, messageIds: input.messageIds });
      const body = selectedInput(task, input.text, input.messageIds);
      return supplementView(await this.saveContinuation(task, parent, source, dispatchId, body))!;
    });
  }

  readSupplement(input: SupplementLookup, toolOwner?: string): SupplementView {
    this.tasks.read(input.taskId);
    const record = this.store.read(eventIdOf(supplementDispatchId(input)))?.record;
    const view = record && this.store.owns(record) && this.visibleDispatch(record, toolOwner) ? supplementView(record) : undefined;
    if (!view || view.runId !== input.runId || view.sessionId !== input.sessionId) throw errors.notFound("没有这条任务补充记录");
    return view;
  }

  private acceptNormalReply(input: ReplyInput, actor: ResponseActor, signal: AbortSignal, authorize: () => void): Promise<ReplyView> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      signal.throwIfAborted();
      authorize();
      const task = this.tasks.read(input.taskId);
      const dispatchId = normalDispatchId(input);
      const eventId = eventIdOf(dispatchId);
      const messageIds = input.messageIds ?? [];
      const prior = this.store.read(eventId)?.record;
      if (prior) {
        const source = prior.snapshot.source;
        if (source.kind !== "reply" || !this.store.owns(prior)) throw new HuhuError("VERSION_CONFLICT", "后续任务轮次的归属不匹配");
        if (!this.readableExecution(source.parent, actor.owner)) throw errors.notFound("没有这条任务回答记录");
        const previous = normalReplyView(prior)!;
        if (
          previous.runId !== input.runId ||
          previous.sessionId !== input.sessionId ||
          previous.requestId !== input.requestId ||
          previous.requestVersion !== input.requestVersion ||
          !sameResponseActor(source.actor, actor) ||
          source.answer !== input.answer ||
          fingerprint(source.messageIds) !== fingerprint(messageIds)
        )
          throw errors.idempotencyMismatch();
        return previous;
      }
      this.store.assertWritable();
      if (this.replies.list(task.id, this.matchesExecution).some(({ replyId }) => replyId === input.replyId)) throw errors.idempotencyMismatch();
      const question = this.receipts.question(task.id, input.runId, input.requestId, (execution) => this.readableExecution(execution, actor.owner));
      if (
        task.type !== "agent" ||
        task.status === "completed" ||
        question?.receipt.payload.mode !== "normal" ||
        this.replyAvailability(question.receipt.execution) === "closed" ||
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
      this.assertContinuationSlot(task, records, parent.receipt.dispatchId);
      const body = selectedInput(task, input.answer, messageIds);
      const source = ReplySource.parse({ kind: "reply", parent: question.receipt.execution, requestId: input.requestId, requestVersion: input.requestVersion, replyId: input.replyId, answer: input.answer, messageIds, actor });
      return normalReplyView(await this.saveContinuation(task, parent, source, dispatchId, body))!;
    });
  }

  private assertContinuationSlot(task: TaskDto, records: DispatchRecord[], parentDispatchId: string): void {
    const { outcomes } = this.receipts.history(task.id, this.matchesExecution, this.onError);
    if (records.some((record) => record.receipt.dispatchId !== parentDispatchId && holdsRun(record, outcomes, task))) rejectDispatch("task_occupied", "该任务已有待派或活动运行");
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
    const spaceRevision = parent.agentTarget?.spaceRevision;
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

  async acceptStop(input: StopLookup, signal: AbortSignal, toolOwner?: string, authorize?: () => void): Promise<StopReceipt> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      AbortSignal.any([signal, this.abort.signal]).throwIfAborted();
      authorize?.();
      const { record, version } = this.lookup(input);
      if (toolOwner !== undefined) this.tasks.read(input.taskId);
      if (record.receipt.runId !== input.runId || !this.visibleDispatch(record, toolOwner)) throw errors.notFound("没有这条任务运行");
      if (record.stop) {
        if (toolOwner !== undefined && record.stop.toolOwner !== toolOwner) throw errors.notFound("没有这条停止记录");
        if (record.stop.stopId !== input.stopId) throw new HuhuError("VERSION_CONFLICT", "该任务运行已有停止记录");
        return stopView(record, record.stop);
      }
      this.store.assertWritable();
      if (!this.store.owns(record) || !record.boundExecution || !this.matchesExecution(record.boundExecution) || record.receipt.state !== "running") {
        throw new HuhuError("RUN_UNKNOWN", "现有记录无法确认原任务执行");
      }
      const now = this.now().toISOString();
      const { outcomes } = this.receipts.history(input.taskId, this.matchesExecution, this.onError);
      const stop: StopRecord = { stopId: input.stopId, status: outcomes.get(record.receipt.dispatchId)?.finishedAt ? "completed" : "pending", acceptedAt: now, updatedAt: now, ...(toolOwner && { toolOwner }) };
      const saved = await this.store.write({ ...record, stop }, version);
      return stopView(saved, stop);
    });
  }

  readStop(input: StopLookup, toolOwner?: string): StopReceipt {
    const { record } = this.lookup(input);
    if (toolOwner !== undefined) this.tasks.read(input.taskId);
    if (record.receipt.runId !== input.runId || record.stop?.stopId !== input.stopId || !this.visibleDispatch(record, toolOwner) || (toolOwner !== undefined && record.stop.toolOwner !== toolOwner)) throw errors.notFound("没有这条停止记录");
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

  private readableExecution(execution: ExecutionBinding, readerOwner?: string): boolean {
    if (!this.matchesExecution(execution)) return false;
    if (readerOwner === undefined) return true;
    const record = this.store.read(eventIdOf(execution.dispatchId))?.record;
    return !!record && this.visibleDispatch(record, readerOwner);
  }

  private replyAvailability = (execution: ExecutionBinding): ReplyAvailability => {
    if (this.store.read(eventIdOf(retryDispatchId(execution.dispatchId)))) return "closed";
    const status = this.store.read(eventIdOf(execution.dispatchId))?.record.stop?.status;
    if (status === "stopped" || status === "completed") return "closed";
    if (status === "pending" || status === "sending" || status === "unknown") return "stopping";
    return "open";
  };

  questions(taskId: string, readerOwner?: string) {
    this.tasks.read(taskId);
    const records = this.recordsFor(taskId).filter((record) => this.visibleDispatch(record, readerOwner));
    return this.history(taskId, records).questions;
  }

  private history(taskId: string, records = this.recordsFor(taskId)) {
    const normal = records.filter((record) => this.store.owns(record)).flatMap((record) => normalReplyView(record) ?? []);
    const visible = new Set(records.map(({ receipt }) => receipt.dispatchId));
    const bound = (execution: ExecutionBinding) => visible.has(execution.dispatchId) && this.matchesExecution(execution);
    const replies = [...this.replies.list(taskId, bound), ...normal];
    const history = this.receipts.history(taskId, (execution) => bound(execution) && !this.store.read(eventIdOf(retryDispatchId(execution.dispatchId))), this.onError);
    const superseded = new Set(records.flatMap(({ retryOf }) => (retryOf ? [retryOf.intent.dispatchId] : [])));
    const closed = new Set(records.filter(({ receipt, stop }) => !superseded.has(receipt.dispatchId) && (stop?.status === "stopped" || stop?.status === "completed")).map(({ receipt }) => receipt.runId));
    const questions = history.questions.map((question) => {
      const reply = replies.find((reply) => reply.runId === question.runId && reply.requestId === question.requestId && reply.requestVersion === question.requestVersion);
      const status = question.mode === "native_deferred" && closed.has(question.runId) ? "closed" : question.status;
      return { ...question, status, ...(reply && { reply }) };
    });
    return { ...history, questions };
  }

  hasActiveRun(taskId: string): boolean {
    const running = this.store.list().filter((record) => record.receipt.taskId === taskId && record.receipt.state === "running" && this.store.owns(record));
    if (!running.length) return false;
    const { outcomes } = this.receipts.history(taskId, this.matchesExecution, this.onError);
    return running.some(({ receipt, stop }) => stop?.status !== "stopped" && !outcomes.get(receipt.dispatchId)?.finishedAt);
  }

  private recordsFor(taskId: string): DispatchRecord[] {
    return this.store.list().filter(({ receipt }) => receipt.taskId === taskId);
  }

  runs(taskId: string, records = this.recordsFor(taskId)): TaskRunSummary[] {
    const { questions, outcomes } = this.history(taskId, records);
    const superseded = new Set(records.flatMap(({ retryOf }) => (retryOf ? [retryOf.intent.dispatchId] : [])));
    return records.flatMap(({ receipt, claim, snapshot, startedAt, finishedAt, stop }) => {
      if (superseded.has(receipt.dispatchId) || (!claim && !receipt.parentRunId && receipt.attempt === 1)) return [];
      const open = questions.filter(({ runId, status }) => runId === receipt.runId && status === "awaiting");
      const outcome = outcomes.get(receipt.dispatchId);
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
          ...(outcome && "result" in outcome && { result: outcome.result }),
        },
      ];
    });
  }

  activity(task: TaskDto): TaskActivity {
    const records = this.recordsFor(task.id).filter((record) => this.store.owns(record));
    const latest = records.toSorted((a, b) => b.receipt.acceptedAt.localeCompare(a.receipt.acceptedAt) || b.receipt.eventId.localeCompare(a.receipt.eventId))[0];
    const binding = latest?.boundExecution;
    let execution: TaskActivity["execution"] = { state: "none" };
    if (latest && binding && this.matchesExecution(binding)) {
      const state = this.runs(task.id, records).find(({ id }) => id === latest.receipt.runId)?.state;
      const { coreAddress: _, ...sessionBinding } = binding.sessionBinding;
      execution = {
        state: state === "succeeded" ? "completed" : state === "waiting_input" ? "waiting-input"
          : state === "running" || state === "failed" ? state : "unknown",
        identity: { ...binding, sessionBinding },
      };
    }
    return { taskId: task.id, inputRevision: task.inputRevision, inputHash: task.inputHash, status: task.status, observedAt: this.now().toISOString(), execution };
  }

  acceptRule(input: DispatchInput, source: RuleSource): Promise<DispatchReceipt> {
    return this.accept(DispatchInput.parse(input), RuleSource.parse(source));
  }

  async acceptFollowUp(raw: FollowUpInput): Promise<DispatchReceipt> {
    const input = FollowUpDispatch.parse(raw);
    const { taskId, followUpId, scheduledFor } = input;
    const dispatchId = `follow-up-${fingerprint([taskId, followUpId])}`;
    const previous = () => {
      const prior = this.store.read(eventIdOf(dispatchId))?.record;
      if (!prior) return undefined;
      const { source } = prior.snapshot;
      if (!this.store.owns(prior) || source.kind !== "follow-up" || source.scheduledFor !== scheduledFor || prior.snapshot.inputRevision !== input.inputRevision || prior.snapshot.inputHash !== input.inputHash)
        throw errors.idempotencyMismatch();
      return prior.receipt;
    };
    const prior = previous();
    if (prior) return prior;
    if (Date.parse(scheduledFor) > this.now().getTime()) rejectDispatch("not_due", "尚未到达跟进时间");
    const task = this.tasks.read(taskId);
    const source = { kind: "follow-up", followUpId, scheduledFor } as const;
    if (task.status === "not_started") {
      return this.accept({ taskId, dispatchId, expectedVersion: task.version, inputHash: input.inputHash, inputRevision: input.inputRevision }, source);
    }
    return this.tasks.withTaskWrite(taskId, async () => {
      this.abort.signal.throwIfAborted();
      const replay = previous();
      if (replay) return replay;
      this.store.assertWritable();
      const current = this.tasks.read(taskId);
      if (current.status !== "in_progress" || current.type !== "agent") rejectDispatch("task_unavailable", "当前任务无法跟进");
      if (!sameInput(current, input)) rejectDispatch("stale_input", "任务输入已变化");
      if (!isTaskAvailable(current.availableAt, this.now())) rejectDispatch("not_due", "尚未到达最早派遣时间");
      const records = this.store.list().filter(({ receipt }) => receipt.taskId === taskId);
      const parent = records.filter(({ boundExecution }) => boundExecution && this.matchesExecution(boundExecution)).sort((a, b) => b.receipt.acceptedAt.localeCompare(a.receipt.acceptedAt))[0];
      if (!parent?.boundExecution) rejectDispatch("target_unavailable", "无法确认原任务的会话");
      this.assertContinuationSlot(current, records, parent.receipt.dispatchId);
      return (await this.saveContinuation(current, parent, { ...source, parent: parent.boundExecution }, dispatchId, selectedInput(current, current.body, []))).receipt;
    });
  }

  async accept(input: DispatchInput, source: DispatchSource): Promise<DispatchReceipt> {
    const eventId = eventIdOf(input.dispatchId);
    const requestHash = fingerprint({ input, source });
    return this.acceptance.run(eventId, () =>
      this.tasks.withTaskWrite(input.taskId, async () => {
        this.abort.signal.throwIfAborted();
        const prior = this.store.read(eventId);
        if (prior) {
          const legacyToolIntent = source.kind === "tool" && prior.record.snapshot.source.kind === "tool" && prior.record.snapshot.source.owner === undefined && prior.record.requestHash === fingerprint({ input, source: { kind: "tool" } });
          if (legacyToolIntent) throw new HuhuError("RUN_UNKNOWN", "旧派遣缺少可核实的外部会话归属");
          if (prior.record.requestHash !== requestHash) throw errors.idempotencyMismatch();
          return prior.record.receipt;
        }
        this.store.assertWritable();
        const task = this.tasks.read(input.taskId);
        const acceptedAt = this.now();
        if ((input.newRound || input.context) && source.kind !== "desktop") throw errors.permissionDenied("在工作台选取上下文或明确开始新轮次");
        if (input.newRound && (task.status !== "in_progress" || (task.execution?.target?.mode ?? "new") !== "new")) throw errors.invalidInput("新轮次需要进行中的任务和新会话目标");
        const { outcomes } = this.receipts.history(task.id, this.matchesExecution, this.onError);
        const priorRuns = this.recordsFor(task.id);
        const existing = priorRuns.find((record) => holdsRun(record, outcomes, task));
        if (existing) rejectDispatch("task_occupied", "该任务已有待派或活动运行", existing.receipt);
        if (!sameInput(task, input)) rejectDispatch("stale_input", "任务输入已变化，请重新读取任务");
        const execution = this.dispatchable(task, input.newRound);
        if (!execution) rejectDispatch("task_unavailable", "只有配置齐全且未开始的 Agent 任务可以派遣");
        const early = !isTaskAvailable(task.availableAt, acceptedAt);
        if (early && (source.kind !== "desktop" || input.allowEarly !== true)) rejectDispatch("not_due", "尚未到最早派遣时间");
        if (source.kind === "automation") {
          if (source.notBefore && Date.parse(source.notBefore) > acceptedAt.getTime()) rejectDispatch("not_due", "派遣时刻尚未到达");
          if (source.expiresAt && Date.parse(source.expiresAt) <= acceptedAt.getTime()) rejectDispatch("expired", "派遣窗口已结束");
        }
        const parent = input.newRound ? priorRuns.filter((record) => this.store.owns(record) && outcomes.get(record.receipt.dispatchId)?.finishedAt).sort((a, b) => b.receipt.acceptedAt.localeCompare(a.receipt.acceptedAt))[0] : undefined;
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
          ...(input.newRound && { newRound: input.newRound }),
          ...(parent && { previousRunId: parent.receipt.runId }),
          ...(input.context && { context: this.freezeContext(task, input.context) }),
        };
        if (snapshot.context && !AgentDispatchInputSchema.shape.input.safeParse(dispatchSnapshotText(snapshot)).success) throw errors.invalidInput("任务与所选上下文超出可派遣输入范围");
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
          ...(parent && { parentRunId: parent.receipt.runId }),
          ...(early && task.availableAt && { overriddenAvailableAt: task.availableAt }),
        };
        // 只要求旧版本的执行输入仍一致。评论或不参与执行的字段可在新文件版本上受理。
        return (await this.store.create({ receipt, requestHash, snapshot, snapshotHash: fingerprint(snapshot), claim: null, startedAt: null, finishedAt: null })).receipt;
      }),
    );
  }

  private freezeContext(task: TaskDto, selection: NonNullable<DispatchInput["context"]>): NonNullable<DispatchSnapshot["context"]> {
    const { messageIds, artifacts } = selection;
    const selectedIds = new Set(messageIds);
    if (selectedIds.size !== messageIds.length || new Set(artifacts.map(({ path }) => path)).size !== artifacts.length) throw errors.invalidInput("上下文中有重复的消息或产物");
    const messages = messageIds.map((id) => {
      const comment = task.comments.find((item) => item.id === id);
      if (!comment || comment.body.length > 8_000) throw errors.invalidInput("所选消息不存在或超过 8000 字符");
      return { id, body: comment.body };
    });
    const referenced = new Set(task.references.filter((ref) => ref.kind === "file" && (ref.from === "task" || selectedIds.has(ref.from))).map(({ path }) => path));
    return {
      messages,
      artifacts: artifacts.map(({ path, expectedVersion }) => {
        if (!referenced.has(path) || !/\.(md|markdown|txt)$/i.test(path)) throw errors.invalidInput("只能选取任务正文或所选消息关联的文本产物");
        const current = this.readArtifact?.(path);
        if (!current) throw errors.invalidInput("所选产物不存在或超出读取范围");
        if (expectedVersion !== undefined && expectedVersion !== current.version) throw errors.versionConflict(current.version);
        return { path, ...current, ...(expectedVersion !== undefined && { expectedVersion }) };
      }),
    };
  }

  async retry(input: RetryDispatch, signal: AbortSignal): Promise<DispatchReceipt> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      AbortSignal.any([signal, this.abort.signal]).throwIfAborted();
      const dispatchId = retryDispatchId(input.dispatchId);
      const eventId = eventIdOf(dispatchId);
      const requestHash = fingerprint(input);
      const replay = () => {
        const retry = this.store.read(eventId)?.record;
        if (!retry) return undefined;
        if (!this.store.owns(retry)) rejectDispatch(this.store.ownerIssue(retry), "只能查询异机重试记录");
        if (retry.requestHash !== requestHash) throw errors.idempotencyMismatch();
        return retry.receipt;
      };
      const previous = replay();
      if (previous) return previous;

      this.store.assertWritable();
      const task = this.tasks.read(input.taskId);
      const { record } = this.lookup(input);
      const { receipt, snapshot, snapshotHash, agentTarget, boundExecution } = record;
      if (!this.retryTaskOpen(task)) rejectDispatch("task_unavailable", "当前任务无法重试");
      if (!this.retryEvidence(record, () => !!boundExecution && this.matchesExecution(boundExecution) && this.receipts.confirmedFailure(boundExecution))) {
        throw new HuhuError("RUN_UNKNOWN", "尚未证实原执行失败并结束");
      }
      const { outcomes } = this.receipts.history(task.id, this.matchesExecution, this.onError);
      if (this.recordsFor(task.id).some((item) => holdsRun(item, outcomes, task))) rejectDispatch("task_occupied", "该任务已有待派或活动运行");
      if (this.replies.list(task.id, this.matchesExecution).some((reply) => reply.runId === receipt.runId && ["pending", "sending", "unknown"].includes(reply.status))) {
        rejectDispatch("task_occupied", "原执行还有未决的回答意图");
      }
      const now = this.now();
      if (!isTaskAvailable(task.availableAt, now)) rejectDispatch("not_due", "尚未到最早派遣时间");
      const next: DispatchReceipt = {
        taskId: task.id,
        dispatchId,
        eventId,
        runId: receipt.runId,
        attempt: receipt.attempt + 1,
        acceptedAt: now.toISOString(),
        state: "pending",
        reason: null,
        cancelRequested: false,
        ...(receipt.parentRunId && { parentRunId: receipt.parentRunId }),
      };
      try {
        const retryOf = { intent: input, taskInput: { inputHash: task.inputHash, inputRevision: task.inputRevision } };
        return (await this.store.create({ receipt: next, retryOf, requestHash, snapshot, snapshotHash, ...(agentTarget && { agentTarget }), claim: null, startedAt: null, finishedAt: null })).receipt;
      } catch (error) {
        if (!isHuhuError(error) || error.code !== "NAME_CONFLICT") throw error;
        const concurrent = replay();
        if (!concurrent) throw error;
        return concurrent;
      }
    });
  }

  private retryTaskOpen(task: TaskDto): boolean {
    return !task.readOnly && task.type === "agent" && task.status !== "completed" && task.problems.length === 0;
  }

  private retryEvidence(record: DispatchRecord, confirmedFailure: () => boolean): boolean {
    if (!this.store.owns(record) || (record.claim !== null && record.claim.machineId !== this.machineId)) return false;
    const { receipt, boundExecution, stop } = record;
    if (receipt.state === "blocked" && !boundExecution) return receipt.reason === "target_unavailable" || receipt.reason === "target_unsupported";
    if (receipt.state !== "running" || !boundExecution || (stop && ["pending", "sending", "unknown"].includes(stop.status))) return false;
    return confirmedFailure();
  }

  private retrySourceSafe(record: OwnedRecord): boolean {
    if (!record.retryOf) return true;
    const { record: prior } = this.lookup(record.retryOf.intent);
    const { receipt, boundExecution } = prior;
    if (receipt.runId !== record.receipt.runId || receipt.attempt + 1 !== record.receipt.attempt || prior.snapshotHash !== record.snapshotHash) return false;
    return this.retryEvidence(prior, () => !!boundExecution && this.matchesExecution(boundExecution) && this.receipts.confirmedFailure(boundExecution));
  }

  read(input: DispatchLookup, toolOwner?: string): DispatchReceipt {
    const { record } = this.lookup(input);
    if (toolOwner !== undefined) this.tasks.read(input.taskId);
    if (!this.visibleDispatch(record, toolOwner)) throw errors.notFound("没有这条任务派遣记录");
    return this.dispatchView(record);
  }

  list(taskId: string, toolOwner?: string): TaskDispatchView[] {
    const task = this.tasks.read(taskId);
    const records = this.recordsFor(taskId);
    const { outcomes } = this.receipts.history(taskId, this.matchesExecution, this.onError);
    const retryTask = this.retryTaskOpen(task) && !records.some((record) => holdsRun(record, outcomes, task));
    const superseded = new Set(records.flatMap(({ retryOf }) => (retryOf ? [retryOf.intent.dispatchId] : [])));
    return records
      .filter((record) => this.visibleDispatch(record, toolOwner))
      .map((record) => {
        const view = this.viewWithSession(record, toolOwner);
        if (superseded.has(record.receipt.dispatchId)) return { ...view, superseded: true as const };
        if (toolOwner === undefined && retryTask && this.retryEvidence(record, () => outcomes.get(view.dispatchId)?.state === "failed")) {
          return { ...view, canRetry: true as const };
        }
        return view;
      })
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt) || b.runId.localeCompare(a.runId));
  }

  recent(limit: number, toolOwner?: string): RecentTaskRun[] {
    const records = this.store.list().filter((record) => this.visibleDispatch(record, toolOwner) && (toolOwner === undefined || this.task(record.receipt.taskId) !== null));
    const superseded = new Set(records.flatMap(({ retryOf }) => (retryOf ? [retryOf.intent.dispatchId] : [])));
    const recent = records
      .filter(({ receipt }) => !superseded.has(receipt.dispatchId))
      .sort((a, b) => b.receipt.acceptedAt.localeCompare(a.receipt.acceptedAt) || b.receipt.runId.localeCompare(a.receipt.runId))
      .slice(0, limit);
    const tasks = new Map<string, { title: string; runs: Map<string, TaskRunSummary> }>();
    return recent.map((record) => {
      const { taskId, runId } = record.receipt;
      let task = tasks.get(taskId);
      if (!task) {
        const runs = this.runs(
          taskId,
          records.filter(({ receipt }) => receipt.taskId === taskId),
        );
        task = { title: this.task(taskId)?.title ?? taskId, runs: new Map(runs.map((run) => [run.id, run])) };
        tasks.set(taskId, task);
      }
      return { dispatch: this.viewWithSession(record, toolOwner), run: task.runs.get(runId) ?? null, title: task.title };
    });
  }

  private visibleDispatch(record: DispatchRecord, toolOwner?: string): boolean {
    if (toolOwner === undefined) return true;
    if (!this.store.owns(record)) return false;
    const { source } = record.snapshot;
    if (source.kind === "tool") return source.owner === toolOwner;
    if (source.kind === "supplement") return source.toolOwner === toolOwner;
    if (source.kind === "reply" && source.actor) return source.actor.owner === toolOwner;
    return true;
  }

  private viewWithSession(record: DispatchRecord, toolOwner?: string): TaskDispatchView {
    const { boundExecution, snapshot, stop } = record;
    const spaceId = snapshot.execution.spaceId;
    const session = boundExecution && spaceId && this.matchesExecution(boundExecution) ? { id: boundExecution.sessionBinding.sessionId, spaceId } : null;
    const view = { ...this.dispatchView(record), session };
    if (!stop || (toolOwner !== undefined && stop.toolOwner !== toolOwner)) return view;
    const { toolOwner: _, ...stopStatus } = stop;
    return { ...view, stop: stopStatus };
  }

  private dispatchView(record: DispatchRecord): DispatchReceipt {
    if (holdsTask(record.receipt) && record.claim && record.claim.machineId !== this.machineId) return { ...record.receipt, reason: "foreign_machine" };
    return record.receipt;
  }

  resumeAbandoned(key: { taskId: string; runId: string; attempt: number; dispatchId: string }): boolean {
    const record = this.store.read(eventIdOf(key.dispatchId))?.record;
    if (!record || !this.store.owns(record) || record.claim?.machineId !== this.machineId || record.agentTarget?.mode !== "resume" || record.boundExecution) return false;
    const { receipt } = record;
    return receipt.taskId === key.taskId && receipt.runId === key.runId && receipt.attempt === key.attempt && receipt.dispatchId === key.dispatchId && !holdsTask(receipt);
  }

  async cancel(input: DispatchLookup, toolOwner?: string): Promise<DispatchReceipt> {
    return this.tasks.withTaskWrite(input.taskId, async () => {
      this.abort.signal.throwIfAborted();
      const { record, version } = this.lookup(input);
      if (toolOwner !== undefined) this.tasks.read(input.taskId);
      if (!this.visibleDispatch(record, toolOwner)) throw errors.notFound("没有这条任务派遣记录");
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

  wakeAfterReceipt(): void {
    this.receiptCheckQueued = true;
    this.scheduleReceiptCheck();
  }

  private scheduleReceiptCheck(): void {
    if (!this.receiptCheckQueued || this.receiptCheckImmediate || this.checking || this.abort.signal.aborted) return;
    // The receipt ACK can return before replay reads the inbox synchronously.
    this.receiptCheckImmediate = setImmediate(() => {
      this.receiptCheckImmediate = undefined;
      if (this.receiptCheckQueued) void this.check();
    });
  }

  /** 受理成功后与重开都走相同的领取路径。 */
  async check(): Promise<void> {
    if (this.store.readOnly || this.checking || this.abort.signal.aborted) return;
    this.checking = true;
    this.receiptCheckQueued = false;
    try {
      await this.receipts.replay(this.tasks, this.matchesExecution, this.abort.signal, this.onError);
      const records = this.store.list((error) => this.onError?.(error));
      const owned = records.filter((record): record is OwnedRecord => this.store.owns(record));
      const events = records
        .filter(({ receipt }) => holdsTask(receipt))
        .sort((a, b) => a.receipt.acceptedAt.localeCompare(b.receipt.acceptedAt) || a.receipt.eventId.localeCompare(b.receipt.eventId));
      const { occupancy, refreshReplies } = this.schedulingOccupancy(owned);
      const budgetReady = this.refreshResources(owned, occupancy);
      const takeActive = ({ receipt }: DispatchRecord) => !this.budget || (budgetReady && this.budget.claim("active", receipt.eventId));
      const slots: RuleSlots = new Map();
      for (const event of owned) this.updateRuleSlots(slots, event, occupancy);
      const replayed = new Set<string>();
      await this.replies.replay(
        this.matchesExecution,
        this.replyAvailability,
        (execution) => {
          const stored = this.store.read(eventIdOf(execution.dispatchId));
          if (!stored || !this.takeRuleSlot(slots, stored.record) || !takeActive(stored.record)) return false;
          replayed.add(execution.taskId);
          return true;
        },
        this.abort.signal,
        this.onError,
      );
      for (const taskId of replayed) refreshReplies(taskId);
      for (const event of events) {
        if (this.abort.signal.aborted) break;
        try {
          await this.advance(event, slots, takeActive);
        } catch (error) {
          if (!this.abort.signal.aborted) this.onError?.(error);
        } finally {
          if (event.snapshot.source.kind === "automation") {
            const latest = this.store.read(event.receipt.eventId);
            if (latest && this.store.owns(latest.record)) this.updateRuleSlots(slots, latest.record, occupancy);
          }
        }
      }
    } catch (error) {
      this.onError?.(error);
    } finally {
      this.checking = false;
      this.scheduleReceiptCheck();
    }
  }

  private refreshResources(records: OwnedRecord[], occupancy: (record: OwnedRecord) => Occupancy): boolean {
    const counts = noBacklog();
    const held = new Set<string>();
    const released = new Set<string>();
    for (const record of records) {
      const { receipt, stop } = record;
      if (receipt.state === "pending" || receipt.state === "claimed") {
        counts.pending++;
        counts.oldestPendingAt = earlier(counts.oldestPendingAt, receipt.acceptedAt);
      }
      if (receipt.state === "unknown" || (receipt.state === "running" && stop?.status === "unknown")) {
        counts.unknown++;
        counts.oldestUnknownAt = earlier(counts.oldestUnknownAt, stop?.status === "unknown" ? stop.updatedAt : receipt.acceptedAt);
      }
      const occupied = occupancy(record);
      if (occupied === "active" && receipt.state !== "claimed") held.add(receipt.eventId);
      else released.add(receipt.eventId);
      if (typeof occupied === "object") {
        counts.waitingNative++;
        counts.oldestNativeWaitAt = earlier(counts.oldestNativeWaitAt, occupied.waitingSince);
      }
    }
    counts.active = held.size;
    this.resourceCounts = counts;
    return this.budget?.sync("active", held, released) ?? true;
  }

  private updateRuleSlots(slots: RuleSlots, record: OwnedRecord, occupancy: (record: OwnedRecord) => Occupancy): void {
    const { source } = record.snapshot;
    if (source.kind !== "automation") return;
    const active = slots.get(source.ruleId) ?? new Set<string>();
    const { eventId } = record.receipt;
    if (occupancy(record) === "active") active.add(eventId);
    else active.delete(eventId);
    slots.set(source.ruleId, active);
  }

  private schedulingOccupancy(records: OwnedRecord[]) {
    const bindings = new Map<string, string>();
    for (const { receipt, claim, boundExecution } of records) {
      if (receipt.state === "running" && claim?.machineId === this.machineId && boundExecution) bindings.set(receipt.dispatchId, fingerprint(boundExecution));
    }
    const matches = (execution: ExecutionBinding) => bindings.get(execution.dispatchId) === fingerprint(execution);
    const { outcomes, nativeWaits } = this.receipts.schedulingHistory(matches, (error) => this.onError?.(error));
    const repliesByTask = new Map<string, ReturnType<TaskNativeReplies["list"]>>();
    const occupancy = ({ receipt, stop }: OwnedRecord): Occupancy => {
      const { state, taskId, runId, dispatchId } = receipt;
      if (state === "claimed" || state === "sending" || state === "unknown") return "active";
      if (state !== "running" || stop?.status === "stopped" || stop?.status === "completed" || outcomes.get(dispatchId)?.finishedAt) return "none";
      const waits = nativeWaits.get(dispatchId);
      if (stop?.status === "unknown" || !waits?.length) return "active";
      try {
        let replies = repliesByTask.get(taskId);
        if (!replies) {
          replies = this.replies.list(taskId, matches);
          repliesByTask.set(taskId, replies);
        }
        if (waits.some((question) => replies.some((reply) => reply.runId === runId && reply.requestId === question.requestId && reply.requestVersion === question.requestVersion && ["sending", "unknown", "accepted"].includes(reply.status)))) return "active";
        return { waitingSince: waits.reduce((oldest, question) => earlier(oldest, question.at), waits[0]!.at) };
      } catch (error) {
        this.onError?.(error);
        return "active";
      }
    };
    return { occupancy, refreshReplies: (taskId: string) => repliesByTask.delete(taskId) };
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

  private dispatchable(task: TaskDto, newRound = false): DispatchSnapshot["execution"] | null {
    const config = task.execution;
    if (!config || agentDispatchBlocker(task, newRound)) return null;
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
    return outcomes.get(parent.dispatchId)?.finishedAt ? "ready" : "waiting";
  }

  private async projectContinuation(record: OwnedRecord, source: ContinuationSource): Promise<void> {
    const { receipt } = record;
    try {
      await this.tasks.addComment(receipt.taskId, {
        id: receipt.dispatchId,
        at: receipt.acceptedAt,
        ...(source.kind === "follow-up" ? { source: "system" as const } : responseCommentActor(source.actor, source.kind === "supplement" && source.toolOwner !== undefined)),
        run: source.parent.runId,
        session: source.parent.sessionBinding.sessionId,
        ...(source.kind === "reply" ? { ask: source.requestId, event: "answer", body: source.answer } : source.kind === "supplement" ? { event: "supplement", body: record.snapshot.body } : { event: "follow-up", body: "按计划跟进" }),
      });
    } catch (error) {
      if (!isHuhuError(error) || error.code !== "NOT_FOUND") throw error;
    }
  }

  private async advance(event: DispatchRecord, slots: RuleSlots, takeActive: (record: DispatchRecord) => boolean): Promise<void> {
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
      if (!record.retryOf && hasParent(snapshot.source)) await this.projectContinuation(record, snapshot.source);
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
      const prepared = !work.agentTarget && typeof ready === "object" ? { ...work, agentTarget: ready.target } : work;
      if (!takeActive(record)) {
        await this.prepare(record, "busy");
        return;
      }
      if (prepared.agentTarget?.mode === "resume" && executor.prepareResume) {
        const nativeReady = await executor.prepareResume(prepared, signal);
        if (!(await this.prepare(record, nativeReady))) return;
      }
      // claimed 独立落盘。进程在此中断时，可以证明尚未开始派遣。
      if (!(await this.beginSending(record))) return;
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
          if (outcomes.get(receipt.dispatchId)?.finishedAt) return "completed";
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
      const continuation = !record.retryOf && hasParent(source) ? this.continuation(source) : null;
      const validateInput = continuation === null || source.kind === "follow-up";
      const next = { ...receipt };
      let claim = record.claim;
      let agentTarget = record.agentTarget;
      const state = typeof readiness === "object" ? readiness.state : readiness;
      if (receipt.cancelRequested) Object.assign(next, { state: "cancelled", reason: null });
      else if (!record.retryOf && source.kind === "automation" && source.expiresAt && Date.parse(source.expiresAt) <= now.getTime()) Object.assign(next, { state: "expired", reason: null });
      else if (task?.status === "completed") Object.assign(next, { state: "cancelled", reason: "task_closed" });
      else if (continuation === "stale" || (!record.retryOf && validateInput && task && !sameInput(task, snapshot))) Object.assign(next, { state: "stale_input", reason: null });
      else if (!task || (record.retryOf ? !this.retryTaskOpen(task) : continuation === null ? !this.dispatchable(task, snapshot.newRound) : task.type !== "agent")) Object.assign(next, { state: "blocked", reason: "task_unavailable" });
      else if (!this.retrySourceSafe(record)) next.reason = "awaiting_confirmation";
      else if (continuation === "waiting") next.reason = "waiting_resource";
      else if (validateInput && !maySend(task, receipt, now)) {
        if (source.kind === "automation" || source.kind === "follow-up") Object.assign(next, { state: "stale_input", reason: "waiting_schedule" });
        else next.reason = "waiting_schedule";
      }
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
      if (!task) return false;
      if (record.retryOf ? !this.retryTaskOpen(task) : hasParent(source) ? task.type !== "agent" || task.status === "completed" || this.continuation(source) !== "ready" : !this.dispatchable(task, record.snapshot.newRound)) return false;
      if (!this.retrySourceSafe(record)) return false;
      const validateInput = record.retryOf !== undefined || !hasParent(source) || source.kind === "follow-up";
      const now = this.now();
      if (validateInput && ((!record.retryOf && !sameInput(task, record.snapshot)) || !maySend(task, record.receipt, now))) return false;
      if (!record.retryOf && source.kind === "automation" && source.expiresAt && Date.parse(source.expiresAt) <= now.getTime()) return false;
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
      if (hasParent(source) && (result === "accepted" || (typeof result === "object" && fingerprint(result.execution.sessionBinding) !== fingerprint(source.parent.sessionBinding)))) result = "unknown";
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
    const linkInput = record.retryOf?.taskInput ?? snapshot;
    if (task && sameInput(task, linkInput) && task.status === "not_started") await this.tasks.recordDispatchAccepted(task.id, linkInput, receipt.runId, this.abort.signal);
  }
}
