import path from "node:path";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { machineId, VaultFiles } from "@huhu/vault";
import type { TaskFollowUpDispatch } from "../../../tasks/src/engine/index.js";
import { AutomationActionSchema, errors, isWorkbenchCaller } from "@huhu/contracts";
import { z } from "zod";
import { ClaimStore } from "./claims.js";
import { DEFAULT_TASK_SCAN_RULE_ID, DEFAULT_TASK_SCAN_SERVICE, DefaultTaskScan } from "./default-task-scan.js";
import { FollowUpCancelInput, FollowUpLookup, FollowUps, FollowUpScheduleInput, FollowUpView } from "./follow-ups.js";
import { HoldStore } from "./holds.js";
import { ReminderDeliveries, type ReminderNotifications } from "./reminder-deliveries.js";
import { Scheduler } from "./scheduler.js";
import { AutomationsService, type ActivationRecord, type AutomationsDeps, type TaskQueryLike, type WorkerInput, type RunOutcome } from "./service.js";
import { hasRunDir, killRound, roundActive } from "./supervised.js";
import { TaskScanOccurrences } from "./task-scan-occurrences.js";
import { registerTerminalEnvironments, type AutomationCredentialHost } from "./terminal-environment.js";
import { processWorker, roundDir, type ResolveLaunch } from "./worker.js";

export { AutomationsService } from "./service.js";
export { DEFAULT_TASK_SCAN_RULE_ID, DEFAULT_TASK_SCAN_SERVICE, type DefaultTaskScanService } from "./default-task-scan.js";
export { Scheduler } from "./scheduler.js";
export { terminalEnvironmentDescriptors } from "./terminal-environment.js";

const Trigger = z.object({ preset: z.string(), cron: z.string(), zone: z.string() });
const Action = AutomationActionSchema;
/** Agent 执行与命令执行永不对外（security.md §1）：外部入口即使被开放 automations.create/update/setEnabled，也不能创建、修改或启用会启动 Agent 或运行命令的规则。 */
function assertNoAgentAction(caller: string, action: { kind: string; input?: { source: string; model?: string | null } } | undefined): void {
  if ((action?.kind === "agent" || action?.kind === "terminal") && !isWorkbenchCaller(caller)) throw errors.permissionDenied("会启动 Agent 或运行命令的规则（仅工作台可用）");
  const model = action?.input && "model" in action.input ? action.input.model : undefined;
  if (model && model.startsWith("-")) throw errors.invalidInput("model 不能以 - 开头");
}

const Rule = z.object({
  id: z.string(),
  path: z.string(),
  version: z.string(),
  body: z.string(),
  data: z.object({ title: z.string(), enabled: z.boolean(), trigger: Trigger, missedRunGraceMinutes: z.number(), action: Action }).passthrough(),
});

export interface AutomationsOptions {
  zone?: () => string;
  /** 注入 worker（测试用替身）；默认以 provider 无界面模式启动外部进程。 */
  worker?: (i: WorkerInput) => Promise<RunOutcome | null>;
  /** 注入接管函数（测试用替身）。 */
  adopt?: AutomationsDeps["adopt"];
  notify?: (n: { title: string; module: string }) => void;
  reminderNotifications?: ReminderNotifications;
  credentialHost?: AutomationCredentialHost;
  spaceState?: (spaceId: string) => { state: "ok" | "missing" | "inaccessible"; root?: string };
  /** CLI 是否已检测到（来自智能体目录的检测结果）。 */
  cliAvailable?: (provider: string) => boolean;
  /** 启动合成：由 agent-cli 的 agent.launch.resolve 提供；默认经能力调用。 */
  resolveLaunch?: ResolveLaunch;
  /** 扫描前刷新 CLI 可用性（见 AutomationsDeps.refreshClis）。 */
  refreshClis?: () => Promise<void>;
  schedule?: boolean;
  now?: () => Date;
}

