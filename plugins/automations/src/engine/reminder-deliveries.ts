import { createHash, randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { errors, HuhuError, isHuhuError } from "@huhu/contracts";
import { filesystemIdentity, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskRuleDispatch } from "../../../tasks/src/engine/index.js";
import type { ActivationRecord, AutomationsService } from "./service.js";

const directory = "automations/reminder-deliveries";
const digest = (fields: string[]) => createHash("sha256").update(JSON.stringify(fields)).digest("hex");
const Id = z.string().regex(/^rem-(?:[a-f0-9]{64}|[a-f0-9-]{36})$/);
const Instant = z.iso.datetime();
const RecordSchema = z.strictObject({
  format: z.literal(1),
  id: Id,
  vaultId: z.string().min(1),
  owner: z.string().regex(/^[a-f0-9]{64}$/),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  scheduledFor: Instant.nullable(),
  startedAt: Instant,
  finishedAt: Instant.nullable(),
  text: z.string().min(1),
  taskBody: z.string(),
  notificationModule: z.enum(["tasks", "automations"]),
  notification: z.enum(["disabled", "pending", "sending", "sent", "unknown"]),
  task: z.enum(["disabled", "pending", "created", "unavailable"]),
});
type ReminderRecord = z.infer<typeof RecordSchema>;
type Stored = { data: ReminderRecord; version: string };
type Notification = { id: string; title: string; module: string };
export type ReminderNotifications = { send(notification: Notification): void; has(id: string): boolean };
const scheduledId = (ruleId: string, at: string) => `rem-${digest([ruleId, at])}`;
const reminderTaskId = (id: string) => `task-${digest(["reminder", id]).slice(0, 32)}`;
const notificationId = (id: string) => `ntf-${digest(["reminder", id])}`;

/** A reminder occurrence has two separately checkpointed effects. */
export class ReminderDeliveries {
  private readonly owner: string | null;
  private readonly active = new Map<string, Promise<ReminderRecord | null>>();
  private readonly lifetime = new AbortController();

  constructor(
    private readonly files: VaultFiles,
    private readonly vaultId: string,
    machine: string,
    private readonly rules: Pick<AutomationsService, "rule">,
    private readonly tasks: () => TaskRuleDispatch | undefined,
    private readonly taskPath: (taskId: string) => string | undefined,
    private readonly notifications: ReminderNotifications,
    private readonly now: () => Date,
    private readonly onChanged: (activation: ActivationRecord) => void,
  ) {
    const stat = statSync(files.root, { bigint: true });
    const identity = filesystemIdentity(stat);
    this.owner = identity && stat.birthtimeNs > 0n ? digest([vaultId, machine, identity, String(stat.birthtimeNs)]) : null;
  }

  async close(): Promise<void> {
    this.lifetime.abort();
    await Promise.allSettled(this.active.values());
  }

  async activate(ruleId: string, scheduled: Date | null): Promise<ActivationRecord | null> {
    const at = scheduled?.toISOString() ?? null;
    const data = await this.run(at ? scheduledId(ruleId, at) : `rem-${randomUUID()}`, { ruleId, at });
    return data ? this.view(data) : null;
  }

  async recover(): Promise<void> {
    if (this.files.readOnly) return;
    await Promise.allSettled(this.ids().map((id) => this.run(id)));
  }

  list(): ActivationRecord[] {
    return this.ids().flatMap((id) => {
      const row = this.load(id);
      return row ? [this.view(row.data)] : [];
    });
  }

  lastScheduledFor(ruleId: string): Date | null {
    const dates = this.ids().flatMap((id) => {
      const row = this.load(id)?.data;
      return row?.ruleId === ruleId && row.owner === this.owner && row.vaultId === this.vaultId && row.scheduledFor ? [row.scheduledFor] : [];
    });
    const latest = dates.sort().at(-1);
    return latest ? new Date(latest) : null;
  }

  private ids(): string[] {
    try {
      return readdirSync(this.files.abs(directory))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -5))
        .filter((id) => Id.safeParse(id).success);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private load(id: string): Stored | null {
    const stored = this.files.read(`${directory}/${id}.json`);
    if (!stored) return null;
    try {
      const data = RecordSchema.parse(JSON.parse(stored.bytes.toString("utf8")));
      if (data.id !== id || (data.scheduledFor && scheduledId(data.ruleId, data.scheduledFor) !== id)) throw new Error("Reminder identity mismatch");
      return { data, version: stored.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "自动化提醒记录损坏", { details: { id } });
    }
  }

  private async save(data: ReminderRecord, expectedVersion: string | null): Promise<Stored> {
    this.lifetime.signal.throwIfAborted();
    const { version } = await this.files.write(`${directory}/${data.id}.json`, Buffer.from(JSON.stringify(data) + "\n"), { expectedVersion });
    return { data, version };
  }

  private run(id: string, trigger?: { ruleId: string; at: string | null }): Promise<ReminderRecord | null> {
    const existing = this.active.get(id);
    if (existing) return existing;
    const pending = this.advance(id, trigger).finally(() => this.active.delete(id));
    this.active.set(id, pending);
    return pending;
  }

  private async advance(id: string, trigger?: { ruleId: string; at: string | null }): Promise<ReminderRecord | null> {
    this.lifetime.signal.throwIfAborted();
    let row = this.load(id);
    if (!row && trigger) {
      const rule = this.rules.rule(trigger.ruleId);
      const action = rule.data.action;
      if (action.kind !== "reminder") throw errors.invalidInput("当前规则不再是提醒规则");
      if (trigger.at && (!rule.data.enabled || Date.parse(trigger.at) <= Date.parse(rule.data.updatedAt))) return null;
      if (trigger.at && Date.parse(trigger.at) > this.now().getTime()) throw errors.invalidInput("提醒时间尚未到达");
      if (!this.owner) throw errors.invalidInput("无法确认本机的提醒归属");
      const reference = action.taskId ? `\n\n相关任务：[[${this.taskPath(action.taskId) ?? action.taskId}]]` : "";
      row = await this.save(
        {
          format: 1,
          id,
          vaultId: this.vaultId,
          owner: this.owner,
          ruleId: rule.id,
          ruleVersion: rule.version,
          scheduledFor: trigger.at,
          startedAt: this.now().toISOString(),
          finishedAt: null,
          text: action.text,
          taskBody: `${action.text}${reference}\n\n（由自动化「${rule.data.title}」创建）`,
          notificationModule: action.taskId ? "tasks" : "automations",
          notification: action.mode === "task" ? "disabled" : "pending",
          task: action.mode === "notification" ? "disabled" : "pending",
        },
        null,
      );
      this.onChanged(this.view(row.data));
    }
    if (!row || row.data.finishedAt || row.data.owner !== this.owner || row.data.vaultId !== this.vaultId) return row?.data ?? null;
    this.files.assertWritable();
    const idempotentNotification = notificationId(id);
    if (row.data.notification === "pending") {
      row = await this.save({ ...row.data, notification: "sending" }, row.version);
      this.lifetime.signal.throwIfAborted();
      try {
        this.notifications.send({ id: idempotentNotification, title: row.data.text, module: row.data.notificationModule });
      } catch {
        // Check the same notification identity even if its acknowledgement was lost.
      }
    }
    if (row.data.notification === "sending") {
      row = await this.save({ ...row.data, notification: this.notifications.has(idempotentNotification) ? "sent" : "unknown" }, row.version);
    }
    if (row.data.task === "pending") {
      const tasks = this.tasks();
      if (!tasks) return row.data;
      const data = row.data;
      this.lifetime.signal.throwIfAborted();
      let task: "created" | "unavailable";
      try {
        await tasks.createFromRule({ taskId: reminderTaskId(id), ruleId: data.ruleId, occurrenceId: id, title: data.text.slice(0, 200), body: data.taskBody, execution: null });
        task = "created";
      } catch (error) {
        if (!isHuhuError(error) || (error.code !== "NOT_FOUND" && error.code !== "VERSION_CONFLICT")) throw error;
        task = "unavailable";
      }
      row = await this.save({ ...row.data, task }, row.version);
    }
    const completed = (await this.save({ ...row.data, finishedAt: this.now().toISOString() }, row.version)).data;
    this.onChanged(this.view(completed));
    return completed;
  }

  private view(data: ReminderRecord): ActivationRecord {
    const { id, ruleId, startedAt, finishedAt, scheduledFor, task, notification } = data;
    const state = !finishedAt ? "pending" : notification === "unknown" ? "unknown" : task === "unavailable" ? "failed" : "succeeded";
    const summary = { state, notification, task, ...(notification === "sent" && { notificationId: notificationId(id) }), ...(task === "created" && { taskId: reminderTaskId(id) }) };
    return {
      activationId: id,
      ruleId,
      trigger: scheduledFor ? "schedule" : "manual",
      scheduledFor,
      startedAt,
      ...(finishedAt && { finishedAt }),
      summary,
    };
  }
}
