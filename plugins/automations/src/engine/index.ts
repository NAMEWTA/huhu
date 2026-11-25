import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";
import type { Context } from "@huhu/cordis";
import { bindCapability, defineCapabilityDescriptor, ExposureStore, toolSelection, type CapabilityContext, type CapabilityDefinition, type CapabilityDescriptor, type FocusDeadlinePort, type HuhuApi } from "@huhu/kernel";
import { filesystemIdentity, machineId, VaultFiles } from "@huhu/vault";
import type { TaskFollowUpDispatch, TaskScheduleAdmission } from "@huhu/contracts";
import { AgentInputSchema, AutomationActionSchema, errors, isWorkbenchCaller, PERIODIC_PLANS_SERVICE, periodicPlanSourceService, type PeriodicPlanSource, type TaskActivityQuery } from "@huhu/contracts";
import { z } from "zod";
import { DEFAULT_TASK_SCAN_RULE_ID, DefaultTaskScan } from "./default-task-scan.js";
import { automationReceipts, automationToolOwner } from "./external-intents.js";
import { FollowUpCancelInput, FollowUpLookup, FollowUps, FollowUpScheduleInput, FollowUpView } from "./follow-ups.js";
import { FocusDeadlinePlans } from "./focus-deadline.js";
import { HoldStore } from "./holds.js";
import { ObservationPlans, type ObservationStatus } from "./observations.js";
import { PeriodicPlans } from "./periodic-plans.js";
import { planDescriptors, registerPlanCatalogue } from "./plans.js";
import { ReminderDeliveries, type ReminderNotifications } from "./reminder-deliveries.js";
import { MissedRunGraceMinutes, Rule, RuleVersion, Trigger } from "./rule-schemas.js";
import { Scheduler } from "./scheduler.js";
import { AutomationsService, hasLegacyTerminalEnvironment, isTaskScanRule, TASK_SCAN_INSTRUCTIONS_LIMIT, type ActivationRecord, type AutomationsDeps, type TaskQueryLike } from "./service.js";
import { TaskScanOccurrences } from "./task-scan-occurrences.js";
import { TaskReminderPlans } from "./task-reminder-plans.js";
import { registerTaskScanTools, TaskScanAction, taskScanAuthorization, taskScanToolDescriptors, type TaskScanPrincipalCheck } from "./task-scan-tools.js";
import { registerTerminalEnvironments, type AutomationCredentialHost } from "./terminal-environment.js";

export { AutomationsService } from "./service.js";
export { DEFAULT_TASK_SCAN_RULE_ID } from "./default-task-scan.js";
export { Scheduler } from "./scheduler.js";
export { taskScanToolDescriptors, type TaskScanPrincipalCheck } from "./task-scan-tools.js";
export { terminalEnvironmentDescriptors } from "./terminal-environment.js";

const Action = z.discriminatedUnion("kind", [
  AutomationActionSchema.options[0].extend({ input: z.discriminatedUnion("source", [TaskScanAction.shape.input, AgentInputSchema.options[1].strict()]) }).strict(),
  AutomationActionSchema.options[1].strict(),
  AutomationActionSchema.options[2].strict(),
]);
const hashOwner = (vault: string, subject: string) =>
  createHash("sha256")
    .update(JSON.stringify([vault, subject]))
    .digest("hex");
function publicRule(value: ReturnType<AutomationsService["rule"]>): z.output<typeof Rule> {
  if (value.data.action.kind !== "terminal") return value;
  const { envRefs: _, ...action } = value.data.action;
  return { ...value, data: { ...value.data, action, legacyEnvironment: hasLegacyTerminalEnvironment(value.data.action) } };
}

function ruleWriteResult(caller: string, value: ReturnType<AutomationsService["rule"]>): z.output<typeof Rule> {
  return publicRule(!isWorkbenchCaller(caller) && isTaskScanRule(value) ? { ...value, body: "" } : value);
}

