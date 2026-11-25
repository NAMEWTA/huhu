import { errors, isHuhuError, isWorkbenchCaller, PlanOccurrenceSchema, PlanRefSchema, PlanSourceSchema, PlanSummarySchema, PlanWriteResultSchema, PlanWriteSchema, type PlanDirectory, type PlanOccurrence, type PlanSource, type PlanSummary, type PlanWrite } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { filterPlanPage, PlanHomeSummary, planOrders, planStates, summarizePlans } from "../shared/plan-directory.js";
import { historyPage, HistoryInput, HistoryPage, type HistoryRow } from "../shared/occurrence-history.js";
import { nextRuns, validateSchedule } from "../shared/cron.js";
import type { DefaultTaskScan } from "./default-task-scan.js";
import type { FollowUps } from "./follow-ups.js";
import type { FocusDeadlinePlans } from "./focus-deadline.js";
import type { PeriodicPlans } from "./periodic-plans.js";
import { hasLegacyTerminalEnvironment, type ActivationRecord, type AutomationsService } from "./service.js";
import { TaskReminderPlanInput, type TaskReminderPlans } from "./task-reminder-plans.js";
import { ObservationEditView, ObservationInput, ObservationUpdateInput, type ObservationPlans } from "./observations.js";

const identifier = PlanRefSchema.shape.planId;
const ListPlans = z.strictObject({
  source: PlanSourceSchema.optional(),
  plugin: identifier.optional(),
  action: identifier.optional(),
  state: z.enum(planStates).optional(),
  query: z.string().max(256).optional(),
  order: z.enum(planOrders).optional(),
  cursor: z.string().min(1).max(8192).optional(),
  limit: z.int().min(1).max(200).default(100),
});
const PlanPage = z.strictObject({ plans: z.array(PlanSummarySchema), nextCursor: identifier.nullable() });
const workbench = { plugin: "automations", exposable: false, defaultExposed: false } as const;
export const planDescriptors = {
  list: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.list", scope: "read", input: ListPlans, output: PlanPage,
    title: "计划目录", description: "枚举当前 Vault 的计划，可按来源对象筛选。", risk: "normal",
  }),
  summary: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.summary", scope: "read", input: z.strictObject({}), output: PlanHomeSummary,
    title: "计划摘要", description: "读取各来源的启用、受阻和最近安排。", risk: "normal",
  }),
  read: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.read", scope: "read", input: PlanRefSchema.pick({ planId: true }), output: PlanSummarySchema.nullable(),
    title: "查看计划", description: "按稳定身份查询一条计划。", risk: "normal",
  }),
  occurrence: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.readOccurrence", scope: "read", input: z.strictObject({ occurrenceId: identifier }), output: PlanOccurrenceSchema.nullable(),
    title: "查看计划发生", description: "查询指定发生的受理事实。", risk: "normal",
  }),
  history: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.history", scope: "read", input: HistoryInput, output: HistoryPage,
    title: "查询计划运行历史", description: "按来源、状态与时间读取发生摘要。", risk: "normal",
  }),
  submit: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.submit", scope: "write", idempotency: "durable", input: PlanWriteSchema, output: PlanWriteResultSchema,
    title: "修改计划", description: "以同一个意图 ID 和意图键提交计划修订。", risk: "high",
  }),
  taskReminder: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.createTaskReminder", scope: "write", idempotency: "durable",
    input: TaskReminderPlanInput, output: PlanSummarySchema,
    title: "设置任务提醒", description: "给原任务添加一次性提醒计划。", risk: "high",
  }),
  observationCreate: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.createObservation", scope: "write", idempotency: "durable",
    input: ObservationInput, output: PlanSummarySchema,
    title: "建立状态观察", description: "按间隔核对任务或会话，在条件满足时递送结果。", risk: "high",
  }),
  observationRead: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.readObservation", scope: "read",
    input: PlanRefSchema.pick({ planId: true }), output: ObservationEditView.nullable(),
    title: "查看观察配置", description: "返回当前的观察对象、触发条件和递送方式。", risk: "normal",
  }),
  observationUpdate: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.updateObservation", scope: "write", idempotency: "durable",
    input: ObservationUpdateInput, output: PlanSummarySchema,
    title: "修改状态观察", description: "使用原观察计划及其修订更新配置。", risk: "high",
  }),
  defaultTaskScan: defineCapabilityDescriptor({
    ...workbench, name: "automations.plans.defaultTaskScan", scope: "write",
    input: z.strictObject({ action: z.enum(["create", "restore"]) }),
    output: z.strictObject({ ruleId: identifier, state: z.enum(["created", "existing", "deleted"]) }),
    title: "安装默认任务扫描", description: "显式创建或恢复默认扫描模板。", risk: "high",
  }),
};

