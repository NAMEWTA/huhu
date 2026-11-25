import { errors, isHuhuError, ledgerBusinessDate, ledgerBusinessDayRange, type CalendarPlanTrigger, type PeriodicEnabledWindow, type PeriodicPlanControl, type PeriodicPlanSource, type PeriodicPlanSpec, type PeriodicRunContext, type PlanSummary } from "@huhu/contracts";
import { canonicalJson, type CapabilityContext } from "@huhu/kernel";
import type { z } from "zod";
import { recurringLabels, recurringPlanId, type OpenRecurring, type RecurringList, type RecurringPeriod, type RecurringPreview, type RecurringRule, type RetryRecurring } from "../shared/recurring.js";
import { anchoredMonthDate } from "../shared/monthly-date.js";
import { requireActiveBook, validateLedgerAccount } from "./accounts.js";
import { saveRecord } from "./records.js";
import type { BookState, LedgerStore } from "./store.js";

type Authorization = Pick<CapabilityContext, "signal" | "assertCapabilityCurrent">;
type Slot = { periodId: string; date: string; scheduledAt: string };
const dayMs = 86_400_000;
const limit = 128;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function fromDate(rule: RecurringRule, minimum: string): string {
  const start = new Date(rule.startOn + "T00:00:00Z");
  const lower = new Date(Math.max(start.getTime(), Date.parse(minimum)));
  if (rule.frequency === "monthly") {
    const months = (lower.getUTCFullYear() - start.getUTCFullYear()) * 12 + lower.getUTCMonth() - start.getUTCMonth();
    const current = anchoredMonthDate(rule.startOn, months);
    return current < minimum ? anchoredMonthDate(rule.startOn, months + 1) : current;
  }
  const step = dayMs * (rule.frequency === "weekly" ? 7 : 1);
  return isoDate(new Date(start.getTime() + Math.ceil((lower.getTime() - start.getTime()) / step) * step));
}

function* pendingDates(rule: RecurringRule, state: BookState, windows: readonly PeriodicEnabledWindow[]) {
  const zone = state.book.timeZone;
  const completed = new Set(state.recurringPeriods.filter(({ ruleId }) => ruleId === rule.id).map(({ periodId }) => periodId));
  for (const { from, until } of windows) {
    let minimum = ledgerBusinessDate(from, zone);
    const lastDay = until ? ledgerBusinessDate(until, zone) : null;
    for (;;) {
      const date = fromDate(rule, minimum);
      if (lastDay && date > lastDay) break;
      const scheduledAt = ledgerBusinessDayRange(date, zone).from;
      if (until && Date.parse(scheduledAt) >= Date.parse(until)) break;
      const periodId = `${rule.id}:${date}`;
      if (Date.parse(scheduledAt) >= Date.parse(from) && ledgerBusinessDate(scheduledAt, zone) === date && !completed.has(periodId)) {
        yield { date, scheduledAt, periodId };
      }
      minimum = isoDate(new Date(Date.parse(date) + dayMs));
    }
  }
}

function* plannedDates(rule: RecurringRule, state: BookState, windows: readonly PeriodicEnabledWindow[], plan?: PeriodicPlanSpec | null) {
  if (!plan?.calendar) {
    yield* pendingDates(rule, state, windows);
    return;
  }
  let start: string | null = null;
  for (const { trigger, until } of [...(plan.calendarHistory ?? []), { trigger: plan.calendar, until: null }]) {
    const eligible = windows.flatMap(({ from, until: end }) => {
      const lower = start && start > from ? start : from;
      const upper = until && (!end || until < end) ? until : end;
      return !upper || lower < upper ? [{ from: lower, until: upper }] : [];
    });
    yield* pendingDates({ ...rule, frequency: trigger.frequency, startOn: trigger.startOn }, state, eligible);
    start = until;
  }
}

function calendar(rule: RecurringRule): CalendarPlanTrigger {
  return { kind: "calendar", frequency: rule.frequency, startOn: rule.startOn };
}

function scheduleLabel(trigger: CalendarPlanTrigger, zone: string) {
  return { label: `${recurringLabels[trigger.frequency]} · ${trigger.startOn} 起 · ${zone}`, zone };
}