const RuleDraftPreview = defineCapabilityDescriptor({
  plugin: "automations", name: "automations.plans.previewRuleDraft", scope: "read", risk: "normal", exposable: false, defaultExposed: false,
  title: "预览规则草稿", description: "使用当前条件读取未来时刻和候选，不执行动作。",
  input: z.union([
    z.strictObject({ trigger: Trigger }),
    z.strictObject({ trigger: Trigger, action: Action, body: z.string().max(TASK_SCAN_INSTRUCTIONS_LIMIT) }),
  ]),
  output: z.strictObject({ at: z.iso.datetime(), next: z.array(z.string()), tasksDisabled: z.boolean(), candidates: z.array(z.unknown()), skipped: z.array(z.unknown()) }),
});
const Id = z.object({ id: z.string() });
const CancelRuleRun = Id.extend({ runId: z.string().min(1).optional(), activationId: z.string().min(1).optional(), intentId: z.uuidv4().optional() }).strict();
const Cancelled = z.strictObject({ cancelled: z.boolean() });

const RunRow = z.object({
  id: z.string(),
  kind: z.literal("automation-run"),
  state: z.string(),
  title: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  live: z.boolean(),
});

export const automationToolDescriptors = {
  plansList: planDescriptors.list,
  plansSummary: planDescriptors.summary,
  plansRead: planDescriptors.read,
  plansPreviewRuleDraft: RuleDraftPreview,
  plansReadOccurrence: planDescriptors.occurrence,
  plansHistory: planDescriptors.history,
  plansSubmit: planDescriptors.submit,
  plansCreateTaskReminder: planDescriptors.taskReminder,
  plansCreateObservation: planDescriptors.observationCreate,
  plansReadObservation: planDescriptors.observationRead,
  plansUpdateObservation: planDescriptors.observationUpdate,
  plansDefaultTaskScan: planDescriptors.defaultTaskScan,
  followUpsGet: defineCapabilityDescriptor({
    name: "automations.followUps.get",
    plugin: "automations",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: FollowUpLookup,
    output: FollowUpView.nullable(),
    title: "查看任务跟进",
    description: "查询指定任务的跟进计划。",
    risk: "normal",
  }),
  followUpsSchedule: defineCapabilityDescriptor({
    name: "automations.followUps.schedule",
    plugin: "automations",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: FollowUpScheduleInput,
    output: FollowUpView,
    title: "安排任务跟进",
    description: "按任务和计划版本安排一次未来跟进。",
    risk: "normal",
  }),
  followUpsCancel: defineCapabilityDescriptor({
    name: "automations.followUps.cancel",
    plugin: "automations",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: FollowUpCancelInput,
    output: FollowUpView,
    title: "取消任务跟进",
    description: "取消尚未派遣的指定版本跟进计划。",
    risk: "normal",
  }),
  list: defineCapabilityDescriptor({
    name: "automations.list",
    plugin: "automations",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.object({}),
    output: z.array(Rule),
    title: "列出自动化规则",
    description: "读取当前 Vault 的自动化规则。",
    risk: "normal",
  }),
  read: defineCapabilityDescriptor({
    name: "automations.read",
    plugin: "automations",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: Id,
    output: Rule,
    title: "读取自动化规则",
    description: "读取指定规则的当前内容与版本。",
    risk: "normal",
  }),
  create: defineCapabilityDescriptor({
    name: "automations.create",
    plugin: "automations",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: z.object({ title: z.string(), trigger: Trigger, action: Action, body: z.string().optional(), missedRunGraceMinutes: MissedRunGraceMinutes.optional() }),
    output: Rule,
    title: "新建自动化规则",
    description: "保存一条停用的自动化规则草稿。",
    risk: "high",
  }),
  update: defineCapabilityDescriptor({
    name: "automations.update",
    plugin: "automations",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: Id.extend({
      expectedVersion: z.string(),
      patch: z.object({ title: z.string().optional(), trigger: Trigger.optional(), action: Action.optional(), missedRunGraceMinutes: MissedRunGraceMinutes.optional() }),
      body: z.string().max(TASK_SCAN_INSTRUCTIONS_LIMIT).optional(),
    }),
    output: Rule,
    title: "更新自动化规则",
    description: "按版本更新指定规则。",
    risk: "high",
  }),
  runNow: defineCapabilityDescriptor({
    name: "automations.runNow",
    plugin: "automations",
    scope: "execute",
    exposable: true,
    defaultExposed: false,
    timeoutMs: 30 * 60_000,
    input: Id.extend({ expectedVersion: RuleVersion.optional(), intentId: z.uuidv4().optional() }),
    output: z.object({ activationId: z.string(), summary: z.unknown() }),
    title: "立即运行规则",
    description: "按规则版本受理一次手动运行。",
    risk: "high",
  }),
  cancel: defineCapabilityDescriptor({
    name: "automations.cancel",
    plugin: "automations",
    scope: "execute",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: CancelRuleRun,
    output: Cancelled,
    title: "取消规则运行",
    description: "取消所选规则的一次具体运行。",
    risk: "high",
  }),
  activations: defineCapabilityDescriptor({
    name: "automations.activations",
    plugin: "automations",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.object({}),
    output: z.array(z.object({ activationId: z.string(), ruleId: z.string(), trigger: z.string(), scheduledFor: z.string().nullable(), startedAt: z.string(), finishedAt: z.string().optional(), summary: z.unknown().optional() })),
    title: "查看规则发生记录",
    description: "读取当前 Vault 的自动化发生记录。",
    risk: "normal",
  }),
  runsList: defineCapabilityDescriptor({
    name: "automations.runs.list",
    plugin: "automations",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.object({ limit: z.number().int().min(1).max(500).optional() }),
    output: z.array(RunRow),
    title: "列出规则运行",
    description: "读取终端规则的最近运行。",
    risk: "normal",
  }),
  runsRead: defineCapabilityDescriptor({
    name: "automations.runs.read",
    plugin: "automations",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.object({ runId: z.string() }),
    output: z.object({ id: z.string(), kind: z.literal("automation-run"), version: z.string(), body: z.string(), data: z.record(z.string(), z.unknown()), title: z.string(), live: z.boolean() }),
    title: "读取规则运行",
    description: "按运行标识查询终端规则运行。",
    risk: "normal",
  }),
  runsCancel: defineCapabilityDescriptor({
    name: "automations.runs.cancel",
    plugin: "automations",
    scope: "execute",
    exposable: true,
    defaultExposed: false,
    input: z.object({ runId: z.string() }),
    output: z.object({ cancelled: z.boolean(), state: z.string() }),
    title: "取消终端规则运行",
    description: "对指定运行发出取消请求。",
    risk: "high",
  }),
};

