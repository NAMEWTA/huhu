import path from "node:path";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { machineId } from "@huhu/vault";
import { AutomationActionSchema, errors } from "@huhu/contracts";
import { z } from "zod";
import { ClaimStore } from "./claims.js";
import { HoldStore } from "./holds.js";
import { Scheduler } from "./scheduler.js";
import { AutomationsService, type AutomationsDeps, type TaskQueryLike, type WorkerInput, type RunOutcome } from "./service.js";
import { hasRunDir, killRound, roundActive } from "./supervised.js";
import { processWorker, roundDir, type ResolveLaunch } from "./worker.js";

export { AutomationsService } from "./service.js";
export { Scheduler } from "./scheduler.js";

const Trigger = z.object({ preset: z.string(), cron: z.string(), zone: z.string() });
const Action = AutomationActionSchema;
/** Agent 执行与命令执行永不对外（security.md §1）：外部入口即使被开放 automations.create/update/setEnabled，也不能创建、修改或启用会启动 Agent 或运行命令的规则。 */
function assertNoAgentAction(caller: string, action: { kind: string; input?: { source: string; model?: string | null } } | undefined): void {
  if ((action?.kind === "agent" || action?.kind === "terminal") && caller !== "desktop") throw errors.permissionDenied("会启动 Agent 或运行命令的规则（仅桌面可用）");
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
  spaceState?: (spaceId: string) => { state: "ok" | "missing" | "inaccessible"; root?: string };
  /** CLI 是否已检测到（来自智能体目录的检测结果）。 */
  cliAvailable?: (provider: string) => boolean;
  /** 启动合成：由 agent-cli 的 agent.launch.resolve 提供；默认经能力调用。 */
  resolveLaunch?: ResolveLaunch;
  /** 扫描前刷新 CLI 可用性（见 AutomationsDeps.refreshClis）。 */
  refreshClis?: () => Promise<void>;
  schedule?: boolean;
}

export function apply(ctx: Context, api: HuhuApi, opts: AutomationsOptions = {}): { service: AutomationsService; scheduler: Scheduler } {
  const mid = machineId();
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
    notify: opts.notify ?? (() => undefined),
    publish: (t, p) => api.events.publish(t, p),
    now: () => new Date(),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    machineId: mid,
  });

  const scheduler = new Scheduler({
    activate: async (ruleId, at, trigger) => {
      await svc.activate(ruleId, trigger, at);
    },
    lastActivatedFor: (id) => svc.lastActivatedFor(id),
    now: () => new Date(),
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
        await svc.delete(i.id);
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
      handler: (_c, i) => svc.preview(i.id),
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
        const a = await svc.activate(i.id, "manual");
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
      handler: () => svc.activations() as never,
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