function applyPeriod(state: BookState, rule: RecurringRule, slot: Slot, occurrenceId: string, previous?: RecurringPeriod) {
  const { type, currency, accountId, amountMinor, memo, title } = rule;
  const base = { ...slot, occurrenceId, ruleId: rule.id, attempts: (previous?.attempts ?? 0) + 1 };
  let period: RecurringPeriod;
  try {
    const row = saveRecord(state, { type, currency, accountId, amountMinor, memo, occurredAt: slot.scheduledAt, payee: null, categoryId: null, tagIds: [], attachmentIds: [] }, title);
    period = { ...base, state: "generated", recordId: row.id, error: null };
    state.recordReferences.push({ kind: "occurrence", targetId: slot.periodId, recordId: row.id });
  } catch (failure) {
    if (!isHuhuError(failure) || !["INVALID_INPUT", "NOT_FOUND"].includes(failure.code)) throw failure;
    period = { ...base, state: "failed", recordId: null, error: failure.message };
  }
  if (previous) state.recurringPeriods[state.recurringPeriods.indexOf(previous)] = period;
  else state.recurringPeriods.push(period);
  return period;
}

export class LedgerRecurring {
  constructor(
    private readonly store: LedgerStore,
    private readonly control: () => PeriodicPlanControl | undefined,
    private readonly lifetime: AbortSignal,
  ) {}

  private find(state: BookState, ruleId: string) {
    const rule = state.recurring.find(({ id }) => id === ruleId);
    if (!rule) throw errors.notFound("固定收支规则不存在");
    return rule;
  }

  private binding(plan: PeriodicPlanSpec) {
    const state = this.store.snapshot(plan.source.object.id);
    const rule = state.recurring.find(({ planId }) => planId === plan.planId);
    if (!rule) throw errors.notFound("固定收支来源不存在");
    return { state, rule };
  }

  source(): PeriodicPlanSource {
    return {
      signal: this.lifetime,
      availability: (plan) => {
        try {
          const { state } = this.binding(plan);
          return state.book.status === "active" ? { state: "ready" } : { state: "blocked", reason: "target-unavailable" };
        } catch (error) {
          return { state: "blocked", reason: isHuhuError(error) && error.code === "NOT_FOUND" ? "target-unavailable" : "domain-conflict" };
        }
      },
      nextDue: (plan, windows) => {
        const { state, rule } = this.binding(plan);
        return plannedDates(rule, state, windows, plan).next().value?.scheduledAt ?? null;
      },
      calendar: (plan) => calendar(this.binding(plan).rule),
      rescheduleCalendar: (plan, trigger) => {
        this.lifetime.throwIfAborted();
        const { state, rule } = this.binding(plan);
        requireActiveBook(state);
        validateLedgerAccount(state, rule.accountId, rule.currency);
        return scheduleLabel(trigger, state.book.timeZone);
      },
      run: (plan, context) => this.generate(plan, context),
    };
  }

  private config(state: BookState, rule: RecurringRule): PeriodicPlanSpec {
    const source = { plugin: "ledger", object: { kind: "ledger-book", id: state.book.id } };
    const schedule = calendar(rule);
    return {
      planId: rule.planId,
      source,
      title: rule.title,
      action: { capability: "ledger.recurring.generate", object: { kind: "ledger-recurring", id: rule.id }, summary: "生成本地账本的固定收支" },
      everySeconds: 60,
      catchUp: "enabled-windows",
      calendar: schedule,
      businessSchedule: scheduleLabel(schedule, state.book.timeZone),
      intent: "paused",
    };
  }

  async create(c: Authorization, { bookId, expectedRevision, rule: input }: z.output<typeof OpenRecurring>) {
    this.lifetime.throwIfAborted();
    const control = this.control();
    if (!control) throw errors.pluginDisabled("automations");
    const signal = AbortSignal.any([this.lifetime, c.signal]);
    const rule = { ...input, planId: recurringPlanId(bookId, input.id) };
    const state = this.store.snapshot(bookId);
    const prior = state.recurring.find(({ id }) => id === input.id);
    if (prior) {
      if (canonicalJson(prior) !== canonicalJson(rule)) throw errors.idempotencyMismatch();
    } else {
      await this.store.change({ ...c, signal }, bookId, expectedRevision, (draft) => {
        requireActiveBook(draft);
        validateLedgerAccount(draft, rule.accountId, rule.currency);
        draft.recurring.push(rule);
      });
    }
    const saved = this.store.snapshot(bookId);
    const current = control.read(rule.planId);
    if (current) {
      if (current.source.plugin !== "ledger" || current.source.object.id !== bookId) throw errors.idempotencyMismatch();
      return { rule: this.project(rule, current), plan: current, periods: saved.recurringPeriods.filter(({ ruleId }) => ruleId === rule.id) };
    }
    c.assertCapabilityCurrent?.();
    const [plan] = await control.configure([{ ...this.config(saved, rule), expectedRevision: null }], signal);
    return { rule, plan: plan ?? null, periods: [] };
  }

