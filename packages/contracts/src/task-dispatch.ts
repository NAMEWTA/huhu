import { z } from "zod";
import type { TaskDto } from "./dto/task.js";
import { ExecutionBindingSchema, NativeStopIdSchema, NativeStopStatusSchema } from "./execution-receipt.js";
import { TaskRunAttemptSchema } from "./kinds/task-run.js";

const Id = z.string().trim().min(1).max(256);
const Instant = z.iso.datetime();
export const TaskDispatchInputIdentitySchema = z.object({ inputRevision: z.number().int().positive(), inputHash: z.string().regex(/^[a-f0-9]{16}$/) });
const ContextSelection = z.strictObject({
  messageIds: z.array(Id).max(8).default([]),
  artifacts: z.array(z.strictObject({ path: z.string().min(1).max(1024), expectedVersion: z.string().min(1).max(256).optional() })).max(4).default([]),
});

export const TaskDispatchInputSchema = TaskDispatchInputIdentitySchema.extend({ taskId: Id, dispatchId: Id, expectedVersion: z.string().min(1), allowEarly: z.boolean().optional(), newRound: z.literal(true).optional(), context: ContextSelection.optional() }).strict();
export const TaskDispatchLookupSchema = TaskDispatchInputSchema.pick({ taskId: true, dispatchId: true });
export const TaskRetryDispatchSchema = TaskDispatchLookupSchema.extend({ retryId: Id });
const TaskStopViewFields = z.strictObject({
  stopId: NativeStopIdSchema,
  status: z.enum(["pending", "sending", ...NativeStopStatusSchema.options]),
  acceptedAt: Instant,
  updatedAt: Instant,
});
export const TaskStopLookupSchema = TaskDispatchLookupSchema.extend({ runId: Id, stopId: TaskStopViewFields.shape.stopId });
export const TaskStopReceiptSchema = TaskStopLookupSchema.extend(TaskStopViewFields.shape);
export const TaskRuleDispatchSourceSchema = z.strictObject({
  kind: z.literal("automation"),
  ruleId: Id,
  ruleVersion: Id,
  occurrenceId: Id,
  maxConcurrent: z.int().min(1).max(4).optional(),
  notBefore: Instant.optional(),
  expiresAt: Instant.optional(),
  instructions: z.string().max(20_000).optional(),
});
export const TaskFollowUpDispatchSchema = TaskDispatchInputIdentitySchema.extend({ taskId: Id, followUpId: Id, scheduledFor: Instant }).strict();
export const TaskFollowUpSourceSchema = TaskFollowUpDispatchSchema.pick({ followUpId: true, scheduledFor: true })
  .extend({ kind: z.literal("follow-up"), parent: ExecutionBindingSchema.optional() });

export const TaskDispatchReceiptSchema = TaskDispatchLookupSchema.extend({
  eventId: z.string(),
  runId: z.string(),
  attempt: TaskRunAttemptSchema,
  acceptedAt: Instant,
  state: z.enum(["pending", "claimed", "sending", "running", "unknown", "cancelled", "stale_input", "expired", "blocked"]),
  reason: z.enum(["waiting_resource", "waiting_schedule", "task_occupied", "task_closed", "task_unavailable", "target_unavailable", "target_unsupported", "foreign_machine", "awaiting_confirmation"]).nullable(),
  cancelRequested: z.boolean(),
  overriddenAvailableAt: Instant.optional(),
  parentRunId: Id.optional(),
});
export const TaskDispatchViewSchema = TaskDispatchReceiptSchema.extend({
  session: z.strictObject({ id: Id, spaceId: Id, processGeneration: Id.optional() }).nullable(),
  stop: TaskStopViewFields.optional(),
  canRetry: z.literal(true).optional(),
  superseded: z.literal(true).optional(),
});
export const TaskRunSummarySchema = z.object({
  id: z.string(),
  state: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  model: z.string().nullable(),
  questions: z.number(),
  parentRunId: z.string().optional(),
  result: z.strictObject({ kind: z.enum(["result", "failed", "no_update"]), delivery: z.enum(["pending", "delivered", "target_missing"]), receiptId: z.string().optional() }).optional(),
});
export const RecentTaskRunSchema = z.object({ dispatch: TaskDispatchViewSchema, run: TaskRunSummarySchema.nullable(), title: z.string() });

export type TaskDispatchView = z.infer<typeof TaskDispatchViewSchema>;
export type TaskRunSummary = z.infer<typeof TaskRunSummarySchema>;
export type RecentTaskRun = z.infer<typeof RecentTaskRunSchema>;

export type TaskRunReference = { taskId: string; id: string; kind: "task-dispatch" | "task-run" };
export interface TaskRunAttentionQuery {
  read(refs: readonly TaskRunReference[]): ReadonlySet<TaskRunReference>;
}

export const TaskFollowUpViewSchema = z.strictObject({
  taskId: z.string().min(1).max(256),
  followUpId: z.uuidv4(),
  revision: z.uuidv4(),
  scheduledFor: Instant,
  reason: z.string().nullable(),
  runId: z.string().nullable(),
  state: z.enum(["scheduled", "accepted", "cancelled", "skipped", "needs_confirmation", "paused"]),
  planId: z.string().min(1).max(256).optional(),
});
export type TaskFollowUpView = z.infer<typeof TaskFollowUpViewSchema>;

export type RuleTemplateTask = {
  taskId: string;
  ruleId: string;
  occurrenceId: string;
  title: string;
  body: string;
  execution: TaskDto["execution"];
};
type RuleSource = z.infer<typeof TaskRuleDispatchSourceSchema>;
type FollowUpSource = z.infer<typeof TaskFollowUpSourceSchema>;
type DispatchInput = z.infer<typeof TaskDispatchInputSchema>;
type DispatchReceipt = z.infer<typeof TaskDispatchReceiptSchema>;

export type TaskScheduleAdmission = (source: RuleSource | FollowUpSource, taskId: string) => boolean;

export interface TaskRuleDispatch {
  acceptRule(input: DispatchInput, source: RuleSource): Promise<DispatchReceipt>;
  readAcceptedRule?(input: DispatchInput, source: RuleSource): DispatchReceipt | null;
  createFromRule(input: RuleTemplateTask): Promise<TaskDto>;
}
export interface TaskFollowUpDispatch {
  acceptFollowUp(input: z.infer<typeof TaskFollowUpDispatchSchema>): Promise<DispatchReceipt>;
}
