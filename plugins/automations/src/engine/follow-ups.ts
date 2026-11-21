import { createHash, randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { errors, HuhuError, isHuhuError } from "@huhu/contracts";
import { filesystemIdentity, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskFollowUpDispatch } from "../../../tasks/src/engine/index.js";
import type { TaskQueryLike } from "./service.js";

const directory = "automations/follow-ups";
const digest = (fields: readonly string[]) => createHash("sha256").update(JSON.stringify(fields)).digest("hex");
const ID = z.string().min(1).max(256);
const Version = z.uuidv4();
const Instant = z.iso.datetime();
const State = z.enum(["scheduled", "accepted", "cancelled", "skipped"]);
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
export const FollowUpView = Schedule.pick({ taskId: true, followUpId: true, revision: true, scheduledFor: true, reason: true, runId: true }).extend({ state: z.enum([...State.options, "needs_confirmation"]) });
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const StoredSchedule = Schedule.extend({
  toolOwner: Hash.optional(),
  intents: z.record(Hash, z.strictObject({ fingerprint: Hash, result: FollowUpView })).optional(),
});
type Schedule = z.infer<typeof StoredSchedule>;
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
    machineId: string,
    private readonly tasks: () => Pick<TaskQueryLike, "snapshot"> | undefined,
    private readonly dispatch: () => TaskFollowUpDispatch | undefined,
    private readonly now: () => Date,
    private readonly onChanged: (taskId: string) => void,
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

  private load(path: string): { value: Schedule; version: string } | null {
    const file = this.files.read(path);
    if (!file) return null;
    try {
      const value = StoredSchedule.parse(JSON.parse(file.bytes.toString("utf8")));
      if (this.pathname(value.taskId) !== path) throw new Error("Follow-up identity mismatch");
      return { value, version: file.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "任务跟进记录损坏");
    }
  }

  private async save(data: Schedule, expectedVersion: string | null): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    await this.files.write(this.pathname(data.taskId), Buffer.from(JSON.stringify(data) + "\n"), { expectedVersion });
    this.onChanged(data.taskId);
  }

  private view(data: Schedule): View {
    const local = data.vaultId === this.vaultId && data.owner === this.owner;
    const { taskId, followUpId, revision, scheduledFor, runId, reason } = data;
    return { taskId, followUpId, revision, scheduledFor, runId, reason, state: !local && data.state === "scheduled" ? "needs_confirmation" : data.state };
  }

  read(taskId: string, toolOwner?: string): View | null {
    if (toolOwner !== undefined && !this.tasks()?.snapshot(taskId)) throw errors.notFound("没有这条任务");
    const stored = this.load(this.pathname(taskId));
    if (toolOwner !== undefined && stored) this.assertVisible(stored.value, toolOwner);
    return stored ? this.view(stored.value) : null;
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
      if (Date.parse(scheduledFor) <= this.now().getTime()) throw errors.invalidInput("跟进时间须晚于当前时间");
      this.compare(stored, expectedRevision);
      if (task.type !== "agent" || task.status === "completed") throw errors.invalidInput("当前任务无法安排跟进");
      const data = StoredSchedule.parse({
        format: 1,
        vaultId: this.vaultId,
        owner: this.owner,
        taskId,
        followUpId: randomUUID(),
        revision: randomUUID(),
        scheduledFor,
        inputRevision: task.inputRevision,
        inputHash: task.inputHash,
        state: "scheduled",
        reason: null,
        runId: null,
        ...(toolOwner && { toolOwner }),
        ...(stored?.value.owner === this.owner && stored.value.vaultId === this.vaultId && stored.value.intents && { intents: stored.value.intents }),
      });
      return this.commit(data, stored?.version ?? null, intent);
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
      this.compare(current, expectedRevision);
      if (!current) throw errors.notFound("没有这条任务跟进");
      if (current.value.state !== "scheduled") throw errors.invalidInput("此任务跟进已处理");
      const data: Schedule = { ...current.value, state: "cancelled", revision: randomUUID() };
      return this.commit(data, current.version, intent);
    });
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

  private async commit(data: Schedule, version: string | null, intent?: Intent): Promise<View> {
    const result = this.view(data);
    if (intent) data.intents = { ...data.intents, [intent.key]: { fingerprint: intent.fingerprint, result } };
    await this.save(data, version);
    return result;
  }

  private compare(current: { value: Schedule } | null, expected: string | null): void {
    if ((current?.value.revision ?? null) !== expected) throw errors.versionConflict(current?.value.revision ?? "");
  }

  async tick(): Promise<void> {
    if (this.checking || this.files.readOnly || this.lifetime.signal.aborted) return;
    this.checking = true;
    try {
      let paths: string[];
      try {
        paths = readdirSync(this.files.abs(directory));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const name of paths.filter((item) => /^[a-f0-9]{64}\.json$/.test(item)).sort()) {
        try {
          await this.serialize(() => this.advance(`${directory}/${name}`));
        } catch {
          // A damaged or temporarily unavailable entry does not prevent other tasks from being checked.
        }
      }
    } finally {
      this.checking = false;
    }
  }

  private async advance(path: string): Promise<void> {
    const stored = this.load(path);
    const data = stored?.value;
    if (!stored || !data || data.state !== "scheduled" || data.owner !== this.owner || data.vaultId !== this.vaultId || Date.parse(data.scheduledFor) > this.now().getTime()) return;
    const dispatch = this.dispatch();
    if (!dispatch) return;
    const { taskId, followUpId, scheduledFor, inputHash, inputRevision } = data;
    let next: Schedule;
    try {
      const receipt = await dispatch.acceptFollowUp({ taskId, followUpId, scheduledFor, inputHash, inputRevision });
      next = { ...data, state: "accepted", runId: receipt.runId, revision: randomUUID() };
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