export interface AutomationsOptions {
  zone?: () => string;
  notify?: AutomationsDeps["notify"];
  reminderNotifications?: ReminderNotifications;
  focusDeadline?: FocusDeadlinePort;
  credentialHost?: AutomationCredentialHost;
  spaceState?: (spaceId: string) => { state: "ok" | "missing" | "inaccessible"; root?: string };
  /** CLI 是否已检测到（来自智能体目录的检测结果）。 */
  cliAvailable?: (provider: string) => boolean;
  /** 扫描前刷新 CLI 可用性（见 AutomationsDeps.refreshClis）。 */
  refreshClis?: () => Promise<void>;
  /** 配合 Engine 静态登记任务扫描描述，复查已认证身份是否仍可用。 */
  taskScanPrincipalCurrent?: TaskScanPrincipalCheck;
  schedule?: boolean;
  periodicClock?: { now(): number };
  now?: () => Date;
}

export function apply(ctx: Context, api: HuhuApi, opts: AutomationsOptions = {}): { service: AutomationsService; scheduler: Scheduler; periodic: PeriodicPlans } {
  const mid = machineId();
  const now = opts.now ?? (() => new Date());
  const zone = opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const cliAvailable = opts.cliAvailable ?? (() => false);
  const stateFiles = new VaultFiles(api.vault.stateDir, undefined, api.vault.files.readOnly);
  const stateStat = statSync(stateFiles.root, { bigint: true });
  const rootIdentity = filesystemIdentity(stateStat);
  const terminalOwner =
    rootIdentity && stateStat.birthtimeNs > 0n
      ? createHash("sha256")
          .update(JSON.stringify([api.vault.vaultId, mid, rootIdentity, String(stateStat.birthtimeNs)]))
          .digest("hex")
      : null;
  const holdStore = new HoldStore(path.join(api.vault.stateDir, "automations", "holds.json"));
  const svc = new AutomationsService({
    repo: api.vault.repo,
    activationsDir: path.join(api.vault.stateDir, "automations", "activations"),
    taskQuery: () => api.service<TaskQueryLike>("taskQuery"),
    spaceState: opts.spaceState ?? (() => ({ state: "missing" })),
    cliAvailable,
    ...(opts.refreshClis ? { refreshClis: opts.refreshClis } : {}),
    holds: (t, h) => holdStore.isHeld(t, h),
    vaultRoot: api.vault.files.root,
    terminalOwner,
    call: (capability, input, idempotencyKey) => api.call(capability, input, idempotencyKey ? { idempotencyKey } : undefined),
    launchTerminal: (ruleId, action, input, signal, expectedEnvironmentRevision) =>
      terminalEnvironments.use(ruleId, action, input, expectedEnvironmentRevision, async (env) => {
        if (!env) return (await api.call("agent.sessions.launch", input, { idempotencyKey: input.requestId, signal })) as { id: string };
        const agent = api.service<{ launch(request: typeof input & { env: Record<string, string> }, signal: AbortSignal): Promise<{ id: string }> }>("agentProtectedTerminal");
        if (!agent) throw errors.invalidInput("Agent CLI 的受保护启动服务不可用");
        return agent.launch({ ...input, env }, signal);
      }),
    notify: opts.notify ?? (() => undefined),
    publish: (t, p) => api.events.publish(t, p),
    now,
    zone,
  });
  const terminalEnvironments = registerTerminalEnvironments(api, svc, opts.credentialHost, opts.taskScanPrincipalCurrent);

  const publishActivation = ({ ruleId, activationId, trigger, finishedAt }: ActivationRecord) => {
    if (finishedAt) api.events.publish("entity.changed", { kind: "automation-activation", id: activationId, op: "updated" });
    else api.events.publish("automation.activated", { ruleId, activationId, trigger });
  };
  const scans = new TaskScanOccurrences(stateFiles, api.vault.vaultId, svc, () => api.service("taskDispatch"), now, publishActivation);
  if (opts.taskScanPrincipalCurrent) registerTaskScanTools(api, svc, scans, opts.taskScanPrincipalCurrent);
  api.provide("taskScanOccurrences", scans);
  ctx.effect(() => () => scans.close());
  const { authorize: authorizeScan } = taskScanAuthorization(api, opts.taskScanPrincipalCurrent);
  const exposure = new ExposureStore(api.vault.files, path.join(api.vault.stateDir, "plugins.json"));
  const assertStillExposed = (c: CapabilityContext, capability: string) => {
    c.signal.throwIfAborted();
    if (!isWorkbenchCaller(c.caller) && toolSelection(exposure.snapshot(), capability) !== true) throw errors.capabilityNotExposed(capability);
  };
  const assertRuleAction = (c: CapabilityContext, action: z.output<typeof Action> | undefined, scanCapability: string): void => {
    if (action?.kind === "terminal" && !isWorkbenchCaller(c.caller)) throw errors.permissionDenied("终端规则的外部手动使用需要固定目标批准");
    if (action?.kind !== "agent") return;
    if (action.input.source === "tasks") {
      if (!isWorkbenchCaller(c.caller)) authorizeScan(c, scanCapability, true);
      return;
    }
    if (!isWorkbenchCaller(c.caller)) throw errors.permissionDenied("固定提示词规则需要工作台");
    if (action.input.model?.startsWith("-") || action.input.effort?.startsWith("-")) throw errors.invalidInput("模型或推理强度不能以命令选项开头");
  };
  const cancelReceipt = automationReceipts(stateFiles.abs("automations/cancel-receipts.ndjson"));
  const followUps = new FollowUps(
    stateFiles,
    api.vault.vaultId,
    mid,
    () => api.service<TaskQueryLike>("taskQuery"),
    () => api.service<TaskFollowUpDispatch>("taskFollowUpDispatch"),
    now,
    (taskId) => api.events.publish("entity.changed", { kind: "task-follow-up", id: taskId, op: "updated" }),
  );
  api.provide("taskFollowUps", followUps);
  api.provide("taskScheduleAdmission", ((source, taskId) => source.kind === "follow-up"
    ? followUps.allowsDispatch(taskId, source.followUpId, source.scheduledFor)
    : scans.allowsDispatch(source.ruleId, source.ruleVersion, source.occurrenceId)) satisfies TaskScheduleAdmission);
  const taskReminders = new TaskReminderPlans(
    stateFiles, api.vault.vaultId, svc, () => api.service<TaskQueryLike>("taskQuery"), () => reminders, now,
    (id) => api.events.publish("entity.changed", { kind: "automation-rule", id, op: "updated" }),
  );
  const periodic = new PeriodicPlans(stateFiles, { vaultId: api.vault.vaultId, machineId: mid, instance: terminalOwner }, svc,
    ["mail", "versioning", "ssh", "ledger"], (plugin) => api.service<PeriodicPlanSource>(periodicPlanSourceService(plugin)), opts.periodicClock ?? { now: Date.now },
    (id, sourcePlugin, kind) => api.events.publish("entity.changed", { kind, id, sourcePlugin, op: "updated" }));
  api.provide(PERIODIC_PLANS_SERVICE, periodic);
  type TaskObservation = { comment(taskId: string, id: string, body: string): Promise<unknown> };
  type AgentObservation = { status(id: string): Promise<ObservationStatus> };
  const observations = new ObservationPlans(stateFiles, { vaultId: api.vault.vaultId, machineId: mid }, svc, () => reminders,
    async ({ kind, id }, signal) => {
      if (kind === "agent-session") return await api.service<AgentObservation>("agentObservation")?.status(id) ?? "unknown";
      const task = await api.service<TaskActivityQuery>("taskActivity")?.readTaskActivity(id, signal);
      if (!task) return "unknown";
      if (task.status === "completed") return "completed";
      if (task.execution.state === "none") return task.status === "not_started" ? "not_started" : "unknown";
      return task.execution.state === "waiting-input" ? "waiting_input" : task.execution.state;
    }, now, (id) => api.events.publish("entity.changed", { kind: "automation-activation", id, op: "updated" }),
    ({ kind }) => kind === "task" ? !!api.service<TaskActivityQuery>("taskActivity") : !!api.service<AgentObservation>("agentObservation"));
  const focus = opts.focusDeadline
    ? new FocusDeadlinePlans(opts.focusDeadline, svc, () => reminders, api.vault.vaultId, stateFiles.readOnly, now)
    : undefined;
  const reminders: ReminderDeliveries | undefined = opts.reminderNotifications
    ? new ReminderDeliveries(
        stateFiles,
        api.vault.vaultId,
        mid,
        svc,
        () => api.service("taskDispatch"),
        (taskId) => {
          try {
            return api.service<TaskQueryLike>("taskQuery")?.snapshot(taskId).path;
          } catch {
            return undefined;
          }
        },
        opts.reminderNotifications,
        now,
        publishActivation,
        (id) => taskReminders.taskAvailable(id),
        (id, revision, at) => taskReminders.current(id, revision, at),
        (id, revision, at) => observations.current(id, revision, at),
        async (taskId, id, body) => {
          const tasks = api.service<TaskObservation>("taskObservation");
          if (!tasks) throw errors.pluginDisabled("tasks");
          return tasks.comment(taskId, id, body);
        },
        focus,
      )
    : undefined;
  if (reminders) api.provide("automationReminderDeliveries", reminders);
  if (focus && reminders && opts.schedule !== false) api.provide("focusDeadlines", true);
  ctx.effect(() => {
    const check = () => {
      void followUps.tick().catch(() => undefined);
      void reminders?.recover().catch(() => undefined);
      void taskReminders.tick().catch(() => undefined);
      if (!stateFiles.readOnly) void scans.recover().catch(() => undefined);
      if (!stateFiles.readOnly) void svc.reconcileTerminals().catch(() => undefined);
    };
    const timer = opts.schedule === false ? undefined : setInterval(check, 5_000);
    if (timer) check();
    const checkDeadlinesAndObservations = () => {
      focus?.tick();
      void observations.tick();
      void periodic.tick().catch(() => undefined);
    };
    const observationTimer = opts.schedule === false ? undefined : setInterval(checkDeadlinesAndObservations, 1_000);
    if (observationTimer) checkDeadlinesAndObservations();
    return () => {
      clearInterval(timer);
      clearInterval(observationTimer);
      followUps.close();
      return Promise.all([taskReminders.close(), observations.close(), periodic.close(), focus?.close(), reminders?.close()]).then(() => undefined);
    };
  });
  const defaults = new DefaultTaskScan(stateFiles, api.vault.files, api.vault.repo, zone, now, (id) => api.events.publish("entity.changed", { kind: "automation-rule", id, op: "created" }));
  ctx.effect(() => () => defaults.close());

  const activate = async (ruleId: string, at: Date | null): Promise<ActivationRecord | null> => {
    const { action } = svc.rule(ruleId).data;
    if (action.kind === "agent") {
      const occurrence = at ? await scans.scheduled(ruleId, at) : await scans.invoke(ruleId);
      return occurrence ? scans.activation(occurrence) : null;
    }
    if (action.kind === "reminder") {
      if (!reminders) throw errors.invalidInput("当前提醒执行服务不可用");
      return reminders.activate(ruleId, at);
    }
    return svc.activateTerminal(ruleId, at ? "schedule" : "manual", at);
  };
  const scheduler = new Scheduler({
    activate: async (ruleId, at) => {
      await activate(ruleId, at);
    },
    lastActivatedFor: (id) => {
      const last = svc.lastActivatedFor(id);
      const kind = svc.rule(id).data.action.kind;
      const current = kind === "agent" ? scans.lastScheduledFor(id) : kind === "reminder" ? reminders?.lastScheduledFor(id) : null;
      return current && (!last || current > last) ? current : last;
    },
    now,
  });
  const scheduleLifetime = new AbortController();
  const resync = () => {
    if (opts.schedule === false || scheduleLifetime.signal.aborted) return;
    scheduler.sync(
      svc.rules().map((r) => ({
        id: r.id,
        version: r.version,
        enabled: r.data.enabled && !hasLegacyTerminalEnvironment(r.data.action),
        cron: r.data.trigger.cron,
        zone: r.data.trigger.zone,
        missedRunGraceMinutes: r.data.missedRunGraceMinutes,
        updatedAt: r.data.updatedAt,
      })),
    );
  };
  // 能力在启动对账完成后才开始服务；对账失败（例如 Vault 已关闭）只记录，不产生未处理拒绝
  const ready = svc
    .reconcileTerminals()
    .catch(() => 0)
    .then(resync)
    .catch(() => undefined);
  ctx.effect(() => () => {
    scheduleLifetime.abort();
    scheduler.stop();
    svc.abortAll();
  }); // 停用 → 作业全部释放，运行中的脚本/Agent 被终止
  // 服务提交规则（含专用任务扫描工具）或外部编辑规则文件后，增量更新 Cron。
  api.events.subscribe((e) => {
    const p = e.payload as { path?: string; kind?: string };
    if ((e.type === "vault.fileChanged" && p.path?.startsWith("Automations/")) || (e.type === "entity.changed" && p.kind === "automation-rule")) resync();
  });
  api.provide("automations", { holdRestoredInput: (taskId: string, inputHash: string) => holdStore.hold(taskId, inputHash), releaseHold: (taskId: string) => holdStore.release(taskId) });
  api.defineCapability(bindCapability(automationToolDescriptors.followUpsGet, (c, { taskId }) => followUps.read(taskId, isWorkbenchCaller(c.caller) ? undefined : automationToolOwner(c))));
  api.defineCapability(
    bindCapability(automationToolDescriptors.followUpsSchedule, (c, input) =>
      followUps.schedule(input, isWorkbenchCaller(c.caller) ? undefined : automationToolOwner(c), () => assertStillExposed(c, automationToolDescriptors.followUpsSchedule.name)),
    ),
  );
  api.defineCapability(
    bindCapability(automationToolDescriptors.followUpsCancel, (c, input) =>
      followUps.cancel(input, isWorkbenchCaller(c.caller) ? undefined : automationToolOwner(c), () => assertStillExposed(c, automationToolDescriptors.followUpsCancel.name)),
    ),
  );
  api.defineCapability(bindCapability(automationToolDescriptors.list, () => svc.rules().map(publicRule)));
  api.defineCapability(bindCapability(automationToolDescriptors.read, (_c, i) => publicRule(svc.rule(i.id))));
  api.defineCapability(
    bindCapability(automationToolDescriptors.create, async (c, i) => {
      const r = await svc.withRuleConfiguration(() => {
        assertRuleAction(c, i.action, taskScanToolDescriptors.create.name);
        return svc.create(i);
      });
      resync();
      return ruleWriteResult(c.caller, r);
    }),
  );
  api.defineCapability(
    bindCapability(automationToolDescriptors.update, async (c, i) => {
      const capability = taskScanToolDescriptors.update.name;
      const r = await svc.update(i.id, i.expectedVersion, i.patch, i.body, (current) => {
        assertRuleAction(c, current.data.action, capability);
        assertRuleAction(c, i.patch.action, capability);
        if (isWorkbenchCaller(c.caller)) return;
        const isScan = isTaskScanRule(current);
        const nextScan = !!i.patch.action && isTaskScanRule({ data: { ...current.data, action: i.patch.action } });
        if (i.patch.action && isScan !== nextScan) throw errors.permissionDenied("任务扫描工具仅可修改已有任务扫描规则");
        if (isScan && current.data.enabled) throw errors.invalidInput("请先停用任务扫描规则");
      });
      resync();
      return ruleWriteResult(c.caller, r);
    }),
  );
  const deleteRule = (id: string, expectedVersion?: string, assertCurrent?: () => void) => {
    const remove = () => svc.delete(id, expectedVersion, assertCurrent);
    return id === DEFAULT_TASK_SCAN_RULE_ID ? defaults.deleteRule(remove, assertCurrent) : remove();
  };
  const activations = () => [...svc.activations(), ...scans.list().map((occurrence) => scans.activation(occurrence)), ...(reminders?.list() ?? [])];
  const readCronOccurrence = (id: string) => scans.readPlanOccurrence(id) ?? reminders?.readPlanOccurrence(id) ?? null;
  registerPlanCatalogue(api, { rules: svc, followUps, taskReminders, observations, periodic, ...(focus && { focus }), defaults, now, activations, readCronOccurrence, deleteRule });
  const defineRuleTool = <I, O>(descriptor: CapabilityDescriptor<I, O>, handler: CapabilityDefinition<NoInfer<I>, NoInfer<O>>["handler"]) =>
    api.defineCapability(opts.taskScanPrincipalCurrent ? bindCapability(descriptor, handler) : { ...descriptor, handler });
  defineRuleTool(taskScanToolDescriptors.delete, async (c, i) => {
    if (!isWorkbenchCaller(c.caller) && !i.expectedVersion) throw errors.invalidInput("外部删除规则需要规则版本");
    await deleteRule(i.id, i.expectedVersion, () => c.signal.throwIfAborted());
    resync();
    return { ok: true as const };
  });
  defineRuleTool(taskScanToolDescriptors.setEnabled, async (c, i) => {
    if (!isWorkbenchCaller(c.caller) && !i.enabled && !i.expectedVersion) throw errors.invalidInput("外部停用规则需要规则版本");
    const r = await svc.setEnabled(
      i.id,
      i.enabled,
      (action) => {
        assertRuleAction(c, action, taskScanToolDescriptors.enable.name);
        if (!isWorkbenchCaller(c.caller) && action.kind === "agent" && !i.expectedVersion) throw errors.invalidInput("外部启用任务扫描需要规则版本");
      },
      i.expectedVersion,
      () => c.signal.throwIfAborted(),
    );
    resync();
    return ruleWriteResult(c.caller, r);
  });
  defineRuleTool(taskScanToolDescriptors.preview, (c, i) => svc.preview(i.id, i.expectedVersion, c.signal));
  api.defineCapability(bindCapability(automationToolDescriptors.plansPreviewRuleDraft, (context, input) =>
    svc.previewDraft(input.trigger, "action" in input ? input.action : undefined, "body" in input ? input.body : "", context.signal)));
  api.defineCapability(
    bindCapability(automationToolDescriptors.runNow, async ({ caller, subject, signal }, { id, expectedVersion, intentId }) => {
      signal.throwIfAborted();
      let a: ActivationRecord | null;
      if (isWorkbenchCaller(caller) && intentId === undefined && expectedVersion === undefined) {
        a = await activate(id, null);
      } else {
        if (!intentId || !expectedVersion) throw errors.invalidInput("手动运行须提供规则版本和固定的执行意图");
        const principal = { caller, subject: subject ?? caller };
        const workbench = isWorkbenchCaller(caller);
        const knownScan = workbench && scans.hasWorkbenchIntent(intentId, principal);
        const currentAction = workbench && !knownScan ? svc.rules().find((rule) => rule.id === id)?.data.action.kind : undefined;
        if (knownScan || currentAction === "agent") {
          const occurrence = await scans.invokeWorkbench({ ruleId: id, expectedVersion, intentId }, principal, signal);
          a = scans.activation(occurrence);
        } else if (currentAction === "terminal") {
          a = await svc.activateTerminal(id, "manual", null, expectedVersion);
        } else {
          if (!reminders) throw errors.invalidInput("当前提醒执行服务不可用");
          a = await reminders.activateManual(id, expectedVersion, caller, intentId);
        }
      }
      if (!a) throw errors.notFound("规则未产生发生记录");
      return { activationId: a.activationId, summary: a.summary };
    }),
  );
  api.defineCapability(
    bindCapability(automationToolDescriptors.cancel, (c, i) => {
      const { id, runId, activationId, intentId } = i;
      if (runId === undefined || activationId === undefined || intentId === undefined) {
        if (!isWorkbenchCaller(c.caller) || runId !== undefined || activationId !== undefined || intentId !== undefined) {
          throw errors.invalidInput("取消规则运行需要原运行、发生和操作意图");
        }
        return { cancelled: svc.cancel(id) };
      }
      return svc.withRuleConfiguration(() => {
        assertStillExposed(c, automationToolDescriptors.cancel.name);
        svc.assertRuleRun(id, runId, activationId);
        const cancelled = () => ({ cancelled: svc.cancelRun(runId) });
        if (isWorkbenchCaller(c.caller)) return cancelled();
        stateFiles.assertWritable();
        if (!terminalOwner) throw errors.permissionDenied("无法确认运行的本机 Vault");
        const owner = hashOwner(terminalOwner, automationToolOwner(c));
        return cancelReceipt(owner, automationToolDescriptors.cancel.name, intentId, i, Cancelled, cancelled);
      });
    }),
  );
  api.defineCapability(
    bindCapability(automationToolDescriptors.activations, () =>
      activations().sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.activationId.localeCompare(a.activationId)),
    ),
  );
  defineRuleTool(taskScanToolDescriptors.dispatches, (_c, { ruleId, activationId }) => ({ dispatches: scans.dispatches(ruleId, activationId) }));
  api.defineCapability(bindCapability(automationToolDescriptors.runsList, (_c, i) => svc.runs(i.limit)));
  api.defineCapability(
    bindCapability(automationToolDescriptors.runsRead, ({ caller }, i) => {
      const run = svc.runDetail(i.runId);
      if (isWorkbenchCaller(caller)) return run;
      const { ruleId, actionKind, state, startedAt, finishedAt, exitCode } = run.data as Record<string, unknown>;
      return { ...run, body: "", data: { ruleId, actionKind, state, startedAt, finishedAt, exitCode } };
    }),
  );
  api.defineCapability(
    bindCapability(automationToolDescriptors.runsCancel, async (_c, i) => {
      await ready;
      const { live, data } = svc.runDetail(i.runId);
      const cancelled = live && svc.cancelRun(i.runId);
      return { cancelled, state: cancelled ? "cancelling" : typeof data.state === "string" ? data.state : "unknown" };
    }),
  );
  return { service: svc, scheduler, periodic };
}
