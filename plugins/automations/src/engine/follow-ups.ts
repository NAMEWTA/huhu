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
export const FollowUpScheduleInput = FollowUpLookup.extend({ scheduledFor: Instant, expectedRevision: Version.nullable() });
export const FollowUpCancelInput = FollowUpLookup.extend({ expectedRevision: Version });
export const FollowUpView = Schedule.pick({ taskId: true, followUpId: true, revision: true, scheduledFor: true, reason: true, runId: true }).extend({ state: z.enum([...State.options, "needs_confirmation"]) });
type Schedule = z.infer<typeof Schedule>;
type View = z.infer<typeof FollowUpView>;

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
      const value = Schedule.parse(JSON.parse(file.bytes.toString("utf8")));
      if (this.pathname(value.taskId) !== path) throw new Error("Follow-up identity mismatch");
      return { value, version: file.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "任务跟进记录损坏");
    }
  }

  private save(data: Schedule, expectedVersion: string | null): Promise<unknown> {
    this.lifetime.signal.throwIfAborted();
    return this.files.write(this.pathname(data.taskId), Buffer.from(JSON.stringify(data) + "\n"), { expectedVersion });
  }

  private view(data: Schedule): View {
    const local = data.vaultId === this.vaultId && data.owner === this.owner;
    const { taskId, followUpId, revision, scheduledFor, runId, reason } = data;
    return { taskId, followUpId, revision, scheduledFor, runId, reason, state: !local && data.state === "scheduled" ? "needs_confirmation" : data.state };
  }

  read(taskId: string): View | null {
    const stored = this.load(this.pathname(taskId));
    return stored ? this.view(stored.value) : null;
  }

  schedule({ taskId, scheduledFor, expectedRevision }: z.infer<typeof FollowUpScheduleInput>): Promise<View> {
    return this.serialize(async () => {
      this.files.assertWritable();
      if (!this.owner) throw errors.invalidInput("无法确认本机的任务跟进归属");
      if (Date.parse(scheduledFor) <= this.now().getTime()) throw errors.invalidInput("跟进时间须晚于当前时间");
      const stored = this.load(this.pathname(taskId));
      this.compare(stored, expectedRevision);
      const task = this.tasks()?.snapshot(taskId);
      if (!task || task.type !== "agent" || task.status === "completed") throw errors.invalidInput("当前任务无法安排跟进");
      const data = Schedule.parse({
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
      });
      await this.save(data, stored?.version ?? null);
      return this.view(data);
    });
  }

  cancel({ taskId, expectedRevision }: z.infer<typeof FollowUpCancelInput>): Promise<View> {
    return this.serialize(async () => {
      this.files.assertWritable();
      const current = this.load(this.pathname(taskId));
      this.compare(current, expectedRevision);
      if (!current) throw errors.notFound("没有这条任务跟进");
      if (current.value.state !== "scheduled") throw errors.invalidInput("此任务跟进已处理");
      const data: Schedule = { ...current.value, state: "cancelled", revision: randomUUID() };
      await this.save(data, current.version);
      return this.view(data);
    });
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
