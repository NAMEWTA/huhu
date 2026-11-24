import { expect, test } from "vitest";
import {
  errors,
  PlanOccurrenceSchema,
  PlanSummarySchema,
  PlanWriteResultSchema,
  PlanWriteSchema,
  TaskActivitySchema,
  type PlanDirectory,
  type PlanExecutionRef,
  type PlanOccurrence,
  type PlanSummary,
  type TaskActivityQuery,
} from "../src/index.js";

const signal = new AbortController().signal;
const now = "2026-11-24T06:00:00.000Z";
const next = "2026-11-25T06:00:00.000Z";
const task = { kind: "task", id: "task-fixture" };
const source = { plugin: "tasks", object: task };
const rule = { kind: "automation-rule", id: "rule-fixture" };
const execution: PlanExecutionRef = {
  vaultId: "vault-fixture", taskId: task.id, runId: "run-fixture", attempt: 2, dispatchId: "dispatch-fixture",
  sessionBinding: { machineId: "machine-fixture", sessionId: "session-fixture", coreId: "core-fixture", processGeneration: "generation-2", provider: "fixture", nativeSessionId: "native-fixture" },
};

function example() {
  const cron = PlanSummarySchema.parse({
    planId: "plan-cron", revision: "rule-version-a", title: "每日提醒",
    source: { plugin: "automations", object: rule },
    owner: { scope: "vault", vaultId: execution.vaultId },
    action: { capability: "automations.runNow", object: rule, summary: "提醒" },
    intent: "paused", availability: { state: "ready" },
    trigger: { kind: "cron", expression: "0 14 * * *", zone: "Asia/Taipei" },
    createdAt: now, updatedAt: now, nextAt: null, lastOccurrence: null, actions: ["resume", "delete"],
  });
  const followUp = PlanSummarySchema.parse({
    planId: "stable-follow-up-plan", revision: "rescheduled-b", title: "跟进任务",
    source,
    owner: { scope: "device", vaultId: execution.vaultId, machineId: execution.sessionBinding.machineId },
    action: { capability: "tasks.dispatch", object: task, summary: "跟进当前任务" },
    intent: "enabled", availability: { state: "blocked", reason: "connection-unavailable" },
    trigger: { kind: "once", scheduledFor: next },
    createdAt: now, updatedAt: now, nextAt: next,
    lastOccurrence: { occurrenceId: "original-follow-up-id", state: "unknown", at: now },
    actions: ["reschedule", "pause", "delete"],
  });
  const occurrence = PlanOccurrenceSchema.parse({
    occurrenceId: "original-follow-up-id", plan: { planId: followUp.planId, revision: "old-follow-up-revision" },
    timing: { trigger: "scheduled", scheduledFor: now },
    state: "unknown", acceptedAt: now,
    frozenInput: { revision: 1, digest: "original-task-input" },
    execution,
    effects: [{ effectId: "effect-fixture", kind: "dispatch", target: task, operationId: "operation-fixture", state: "unknown", receiptId: null }],
  });
  const plans = new Map<string, PlanSummary>([[cron.planId, cron], [followUp.planId, followUp]]);
  const activity: TaskActivityQuery = {
    async readTaskActivity(taskId) {
      if (taskId !== task.id) return null;
      return TaskActivitySchema.parse({ taskId, inputRevision: 2, inputHash: "current-task-input", status: "in_progress", observedAt: next, execution: { state: "unknown", identity: execution } });
    },
  };
  const stored = PlanWriteResultSchema.parse({
    outcome: "unknown", intentId: "7707a84e-dc27-4888-a49d-fdb42f110892", operationId: "operation-fixture", occurrence,
  });
  if (stored.outcome !== "unknown") throw new Error("夹具需要未知回执");
  const directory: PlanDirectory = {
    async list(input) {
      return {
        plans: [...plans.values()].filter((plan) => !input.source || (plan.source.plugin === input.source.plugin && plan.source.object.kind === input.source.object.kind && plan.source.object.id === input.source.object.id)),
        nextCursor: null,
      };
    },
    async read(planId) { return plans.get(planId) ?? null; },
    async readOccurrence(id) { return id === occurrence.occurrenceId ? occurrence : null; },
    async readOperation(id) { return id === stored.operationId ? stored : null; },
    async submit(write) {
      PlanWriteSchema.parse(write);
      if (write.intentId === stored.intentId && write.planId === followUp.planId && write.change === "run-now") return stored;
      const current = plans.get(write.planId);
      if (!current) return { outcome: "not-accepted", error: errors.notFound("自动化计划").toJSON() };
      if (current.revision !== write.expectedRevision) return { outcome: "not-accepted", error: errors.versionConflict(current.revision).toJSON() };
      throw new Error("合同夹具未实现当前版本写入");
    },
  };
  return { directory, activity, cron, followUp, occurrence, stored };
}

test("PlanAPI #16 中心与来源共享相同计划身份，区分暂停、受阻和旧发生", async () => {
  const { directory, activity, cron, followUp, occurrence } = example();
  const centre = await directory.list({ limit: 20 }, signal);
  expect(centre.plans).toEqual([cron, followUp]);
  expect(centre.plans[0]).toMatchObject({ intent: "paused", availability: { state: "ready" }, nextAt: null });
  const fromTask = await directory.list({ source, limit: 20 }, signal);
  expect(fromTask.plans).toEqual([followUp]);
  expect(await directory.read(fromTask.plans[0]!.planId, signal)).toEqual(centre.plans[1]);
  expect(followUp).toMatchObject({ intent: "enabled", availability: { state: "blocked", reason: "connection-unavailable" } });
  expect(followUp.planId).not.toBe(occurrence.occurrenceId);
  const taskState = await activity.readTaskActivity(task.id, signal);
  expect(taskState).toMatchObject({ inputRevision: 2, status: "in_progress", execution: { state: "unknown", identity: occurrence.execution } });
  expect(occurrence.frozenInput?.revision).toBe(1);
  expect(JSON.stringify(taskState)).not.toContain("coreAddress");
});

test("PlanAPI F29 旧修订零受理，已受理未知按原操作和发生查询", async () => {
  const { directory, followUp, occurrence, stored } = example();
  const stale = PlanWriteResultSchema.parse(await directory.submit({
    planId: followUp.planId, expectedRevision: "old-follow-up-revision", intentId: "5517c4a5-d50e-4c2b-969f-cb33dc6f62fa", change: "delete",
  }, signal));
  expect(stale).toMatchObject({ outcome: "not-accepted", error: { code: "VERSION_CONFLICT", details: { currentVersion: followUp.revision } } });
  expect(stale).not.toHaveProperty("operationId");
  const intent = { planId: followUp.planId, expectedRevision: occurrence.plan.revision, intentId: stored.intentId, change: "run-now" } as const;
  expect(await directory.submit(intent, signal)).toEqual(stored);
  expect(await directory.readOperation(stored.operationId, signal)).toEqual(stored);
  expect(await directory.readOccurrence(occurrence.occurrenceId, signal)).toEqual(occurrence);
  expect(await directory.read(followUp.planId, signal)).toEqual(followUp);
});

test("PlanAPI 已受理的活动缺原始身份时无法解析", () => {
  const { occurrence } = example();
  for (const field of ["acceptedAt", "frozenInput"] as const) {
    expect(PlanOccurrenceSchema.safeParse({ ...occurrence, [field]: null }).success).toBe(false);
  }
  const pending: PlanOccurrence = { ...occurrence, state: "scheduled", acceptedAt: null, frozenInput: null, execution: null, effects: [] };
  expect(PlanOccurrenceSchema.parse(pending)).toEqual(pending);
});
