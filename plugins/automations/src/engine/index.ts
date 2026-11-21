import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { filesystemIdentity, machineId, VaultFiles } from "@huhu/vault";
import type { TaskFollowUpDispatch } from "../../../tasks/src/engine/index.js";
import { AutomationActionSchema, errors, isWorkbenchCaller } from "@huhu/contracts";
import { z } from "zod";
import { DEFAULT_TASK_SCAN_RULE_ID, DEFAULT_TASK_SCAN_SERVICE, DefaultTaskScan } from "./default-task-scan.js";
import { FollowUpCancelInput, FollowUpLookup, FollowUps, FollowUpScheduleInput, FollowUpView } from "./follow-ups.js";
import { HoldStore } from "./holds.js";
import { ReminderDeliveries, type ReminderNotifications } from "./reminder-deliveries.js";
import { MissedRunGraceMinutes, Rule, RuleVersion, Trigger } from "./rule-schemas.js";
import { Scheduler } from "./scheduler.js";
import { AutomationsService, hasLegacyTerminalEnvironment, TASK_SCAN_INSTRUCTIONS_LIMIT, type ActivationRecord, type TaskQueryLike } from "./service.js";
import { TaskScanOccurrenceId, TaskScanOccurrences } from "./task-scan-occurrences.js";
import { registerTaskScanTools, type TaskScanPrincipalCheck } from "./task-scan-tools.js";
import { registerTerminalEnvironments, type AutomationCredentialHost } from "./terminal-environment.js";

export { AutomationsService } from "./service.js";
export { DEFAULT_TASK_SCAN_RULE_ID, DEFAULT_TASK_SCAN_SERVICE, type DefaultTaskScanService } from "./default-task-scan.js";
export { Scheduler } from "./scheduler.js";
export { taskScanToolDescriptors, type TaskScanPrincipalCheck } from "./task-scan-tools.js";
export { terminalEnvironmentDescriptors } from "./terminal-environment.js";

const Action = AutomationActionSchema;
/** 外部任务扫描使用独立能力授权。 */
function assertGenericRuleAction(caller: string, action: z.output<typeof Action> | undefined): void {
  if ((action?.kind === "agent" || action?.kind === "terminal") && !isWorkbenchCaller(caller)) throw errors.permissionDenied("会启动 Agent 或运行命令的规则（仅工作台可用）");
  const model = action?.kind === "agent" && action.input.source === "prompt" ? action.input.model : undefined;
  if (model && model.startsWith("-")) throw errors.invalidInput("model 不能以 - 开头");
}

function publicRule(value: ReturnType<AutomationsService["rule"]>): z.output<typeof Rule> {
  if (value.data.action.kind !== "terminal") return value;
  const { envRefs: _, ...action } = value.data.action;
  return { ...value, data: { ...value.data, action, legacyEnvironment: hasLegacyTerminalEnvironment(value.data.action) } };
}

export interface AutomationsOptions {
  zone?: () => string;
  notify?: (n: { title: string; module: string }) => void;
  reminderNotifications?: ReminderNotifications;
  credentialHost?: AutomationCredentialHost;
  spaceState?: (spaceId: string) => { state: "ok" | "missing" | "inaccessible"; root?: string };
  /** CLI 是否已检测到（来自智能体目录的检测结果）。 */
  cliAvailable?: (provider: string) => boolean;
  /** 扫描前刷新 CLI 可用性（见 AutomationsDeps.refreshClis）。 */
  refreshClis?: () => Promise<void>;
  /** 配合 Engine 静态登记任务扫描描述，复查已认证身份是否仍可用。 */
  taskScanPrincipalCurrent?: TaskScanPrincipalCheck;
  schedule?: boolean;
  now?: () => Date;
}

