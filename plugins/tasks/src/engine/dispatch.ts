import { HuhuError, errors, isHuhuError, newId, type TaskDto } from "@huhu/contracts";
import { DispatchInput, DispatchLookup, DispatchStore, RuleSource, eventIdOf, fingerprint, holdsTask, sameInput, type DispatchReceipt, type DispatchRecord, type DispatchSnapshot, type DispatchSource } from "./dispatch-store.js";
import type { TasksService } from "./service.js";
import { WriteQueue } from "./write-queue.js";

type Work = Readonly<{
  eventId: string;
  dispatchId: string;
  runId: string;
  attempt: number;
  snapshot: DispatchSnapshot;
  snapshotHash: string;
}>;

export interface TaskDispatchExecutor {
  /** 只读目标/资源预检。实际输入所有权仍须由执行者在派遣时核验。 */
  ready(work: Work, signal: AbortSignal): Promise<"ready" | "busy" | "unavailable">;
  /** accepted 表示目标实例已接收本轮输入；仅保存启动意图仍须对账。 */
  dispatch(work: Work, signal: AbortSignal): Promise<"accepted" | "not_sent" | "unknown">;
  /** not_sent 必须是可证明未送达；空列表或离线只能返回 unknown。 */
  inspect(work: Work, signal: AbortSignal): Promise<"accepted" | "not_sent" | "unknown">;
}

type Rejection = NonNullable<DispatchReceipt["reason"]> | "stale_input" | "not_due" | "expired";

function rejectDispatch(reason: Rejection, message: string, existing?: DispatchReceipt): never {
  const code = reason === "stale_input" ? "VERSION_CONFLICT" : "INVALID_INPUT";
  throw new HuhuError(code, message, { details: { reason, ...(existing ? { dispatchId: existing.dispatchId, eventId: existing.eventId, runId: existing.runId } : {}) } });
}

export class TaskDispatch {
  private readonly acceptance = new WriteQueue();
  private readonly abort = new AbortController();
  private checking = false;

  constructor(
    private readonly tasks: TasksService,
    private readonly store: DispatchStore,
    private readonly now: () => Date,
    private readonly machineId: string,
    private readonly executor?: TaskDispatchExecutor,
    private readonly onError?: (error: unknown) => void,
  ) {}

  async close(): Promise<void> {
    this.abort.abort();
    await this.tasks.drainWrites();
  }

  hasHold(taskId: string): boolean {
    return this.store.list().some(({ receipt }) => receipt.taskId === taskId && holdsTask(receipt));
  }

  hasActiveRun(taskId: string): boolean {
    return this.store.list().some(({ receipt }) => receipt.taskId === taskId && receipt.state === "running");
  }

  runs(taskId: string): ReturnType<TasksService["runs"]> {
    return this.store.list().flatMap(({ receipt, claim, snapshot, startedAt, finishedAt }) => {
      if (receipt.taskId !== taskId || !claim) return [];
      let state = "queued";
      if (receipt.state === "running" || receipt.state === "unknown" || receipt.state === "cancelled") state = receipt.state;
      if (receipt.state === "stale_input" || receipt.state === "expired" || receipt.state === "blocked") state = "cancelled";
      return [{ id: receipt.runId, state, startedAt, finishedAt, model: snapshot.execution.model, questions: 0 }];
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
        const existing = this.store.list().find(({ receipt }) => receipt.taskId === task.id && holdsTask(receipt));
        if (existing || this.tasks.hasLegacyRun(task.id)) rejectDispatch("task_occupied", "该任务已有待派或活动运行", existing?.receipt);
        if (!sameInput(task, input)) rejectDispatch("stale_input", "任务输入已变化，请重新读取任务");
        const execution = this.dispatchable(task);
        if (!execution) rejectDispatch("task_unavailable", "只有配置齐全且未开始的 Agent 任务可以派遣");
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
        };
        // 只要求旧版本的执行输入仍一致。评论或不参与执行的字段可在新文件版本上受理。
        return (await this.store.write({ schema: 1, receipt, requestHash, snapshot, snapshotHash: fingerprint(snapshot), claim: null, startedAt: null, finishedAt: null }, null)).receipt;
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
      const events = this.store
        .list()
        .filter(({ receipt }) => holdsTask(receipt))
        .sort((a, b) => a.receipt.acceptedAt.localeCompare(b.receipt.acceptedAt) || a.receipt.eventId.localeCompare(b.receipt.eventId));
      for (const event of events) {
        if (this.abort.signal.aborted) break;
        try {
          await this.advance(event);
        } catch (error) {
          this.onError?.(error);
        }
      }
    } catch (error) {
      this.onError?.(error);
    } finally {
      this.checking = false;
    }
  }

  private lookup(input: DispatchLookup) {
    const stored = this.store.read(eventIdOf(input.dispatchId));
    if (!stored || stored.record.receipt.taskId !== input.taskId) throw errors.notFound("没有这条任务派遣记录");
    return stored;
  }

