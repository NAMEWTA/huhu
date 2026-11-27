import { createHash, randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { errors, HuhuError, isHuhuError, PlanOccurrenceSchema, TaskFollowUpViewSchema as FollowUpView, type PlanOccurrence, type PlanSummary, type PlanWrite, type TaskFollowUpDispatch } from "@huhu/contracts";
import { filesystemIdentity, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskQueryLike } from "./service.js";

const directory = "automations/follow-ups";
const digest = (fields: readonly string[]) => createHash("sha256").update(JSON.stringify(fields)).digest("hex");
const ID = z.string().min(1).max(256);
const Version = z.uuidv4();
const Instant = z.iso.datetime();
const State = FollowUpView.shape.state.exclude(["needs_confirmation", "paused"]);
const Schedule = z.strictObject({
  format: z.literal(1),
  vaultId: ID,
  owner: z.string().regex(/^[a-f0-9]{64}$/),
  taskId: ID,
  followUpId: Version,
  revision: Version,
  scheduledFor: Instant,
  inputRevision: z.int().positive(),
  inputHash: z.string().regex(/^[a-f0-9]{16}$/),
  state: State,
  reason: z.string().nullable(),
  runId: z.string().nullable(),
});

export const FollowUpLookup = Schedule.pick({ taskId: true });
const expectedTaskVersion = z.string().min(1).max(128).optional();
export const FollowUpScheduleInput = FollowUpLookup.extend({ scheduledFor: Instant, expectedRevision: Version.nullable(), expectedTaskVersion, intentId: Version.optional() });
export const FollowUpCancelInput = FollowUpLookup.extend({ expectedRevision: Version, intentId: Version.optional() });
export { FollowUpView };
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const PlanMetadata = z.strictObject({
  id: ID,
  createdAt: Instant,
  updatedAt: Instant,
  intent: z.enum(["enabled", "paused", "deleted"]),
  machineId: ID.optional(),
  acceptance: z.strictObject({ at: Instant, revision: Version }).optional(),
  blockedDispatch: z.literal(true).optional(),
});
const StoredSchedule = Schedule.extend({
  toolOwner: Hash.optional(),
  intents: z.record(Hash, z.strictObject({ fingerprint: Hash, result: FollowUpView })).optional(),
  plan: PlanMetadata.optional(),
  history: z.array(PlanOccurrenceSchema).optional(),
});
type Schedule = Omit<z.infer<typeof StoredSchedule>, "plan"> & { plan: z.infer<typeof PlanMetadata> };
type Stored = { value: Schedule; version: string };
type View = z.infer<typeof FollowUpView>;
type Intent = { key: string; fingerprint: string };

export class FollowUps {
  private readonly owner: string | null;
  private readonly lifetime = new AbortController();
  private tail: Promise<unknown> = Promise.resolve();
  private checking = false;

  constructor(
    private readonly files: VaultFiles,
    private readonly vaultId: string,
    private readonly machineId: string,
    private readonly tasks: () => Pick<TaskQueryLike, "snapshot"> | undefined,
    private readonly dispatch: () => TaskFollowUpDispatch | undefined,
    private readonly now: () => Date,
    private readonly onChanged: (taskId: string) => void,
    private readonly allowsSchedule: (slot: string) => boolean = () => true,
  ) {
    const root = statSync(files.root, { bigint: true });
    const identity = filesystemIdentity(root);
    this.owner = identity && root.birthtimeNs > 0n ? digest([vaultId, machineId, identity, String(root.birthtimeNs)]) : null;
  }

  close(): void {
    this.lifetime.abort();
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(() => {
      this.lifetime.signal.throwIfAborted();
      return operation();
    });
    this.tail = next.catch(() => undefined);
    return next;
  }

  private pathname(taskId: string): string {
    return `${directory}/${digest([taskId])}.json`;
  }

  private load(path: string): Stored | null {
    const file = this.files.read(path);
    if (!file) return null;
    try {
      const value = StoredSchedule.parse(JSON.parse(file.bytes.toString("utf8")));
      if (this.pathname(value.taskId) !== path) throw new Error("Follow-up identity mismatch");
      if (value.plan) return { value: { ...value, plan: value.plan }, version: file.version };
      const observedAt = statSync(this.files.abs(path)).mtime.toISOString();
      return {
        value: {
          ...value,
          plan: {
            id: `follow-up-${digest([value.vaultId, value.taskId])}`,
            createdAt: observedAt,
            updatedAt: observedAt,
            intent: value.state === "cancelled" ? "paused" : "enabled",
          },
        },
        version: file.version,
      };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "任务跟进记录损坏");
    }
  }

  private async save(data: Schedule, expectedVersion: string | null, authorize?: () => void): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    await this.files.write(this.pathname(data.taskId), Buffer.from(JSON.stringify(data) + "\n"), {
      expectedVersion,
      ...(authorize && { beforeCommit: authorize }),
    });
    this.onChanged(data.taskId);
  }

  private view(data: Schedule): View {
    const local = this.isLocal(data);
    const { taskId, followUpId, revision, scheduledFor, runId, reason } = data;
    const state = data.state === "scheduled" ? (!local ? "needs_confirmation" : data.plan.intent === "paused" ? "paused" : data.state) : data.state;
    return { taskId, followUpId, revision, scheduledFor, runId, reason, state, planId: data.plan.id };
  }

  read(taskId: string, toolOwner?: string): View | null {
    if (toolOwner !== undefined && !this.tasks()?.snapshot(taskId)) throw errors.notFound("没有这条任务");
    const stored = this.load(this.pathname(taskId));
    if (toolOwner !== undefined && stored) this.assertVisible(stored.value, toolOwner);
    return stored && stored.value.plan.intent !== "deleted" ? this.view(stored.value) : null;
  }

  schedule(input: z.infer<typeof FollowUpScheduleInput>, toolOwner?: string, authorize?: () => void): Promise<View> {
    const { taskId, scheduledFor, expectedRevision, expectedTaskVersion, intentId } = input;
    return this.serialize(async () => {
      authorize?.();
      this.files.assertWritable();
      if (!this.owner) throw errors.invalidInput("无法确认本机的任务跟进归属");
      const stored = this.load(this.pathname(taskId));
      const task = this.tasks()?.snapshot(taskId);
      if (!task) throw errors.notFound("没有这条任务");
      if (toolOwner !== undefined && stored) this.assertVisible(stored.value, toolOwner);
      const intent = this.intent(toolOwner, "schedule", intentId, [taskId, scheduledFor, expectedRevision, expectedTaskVersion]);
      const previous = this.replay(stored?.value, intent);
      if (previous) return previous;
      if (toolOwner !== undefined && expectedTaskVersion === undefined) throw errors.invalidInput("安排跟进需要当前任务版本");
      if (expectedTaskVersion !== undefined && task.version !== expectedTaskVersion) throw errors.versionConflict(task.version);
      this.compare(stored?.value.plan.intent === "deleted" ? null : stored, expectedRevision);
      const data = this.reschedule(this.owner, task, scheduledFor, stored?.value, toolOwner);
      return this.commit(data, stored?.version ?? null, intent, authorize);
    });
  }

  cancel({ taskId, expectedRevision, intentId }: z.infer<typeof FollowUpCancelInput>, toolOwner?: string, authorize?: () => void): Promise<View> {
    return this.serialize(async () => {
      authorize?.();
      this.files.assertWritable();
      const current = this.load(this.pathname(taskId));
      if (toolOwner !== undefined) {
        if (!this.tasks()?.snapshot(taskId)) throw errors.notFound("没有这条任务");
        if (current) this.assertVisible(current.value, toolOwner);
      }
      const intent = this.intent(toolOwner, "cancel", intentId, [taskId, expectedRevision]);
      const previous = this.replay(current?.value, intent);
      if (previous) return previous;
      if (!current || current.value.plan.intent === "deleted") throw errors.notFound("没有这条任务跟进");
      this.compare(current, expectedRevision);
      if (current.value.state !== "scheduled") throw errors.invalidInput("此任务跟进已处理");
      const data: Schedule = {
        ...current.value,
        state: "cancelled",
        revision: randomUUID(),
        plan: { ...current.value.plan, intent: "paused", updatedAt: this.now().toISOString() },
      };
      return this.commit(data, current.version, intent, authorize);
    });
  }

  private isLocal(data: Schedule): boolean {
    return data.vaultId === this.vaultId && data.owner === this.owner;
  }

  private reschedule(owner: string, task: ReturnType<TaskQueryLike["snapshot"]>, scheduledFor: string, previous?: Schedule, toolOwner?: string): Schedule {
    if (task.type !== "agent" || task.status === "completed") throw errors.invalidInput("当前任务无法安排跟进");
    const updatedAt = this.now().toISOString();
    if (Date.parse(scheduledFor) <= Date.parse(updatedAt)) throw errors.invalidInput("跟进时间须晚于当前时间");
    const previousPlan = previous?.plan.intent === "deleted" ? undefined : previous?.plan;
    const last = previous?.plan.acceptance ? this.occurrence(previous) : null;
    const history = last ? [...(previous?.history ?? []), last] : previous?.history;
    return {
      format: 1,
      vaultId: this.vaultId,
      owner,
      taskId: task.id,
      followUpId: randomUUID(),
      revision: randomUUID(),
      scheduledFor,
      inputRevision: task.inputRevision,
      inputHash: task.inputHash,
      state: "scheduled",
      reason: null,
      runId: null,
      plan: {
        id: previousPlan?.id ?? `follow-up-${randomUUID()}`,
        createdAt: previousPlan?.createdAt ?? updatedAt,
        updatedAt,
        intent: previousPlan && previous?.state !== "cancelled" ? previousPlan.intent : "enabled",
        machineId: this.machineId,
      },
      ...(history && { history }),
      ...(toolOwner && { toolOwner }),
      ...(previous && this.isLocal(previous) && previous.intents && { intents: previous.intents }),
    };
  }

  listPlans(taskId?: string): PlanSummary[] {
    if (taskId !== undefined) {
      const data = this.load(this.pathname(taskId))?.value;
      return data && data.plan.intent !== "deleted" ? [this.summary(data)] : [];
    }
    const summaries: PlanSummary[] = [];
    for (const { value } of this.records()) {
      if (value.plan.intent !== "deleted") summaries.push(this.summary(value));
    }
    return summaries;
  }

  readPlan(planId: string): PlanSummary | null {
    const stored = this.findPlan(planId);
    return stored ? this.summary(stored.value) : null;
  }

  private findPlan(planId: string): Stored | null {
    for (const stored of this.records()) {
      const { plan } = stored.value;
      if (plan.id === planId && plan.intent !== "deleted") return stored;
    }
    return null;
  }

  readOccurrence(id: string): PlanOccurrence | null {
    for (const { value } of this.records()) {
      if (value.followUpId === id) return this.occurrence(value);
      const prior = value.history?.find(({ occurrenceId }) => occurrenceId === id);
      if (prior) return prior;
    }
    return null;
  }

  listHistory() {
    return [...this.records()].flatMap(({ value }) => {
      const current = this.occurrence(value);
      return [...(current && current.state !== "scheduled" ? [current] : []), ...(value.history ?? [])].map((occurrence) => ({ occurrence, title: "任务跟进", source: "tasks" }));
    });
  }

  changePlan(change: PlanWrite, authorize: () => void): Promise<PlanSummary> {
    return this.serialize(async () => {
      authorize();
      this.files.assertWritable();
      const stored = this.findPlan(change.planId);
      if (!stored) throw errors.notFound("没有这条任务跟进计划");
      this.compare(stored, change.expectedRevision);
      const data = stored.value;
      if (!this.owner || !this.isLocal(data)) throw errors.permissionDenied("此跟进不属于当前 Vault 实例");
      let next: Schedule;
      if (change.change === "reschedule") {
        if (change.trigger.kind !== "once") throw errors.invalidInput("任务跟进需要一次性触发时间");
        const task = this.tasks()?.snapshot(data.taskId);
        if (!task) throw errors.notFound("没有这条任务");
        next = this.reschedule(this.owner, task, change.trigger.scheduledFor, data, data.toolOwner);
      } else if (change.change === "delete" || change.change === "set-intent") {
        if (change.change === "set-intent" && change.intent === "enabled" && data.state === "cancelled") {
          throw errors.invalidInput("请先为已取消的跟进重新安排时间");
        }
        const intent = change.change === "delete" ? "deleted" : change.intent;
        next = {
          ...data,
          revision: randomUUID(),
          state: intent === "deleted" && data.state === "scheduled" ? "cancelled" : data.state,
          plan: { ...data.plan, intent, updatedAt: this.now().toISOString(), ...(data.state === "accepted" && intent !== "enabled" && { blockedDispatch: true as const }) },
        };
      } else {
        throw errors.invalidInput("任务跟进按计划时间触发");
      }
      await this.save(next, stored.version, authorize);
      return this.summary(next);
    });
  }

  private summary(data: Schedule): PlanSummary {
    const local = this.isLocal(data);
    let title = "一次性任务跟进";
    let availability: PlanSummary["availability"] = { state: "ready" };
    const tasks = this.tasks();
    if (tasks) {
      try {
        title = tasks.snapshot(data.taskId).title;
      } catch (error) {
        if (!isHuhuError(error) || error.code !== "NOT_FOUND") throw error;
        availability = { state: "blocked", reason: "target-unavailable" };
      }
    }
    if (!tasks || !this.dispatch()) availability = { state: "blocked", reason: "plugin-disabled" };
    if (!local) availability = { state: "blocked", reason: "foreign-owner" };
    if (this.files.readOnly) availability = { state: "blocked", reason: "read-only" };
    const { id: planId, createdAt, updatedAt, intent, machineId, acceptance } = data.plan;
    const object = { kind: "task", id: data.taskId };
    const actions: PlanSummary["actions"] = [];
    if (local && !this.files.readOnly && intent !== "deleted") {
      actions.push("reschedule", "delete");
      if (intent === "enabled") actions.push("pause");
      else if (data.state !== "cancelled") actions.push("resume");
    }
    const last = data.history?.at(-1);
    return {
      planId,
      revision: data.revision,
      title,
      source: { plugin: "tasks", object },
      owner: { scope: "device", vaultId: data.vaultId, machineId: machineId ?? (local ? this.machineId : data.owner) },
      action: { capability: "tasks.dispatch", object, summary: "一次性任务跟进" },
      intent,
      availability,
      trigger: { kind: "once", scheduledFor: data.scheduledFor },
      createdAt,
      updatedAt,
      nextAt: data.state === "scheduled" && intent === "enabled" && availability.state === "ready" ? data.scheduledFor : null,
      lastOccurrence:
        data.state === "accepted" ? { occurrenceId: data.followUpId, state: "accepted", at: acceptance?.at ?? data.scheduledFor } : last?.acceptedAt ? { occurrenceId: last.occurrenceId, state: last.state, at: last.acceptedAt } : null,
      actions,
    };
  }

  private occurrence(data: Schedule): PlanOccurrence | null {
    const { acceptance } = data.plan;
    if (data.state === "accepted" && !acceptance) return null;
    const state = data.state === "skipped" ? "blocked" : data.state;
    return {
      occurrenceId: data.followUpId,
      plan: { planId: data.plan.id, revision: acceptance?.revision ?? data.revision },
      timing: { trigger: "scheduled", scheduledFor: data.scheduledFor },
      state,
      acceptedAt: acceptance?.at ?? null,
      frozenInput: { revision: data.inputRevision, digest: data.inputHash },
      execution: null,
      effects: data.runId ? [{ effectId: data.runId, kind: "task-run", target: { kind: "task", id: data.taskId }, state: "accepted", operationId: null, receiptId: data.runId }] : [],
    };
  }

  private assertVisible(data: Schedule, toolOwner: string): void {
    if (!this.owner || data.vaultId !== this.vaultId || data.owner !== this.owner || (data.toolOwner && data.toolOwner !== toolOwner)) {
      throw errors.notFound("没有这条任务跟进");
    }
  }

  private intent(owner: string | undefined, action: string, intentId: string | undefined, input: unknown[]): Intent | undefined {
    if (owner === undefined) return undefined;
    if (!intentId) throw errors.invalidInput("需要固定的跟进操作意图");
    return { key: digest([owner, action, intentId]), fingerprint: digest([JSON.stringify(input)]) };
  }

  private replay(data: Schedule | undefined, intent: Intent | undefined): View | undefined {
    if (!intent) return undefined;
    const prior = data?.intents?.[intent.key];
    if (prior && prior.fingerprint !== intent.fingerprint) throw errors.idempotencyMismatch();
    return prior?.result;
  }

  private async commit(data: Schedule, version: string | null, intent?: Intent, authorize?: () => void): Promise<View> {
    const result = this.view(data);
    if (intent) data.intents = { ...data.intents, [intent.key]: { fingerprint: intent.fingerprint, result } };
    await this.save(data, version, authorize);
    return result;
  }

  private compare(current: { value: Schedule } | null, expected: string | null): void {
    if ((current?.value.revision ?? null) !== expected) throw errors.versionConflict(current?.value.revision ?? "");
  }

  private paths(): string[] {
    try {
      return readdirSync(this.files.abs(directory))
        .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
        .sort()
        .map((name) => `${directory}/${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private *records(): Iterable<Stored> {
    for (const path of this.paths()) {
      try {
        const stored = this.load(path);
        if (stored) yield stored;
      } catch (error) {
        if (!isHuhuError(error) || error.code !== "WRITE_PARTIAL") throw error;
      }
    }
  }

  async tick(): Promise<void> {
    if (this.checking || this.files.readOnly || this.lifetime.signal.aborted) return;
    this.checking = true;
    try {
      for (const path of this.paths()) {
        try {
          await this.serialize(() => this.advance(path));
        } catch {
          // A damaged or temporarily unavailable entry does not prevent other tasks from being checked.
        }
      }
    } finally {
      this.checking = false;
    }
  }

  allowsDispatch(taskId: string, followUpId: string, scheduledFor: string): boolean {
    if (this.lifetime.signal.aborted) return false;
    const data = this.load(this.pathname(taskId))?.value;
    return Boolean(
      this.allowsSchedule(scheduledFor) &&
      data &&
      this.isLocal(data) &&
      data.followUpId === followUpId &&
      data.scheduledFor === scheduledFor &&
      (data.state === "scheduled" || data.state === "accepted") &&
      data.plan.intent === "enabled" &&
      !data.plan.blockedDispatch,
    );
  }

  private async advance(path: string): Promise<void> {
    const stored = this.load(path);
    const data = stored?.value;
    if (!stored || !data || data.state !== "scheduled" || data.plan.intent !== "enabled" || !this.isLocal(data) || Date.parse(data.scheduledFor) > this.now().getTime()) return;
    if (!this.allowsSchedule(data.scheduledFor)) {
      await this.save({ ...data, state: "skipped", reason: "global-pause", revision: randomUUID() }, stored.version);
      return;
    }
    const dispatch = this.dispatch();
    if (!dispatch) return;
    const { taskId, followUpId, scheduledFor, inputHash, inputRevision } = data;
    let next: Schedule;
    try {
      const receipt = await dispatch.acceptFollowUp({ taskId, followUpId, scheduledFor, inputHash, inputRevision });
      next = {
        ...data,
        state: "accepted",
        runId: receipt.runId,
        revision: randomUUID(),
        plan: { ...data.plan, acceptance: { at: receipt.acceptedAt, revision: data.revision } },
      };
    } catch (error) {
      if (!isHuhuError(error)) throw error;
      const reason = error.details?.["reason"];
      if (reason === "not_due" || reason === "task_occupied" || error.retryable) return;
      if (error.code !== "NOT_FOUND" && reason !== "task_unavailable" && reason !== "stale_input" && reason !== "target_unavailable") throw error;
      next = { ...data, state: "skipped", reason: typeof reason === "string" ? reason : "task_deleted", revision: randomUUID() };
    }
    await this.save(next, stored.version);
  }
}
