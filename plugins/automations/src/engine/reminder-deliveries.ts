import { createHash, randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { errors, HuhuError, isHuhuError, type PlanOccurrence, type PlanOccurrenceLink } from "@huhu/contracts";
import { filesystemIdentity, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskRuleDispatch } from "@huhu/contracts";
import type { FocusDeadlinePlans } from "./focus-deadline.js";
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
  notificationModule: z.enum(["tasks", "automations", "home"]),
  notification: z.enum(["disabled", "pending", "sending", "sent", "unknown"]),
  task: z.enum(["disabled", "pending", "created", "unavailable"]),
  source: z.enum(["task-reminder", "observation", "focus-deadline"]).optional(),
  targetTask: z.string().optional(),
  comment: z.enum(["pending", "writing", "written", "unavailable"]).optional(),
  focusSettled: z.literal(true).optional(),
  cancelled: z.boolean().optional(),
});
type ReminderRecord = z.infer<typeof RecordSchema>;
type Stored = { data: ReminderRecord; version: string };
type PlanReminder = {
  planId: string; revision: string; scheduledFor: string; source: NonNullable<ReminderRecord["source"]>;
  title: string; taskId?: string; effect: "notification" | "task" | "both" | "comment";
};
type ReminderTrigger = {
  ruleId: string;
  at: string | null;
  expectedVersion?: string;
  plan?: PlanReminder;
};
type Notification = { id: string; title: string; module: string; body?: string; occurrence: PlanOccurrenceLink };
export type ReminderNotifications = { send(notification: Notification): void; has(id: string): boolean };
const scheduledId = (ruleId: string, at: string, revision?: string) => `rem-${digest(revision ? [ruleId, revision, at] : [ruleId, at])}`;
export const planReminderOccurrenceId = (plan: { planId: string; revision: string; scheduledFor: string }) => scheduledId(plan.planId, plan.scheduledFor, plan.revision);
const reminderTaskId = (id: string) => `task-${digest(["reminder", id]).slice(0, 32)}`;
const notificationId = (id: string) => `ntf-${digest(["reminder", id])}`;
const commentId = (id: string) => `c-${digest(["observation", id])}`;

/** A reminder occurrence checkpoints each effect independently. */
export class ReminderDeliveries {
  private readonly owner: string | null;
  private readonly active = new Map<string, Promise<ReminderRecord | null>>();
  private readonly lifetime = new AbortController();