type Rule = ReturnType<AutomationsService["rule"]>;
type CatalogueDeps = {
  rules: AutomationsService;
  followUps: FollowUps;
  taskReminders: TaskReminderPlans;
  observations: ObservationPlans;
  periodic: PeriodicPlans;
  focus?: FocusDeadlinePlans;
  defaults: DefaultTaskScan;
  now(): Date;
  activations(): ActivationRecord[];
  readCronOccurrence(id: string): PlanOccurrence | null;
  deleteRule(ruleId: string, expectedVersion: string, assertCurrent: () => void): Promise<void>;
};
type ReadDirectory = Pick<PlanDirectory, "list" | "read" | "readOccurrence">;

function asInstant(value: string): string {
  return new Date(value).toISOString();
}

function matchesSource(value: PlanSource, filter: PlanSource): boolean {
  return value.plugin === filter.plugin && value.object.kind === filter.object.kind && value.object.id === filter.object.id;
}

function latestActivation(rows: ActivationRecord[]): Map<string, ActivationRecord> {
  const result = new Map<string, ActivationRecord>();
  for (const row of rows) {
    const current = result.get(row.ruleId);
    if (!current || row.startedAt > current.startedAt || (row.startedAt === current.startedAt && row.activationId > current.activationId)) result.set(row.ruleId, row);
  }
  return result;
}

function occurrenceSummary(row: ActivationRecord): PlanSummary["lastOccurrence"] {
  const status = row.summary && "state" in row.summary ? row.summary.state : undefined;
  let state: NonNullable<PlanSummary["lastOccurrence"]>["state"];
  switch (status) {
    case "unknown": state = "unknown"; break;
    case "cancelled": state = "cancelled"; break;
    case "failed": state = "failed"; break;
    case "succeeded": case "completed": state = "completed"; break;
    case "running": state = "running"; break;
    default: state = row.summary && "processed" in row.summary ? "completed" : "accepted";
  }
  return { occurrenceId: row.activationId, at: asInstant(row.startedAt), state };
}

