import { randomUUID } from "node:crypto";
import { errors, type PlanSummary, type PlanWrite } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { planReminderOccurrenceId, type ReminderDeliveries } from "./reminder-deliveries.js";
import type { AutomationsService } from "./service.js";

const file = "automations/observation-plans.json";
const Target = z.strictObject({ kind: z.enum(["task", "agent-session"]), id: z.string().min(1).max(256) });
const Status = z.enum(["not_started", "running", "waiting_input", "completed", "failed", "unknown"]);
const Cadence = z.int().positive().max(86_400);
const Condition = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("change") }),
  z.strictObject({ kind: z.literal("threshold"), status: Status.exclude(["unknown"]), seconds: Cadence }),
]);
export const ObservationInput = z.strictObject({
  title: z.string().trim().min(1).max(200), target: Target, everySeconds: Cadence, condition: Condition,
  repeat: z.boolean().default(false), stopAtTerminal: z.boolean().default(true),
  effect: z.enum(["notification", "task", "both", "comment"]).default("notification"), intentId: z.uuidv4(),
});
const Store = z.array(ObservationInput.omit({ intentId: true }).extend({
  planId: z.string(), revision: z.string(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), nextAt: z.iso.datetime(),
  intent: z.enum(["enabled", "paused", "deleted"]), stopped: z.boolean(), machineId: z.string().nullable(),
  status: Status.nullable(), since: z.iso.datetime().nullable(), alerted: z.boolean(), lastOccurrenceId: z.string().nullable(),
}));
type Observation = z.infer<typeof Store>[number];
export type ObservationStatus = z.infer<typeof Status>;
type ReadStatus = (target: Observation["target"], signal: AbortSignal) => Promise<ObservationStatus>;

export class ObservationPlans {
  private sweeping: Promise<void> | undefined;
  private stopped = false;
  private readonly lifetime = new AbortController();

  constructor(
    private readonly files: VaultFiles,
    private readonly owner: { vaultId: string; machineId: string },
    private readonly rules: Pick<AutomationsService, "withRuleConfiguration">,
    private readonly deliveries: () => ReminderDeliveries | undefined,
    private readonly observe: ReadStatus,
    private readonly now: () => Date,
    private readonly changed: (id: string) => void,
  ) {}

  private load() {
    const fileEntry = this.files.read(file);
    return { plans: fileEntry ? Store.parse(JSON.parse(fileEntry.bytes.toString("utf8"))) : [], version: fileEntry?.version ?? null };
  }

  private async save(plans: Observation[], version: string | null, signal?: AbortSignal): Promise<void> {
    await this.files.write(file, Buffer.from(JSON.stringify(plans) + "\n"), { expectedVersion: version, ...(signal && { beforeCommit: () => signal.throwIfAborted() }) });
  }

  private instant(after = 0): string {
    return new Date(this.now().getTime() + after * 1_000).toISOString();
  }

  private eligible(plan: Observation): boolean {
    return !this.stopped && !plan.stopped && plan.intent === "enabled" && (!plan.machineId || plan.machineId === this.owner.machineId);
  }

  current(planId: string, revision: string, scheduledFor: string): boolean {
    const plan = this.load().plans.find((entry) => entry.planId === planId);
    return Boolean(plan && this.eligible(plan) && plan.revision === revision && plan.nextAt === scheduledFor);
  }

  private summary(plan: Observation): PlanSummary {
    const { planId, revision, machineId, target, title, createdAt, updatedAt, intent } = plan;
    const availability: PlanSummary["availability"] = this.files.readOnly ? { state: "blocked", reason: "read-only" }
      : machineId && machineId !== this.owner.machineId ? { state: "blocked", reason: "foreign-owner" }
      : !this.deliveries() ? { state: "blocked", reason: "plugin-disabled" } : { state: "ready" };
    const actions: PlanSummary["actions"] = this.files.readOnly || intent === "deleted" || availability.state === "blocked" ? [] : ["delete", "reschedule"];
    if (actions.length) actions.push(intent === "enabled" && !plan.stopped ? "pause" : "resume");
    const recent = plan.lastOccurrenceId ? this.deliveries()?.readPlanOccurrence(plan.lastOccurrenceId) : null;
    return {
      planId, revision, title, createdAt, updatedAt, intent: plan.stopped && intent === "enabled" ? "paused" : intent, availability, actions,
      owner: machineId ? { scope: "device", vaultId: this.owner.vaultId, machineId } : { scope: "vault", vaultId: this.owner.vaultId },
      source: { plugin: target.kind === "task" ? "tasks" : "agent-cli", object: target },
      action: { capability: "automations.plans.createObservation", object: target, summary: effectLabel[plan.effect] },
      trigger: { kind: "observe", query: target.kind === "task" ? "task.status" : "agent.sessionState", object: target, everySeconds: plan.everySeconds },
      nextAt: availability.state === "ready" && this.eligible(plan) ? plan.nextAt : null,
      lastOccurrence: recent ? { occurrenceId: recent.occurrenceId, at: recent.acceptedAt ?? plan.updatedAt, state: recent.state } : null,
    };
  }

  list(): PlanSummary[] {
    return this.load().plans.filter((plan) => plan.intent !== "deleted").map((plan) => this.summary(plan));
  }

  read(planId: string): PlanSummary | null {
    const plan = this.load().plans.find((entry) => entry.planId === planId);
    return plan ? this.summary(plan) : null;
  }