  constructor(
    private readonly files: VaultFiles,
    private readonly vaultId: string,
    machine: string,
    private readonly rules: Pick<AutomationsService, "rule" | "withRuleConfiguration">,
    private readonly tasks: () => TaskRuleDispatch | undefined,
    private readonly taskPath: (taskId: string) => string | undefined,
    private readonly notifications: ReminderNotifications,
    private readonly now: () => Date,
    private readonly onChanged: (activation: ActivationRecord) => void,
    private readonly taskAvailable: (taskId: string) => boolean = () => true,
    private readonly reminderPlanCurrent: (planId: string, revision: string, at: string) => boolean = () => false,
    private readonly observationCurrent: (planId: string, revision: string, at: string) => boolean = () => false,
    private readonly writeComment?: (taskId: string, commentId: string, body: string) => Promise<unknown>,
    private readonly focus?: Pick<FocusDeadlinePlans, "current" | "settle">,
    private readonly allowsSchedule: (slot: string) => boolean = () => true,
    private readonly readComment?: (taskId: string, id: string, body: string) => boolean | undefined,
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

  async activateManual(ruleId: string, expectedVersion: string, caller: string, intentId: string): Promise<ActivationRecord | null> {
    const trigger = { ruleId, at: null, expectedVersion };
    const id = `rem-${digest(["manual-intent", this.vaultId, caller, intentId])}`;
    const data = await this.run(id, trigger);
    if (!data) return null;
    this.assertClaim(data, trigger);
    return this.view(data);
  }

  async activateTaskReminder(plan: { planId: string; revision: string; taskId: string; title: string; scheduledFor: string }): Promise<void> {
    await this.activatePlanReminder({ ...plan, source: "task-reminder", effect: "notification" });
  }

  async activatePlanReminder(plan: PlanReminder): Promise<void> {
    await this.run(planReminderOccurrenceId(plan), { ruleId: plan.planId, at: plan.scheduledFor, plan });
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

  readPlanOccurrence(id: string): PlanOccurrence | null {
    if (!Id.safeParse(id).success) return null;
    const row = this.load(id)?.data;
    if (!row) return null;
    const canRecover = !this.files.readOnly && this.owns(row);
    const canRetry = canRecover && row.finishedAt && !row.cancelled && (!row.targetTask || this.taskAvailable(row.targetTask));
    const effects: PlanOccurrence["effects"] = [];
    if (row.source === "focus-deadline") {
      effects.push({
        effectId: `focus-${id}`, kind: "focus-settlement", target: { kind: "focus-session", id: row.ruleId }, operationId: null,
        state: row.focusSettled ? "completed" : "not-accepted", receiptId: row.focusSettled ? id : null,
      });
    }
    if (row.notification !== "disabled") {
      const effectId = notificationId(id);
      const state = row.notification === "sent" ? "completed" : row.notification === "pending" ? "not-accepted" : "unknown";
      effects.push({ effectId, kind: "notification", target: { kind: "notification", id: effectId }, operationId: null, state,
        receiptId: state === "completed" ? effectId : null, ...(canRecover && state === "unknown" && { recovery: "verify" as const }) });
    }
    if (row.task !== "disabled") {
      const taskId = reminderTaskId(id);
      const state = row.task === "created" ? "completed" : row.task === "pending" ? "not-accepted" : "failed";
      effects.push({ effectId: taskId, kind: "task-create", target: { kind: "task", id: taskId }, operationId: null, state,
        receiptId: state === "completed" ? taskId : null, ...(canRetry && state === "failed" && this.tasks() && { recovery: "retry" as const }) });
    }
    if (row.comment && row.targetTask) {
      const effectId = commentId(id);
      const state = row.comment === "written" ? "completed" : row.comment === "pending" ? "not-accepted"
        : row.comment === "writing" ? "unknown" : "failed";
      effects.push({ effectId, kind: "task-comment", target: { kind: "task", id: row.targetTask }, operationId: null, state,
        receiptId: state === "completed" ? effectId : null,
        ...(canRecover && state === "unknown" && this.readComment && { recovery: "verify" as const }),
        ...(canRetry && state === "failed" && this.writeComment && { recovery: "retry" as const }) });
    }
    return {
      occurrenceId: id,
      plan: { planId: row.ruleId, revision: row.ruleVersion },
      timing: row.scheduledFor ? { trigger: "scheduled", scheduledFor: row.scheduledFor } : { trigger: "manual" },
      state: effects.some(({ state }) => state === "unknown") ? "unknown" : row.cancelled ? "cancelled"
        : row.finishedAt ? (effects.some(({ state }) => state === "failed") ? "failed" : "completed") : "accepted",
      acceptedAt: row.startedAt,
      frozenInput: { revision: row.ruleVersion, digest: digest([row.text, row.taskBody, row.notificationModule, ...effects.map(({ effectId }) => effectId)]) },
      execution: null,
      effects,
    };
  }

  async recoverEffect(link: PlanOccurrenceLink, effectId: string, signal: AbortSignal): Promise<PlanOccurrence> {
    const { planId, occurrenceId } = link;
    if (!Id.safeParse(occurrenceId).success) throw errors.notFound("可恢复的原发生");
    return this.rules.withRuleConfiguration(async () => {
      signal.throwIfAborted();
      this.lifetime.signal.throwIfAborted();
      this.files.assertWritable();
      let row = this.load(occurrenceId);
      if (!row || row.data.ruleId !== planId || !this.owns(row.data)) throw errors.notFound("可恢复的原发生");
      const occurrence = this.readPlanOccurrence(occurrenceId)!;
      const effect = occurrence.effects.find((entry) => entry.effectId === effectId);
      if (!effect) throw errors.notFound("原发生效果");
      if (effect.state === "completed") return occurrence;
      const { data } = row;
      let updated: ReminderRecord;
      if (effect.recovery === "verify" && effect.kind === "notification") {
        if (!this.notifications.has(effectId)) return occurrence;
        updated = { ...data, notification: "sent" };
      } else if (effect.recovery === "verify" && effect.kind === "task-comment" && data.targetTask) {
        const written = this.readComment?.(data.targetTask, effectId, data.text);
        if (written === undefined) return occurrence;
        const canContinue = !written && this.current(data);
        updated = {
          ...data, comment: written ? "written" : "pending",
          finishedAt: canContinue ? null : data.finishedAt ?? this.now().toISOString(),
          ...(!written && !canContinue && { cancelled: true }),
        };
      } else if (effect.recovery === "retry") {
        if (effect.kind === "task-create") updated = { ...data, task: await this.createTask(data) };
        else if (effect.kind === "task-comment" && data.targetTask) {
          row = await this.save({ ...data, comment: "writing" }, row.version);
          signal.throwIfAborted();
          this.lifetime.signal.throwIfAborted();
          updated = { ...row.data, comment: await this.commentTask(row.data, data.targetTask) };
        } else throw errors.invalidInput("原效果不可重试");
      } else throw errors.invalidInput("原效果当前不可重试");
      const saved = await this.save(updated, row.version);
      this.onChanged(this.view(saved.data));
      return this.readPlanOccurrence(occurrenceId)!;
    });
  }

  private owns(row: ReminderRecord): boolean {
    return this.owner !== null && row.owner === this.owner && row.vaultId === this.vaultId;
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
      if (data.id !== id || (data.scheduledFor && scheduledId(data.ruleId, data.scheduledFor, data.source ? data.ruleVersion : undefined) !== id)) throw new Error("Reminder identity mismatch");
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

  private run(id: string, trigger?: ReminderTrigger): Promise<ReminderRecord | null> {
    const existing = this.active.get(id);
    if (existing) return existing;
    const pending = this.advance(id, trigger).finally(() => this.active.delete(id));
    this.active.set(id, pending);
    return pending;
  }

  private assertClaim(data: ReminderRecord, { ruleId, expectedVersion }: ReminderTrigger): void {
    if (!this.owner || data.owner !== this.owner || data.vaultId !== this.vaultId) throw errors.notFound("此主机的提醒执行意图");
    if (data.ruleId !== ruleId || data.ruleVersion !== expectedVersion || data.scheduledFor !== null) throw errors.idempotencyMismatch();
  }

  private sourceCurrent(source: PlanReminder["source"], id: string, revision: string, scheduledFor: string, taskId: string | undefined): boolean {
    if (source === "focus-deadline") return this.focus?.current(id, revision, scheduledFor) === true;
    if (source === "observation") return this.observationCurrent(id, revision, scheduledFor);
    return Boolean(taskId && this.taskAvailable(taskId) && this.reminderPlanCurrent(id, revision, scheduledFor));
  }

  private current(data: ReminderRecord): boolean {
    if (data.scheduledFor && !this.allowsSchedule(data.scheduledFor)) return false;
    if (data.source && data.scheduledFor) return this.sourceCurrent(data.source, data.ruleId, data.ruleVersion, data.scheduledFor, data.targetTask);
    if (data.targetTask && !this.taskAvailable(data.targetTask)) return false;
    if (!data.scheduledFor) return true;
    try {
      const rule = this.rules.rule(data.ruleId);
      return rule.version === data.ruleVersion && rule.data.enabled && rule.data.action.kind === "reminder";
    } catch (error) {
      if (isHuhuError(error) && error.code === "NOT_FOUND") return false;
      throw error;
    }
  }

  private async createTask(data: ReminderRecord): Promise<"created" | "unavailable"> {
    const tasks = this.tasks();
    if (!tasks) throw errors.pluginDisabled("tasks");
    try {
      await tasks.createFromRule({ taskId: reminderTaskId(data.id), ruleId: data.ruleId, occurrenceId: data.id, title: data.text.slice(0, 200), body: data.taskBody, execution: null });
      return "created";
    } catch (error) {
      if (!isHuhuError(error) || !["NOT_FOUND", "VERSION_CONFLICT"].includes(error.code)) throw error;
      return "unavailable";
    }
  }

  private async commentTask(data: ReminderRecord, taskId: string): Promise<"written" | "unavailable"> {
    if (!this.writeComment) throw errors.pluginDisabled("tasks");
    try {
      await this.writeComment(taskId, commentId(data.id), data.text);
      return "written";
    } catch (error) {
      if (!isHuhuError(error) || !["NOT_FOUND", "READ_ONLY_VAULT"].includes(error.code)) throw error;
      return "unavailable";
    }
  }

  private async advanceEffects(row: Stored): Promise<ReminderRecord> {
    const { id } = row.data;
    const stableNotification = notificationId(id);
    if (row.data.notification === "pending" && this.current(row.data)) {
      const source = row.data;
      if (source.source === "focus-deadline" && source.scheduledFor && !this.focus?.settle(source.ruleId, source.ruleVersion, source.scheduledFor, id)) return source;
      row = await this.save({ ...row.data, notification: "sending", ...(source.source === "focus-deadline" && { focusSettled: true }) }, row.version);
      this.lifetime.signal.throwIfAborted();
      if (this.current(row.data)) {
        try {
          // oxlint-disable-next-line huhu-scheduling/no-direct-notification-fallback -- 计划递送端口在持久化副作用检查点后发送。
          this.notifications.send({ id: stableNotification, title: row.data.text, module: row.data.notificationModule,
            occurrence: { planId: row.data.ruleId, occurrenceId: id },
            ...(row.data.source === "task-reminder" && { body: `提醒时间 ${row.data.scheduledFor}` }),
          });
        } catch {
          // Check the same identity even if its acknowledgement was lost.
        }
      } else {
        row = await this.save({ ...row.data, notification: "pending", cancelled: true }, row.version);
      }
    }
    if (row.data.notification === "sending") {
      row = await this.save({ ...row.data, notification: this.notifications.has(stableNotification) ? "sent" : "unknown" }, row.version);
    }
    if (row.data.task === "pending" && this.current(row.data)) {
      if (!this.tasks()) return row.data;
      this.lifetime.signal.throwIfAborted();
      row = await this.save({ ...row.data, task: await this.createTask(row.data) }, row.version);
    }
    if (row.data.comment === "pending" && row.data.targetTask && this.current(row.data)) {
      if (!this.writeComment) return row.data;
      const taskId = row.data.targetTask;
      row = await this.save({ ...row.data, comment: "writing" }, row.version);
      this.lifetime.signal.throwIfAborted();
      if (this.current(row.data)) {
        row = await this.save({ ...row.data, comment: await this.commentTask(row.data, taskId) }, row.version);
      } else {
        row = await this.save({ ...row.data, comment: "pending", cancelled: true }, row.version);
      }
    } else if (row.data.comment === "pending" && row.data.targetTask && this.readComment?.(row.data.targetTask, commentId(id), row.data.text)) {
      // Older interrupted attempts recorded only "pending", even after a successful comment write.
      row = await this.save({ ...row.data, comment: "written" }, row.version);
    }
    const cancelled = row.data.cancelled || ((row.data.notification === "pending" || row.data.task === "pending" || row.data.comment === "pending") && !this.current(row.data));
    const completed = (await this.save({ ...row.data, ...(cancelled && { cancelled }), finishedAt: this.now().toISOString() }, row.version)).data;
    this.onChanged(this.view(completed));
    return completed;
  }

  private async advance(id: string, trigger?: ReminderTrigger): Promise<ReminderRecord | null> {
    this.lifetime.signal.throwIfAborted();
    let row = this.load(id);
    if (row && trigger?.expectedVersion !== undefined) this.assertClaim(row.data, trigger);
    if (!row && trigger) {
      row = await this.rules.withRuleConfiguration(async () => {
        this.lifetime.signal.throwIfAborted();
        if (trigger.at && !this.allowsSchedule(trigger.at)) return null;
        if (trigger.plan && trigger.at) {
          const { revision, title, taskId, source, effect } = trigger.plan;
          const current = this.sourceCurrent(source, trigger.ruleId, revision, trigger.at, taskId);
          if (!this.owner || !current) return null;
          return this.save({
            format: 1, id, vaultId: this.vaultId, owner: this.owner, ruleId: trigger.ruleId, ruleVersion: revision,
            scheduledFor: trigger.at, startedAt: this.now().toISOString(), finishedAt: null, text: title,
            taskBody: taskId ? `${title}\n\n相关任务：[[${this.taskPath(taskId) ?? taskId}]]` : title,
            notificationModule: source === "task-reminder" ? "tasks" : source === "focus-deadline" ? "home" : "automations",
            notification: effect === "notification" || effect === "both" ? "pending" : "disabled",
            task: effect === "task" || effect === "both" ? "pending" : "disabled",
            ...(effect === "comment" && { comment: "pending" }), source, ...(taskId && { targetTask: taskId }),
          }, null);
        }
        const rule = this.rules.rule(trigger.ruleId);
        const action = rule.data.action;
        if (trigger.expectedVersion !== undefined) {
          if (action.kind !== "reminder") throw errors.permissionDenied("外部立即运行只支持提醒规则");
          if (rule.version !== trigger.expectedVersion) throw errors.versionConflict(rule.version);
        } else if (action.kind !== "reminder") {
          throw errors.invalidInput("当前规则不再是提醒规则");
        }
        if (trigger.at && (!rule.data.enabled || Date.parse(trigger.at) <= Date.parse(rule.data.updatedAt))) return null;
        if (action.taskId && !this.taskAvailable(action.taskId)) return null;
        if (trigger.at && Date.parse(trigger.at) > this.now().getTime()) throw errors.invalidInput("提醒时间尚未到达");
        if (!this.owner) throw errors.invalidInput("无法确认本机的提醒归属");
        const reference = action.taskId ? `\n\n相关任务：[[${this.taskPath(action.taskId) ?? action.taskId}]]` : "";
        return this.save({
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
          ...(action.taskId && { targetTask: action.taskId }),
        }, null);
      });
      if (!row) return null;
      this.onChanged(this.view(row.data));
    }
    if (!row || row.data.finishedAt || !this.owns(row.data)) return row?.data ?? null;
    this.files.assertWritable();
    return this.rules.withRuleConfiguration(() => this.advanceEffects(row!));
  }

  private view(data: ReminderRecord): ActivationRecord {
    const { id, ruleId, startedAt, finishedAt, scheduledFor, task, notification } = data;
    const state = data.comment === "writing" ? "unknown" : !finishedAt ? "pending" : notification === "unknown" ? "unknown"
      : data.cancelled ? "cancelled" : task === "unavailable" || data.comment === "unavailable" ? "failed" : "succeeded";
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
