import type { PlanSummary, PlanWrite } from "@huhu/contracts";
import type { FocusDeadline, FocusDeadlinePort } from "@huhu/kernel";
import { planReminderOccurrenceId, type ReminderDeliveries } from "./reminder-deliveries.js";
import type { AutomationsService } from "./service.js";

export class FocusDeadlinePlans {
  private ticking: Promise<void> | undefined;
  private closed = false;

  constructor(
    private readonly home: FocusDeadlinePort,
    private readonly rules: Pick<AutomationsService, "withRuleConfiguration">,
    private readonly deliveries: () => ReminderDeliveries | undefined,
    private readonly vaultId: string,
    private readonly readOnly: boolean,
    private readonly now: () => Date,
    private readonly allowsSchedule: (slot: string) => boolean = () => true,
  ) {}

  private summary(plan: FocusDeadline): PlanSummary {
    const { planId, revision, createdAt, updatedAt, scheduledFor, state } = plan;
    const object = { kind: "focus-session", id: planId };
    const availability: PlanSummary["availability"] = this.readOnly ? { state: "blocked", reason: "read-only" } : !this.deliveries() ? { state: "blocked", reason: "plugin-disabled" } : { state: "ready" };
    const actions: PlanSummary["actions"] = [];
    if (availability.state === "ready" && state !== "deleted") {
      actions.push("delete");
      if (state === "enabled" || state === "paused") actions.push("reschedule", state === "enabled" ? "pause" : "resume");
      if (state === "skipped") actions.push("reschedule");
    }
    const occurrence = this.deliveries()?.readPlanOccurrence(planReminderOccurrenceId(plan));
    return {
      planId,
      revision,
      title: "专注计时",
      createdAt,
      updatedAt,
      source: { plugin: "kernel", object },
      owner: { scope: "vault", vaultId: this.vaultId },
      action: { capability: "home.focus.update", object, summary: "结算专注时段并递送完成通知" },
      intent: state === "completed" ? "paused" : state === "skipped" ? "enabled" : state,
      availability,
      trigger: { kind: "once", scheduledFor },
      nextAt: state === "enabled" && availability.state === "ready" && this.allowsSchedule(scheduledFor) ? scheduledFor : null,
      lastOccurrence: occurrence ? { occurrenceId: occurrence.occurrenceId, at: occurrence.acceptedAt ?? scheduledFor, state: occurrence.state } : null,
      actions,
    };
  }

  list(): PlanSummary[] {
    const plan = this.home.current();
    return plan && plan.state !== "deleted" ? [this.summary(plan)] : [];
  }

  read(planId: string): PlanSummary | null {
    const current = this.home.current();
    if (current?.planId === planId) return this.summary(current);
    const previous = this.home.settled()?.plan;
    return previous?.planId === planId ? { ...this.summary(previous), actions: [] } : null;
  }

  async change(write: PlanWrite, signal: AbortSignal): Promise<PlanSummary> {
    return this.rules.withRuleConfiguration(() => {
      signal.throwIfAborted();
      return this.summary(this.home.change(write));
    });
  }

  current(planId: string, revision: string, scheduledFor: string): boolean {
    const current = this.home.current();
    return [current?.state === "enabled" ? current : undefined, this.home.settled()?.plan].some((plan) => plan?.planId === planId && plan.revision === revision && plan.scheduledFor === scheduledFor);
  }

  settle(planId: string, revision: string, scheduledFor: string, occurrenceId: string): boolean {
    return this.home.settle({ planId, revision, scheduledFor }, occurrenceId);
  }

  tick(): void {
    if (this.ticking || this.closed || this.readOnly) return;
    const plan = this.home.current();
    if (plan?.state !== "enabled" || Date.parse(plan.scheduledFor) > this.now().getTime()) return;
    if (!this.allowsSchedule(plan.scheduledFor)) {
      // The caller runs the deadline sweep only while automatic schedules are enabled.
      this.home.skip(plan);
      return;
    }
    this.ticking = this.deliveries()
      ?.activatePlanReminder({ ...plan, source: "focus-deadline", title: "专注完成", effect: "notification" })
      .catch(() => undefined)
      .finally(() => {
        this.ticking = undefined;
      });
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.ticking;
  }
}
