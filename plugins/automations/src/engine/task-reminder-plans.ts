import { createHash, randomUUID } from "node:crypto";
import { errors, isHuhuError, PlanRefSchema, type PlanSummary, type PlanWrite } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { taskReminderOccurrenceId, type ReminderDeliveries } from "./reminder-deliveries.js";
import type { AutomationsService, TaskQueryLike } from "./service.js";

const file = "automations/task-reminder-plans.json";
const storedPlan = PlanRefSchema.extend({
  taskId: z.string().min(1),
  title: z.string(),
  scheduledFor: z.iso.datetime(),
  intent: z.enum(["enabled", "paused", "deleted"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const Store = z.array(storedPlan);
type TaskReminderPlan = z.infer<typeof storedPlan>;

export const TaskReminderPlanInput = z.strictObject({ taskId: z.string().min(1), scheduledFor: z.iso.datetime(), intentId: z.uuidv4() });

export class TaskReminderPlans {
  private tickInFlight: Promise<void> | undefined;
  private readLegacy = false;
  private closed = false;

  constructor(
    private readonly files: VaultFiles,
    private readonly vaultId: string,
    private readonly rules: Pick<AutomationsService, "withRuleConfiguration">,
    private readonly tasks: () => TaskQueryLike | undefined,
    private readonly deliveries: () => ReminderDeliveries | undefined,
    private readonly now: () => Date,
    private readonly changed: (taskId: string) => void,
  ) {}

  private load() {
    const row = this.files.read(file);
    return { plans: row ? Store.parse(JSON.parse(row.bytes.toString("utf8"))) : [], version: row?.version ?? null };
  }

  private async save(plans: TaskReminderPlan[], version: string | null, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.files.write(file, Buffer.from(JSON.stringify(plans) + "\n"), { expectedVersion: version, ...(signal && { beforeCommit: () => signal.throwIfAborted() }) });
  }

  task(taskId: string) {
    try {
      return this.tasks()?.snapshot(taskId);
    } catch (error) {
      if (isHuhuError(error) && error.code === "NOT_FOUND") return undefined;
      throw error;
    }
  }

  taskAvailable(taskId: string): boolean {
    const task = this.task(taskId);
    return Boolean(task && !task.readOnly && task.status !== "completed");
  }

  current(planId: string, revision: string, at: string): boolean {
    const plan = this.load().plans.find((entry) => entry.planId === planId);
    return Boolean(plan && plan.intent === "enabled" && plan.revision === revision && plan.scheduledFor === at && this.taskAvailable(plan.taskId));
  }

  private summary(plan: TaskReminderPlan): PlanSummary {
    const task = this.task(plan.taskId);
    const readOnly = this.files.readOnly || task?.readOnly;
    const availability: PlanSummary["availability"] = readOnly ? { state: "blocked", reason: "read-only" }
      : !task || task.status === "completed" ? { state: "blocked", reason: "target-unavailable" }
      : !this.deliveries() ? { state: "blocked", reason: "plugin-disabled" } : { state: "ready" };
    const occurrence = this.deliveries()?.readPlanOccurrence(taskReminderOccurrenceId(plan));
    const actions: PlanSummary["actions"] = readOnly || plan.intent === "deleted" ? [] : ["reschedule", "delete"];
    if (actions.length > 0 && !occurrence?.effects.some(({ state }) => state === "completed" || state === "unknown")) {
      if (plan.intent === "enabled") actions.push("pause");
      else if (availability.state === "ready") actions.push("resume");
    }
    const object = { kind: "task", id: plan.taskId };
    return {
      planId: plan.planId, revision: plan.revision, title: task ? `任务提醒：${task.title}` : plan.title,
      createdAt: plan.createdAt, updatedAt: plan.updatedAt, intent: plan.intent, availability, actions,
      source: { plugin: "tasks", object }, owner: { scope: "vault", vaultId: this.vaultId },
      trigger: { kind: "once", scheduledFor: plan.scheduledFor },
      action: { capability: "notifications.create", object, summary: "递送任务提醒" },
      nextAt: plan.intent === "enabled" && availability.state === "ready" && !occurrence ? plan.scheduledFor : null,
      lastOccurrence: occurrence ? { occurrenceId: occurrence.occurrenceId, at: occurrence.acceptedAt ?? plan.scheduledFor, state: occurrence.state } : null,
    };
  }

  list(): PlanSummary[] {
    return this.load().plans.filter((plan) => plan.intent !== "deleted").map((plan) => this.summary(plan));
  }

  read(planId: string): PlanSummary | null {
    const plan = this.load().plans.find((entry) => entry.planId === planId);
    return plan ? this.summary(plan) : null;
  }

  async create({ taskId, scheduledFor, intentId }: z.infer<typeof TaskReminderPlanInput>, signal: AbortSignal): Promise<PlanSummary> {
    const result = await this.rules.withRuleConfiguration(async () => {
      const { plans, version } = this.load();
      const planId = `task-reminder-${intentId}`;
      const existing = plans.find((entry) => entry.planId === planId);
      if (existing) {
        if (existing.taskId !== taskId) throw errors.idempotencyMismatch();
        return this.summary(existing);
      }
      const task = this.task(taskId);
      if (!task || task.readOnly || task.status === "completed" || !this.deliveries()) throw errors.invalidInput("当前任务无法设置提醒");
      const stamp = this.now().toISOString();
      const plan: TaskReminderPlan = {
        planId, revision: randomUUID(), taskId, title: `任务提醒：${task.title}`, scheduledFor: new Date(scheduledFor).toISOString(),
        intent: "enabled", createdAt: stamp, updatedAt: stamp,
      };
      await this.save([...plans, plan], version, signal);
      this.changed(taskId);
      return this.summary(plan);
    });
    void this.tick().catch(() => undefined);
    return result;
  }

  async change(write: PlanWrite, signal: AbortSignal): Promise<PlanSummary> {
    const result = await this.rules.withRuleConfiguration(async () => {
      const { plans, version } = this.load();
      const plan = plans.find((entry) => entry.planId === write.planId);
      if (!plan || plan.intent === "deleted") throw errors.notFound("任务提醒计划");
      if (write.expectedRevision !== plan.revision) throw errors.versionConflict(plan.revision);
      const replacement = { ...plan, revision: randomUUID(), updatedAt: this.now().toISOString() };
      if (write.change === "reschedule" && write.trigger.kind === "once") replacement.scheduledFor = new Date(write.trigger.scheduledFor).toISOString();
      else if (write.change === "set-intent") {
        const occurrence = this.deliveries()?.readPlanOccurrence(taskReminderOccurrenceId(plan));
        if (occurrence?.effects.some(({ state }) => state === "completed" || state === "unknown")) throw errors.invalidInput("已递送或待核实的提醒须先改期");
        if (write.intent === "enabled" && !this.taskAvailable(plan.taskId)) throw errors.invalidInput("当前任务无法设置提醒");
        replacement.intent = write.intent;
      } else if (write.change === "delete") replacement.intent = "deleted";
      else throw errors.invalidInput("任务提醒需要一次性触发时间");
      await this.save(plans.map((entry) => entry === plan ? replacement : entry), version, signal);
      this.changed(plan.taskId);
      return this.summary(replacement);
    });
    void this.tick().catch(() => undefined);
    return result;
  }

  tick(): Promise<void> {
    if (this.closed || this.files.readOnly) return Promise.resolve();
    this.tickInFlight ??= this.scan().finally(() => { this.tickInFlight = undefined; });
    return this.tickInFlight;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.tickInFlight?.catch(() => undefined);
  }

  private async scan(): Promise<void> {
    const tasks = this.tasks();
    const deliveries = this.deliveries();
    if (!tasks || !deliveries) return;
    const stamp = this.now().toISOString();
    const due = await this.rules.withRuleConfiguration(async () => {
      const { plans, version } = this.load();
      const existing = new Set(plans.map(({ planId }) => planId));
      const imported = (this.readLegacy ? [] : tasks.listAll()).flatMap((task) => task.reminders.flatMap((reminder) => {
        const planId = "task-reminder-legacy-" + createHash("sha256").update(JSON.stringify([task.id, reminder.id])).digest("hex");
        if (existing.has(planId) || reminder.deliveredAt || task.readOnly || !Number.isFinite(Date.parse(reminder.at))) return [];
        existing.add(planId);
        return [{
          planId, revision: randomUUID(), taskId: task.id, title: `任务提醒：${task.title}`, scheduledFor: new Date(reminder.at).toISOString(),
          intent: reminder.enabled ? "enabled" as const : "paused" as const, createdAt: stamp, updatedAt: stamp,
        }];
      }));
      const next = [...plans, ...imported];
      if (imported.length) {
        await this.save(next, version);
        for (const taskId of new Set(imported.map((plan) => plan.taskId))) this.changed(taskId);
      }
      this.readLegacy = true;
      return next.filter((plan) => plan.intent === "enabled" && plan.scheduledFor <= stamp);
    });
    for (const plan of due) {
      if (this.closed) break;
      if (!this.current(plan.planId, plan.revision, plan.scheduledFor)) continue;
      if (deliveries.readPlanOccurrence(taskReminderOccurrenceId(plan))) continue;
      await deliveries.activateTaskReminder(plan);
    }
  }
}