export function apply(ctx: Context, api: HuhuApi, opts: AutomationsOptions = {}): { service: AutomationsService; scheduler: Scheduler } {
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
  const terminalEnvironments = registerTerminalEnvironments(api, svc, opts.credentialHost);

  const publishActivation = ({ ruleId, activationId, trigger, finishedAt }: ActivationRecord) => {
    if (finishedAt) api.events.publish("entity.changed", { kind: "automation-activation", id: activationId, op: "updated" });
    else api.events.publish("automation.activated", { ruleId, activationId, trigger });
  };
  const scans = new TaskScanOccurrences(stateFiles, api.vault.vaultId, svc, () => api.service("taskDispatch"), now, publishActivation);
  if (opts.taskScanPrincipalCurrent) registerTaskScanTools(api, svc, scans, opts.taskScanPrincipalCurrent);
  api.provide("taskScanOccurrences", scans);
  ctx.effect(() => () => scans.close());
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
  const reminders = opts.reminderNotifications
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
      )
    : undefined;
  if (reminders) api.provide("automationReminderDeliveries", reminders);
  ctx.effect(() => {
    const check = () => {
      void followUps.tick().catch(() => undefined);
      void reminders?.recover().catch(() => undefined);
      if (!stateFiles.readOnly) void scans.recover().catch(() => undefined);
      if (!stateFiles.readOnly) void svc.reconcileTerminals().catch(() => undefined);
    };
    const timer = opts.schedule === false ? undefined : setInterval(check, 5_000);
    if (timer) check();
    return () => {
      clearInterval(timer);
      followUps.close();
      return reminders?.close();
    };
  });
  const defaults = new DefaultTaskScan(stateFiles, api.vault.files, api.vault.repo, zone, now, (id) => api.events.publish("entity.changed", { kind: "automation-rule", id, op: "created" }));
  api.provide(DEFAULT_TASK_SCAN_SERVICE, defaults);
  ctx.effect(() => () => defaults.close());

  const activate = async (ruleId: string, at: Date | null): Promise<ActivationRecord | null> => {
    const { action } = svc.rule(ruleId).data;
    if (action.kind === "agent") {
      const occurrence = at ? await scans.scheduled(ruleId, at) : await scans.invoke(ruleId);
      return occurrence ? scans.activation(occurrence) : null;
    }
    if (action.kind === "reminder" && reminders) return reminders.activate(ruleId, at);
    return svc.activateNonAgent(ruleId, at ? "schedule" : "manual", at);
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
  const sync = () =>
    scheduler.sync(
      svc.rules().map((r) => ({
        id: r.id,
        enabled: r.data.enabled && !hasLegacyTerminalEnvironment(r.data.action),
        cron: r.data.trigger.cron,
        zone: r.data.trigger.zone,
        missedRunGraceMinutes: r.data.missedRunGraceMinutes,
        updatedAt: r.data.updatedAt,
      })),
    );
  // 能力在启动对账完成后才开始服务；对账失败（例如 Vault 已关闭）只记录，不产生未处理拒绝
  const ready = svc
    .reconcileTerminals()
    .catch(() => 0)
    .then(() => {
      if (opts.schedule !== false) sync();
    })
    .catch(() => undefined);
  ctx.effect(() => () => {
    scheduler.stop();
    svc.abortAll();
  }); // 停用 → 作业全部释放，运行中的脚本/Agent 被终止
  const resync = () => {
    if (opts.schedule !== false) sync();
  };

  // 规则文件被恢复/外部修改时重建作业（否则内存里的 Cron 会继续按旧设置激活）
  api.events.subscribe((e) => {
    const p = e.payload as { path?: string; kind?: string };
    if ((e.type === "vault.fileChanged" && p.path?.startsWith("Automations/")) || (e.type === "entity.changed" && p.kind === "automation-rule")) resync();
  });
  api.provide("automations", { holdRestoredInput: (taskId: string, inputHash: string) => holdStore.hold(taskId, inputHash), releaseHold: (taskId: string) => holdStore.release(taskId) });

  const Id = z.object({ id: z.string() });
  api.defineCapability(
    def({
      name: "automations.followUps.get",
      plugin: "automations",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: FollowUpLookup,
      output: FollowUpView.nullable(),
      handler: ({ caller }, { taskId }) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看任务跟进");
        return followUps.read(taskId);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.followUps.schedule",
      plugin: "automations",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: FollowUpScheduleInput,
      output: FollowUpView,
      handler: ({ caller }, input) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("安排任务跟进");
        return followUps.schedule(input);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.followUps.cancel",
      plugin: "automations",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: FollowUpCancelInput,
      output: FollowUpView,
      handler: ({ caller }, input) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("取消任务跟进");
        return followUps.cancel(input);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.list",
      plugin: "automations",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({}),
      output: z.array(Rule),
      handler: async () => {
        await ready;
        return svc.rules().map(publicRule);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.read",
      plugin: "automations",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: Id,
      output: Rule,
      handler: async (_c, i) => {
        await ready;
        return publicRule(svc.rule(i.id));
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.create",
      plugin: "automations",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: z.object({ title: z.string(), trigger: Trigger, action: Action, body: z.string().optional(), missedRunGraceMinutes: MissedRunGraceMinutes.optional() }),
      output: Rule,
      handler: async (c, i) => {
        assertGenericRuleAction(c.caller, i.action);
        const r = await svc.create(i);
        resync();
        return publicRule(r);
      },
    }),
  );
  api.defineCapability(
    def({
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
      handler: async (c, i) => {
        assertGenericRuleAction(c.caller, i.patch.action);
        const r = await svc.update(i.id, i.expectedVersion, i.patch, i.body, (current) => assertGenericRuleAction(c.caller, current.data.action));
        resync();
        return publicRule(r);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.delete",
      plugin: "automations",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Id.extend({ expectedVersion: RuleVersion.optional() }),
      output: z.object({ ok: z.literal(true) }),
      handler: async (c, i) => {
        if (!isWorkbenchCaller(c.caller) && !i.expectedVersion) throw errors.invalidInput("外部删除规则需要规则版本");
        if (i.id === DEFAULT_TASK_SCAN_RULE_ID) await defaults.deleteRule(() => svc.delete(i.id, i.expectedVersion));
        else await svc.delete(i.id, i.expectedVersion);
        resync();
        return { ok: true as const };
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.setEnabled",
      plugin: "automations",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Id.extend({ enabled: z.boolean(), expectedVersion: RuleVersion.optional() }),
      output: Rule,
      handler: async (c, i) => {
        if (!isWorkbenchCaller(c.caller) && !i.enabled && !i.expectedVersion) throw errors.invalidInput("外部停用规则需要规则版本");
        const r = await svc.setEnabled(i.id, i.enabled, (action) => assertGenericRuleAction(c.caller, action), i.expectedVersion);
        resync();
        return publicRule(r);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.preview",
      plugin: "automations",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: Id.extend({ expectedVersion: RuleVersion.optional() }),
      output: z.object({ ruleVersion: z.string(), next: z.array(z.string()), tasksDisabled: z.boolean(), candidates: z.array(z.unknown()), skipped: z.array(z.unknown()) }),
      handler: (_c, i) => svc.preview(i.id, i.expectedVersion),
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runNow",
      plugin: "automations",
      scope: "execute",
      exposable: true,
      defaultExposed: false,
      timeoutMs: 30 * 60_000,
      input: Id.extend({ expectedVersion: RuleVersion.optional(), intentId: z.uuidv4().optional() }),
      output: z.object({ activationId: z.string(), summary: z.unknown() }),
      handler: async ({ caller, signal }, { id, expectedVersion, intentId }) => {
        signal.throwIfAborted();
        let a: ActivationRecord | null;
        if (isWorkbenchCaller(caller) && intentId === undefined && expectedVersion === undefined) {
          a = await activate(id, null);
        } else {
          if (!intentId || !expectedVersion) throw errors.invalidInput("运行提醒须提供规则版本和固定的执行意图");
          if (!reminders) throw errors.invalidInput("当前提醒执行服务不可用");
          a = await reminders.activateManual(id, expectedVersion, caller, intentId);
        }
        if (!a) throw errors.notFound("规则未产生发生记录");
        return { activationId: a.activationId, summary: a.summary };
      },
    }),
  );
  api.defineCapability(
    def({ name: "automations.cancel", plugin: "automations", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: z.object({ cancelled: z.boolean() }), handler: (_c, i) => ({ cancelled: svc.cancel(i.id) }) }),
  );
  api.defineCapability(
    def({
      name: "automations.activations",
      plugin: "automations",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({}),
      output: z.array(z.object({ activationId: z.string(), ruleId: z.string(), trigger: z.string(), scheduledFor: z.string().nullable(), startedAt: z.string(), finishedAt: z.string().optional(), summary: z.unknown().optional() })),
      handler: () =>
        [...svc.activations(), ...scans.list().map((occurrence) => scans.activation(occurrence)), ...(reminders?.list() ?? [])].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.activationId.localeCompare(a.activationId)),
    }),
  );
  const RunRow = z.object({
    id: z.string(),
    kind: z.literal("automation-run"),
    state: z.string(),
    title: z.string(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    live: z.boolean(),
  });
  api.defineCapability(
    def({
      name: "automations.activations.dispatches",
      plugin: "automations",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: z.strictObject({ ruleId: z.string().min(1).max(128), activationId: TaskScanOccurrenceId }),
      output: z.strictObject({ dispatches: z.array(z.strictObject({ taskId: z.string(), dispatchId: z.string(), state: z.enum(["pending", "accepted"]), runId: z.string().nullable() })) }),
      handler: (_c, { ruleId, activationId }) => ({ dispatches: scans.dispatches(ruleId, activationId) }),
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runs.list",
      plugin: "automations",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: z.object({ limit: z.number().int().min(1).max(500).optional() }),
      output: z.array(RunRow),
      handler: async (_c, i) => {
        await ready;
        return svc.runs(i.limit);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runs.read",
      plugin: "automations",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: z.object({ runId: z.string() }),
      output: z.object({ id: z.string(), kind: z.literal("automation-run"), version: z.string(), body: z.string(), data: z.record(z.string(), z.unknown()), title: z.string(), live: z.boolean() }),
      handler: async ({ caller }, i) => {
        await ready;
        const run = svc.runDetail(i.runId);
        if (isWorkbenchCaller(caller)) return run;
        const { ruleId, actionKind, state, startedAt, finishedAt, exitCode } = run.data as Record<string, unknown>;
        return { ...run, body: "", data: { ruleId, actionKind, state, startedAt, finishedAt, exitCode } };
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runs.cancel",
      plugin: "automations",
      scope: "execute",
      exposable: true,
      defaultExposed: false,
      input: z.object({ runId: z.string() }),
      output: z.object({ cancelled: z.boolean(), state: z.string() }),
      handler: async (_c, i) => {
        await ready;
        const { live, data } = svc.runDetail(i.runId);
        const cancelled = live && svc.cancelRun(i.runId);
        return { cancelled, state: cancelled ? "cancelling" : typeof data.state === "string" ? data.state : "unknown" };
      },
    }),
  );
  return { service: svc, scheduler };
}