export function apply(ctx: Context, api: HuhuApi, opts: AutomationsOptions = {}): { service: AutomationsService; scheduler: Scheduler } {
  const mid = machineId();
  const now = opts.now ?? (() => new Date());
  const zone = opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const cliAvailable = opts.cliAvailable ?? (() => false);
  const runsDir = path.join(api.vault.stateDir, "runtime", mid, "runs");
  const resolveLaunch: ResolveLaunch = opts.resolveLaunch ?? ((i) => api.call("agent.launch.resolve", i) as ReturnType<ResolveLaunch>);
  const realWorker = processWorker({ runsDir, resolveLaunch });
  const holdStore = new HoldStore(path.join(api.vault.stateDir, "automations", "holds.json"));
  const svc = new AutomationsService({
    repo: api.vault.repo,
    claims: new ClaimStore(path.join(api.vault.stateDir, "automations", "claims")),
    activationsDir: path.join(api.vault.stateDir, "automations", "activations"),
    taskQuery: () => api.service<TaskQueryLike>("taskQuery"),
    worker: opts.worker ?? realWorker.run,
    ...(opts.worker ? (opts.adopt ? { adopt: opts.adopt } : {}) : { adopt: realWorker.adopt }),
    runAlive: (runId, round) => roundActive(roundDir(runsDir, runId, round)),
    killRound: (runId, round) => killRound(roundDir(runsDir, runId, round)),
    hasRound: (runId, round) => hasRunDir(roundDir(runsDir, runId, round)),
    spaceState: opts.spaceState ?? (() => ({ state: "missing" })),
    cliAvailable,
    ...(opts.refreshClis ? { refreshClis: opts.refreshClis } : {}),
    holds: (t, h) => holdStore.isHeld(t, h),
    vaultRoot: api.vault.files.root,
    readVaultFile: (rel) => {
      try {
        return api.vault.files.read(rel)?.bytes.toString("utf8") ?? null;
      } catch {
        return null;
      }
    },
    call: (capability, input, idempotencyKey) => api.call(capability, input, idempotencyKey ? { idempotencyKey } : undefined),
    launchTerminal: (ruleId, action, input, signal) =>
      terminalEnvironments.use(ruleId, action, input, async (env) => {
        if (!env) return (await api.call("agent.sessions.launch", input, { idempotencyKey: input.requestId, signal })) as { id: string };
        if (input.envRefs) throw errors.invalidInput("移除旧保险箱引用后再使用规则自有环境");
        const agent = api.service<{ launch(request: typeof input & { env: Record<string, string> }, signal: AbortSignal): Promise<{ id: string }> }>("agentProtectedTerminal");
        if (!agent) throw errors.invalidInput("Agent CLI 的受保护启动服务不可用");
        return agent.launch({ ...input, env }, signal);
      }),
    notify: opts.notify ?? (() => undefined),
    publish: (t, p) => api.events.publish(t, p),
    now,
    zone,
    machineId: mid,
  });
  const terminalEnvironments = registerTerminalEnvironments(api, svc, opts.credentialHost);

  const stateFiles = new VaultFiles(api.vault.stateDir, undefined, api.vault.files.readOnly);
  const publishActivation = ({ ruleId, activationId, trigger, finishedAt }: ActivationRecord) => {
    if (finishedAt) api.events.publish("entity.changed", { kind: "automation-activation", id: activationId, op: "updated" });
    else api.events.publish("automation.activated", { ruleId, activationId, trigger });
  };
  const scans = new TaskScanOccurrences(stateFiles, api.vault.vaultId, svc, () => api.service("taskDispatch"), now, publishActivation);
  api.provide("taskScanOccurrences", scans);
  ctx.effect(() => () => scans.close());
  const followUps = new FollowUps(
    stateFiles,
    api.vault.vaultId,
    mid,
    () => api.service<TaskQueryLike>("taskQuery"),
    () => api.service<TaskFollowUpDispatch>("taskFollowUpDispatch"),
    now,
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
    return svc.activate(ruleId, at ? "schedule" : "manual", at);
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
  const sync = () => scheduler.sync(svc.rules().map((r) => ({ id: r.id, enabled: r.data.enabled, cron: r.data.trigger.cron, zone: r.data.trigger.zone, missedRunGraceMinutes: r.data.missedRunGraceMinutes, updatedAt: r.data.updatedAt })));
  // 能力在启动对账完成后才开始服务；对账失败（例如 Vault 已关闭）只记录，不产生未处理拒绝
  const ready = svc
    .reconcile()
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
  api.provide("automations", { activeFor: (ids: string[]) => svc.activeFor(ids), holdRestoredInput: (taskId: string, inputHash: string) => holdStore.hold(taskId, inputHash), releaseHold: (taskId: string) => holdStore.release(taskId) });

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
      name: "automations.runs.activeFor",
      plugin: "automations",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({ taskIds: z.array(z.string()).max(1000) }),
      output: z.record(z.string(), z.boolean()),
      handler: (_c, i) => svc.activeFor(i.taskIds),
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
        return svc.rules() as never;
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
        return svc.rule(i.id) as never;
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
      input: z.object({ title: z.string(), trigger: Trigger, action: Action, body: z.string().optional(), missedRunGraceMinutes: z.number().int().min(0).max(1440).optional() }),
      output: Rule,
      handler: async (c, i) => {
        assertNoAgentAction(c.caller, i.action as never);
        const r = await svc.create(i as never);
        resync();
        return r as never;
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
        patch: z.object({ title: z.string().optional(), trigger: Trigger.optional(), action: Action.optional(), missedRunGraceMinutes: z.number().int().min(0).max(1440).optional() }),
        body: z.string().max(20_000).optional(),
      }),
      output: Rule,
      handler: async (c, i) => {
        assertNoAgentAction(c.caller, i.patch.action as never);
        {
          assertNoAgentAction(c.caller, svc.rule(i.id).data.action as never);
        }
        const r = await svc.update(i.id, i.expectedVersion, i.patch as never, i.body);
        resync();
        return r as never;
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
      input: Id,
      output: z.object({ ok: z.literal(true) }),
      handler: async (_c, i) => {
        if (i.id === DEFAULT_TASK_SCAN_RULE_ID) await defaults.deleteRule(() => svc.delete(i.id));
        else await svc.delete(i.id);
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
      input: Id.extend({ enabled: z.boolean() }),
      output: Rule,
      handler: async (c, i) => {
        if (i.enabled) assertNoAgentAction(c.caller, svc.rule(i.id).data.action as never);
        /* 暂停永远允许 */ const r = await svc.setEnabled(i.id, i.enabled);
        resync();
        return r as never;
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
      input: Id,
      output: z.object({ next: z.array(z.string()), tasksDisabled: z.boolean(), candidates: z.array(z.unknown()), skipped: z.array(z.unknown()) }),
      handler: (_c, i) => (svc.rule(i.id).data.action.kind === "agent" ? scans.preview(i.id) : svc.preview(i.id)),
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runNow",
      plugin: "automations",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      timeoutMs: 30 * 60_000,
      input: Id,
      output: z.object({ activationId: z.string(), summary: z.unknown() }),
      handler: async (_c, i) => {
        const a = await activate(i.id, null);
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
    kind: z.enum(["task-run", "automation-run"]),
    state: z.string(),
    title: z.string(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    attempt: z.number().nullable(),
    live: z.boolean(),
  });
  api.defineCapability(
    def({
      name: "automations.runs.list",
      plugin: "automations",
      scope: "read",
      exposable: false,
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
      exposable: false,
      defaultExposed: false,
      input: z.object({ runId: z.string() }),
      output: z.object({ id: z.string(), kind: z.enum(["task-run", "automation-run"]), version: z.string(), body: z.string(), data: z.record(z.string(), z.unknown()), title: z.string(), live: z.boolean(), canRetry: z.boolean() }),
      handler: async (_c, i) => {
        await ready;
        return svc.runDetail(i.runId);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runs.answer",
      plugin: "automations",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      input: z.object({
        runId: z.string(),
        answers: z
          .array(z.object({ id: z.string(), answer: z.string() }))
          .min(1)
          .max(20),
      }),
      output: z.object({ resumed: z.boolean() }),
      handler: async (_c, i) => {
        await ready;
        return svc.answerRun(i.runId, i.answers);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runs.cancel",
      plugin: "automations",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      input: z.object({ runId: z.string() }),
      output: z.object({ cancelled: z.boolean() }),
      handler: async (_c, i) => {
        await ready;
        return svc.cancelRunById(i.runId);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "automations.runs.retry",
      plugin: "automations",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      input: z.object({ runId: z.string() }),
      output: z.object({ runId: z.string() }),
      handler: async (_c, i) => {
        await ready;
        return svc.retryRun(i.runId);
      },
    }),
  );
  return { service: svc, scheduler };
}