  private dispatchable(task: TaskDto): DispatchSnapshot["execution"] | null {
    const config = task.execution;
    if (task.readOnly || task.type !== "agent" || task.status !== "not_started" || task.problems.length || !task.body.trim() || !config?.spaceId) return null;
    if (config.target?.mode !== "existing" && !config.provider) return null;
    if (task.references.some((ref) => ref.from === "task" && (ref.path.startsWith("/") || ref.path.split("/").includes("..") || /^[a-z]:/i.test(ref.path) || ref.path.includes("\\")))) return null;
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

  private async advance(event: DispatchRecord): Promise<void> {
    const { receipt, snapshot, snapshotHash } = event;
    const signal = this.abort.signal;
    const executor = this.executor;
    if (event.claim && event.claim.machineId !== this.machineId) return;
    if (receipt.state === "running") {
      await this.linkTask(event);
      return;
    }
    const work = { eventId: receipt.eventId, dispatchId: receipt.dispatchId, runId: receipt.runId, attempt: receipt.attempt, snapshot, snapshotHash };
    if (receipt.state === "pending" || receipt.state === "claimed") {
      // 重开后先检查原快照有效性，过期或已关闭的任务不做目标预检。
      if (!(await this.prepare(receipt, "check")) || !executor) return;
      const ready = await executor.ready(work, signal);
      if (!(await this.prepare(receipt, ready))) return;
      // claimed 独立落盘。进程在此中断时，可以证明尚未开始派遣。
      if (!(await this.beginSending(receipt))) return;
      await this.finishSending(receipt, () => executor.dispatch(work, signal));
      return;
    }
    if (executor) await this.finishSending(receipt, () => executor.inspect(work, signal));
  }

  private async prepare(key: DispatchLookup, readiness: "check" | "ready" | "busy" | "unavailable"): Promise<boolean> {
    return this.tasks.withTaskWrite(key.taskId, async () => {
      if (this.abort.signal.aborted) return false;
      const { record, version } = this.lookup(key);
      const { receipt, snapshot } = record;
      if (receipt.state !== "pending" && receipt.state !== "claimed") return false;
      const task = this.task(key.taskId);
      const now = this.now();
      const source = snapshot.source;
      const next = { ...receipt };
      let claim = record.claim;
      if (receipt.cancelRequested) Object.assign(next, { state: "cancelled", reason: null });
      else if (source.kind === "automation" && source.expiresAt && Date.parse(source.expiresAt) <= now.getTime()) Object.assign(next, { state: "expired", reason: null });
      else if (task?.status === "completed") Object.assign(next, { state: "cancelled", reason: "task_closed" });
      else if (task && !sameInput(task, snapshot)) Object.assign(next, { state: "stale_input", reason: null });
      else if (!task || !this.dispatchable(task)) Object.assign(next, { state: "blocked", reason: "task_unavailable" });
      else if (this.tasks.hasLegacyRun(key.taskId)) next.reason = "task_occupied";
      else if (readiness === "busy") next.reason = "waiting_resource";
      else if (readiness === "unavailable") Object.assign(next, { state: "blocked", reason: "target_unavailable" });
      else if (readiness === "ready") {
        next.state = "claimed";
        next.reason = null;
        claim ??= { machineId: this.machineId, at: now.toISOString() };
      } else return true;
      const changed = next.reason !== receipt.reason || next.state !== receipt.state;
      if (changed) await this.store.write({ ...record, receipt: next, claim, finishedAt: holdsTask(next) ? null : now.toISOString() }, version);
      return next.state === "claimed" && next.reason === null;
    });
  }

  private async beginSending(key: DispatchLookup): Promise<boolean> {
    return this.tasks.withTaskWrite(key.taskId, async () => {
      if (this.abort.signal.aborted) return false;
      const { record, version } = this.lookup(key);
      if (record.receipt.state !== "claimed" || record.receipt.cancelRequested) return false;
      // 任务编辑可以在领取落盘与本步骤之间取得写锁。
      const task = this.task(key.taskId);
      if (!task || !sameInput(task, record.snapshot) || !this.dispatchable(task) || this.tasks.hasLegacyRun(key.taskId)) return false;
      const source = record.snapshot.source;
      if (source.kind === "automation" && source.expiresAt && Date.parse(source.expiresAt) <= this.now().getTime()) return false;
      await this.store.write({ ...record, receipt: { ...record.receipt, state: "sending" } }, version);
      return !this.abort.signal.aborted;
    });
  }

  private async finishSending(key: DispatchLookup, send: () => Promise<"accepted" | "not_sent" | "unknown">): Promise<void> {
    if (this.abort.signal.aborted) return;
    let result: "accepted" | "not_sent" | "unknown";
    try {
      result = await send();
    } catch {
      result = "unknown";
    }
    const record = await this.tasks.withTaskWrite(key.taskId, async () => {
      if (this.abort.signal.aborted) return null;
      const { record, version } = this.lookup(key);
      const receipt = { ...record.receipt };
      if (receipt.state !== "sending" && receipt.state !== "unknown") return null;
      const now = this.now().toISOString();
      if (result === "accepted") {
        receipt.state = "running";
        receipt.reason = null;
        return this.store.write({ ...record, receipt, startedAt: now }, version);
      }
      if (result === "not_sent" && receipt.cancelRequested) {
        receipt.state = "cancelled";
        receipt.reason = null;
        return this.store.write({ ...record, receipt, finishedAt: now }, version);
      }
      receipt.state = result === "not_sent" ? "claimed" : "unknown";
      receipt.reason = result === "not_sent" ? "waiting_resource" : "awaiting_confirmation";
      if (receipt.state === record.receipt.state && receipt.reason === record.receipt.reason) return null;
      return this.store.write({ ...record, receipt }, version);
    });
    if (record?.receipt.state === "running") await this.linkTask(record);
  }

  private async linkTask({ receipt, snapshot }: DispatchRecord): Promise<void> {
    if (this.abort.signal.aborted) return;
    const task = this.task(receipt.taskId);
    if (task && sameInput(task, snapshot) && task.status === "not_started") await this.tasks.markDispatched(task.id, snapshot, receipt.runId, { signal: this.abort.signal });
  }
}