  async create({ intentId, ...input }: z.output<typeof ObservationInput>, signal: AbortSignal): Promise<PlanSummary> {
    return this.rules.withRuleConfiguration(async () => {
      const { plans, version } = this.load();
      const planId = `observation-${intentId}`;
      const existing = plans.find((plan) => plan.planId === planId);
      if (existing) return this.summary(existing);
      if (!this.deliveries()) throw errors.invalidInput("当前无法递送观察结果");
      if (input.effect === "comment" && input.target.kind !== "task") throw errors.invalidInput("只有任务观察能向原任务追加评论");
      const stamp = this.instant();
      const plan: Observation = {
        ...input, planId, revision: randomUUID(), createdAt: stamp, updatedAt: stamp, nextAt: stamp,
        intent: "enabled", stopped: false, machineId: input.target.kind === "agent-session" ? this.owner.machineId : null,
        status: null, since: null, alerted: false, lastOccurrenceId: null,
      };
      await this.save([...plans, plan], version, signal);
      this.changed(planId);
      return this.summary(plan);
    });
  }

  async change(write: PlanWrite, signal: AbortSignal): Promise<PlanSummary> {
    return this.rules.withRuleConfiguration(async () => {
      const { plans, version } = this.load();
      const plan = plans.find((entry) => entry.planId === write.planId && entry.intent !== "deleted");
      if (!plan) throw errors.notFound("观察计划");
      if (plan.machineId && plan.machineId !== this.owner.machineId) throw errors.permissionDenied("只能在来源设备修改会话观察");
      if (plan.revision !== write.expectedRevision) throw errors.versionConflict(plan.revision);
      const next = { ...plan, revision: randomUUID(), updatedAt: this.instant() };
      if (write.change === "delete") next.intent = "deleted";
      else if (write.change === "set-intent") {
        next.intent = write.intent;
        if (write.intent === "enabled") {
          next.stopped = false;
          next.nextAt = this.instant();
          next.since = null;
          next.alerted = false;
        }
      } else if (write.change === "reschedule" && write.trigger.kind === "observe") {
        const seconds = Cadence.safeParse(write.trigger.everySeconds);
        if (!seconds.success || write.trigger.object.id !== plan.target.id || write.trigger.object.kind !== plan.target.kind) throw errors.invalidInput("观察间隔或来源无效");
        next.everySeconds = seconds.data;
        next.nextAt = this.instant(seconds.data);
      } else throw errors.invalidInput("观察计划需要间隔与原观察对象");
      await this.save(plans.map((entry) => entry === plan ? next : entry), version, signal);
      this.changed(plan.planId);
      return this.summary(next);
    });
  }

  tick(): Promise<void> {
    if (this.stopped || this.files.readOnly) return Promise.resolve();
    this.sweeping ??= this.sweep().catch(() => undefined).finally(() => { this.sweeping = undefined; });
    return this.sweeping;
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.lifetime.abort();
    await this.sweeping;
  }

  private async sweep(): Promise<void> {
    const deliveries = this.deliveries();
    if (!deliveries) return;
    const stamp = this.instant();
    const facts = new Map<string, Promise<ObservationStatus>>();
    for (const plan of this.load().plans) {
      if (!this.eligible(plan) || plan.nextAt > stamp) continue;
      try {
        const key = JSON.stringify(plan.target);
        const fact = facts.get(key) ?? this.observe(plan.target, this.lifetime.signal);
        facts.set(key, fact);
        await this.check(plan, deliveries, await fact);
      } catch {
        // A problem with one target leaves that observation available for the next tick.
      }
    }
  }

  private async check(plan: Observation, deliveries: ReminderDeliveries, status: ObservationStatus): Promise<void> {
    const slot = { planId: plan.planId, revision: plan.revision, scheduledFor: plan.nextAt };
    const id = planReminderOccurrenceId(slot);
    let occurrence = deliveries.readPlanOccurrence(id);
    const now = this.instant();
    const changed = plan.status !== status;
    const since = changed || !plan.since ? now : plan.since;
    const notify = status !== "unknown" && (plan.condition.kind === "change"
      ? (changed && plan.status !== null && plan.status !== "unknown") || (plan.repeat && plan.alerted)
      : status === plan.condition.status && Date.parse(now) - Date.parse(since) >= plan.condition.seconds * 1_000 && (plan.repeat || changed || !plan.alerted));
    if (occurrence || notify) {
      await deliveries.activatePlanReminder({
        ...slot, source: "observation", title: `${plan.title}：${statusLabel[status]}`,
        ...(plan.target.kind === "task" && { taskId: plan.target.id }), effect: plan.effect,
      });
      occurrence = deliveries.readPlanOccurrence(id);
      if (!occurrence || occurrence.state === "accepted") return;
    }
    await this.rules.withRuleConfiguration(async () => {
      if (!this.current(slot.planId, slot.revision, slot.scheduledFor)) return;
      const { plans, version } = this.load();
      const stopped = plan.stopAtTerminal && (status === "completed" || status === "failed");
      const next: Observation = {
        ...plan, status: status === "unknown" ? plan.status : status, since: status === "unknown" ? null : since, stopped,
        alerted: status === "unknown" ? plan.alerted : notify || (!changed && plan.alerted),
        nextAt: this.instant(plan.everySeconds), lastOccurrenceId: occurrence?.occurrenceId ?? plan.lastOccurrenceId,
      };
      await this.save(plans.map((entry) => entry.planId === plan.planId ? next : entry), version);
      this.changed(plan.planId);
    });
  }
}

const statusLabel: Record<ObservationStatus, string> = {
  not_started: "未开始", running: "运行中", waiting_input: "等待输入", completed: "已完成", failed: "失败", unknown: "待核实",
};
const effectLabel: Record<Observation["effect"], string> = {
  notification: "观察状态并提醒", task: "观察状态并创建任务", both: "观察状态、提醒并创建任务", comment: "观察状态并追加任务评论",
};
