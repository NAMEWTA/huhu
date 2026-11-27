import { z } from "zod";
import { HuhuErrorSchema } from "./errors.js";
import { ExecutionBindingSchema, ExecutionSessionBindingSchema } from "./execution-receipt.js";
import { TaskStatusSchema } from "./kinds/task.js";
import { LedgerBusinessDate } from "./ledger.js";

const id = z.string().min(1).max(256);
const instant = z.iso.datetime();
const revision = id;
const domainObject = z.strictObject({ kind: id, id });

export const PlanRefSchema = z.strictObject({ planId: id, revision });
export type PlanRef = z.infer<typeof PlanRefSchema>;
export const PlanOccurrenceLinkSchema = z.strictObject({ planId: id, occurrenceId: id });
export type PlanOccurrenceLink = z.infer<typeof PlanOccurrenceLinkSchema>;
export const PlanSourceSchema = z.strictObject({ plugin: id, object: domainObject });
export type PlanSource = z.infer<typeof PlanSourceSchema>;

const owner = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("vault"), vaultId: id }),
  z.strictObject({ scope: z.literal("device"), vaultId: id, machineId: id }),
  z.strictObject({ scope: z.literal("connection"), vaultId: id, machineId: id, connectionId: id }),
]);

export const CalendarPlanTriggerSchema = z.strictObject({
  kind: z.literal("calendar"),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  startOn: LedgerBusinessDate,
});
export type CalendarPlanTrigger = z.infer<typeof CalendarPlanTriggerSchema>;

export const PlanTriggerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("once"), scheduledFor: instant }),
  z.strictObject({ kind: z.literal("interval"), every: z.int().positive(), unit: z.enum(["seconds", "minutes"]) }),
  z.strictObject({ kind: z.literal("cron"), expression: id, zone: id }),
  z.strictObject({ kind: z.literal("event"), event: id, object: domainObject }),
  z.strictObject({ kind: z.literal("observe"), query: id, object: domainObject, everySeconds: z.int().positive() }),
  CalendarPlanTriggerSchema,
]);
export type PlanTrigger = z.infer<typeof PlanTriggerSchema>;

const intervalBounds = z.strictObject({
  min: z.int().positive(),
  max: z.int().positive(),
  step: z.int().positive(),
  allowed: z.array(z.int().positive()).min(1).optional(),
});

const blockedReason = z.enum(["plugin-disabled", "read-only", "foreign-owner", "credentials-unavailable", "connection-unavailable", "domain-conflict", "target-unavailable"]);
const availability = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("ready") }), z.strictObject({ state: z.literal("blocked"), reason: blockedReason, detail: z.string().optional() })]);
const action = z.strictObject({ capability: id, object: domainObject, summary: z.string() });
const allowedAction = z.enum(["reschedule", "pause", "resume", "delete", "run-now"]);
const intent = z.enum(["enabled", "paused", "deleted"]);
const occurrenceState = z.enum(["scheduled", "blocked", "cancelled", "accepted", "running", "completed", "failed", "unknown"]);
const occurrenceSummary = z.strictObject({ occurrenceId: id, state: occurrenceState, at: instant });
const businessSchedule = z.strictObject({ label: z.string(), zone: id });

/** C3/C7 shared projection. The source route and the centre use this same plan identity. */
export const PlanSummarySchema = PlanRefSchema.extend({
  title: z.string(),
  source: PlanSourceSchema,
  owner,
  action,
  intent,
  availability,
  trigger: PlanTriggerSchema,
  businessSchedule: businessSchedule.optional(),
  intervalBounds: intervalBounds.optional(),
  createdAt: instant,
  updatedAt: instant,
  nextAt: instant.nullable(),
  lastOccurrence: occurrenceSummary.nullable(),
  needsAttention: z.literal(true).optional(),
  actions: z.array(allowedAction),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

/** Public navigation retains generation identity without a Core transport address. */
export const PlanExecutionRefSchema = ExecutionBindingSchema.omit({ sessionBinding: true }).extend({
  sessionBinding: ExecutionSessionBindingSchema.omit({ coreAddress: true }),
});
export type PlanExecutionRef = z.infer<typeof PlanExecutionRefSchema>;

const inputRevision = z.union([revision, z.int().nonnegative()]);
export const PlanEffectSchema = z.strictObject({
  effectId: id,
  kind: id,
  target: domainObject,
  operationId: id.nullable(),
  state: z.enum(["not-accepted", "accepted", "completed", "failed", "unknown"]),
  receiptId: id.nullable(),
  recovery: z.enum(["retry", "verify"]).optional(),
});
export type PlanEffect = z.infer<typeof PlanEffectSchema>;

const occurrenceTiming = z.discriminatedUnion("trigger", [
  z.strictObject({ trigger: z.literal("scheduled"), scheduledFor: instant }),
  z.strictObject({ trigger: z.literal("manual") }),
  z.strictObject({ trigger: z.literal("event"), eventId: id }),
]);
const occurrenceBase = z.strictObject({
  occurrenceId: id,
  plan: PlanRefSchema,
  timing: occurrenceTiming,
  state: occurrenceState,
  acceptedAt: instant.nullable(),
  frozenInput: z.strictObject({ revision: inputRevision, digest: id }).nullable(),
  execution: PlanExecutionRefSchema.nullable(),
  effects: z.array(PlanEffectSchema),
});

export const PlanOccurrenceSchema = occurrenceBase.superRefine((value, context) => {
  const admitted = ["accepted", "running", "completed", "failed", "unknown"].includes(value.state);
  if (admitted && (!value.acceptedAt || !value.frozenInput)) {
    context.addIssue({ code: "custom", path: ["acceptedAt"], message: "受理后的发生须保留原受理时间和冻结输入" });
  }
});
export type PlanOccurrence = z.infer<typeof PlanOccurrenceSchema>;

/** One Tasks-owned observation. A missing execution is explicit; it does not imply completion. */
export const TaskActivitySchema = z.strictObject({
  taskId: id,
  inputRevision: z.int().nonnegative(),
  inputHash: id,
  status: TaskStatusSchema,
  observedAt: instant,
  execution: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("none") }), z.strictObject({ state: z.enum(["running", "waiting-input", "completed", "failed", "unknown"]), identity: PlanExecutionRefSchema })]),
});
export type TaskActivity = z.infer<typeof TaskActivitySchema>;