function rulePlan(rule: Rule, api: HuhuApi, deps: CatalogueDeps, now: Date, recent?: ActivationRecord): PlanSummary {
  const { data, id: planId, version: revision } = rule;
  const object = { kind: "automation-rule", id: planId };
  const taskId = data.action.kind === "reminder" ? data.action.taskId : null;
  const input = data.action.kind === "agent" && data.action.input.source === "prompt" ? data.action.input : null;
  const issue = input ? deps.rules.templateIssue(input.spaceId, input.provider, rule.body) : undefined;
  const issueLabels: Record<string, string> = {
    "missing-space": "原 Space 不存在", "space-inaccessible": "原 Space 当前不可访问",
    "cli-missing": "原 CLI 当前不可用", "empty-template": "缺少固定需求正文",
  };
  const source = taskId ? { plugin: "tasks", object: { kind: "task", id: taskId } } : { plugin: "automations", object };
  const readOnly = api.vault.files.readOnly || rule.readOnly;
  const needsTasks = !!taskId || (data.action.kind === "agent" && data.action.input.source === "tasks");
  let availability: PlanSummary["availability"] = readOnly
    ? { state: "blocked", reason: "read-only" }
    : hasLegacyTerminalEnvironment(data.action) ? { state: "blocked", reason: "credentials-unavailable" }
    : needsTasks && !deps.taskReminders.taskSourceAvailable() ? { state: "blocked", reason: "plugin-disabled" }
    : taskId && !deps.taskReminders.taskAvailable(taskId) ? { state: "blocked", reason: "target-unavailable" }
    : issue ? { state: "blocked", reason: "target-unavailable", detail: issueLabels[issue] ?? "请检查执行目标" }
    : { state: "ready" };
  const { cron: expression, zone } = data.trigger;
  let nextAt: string | null = null;
  if (data.enabled && availability.state === "ready") {
    try {
      nextAt = nextRuns(expression, zone, 1, now)[0] ?? null;
    } catch {
      availability = { state: "blocked", reason: "domain-conflict", detail: "定时设置无效" };
    }
  }
  const actions: PlanSummary["actions"] = [];
  if (!readOnly) {
    actions.push("reschedule", "delete");
    if (data.enabled) actions.push("pause");
    else if (availability.state === "ready") actions.push("resume");
  }
  const action = data.action;
  const target = action.kind === "agent" && action.input.source === "prompt" ? { kind: "agent-space", id: action.input.spaceId }
    : action.kind === "terminal" && action.spaceId ? { kind: "agent-space", id: action.spaceId }
    : taskId ? { kind: "task", id: taskId } : object;
  const actionSummary = action.kind === "agent"
    ? (action.input.source === "tasks" ? "扫描 Agent 任务" : `向 ${action.input.provider} 派遣新任务`)
    : action.kind === "terminal" ? "运行终端命令" : "递送提醒";
  return {
    planId, revision, title: data.title,
    source,
    owner: { scope: "vault", vaultId: api.vault.vaultId },
    action: { capability: "automations.runNow", object, summary: target.kind === "agent-space" ? `${actionSummary} · ${target.id}` : actionSummary },
    intent: data.enabled ? "enabled" : "paused",
    availability,
    trigger: { kind: "cron", expression, zone },
    nextAt,
    createdAt: asInstant(data.createdAt),
    updatedAt: asInstant(data.updatedAt),
    lastOccurrence: recent ? occurrenceSummary(recent) : null,
    actions,
  };
}

async function changeRule(rule: Rule, change: PlanWrite, deps: CatalogueDeps, api: HuhuApi, assertCurrent: () => void): Promise<PlanSummary> {
  const { planId, expectedRevision } = change;
  if (rule.readOnly) throw errors.invalidInput("该规则由较新版本的 Huhu 创建，只读");
  if (rule.version !== expectedRevision) throw errors.versionConflict(rule.version);
  const summary = (value: Rule) => rulePlan(value, api, deps, deps.now(), latestActivation(deps.activations()).get(planId));
  switch (change.change) {
    case "reschedule": {
      if (change.trigger.kind !== "cron") throw errors.invalidInput("自动化规则需要 Cron 触发设置");
      const { expression: cron, zone } = change.trigger;
      try {
        validateSchedule(cron, zone);
      } catch (error) {
        throw errors.invalidInput(error instanceof Error ? error.message : "定时设置无效");
      }
      const trigger = { preset: "custom", cron, zone };
      return summary(await deps.rules.update(planId, expectedRevision, { trigger }, undefined, assertCurrent));
    }
    case "set-intent":
      return summary(await deps.rules.setEnabled(planId, change.intent === "enabled", undefined, expectedRevision, assertCurrent));
    case "delete": {
      const deleted = summary(rule);
      await deps.deleteRule(planId, expectedRevision, assertCurrent);
      return { ...deleted, intent: "deleted", nextAt: null, actions: [] };
    }
    case "run-now":
      throw errors.invalidInput("请使用规则的手动运行入口");
  }
}