  list(state: BookState): RecurringList {
    const control = this.control();
    return {
      revision: state.book.revision,
      rows: state.recurring.map((rule) => {
        const plan = control?.read(rule.planId) ?? null;
        return { rule: this.project(rule, plan), plan, periods: state.recurringPeriods.filter(({ ruleId }) => ruleId === rule.id).sort((a, b) => b.date.localeCompare(a.date)) };
      }),
    };
  }

  private project(rule: RecurringRule, plan: PlanSummary | null): RecurringRule {
    return plan?.trigger.kind === "calendar" ? { ...rule, frequency: plan.trigger.frequency, startOn: plan.trigger.startOn } : rule;
  }

  backupRules(state: BookState): RecurringRule[] {
    const control = this.control();
    return state.recurring.map((rule) => {
      const trigger = control?.inspect(rule.planId)?.calendar;
      return trigger ? { ...rule, frequency: trigger.frequency, startOn: trigger.startOn } : rule;
    });
  }

  ensure(c: Authorization, bookId: string, ruleId: string) {
    const state = this.store.snapshot(bookId);
    requireActiveBook(state);
    const { planId: _planId, ...rule } = this.find(state, ruleId);
    return this.create(c, { bookId, expectedRevision: state.book.revision, rule });
  }

  preview(bookId: string, ruleId: string): RecurringPreview {
    const state = this.store.snapshot(bookId);
    const rule = this.find(state, ruleId);
    const control = this.control();
    const windows = control?.enabledWindows(rule.planId) ?? [];
    const pending: Slot[] = [];
    const now = Date.now();
    for (const slot of plannedDates(rule, state, windows, control?.inspect(rule.planId))) {
      if (Date.parse(slot.scheduledAt) > now) return { nextDate: slot.date, pending, truncated: false };
      if (pending.length === limit) return { nextDate: slot.date, pending, truncated: true };
      pending.push(slot);
    }
    return { nextDate: null, pending, truncated: false };
  }

  private async generate(plan: PeriodicPlanSpec, context: PeriodicRunContext) {
    const { state, rule } = this.binding(plan);
    const clock = Date.parse(context.observedAt ?? context.scheduledFor);
    const due: Slot[] = [];
    for (const slot of plannedDates(rule, state, context.enabledWindows ?? [], plan)) {
      if (due.length === limit || Date.parse(slot.scheduledAt) > clock) break;
      due.push(slot);
    }
    if (!due.length) return "skipped" as const;
    const outcome = await this.store.change(
      {
        signal: context.signal,
        assertCapabilityCurrent: () => {
          if (!context.isCurrent()) throw errors.permissionDenied("固定收支计划已变更");
        },
      },
      state.book.id,
      state.book.revision,
      (draft) => {
        requireActiveBook(draft);
        return due.map((slot) => applyPeriod(draft, rule, slot, context.occurrenceId));
      },
    );
    return outcome.some(({ state }) => state === "failed") ? ("failed" as const) : undefined;
  }

  retry(c: Authorization, { bookId, ruleId, periodId, expectedRevision }: z.output<typeof RetryRecurring>) {
    const state = this.store.snapshot(bookId);
    const rule = this.find(state, ruleId);
    const known = state.recurringPeriods.find((row) => row.periodId === periodId && row.ruleId === ruleId);
    if (!known) throw errors.notFound("没有该固定收支期次");
    if (known.state === "generated") return known;
    const control = this.control();
    if (!control) throw errors.pluginDisabled("automations");
    const plan = control.read(rule.planId);
    const check = () => {
      c.assertCapabilityCurrent?.();
      if (this.control() !== control) throw errors.pluginDisabled("automations");
      const current = control.read(rule.planId);
      if (!current || current.revision !== plan?.revision || current.intent !== "enabled" || current.availability.state !== "ready") {
        throw errors.permissionDenied("原计划需要在本机启用后才能重试");
      }
    };
    return this.store.change(
      {
        signal: AbortSignal.any([this.lifetime, c.signal]),
        assertCapabilityCurrent: check,
      },
      bookId,
      expectedRevision,
      (draft) => {
        requireActiveBook(draft);
        const prior = draft.recurringPeriods.find((row) => row.periodId === periodId && row.ruleId === ruleId)!;
        return applyPeriod(draft, rule, { periodId, date: prior.date, scheduledAt: prior.scheduledAt }, prior.occurrenceId, prior);
      },
    );
  }
}