const writeBase = z.strictObject({ planId: id, expectedRevision: revision, intentId: z.uuidv4() });
export const PlanWriteSchema = z.discriminatedUnion("change", [
  writeBase.extend({ change: z.literal("reschedule"), trigger: PlanTriggerSchema }),
  writeBase.extend({ change: z.literal("set-intent"), intent: z.enum(["enabled", "paused"]) }),
  writeBase.extend({ change: z.literal("delete") }),
  writeBase.extend({ change: z.literal("run-now") }),
]);
export type PlanWrite = z.infer<typeof PlanWriteSchema>;

const admittedWrite = z.strictObject({ intentId: z.uuidv4(), operationId: id });
export const PlanWriteResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("not-accepted"), error: HuhuErrorSchema }),
  admittedWrite.extend({ outcome: z.literal("completed"), plan: PlanSummarySchema }),
  admittedWrite.extend({ outcome: z.literal("unknown"), occurrence: PlanOccurrenceSchema.nullable() }),
]);
export type PlanWriteResult = z.infer<typeof PlanWriteResultSchema>;

/** Consumer ports for the directory implementation, with authorization owned by Dispatcher. */
export interface PlanDirectory {
  list(input: { source?: PlanSource; cursor?: string; limit: number }, signal: AbortSignal): Promise<{ plans: PlanSummary[]; nextCursor: string | null }>;
  read(planId: string, signal: AbortSignal): Promise<PlanSummary | null>;
  readOccurrence(occurrenceId: string, signal: AbortSignal): Promise<PlanOccurrence | null>;
  readOperation(operationId: string, signal: AbortSignal): Promise<PlanWriteResult | null>;
  submit(write: PlanWrite, signal: AbortSignal): Promise<PlanWriteResult>;
}

export interface TaskActivityQuery {
  readTaskActivity(taskId: string, signal: AbortSignal): Promise<TaskActivity | null>;
}

/** Existing source actions, executed by Automations under one plan revision. */
export const PeriodicPlanSpecSchema = z.strictObject({
  planId: id,
  source: PlanSourceSchema,
  title: z.string().min(1).max(200),
  everySeconds: z.int().min(1).max(86_400),
  catchUp: z.literal("enabled-windows").optional(),
  businessSchedule: businessSchedule.optional(),
  calendar: CalendarPlanTriggerSchema.optional(),
  calendarHistory: z.array(z.strictObject({ trigger: CalendarPlanTriggerSchema, until: instant })).optional(),
  bounds: intervalBounds.optional(),
  action,
  intent,
});
export type PeriodicPlanSpec = z.infer<typeof PeriodicPlanSpecSchema>;
export type PeriodicPlanChange = PeriodicPlanSpec & { expectedRevision: string | null };
export const PeriodicEnabledWindowSchema = z.strictObject({ from: instant, until: instant.nullable() });
export type PeriodicEnabledWindow = z.infer<typeof PeriodicEnabledWindowSchema>;
export type PeriodicRunOutcome = "skipped" | "failed";
export type PeriodicRunContext = PlanRef & {
  occurrenceId: string;
  scheduledFor: string;
  observedAt?: string;
  enabledWindows?: readonly PeriodicEnabledWindow[];
  signal: AbortSignal;
  isCurrent(): boolean;
  /** Ask Automations to wake the same still-active plan for a protocol event or bounded continuation. */
  wake(delayMs: number): void;
};
export interface PeriodicPlanSource {
  readonly signal: AbortSignal;
  legacy?(): readonly PeriodicPlanSpec[];
  availability?(plan: PeriodicPlanSpec): PlanSummary["availability"];
  /** Calendar owners decide which unhandled business occurrence is next. */
  nextDue?(plan: PeriodicPlanSpec, windows: readonly PeriodicEnabledWindow[]): string | null;
  calendar?(plan: PeriodicPlanSpec): CalendarPlanTrigger | null;
  rescheduleCalendar?(plan: PeriodicPlanSpec, trigger: CalendarPlanTrigger): NonNullable<PeriodicPlanSpec["businessSchedule"]>;
  suspend?(): void;
  run(plan: PeriodicPlanSpec, context: PeriodicRunContext): Promise<PeriodicRunOutcome | void>;
}
export interface PeriodicPlanControl {
  read(planId: string): PlanSummary | null;
  inspect(planId: string): (PeriodicPlanSpec & PlanRef) | null;
  enabledWindows(planId: string): readonly PeriodicEnabledWindow[];
  configure(changes: readonly PeriodicPlanChange[], signal: AbortSignal): Promise<PlanSummary[]>;
  wake(plan: PlanRef, delayMs: number): void;
  importSource(plugin: string): Promise<void>;
}
export const PERIODIC_PLANS_SERVICE = "automations.periodicPlans";
export const periodicPlanSourceService = (plugin: string) => `automations.periodicSource:${plugin}`;