export function registerPlanCatalogue(api: HuhuApi, deps: CatalogueDeps): void {
  function catalogue(source?: PlanSource, includeRuleHistory = true): PlanSummary[] {
    const now = deps.now();
    const rules = source && source.plugin !== "automations" && source.plugin !== "tasks" ? [] : deps.rules.rules();
    const recent = includeRuleHistory && rules.length > 0 ? latestActivation(deps.activations()) : undefined;
    return [
      ...rules.map((rule) => rulePlan(rule, api, deps, now, recent?.get(rule.id))),
      ...(source && source.plugin !== "tasks" ? [] : deps.taskReminders.list()),
      ...deps.observations.list(),
      ...deps.periodic.list(),
      ...(source && source.plugin !== "kernel" ? [] : deps.focus?.list() ?? []),
      ...(source && source.plugin !== "tasks" ? [] : deps.followUps.listPlans(source?.object.id)),
    ].filter((plan) => !source || matchesSource(plan.source, source));
  }
  const directory: ReadDirectory & { list(input: z.output<typeof ListPlans>, signal: AbortSignal): Promise<z.output<typeof PlanPage>> } = {
    async list(input: z.output<typeof ListPlans>, signal) {
      const { source } = input;
      signal.throwIfAborted();
      await (source ? deps.periodic.importSource(source.plugin) : deps.periodic.importReady());
      signal.throwIfAborted();
      return filterPlanPage(catalogue(source), input);
    },
    async read(planId, signal) {
      signal.throwIfAborted();
      await deps.periodic.importReady();
      signal.throwIfAborted();
      const rule = deps.rules.rules().find(({ id }) => id === planId);
      if (!rule) return deps.periodic.read(planId) ?? deps.taskReminders.read(planId) ?? deps.observations.read(planId) ?? deps.focus?.read(planId) ?? deps.followUps.readPlan(planId);
      return rulePlan(rule, api, deps, deps.now(), latestActivation(deps.activations()).get(planId));
    },
    async readOccurrence(occurrenceId, signal) {
      signal.throwIfAborted();
      return deps.periodic.readOccurrence(occurrenceId) ?? deps.readCronOccurrence(occurrenceId) ?? deps.followUps.readOccurrence(occurrenceId);
    },
  };
  api.defineCapability(bindCapability(planDescriptors.list, (context, input) => directory.list(input, context.signal)));
  api.defineCapability(bindCapability(planDescriptors.summary, ({ caller, signal }) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看工作台计划摘要");
    signal.throwIfAborted();
    return summarizePlans(catalogue(undefined, false));
  }));
  api.defineCapability(bindCapability(planDescriptors.read, (context, { planId }) => directory.read(planId, context.signal)));
  api.defineCapability(bindCapability(planDescriptors.occurrence, (context, { occurrenceId }) => directory.readOccurrence(occurrenceId, context.signal)));
  api.defineCapability(bindCapability(planDescriptors.history, ({ caller, signal }, input) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看工作台运行历史");
    signal.throwIfAborted();
    const titles = new Map(deps.rules.rules().map((rule) => [rule.id, {
      title: rule.data.title,
      source: rule.data.action.kind === "agent" ? "tasks" : "automations",
    }]));
    for (const plan of [...deps.taskReminders.list(), ...deps.observations.list(), ...(deps.focus?.list() ?? [])]) {
      titles.set(plan.planId, { title: plan.title, source: plan.source.plugin });
    }
    const rows = new Map<string, HistoryRow>();
    for (const row of deps.activations()) {
      const occurrence = occurrenceSummary(row)!;
      const plan = titles.get(row.ruleId);
      rows.set(row.activationId, {
        id: row.activationId, planId: row.ruleId, source: plan?.source ?? "unknown",
        title: plan?.title ?? "原自动化已移除", at: new Date(occurrence.at).toISOString(),
        trigger: row.trigger === "manual" ? "manual" : "scheduled", state: occurrence.state,
        ...(row.terminalRunId && { terminalRunId: row.terminalRunId }),
        ...(row.summary && "processed" in row.summary && { counts: row.summary }),
      });
    }
    for (const { occurrence, title, source } of [...deps.periodic.listHistory(), ...deps.followUps.listHistory()]) {
      const at = occurrence.acceptedAt ?? (occurrence.timing.trigger === "scheduled" ? occurrence.timing.scheduledFor : null);
      if (!at) continue;
      rows.set(occurrence.occurrenceId, {
        id: occurrence.occurrenceId, planId: occurrence.plan.planId, title, source, at: new Date(at).toISOString(),
        trigger: occurrence.timing.trigger, state: occurrence.state,
      });
    }
    return historyPage([...rows.values()], input);
  }));
  api.defineCapability(bindCapability(planDescriptors.taskReminder, (context, input) => {
    if (!context.parentOperationId || context.intentKey !== input.intentId) throw errors.invalidInput("添加提醒需要与意图 ID 相同的持久意图键");
    return deps.taskReminders.create(input, context.signal);
  }));
  api.defineCapability(bindCapability(planDescriptors.observationCreate, (context, input) => {
    if (!context.parentOperationId || context.intentKey !== input.intentId) throw errors.invalidInput("建立观察需要与意图 ID 相同的持久意图键");
    return deps.observations.create(input, context.signal);
  }));
  api.defineCapability(bindCapability(planDescriptors.observationRead, (context, { planId }) => {
    context.signal.throwIfAborted();
    return deps.observations.configuration(planId);
  }));
  api.defineCapability(bindCapability(planDescriptors.observationUpdate, (context, input) => {
    if (!context.parentOperationId || context.intentKey !== input.intentId) throw errors.invalidInput("修改观察需要与意图 ID 相同的持久意图键");
    return deps.observations.update(input, context.signal);
  }));
  api.defineCapability(bindCapability(planDescriptors.submit, async (context, change) => {
    const { intentId, planId } = change;
    const operationId = context.parentOperationId;
    const assertCurrent = () => context.signal.throwIfAborted();
    try {
      if (!operationId || context.intentKey !== intentId) throw errors.invalidInput("计划写入需要与意图 ID 相同的持久意图键");
      assertCurrent();
      api.vault.files.assertWritable();
      const rule = deps.rules.rules().find(({ id }) => id === planId);
      const plan = rule
        ? await changeRule(rule, change, deps, api, assertCurrent)
        : deps.periodic.read(planId) ? await deps.periodic.change(change, context.signal)
        : deps.taskReminders.read(planId) ? await deps.taskReminders.change(change, context.signal)
        : deps.observations.read(planId) ? await deps.observations.change(change, context.signal)
        : deps.focus?.read(planId) ? await deps.focus.change(change, context.signal)
        : await deps.followUps.changePlan(change, assertCurrent);
      return { outcome: "completed", intentId, operationId, plan } as const;
    } catch (error) {
      if (
        isHuhuError(error) && (
          error.code === "INVALID_INPUT" || error.code === "NOT_FOUND" || error.code === "VERSION_CONFLICT" ||
          error.code === "READ_ONLY_VAULT" || error.code === "PERMISSION_DENIED"
        )
      ) return { outcome: "not-accepted", error: error.toJSON() } as const;
      if (operationId && isHuhuError(error) && error.code === "WRITE_PARTIAL" && error.details?.["state"] === "needs_attention") {
        return { outcome: "unknown", intentId, operationId, occurrence: null } as const;
      }
      throw error;
    }
  }));
  api.defineCapability(bindCapability(planDescriptors.defaultTaskScan, (context, { action }) => {
    const assertCurrent = () => context.signal.throwIfAborted();
    return action === "restore" ? deps.defaults.restore(assertCurrent) : deps.defaults.create(assertCurrent);
  }));
}
