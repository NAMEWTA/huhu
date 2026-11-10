import path from "node:path";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { machineId } from "@huhu/vault";
import { errors } from "@huhu/contracts";
import { z } from "zod";
import { ClaimStore } from "./claims.js";
import { ScriptStore } from "./scripts.js";
import { HoldStore } from "./holds.js";
import { Scheduler } from "./scheduler.js";
import { AutomationsService, type TaskQueryLike, type WorkerInput, type RunOutcome } from "./service.js";
import { processWorker } from "./worker.js";

export { AutomationsService } from "./service.js";
export { Scheduler } from "./scheduler.js";

const Trigger = z.object({ preset: z.string(), cron: z.string(), zone: z.string() });
const Action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scan_agent_tasks"), maxConcurrent: z.number().int().min(1).max(4).default(1) }),
  z.object({ kind: z.literal("agent_prompt"), spaceId: z.string(), provider: z.string(), model: z.string().nullable().default(null), effort: z.string().nullable().default(null), fast: z.boolean().default(false) }),
  z.object({ kind: z.literal("script"), scriptId: z.string(), args: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal("notify"), channel: z.literal("in_app"), text: z.string() }),
]);
/** Agent 执行永不对外（security.md §1）：外部入口即使被开放 automations.create/update/setEnabled，也不能创建、修改或启用 agent_prompt 规则。 */
function assertNoAgentAction(caller: string, action: { kind: string; model?: string | null } | undefined): void {
  if (action?.kind === "agent_prompt" && caller !== "desktop") throw errors.permissionDenied("agent_prompt 规则（仅桌面可用）");
  if (action?.model && action.model.startsWith("-")) throw errors.invalidInput("model 不能以 - 开头");
}

const Rule = z.object({ id: z.string(), path: z.string(), version: z.string(), body: z.string(), data: z.object({ title: z.string(), enabled: z.boolean(), builtin: z.boolean(), trigger: Trigger, missedRunGraceMinutes: z.number(), action: Action }).passthrough() });

export interface AutomationsOptions {
  zone?: () => string;
  /** 注入 worker（测试用替身）；默认以 provider 无界面模式启动外部进程。 */
  worker?: (i: WorkerInput) => Promise<RunOutcome>;
  notify?: (n: { title: string; module: string }) => void;
  spaceState?: (spaceId: string) => { state: "ok" | "missing" | "inaccessible"; root?: string };
  exeFor?: (provider: string) => string | null;
  schedule?: boolean;
}

export function apply(ctx: Context, api: HuhuApi, opts: AutomationsOptions = {}): { service: AutomationsService; scheduler: Scheduler } {
  const root = api.vault.files.root;
  const mid = machineId();
  const exeFor = opts.exeFor ?? (() => null);
  const scriptStore = new ScriptStore(path.join(root, ".huhu", "automations", "scripts.json"));
  const holdStore = new HoldStore(path.join(root, ".huhu", "automations", "holds.json"));
  const svc = new AutomationsService({
    repo: api.vault.repo,
    claims: new ClaimStore(path.join(root, ".huhu", "automations", "claims")),
    activationsDir: path.join(root, ".huhu", "automations", "activations"),
    taskQuery: () => api.service<TaskQueryLike>("taskQuery"),
    worker: opts.worker ?? processWorker({ runsDir: path.join(root, ".huhu", "runtime", mid, "runs"), exeFor }),
    spaceState: opts.spaceState ?? (() => ({ state: "missing" })),
    cliAvailable: (p) => exeFor(p) !== null,
    holds: (t, h) => holdStore.isHeld(t, h),
    scripts: scriptStore,
    resolveSecret: (ref, purpose) => {
      const su = api.service<{ resolve(ref: string, c: { plugin: string; purpose: string }): string }>("secretUse");
      if (!su) throw Object.assign(new Error("保险箱插件未启用"), { code: "SECRET_REF_INVALID" });
      return su.resolve(ref, { plugin: "automations", purpose });
    },
    notify: opts.notify ?? (() => undefined),
    publish: (t, p) => api.events.publish(t, p),
    now: () => new Date(),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    machineId: mid,
  });

  const scheduler = new Scheduler({
    activate: async (ruleId, at, trigger) => { await svc.activate(ruleId, trigger, at); },
    lastActivatedFor: (id) => svc.lastActivatedFor(id),
    now: () => new Date(),
  });
  const sync = () => scheduler.sync(svc.rules().map((r) => ({ id: r.id, enabled: r.data.enabled, cron: r.data.trigger.cron, zone: r.data.trigger.zone, missedRunGraceMinutes: r.data.missedRunGraceMinutes })));
  // 能力在内置规则写入完成后才开始服务；写入失败（例如 Vault 已关闭）只记录，不产生未处理拒绝
  const ready = svc.ensureBuiltin().then(() => svc.reconcile()).then(() => { if (opts.schedule !== false) sync(); }).catch(() => undefined);
  ctx.effect(() => () => { scheduler.stop(); svc.abortAll(); }); // 停用 → 作业全部释放，运行中的脚本/Agent 被终止
  const resync = () => { if (opts.schedule !== false) sync(); };

  // 规则文件被恢复/外部修改时重建作业（否则内存里的 Cron 会继续按旧设置激活）
  api.events.subscribe((e) => {
    const p = e.payload as { path?: string; kind?: string };
    if ((e.type === "vault.fileChanged" && p.path?.startsWith("Automations/")) || (e.type === "entity.changed" && p.kind === "automation-rule")) resync();
  });
  api.provide("automations", { holdRestoredInput: (taskId: string, inputHash: string) => holdStore.hold(taskId, inputHash), releaseHold: (taskId: string) => holdStore.release(taskId) });

  const Id = z.object({ id: z.string() });
  const Script = z.object({ id: z.string(), title: z.string(), program: z.string(), args: z.array(z.string()), cwd: z.string(), envRefs: z.record(z.string(), z.string()), timeoutSec: z.number() });
  api.defineCapability(def({ name: "automations.scripts.list", plugin: "automations", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.array(Script), handler: () => scriptStore.list() }));
  api.defineCapability(def({ name: "automations.scripts.save", plugin: "automations", scope: "admin", exposable: false, defaultExposed: false, input: Script.omit({ id: true }).extend({ id: z.string().optional() }), output: Script, handler: (_c, i) => scriptStore.save(i) }));
  api.defineCapability(def({ name: "automations.scripts.delete", plugin: "automations", scope: "admin", exposable: false, defaultExposed: false, input: Id, output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (scriptStore.delete(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "automations.list", plugin: "automations", scope: "read", exposable: true, defaultExposed: true, input: z.object({}), output: z.array(Rule), handler: async () => { await ready; return svc.rules() as never; } }));
  api.defineCapability(def({ name: "automations.read", plugin: "automations", scope: "read", exposable: true, defaultExposed: true, input: Id, output: Rule, handler: async (_c, i) => { await ready; return svc.rule(i.id) as never; } }));
  api.defineCapability(def({ name: "automations.create", plugin: "automations", scope: "write", exposable: true, defaultExposed: false, input: z.object({ title: z.string(), trigger: Trigger, action: Action, body: z.string().optional(), missedRunGraceMinutes: z.number().int().min(0).max(1440).optional() }), output: Rule, handler: async (c, i) => { assertNoAgentAction(c.caller, i.action); const r = await svc.create(i as never); resync(); return r as never; } }));
  api.defineCapability(def({ name: "automations.update", plugin: "automations", scope: "write", exposable: true, defaultExposed: false, input: Id.extend({ expectedVersion: z.string(), patch: z.object({ title: z.string().optional(), trigger: Trigger.optional(), action: Action.optional(), missedRunGraceMinutes: z.number().int().min(0).max(1440).optional() }) }), output: Rule, handler: async (c, i) => { assertNoAgentAction(c.caller, i.patch.action); assertNoAgentAction(c.caller, svc.rule(i.id).data.action); const r = await svc.update(i.id, i.expectedVersion, i.patch as never); resync(); return r as never; } }));
  api.defineCapability(def({ name: "automations.delete", plugin: "automations", scope: "write", exposable: true, defaultExposed: false, input: Id, output: z.object({ ok: z.literal(true) }), handler: async (_c, i) => { await svc.delete(i.id); resync(); return { ok: true as const }; } }));
  api.defineCapability(def({ name: "automations.setEnabled", plugin: "automations", scope: "write", exposable: true, defaultExposed: false, input: Id.extend({ enabled: z.boolean() }), output: Rule, handler: async (c, i) => { assertNoAgentAction(c.caller, svc.rule(i.id).data.action); const r = await svc.setEnabled(i.id, i.enabled); resync(); return r as never; } }));
  api.defineCapability(def({ name: "automations.preview", plugin: "automations", scope: "read", exposable: true, defaultExposed: false, input: Id, output: z.object({ next: z.array(z.string()), tasksDisabled: z.boolean(), candidates: z.array(z.unknown()), skipped: z.array(z.unknown()) }), handler: (_c, i) => svc.preview(i.id) }));
  api.defineCapability(def({ name: "automations.runNow", plugin: "automations", scope: "execute", exposable: false, defaultExposed: false, timeoutMs: 30 * 60_000, input: Id, output: z.object({ activationId: z.string(), summary: z.unknown() }), handler: async (_c, i) => { const a = await svc.activate(i.id, "manual"); return { activationId: a.activationId, summary: a.summary }; } }));
  api.defineCapability(def({ name: "automations.cancel", plugin: "automations", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: z.object({ cancelled: z.boolean() }), handler: (_c, i) => ({ cancelled: svc.cancel(i.id) }) }));
  api.defineCapability(def({ name: "automations.activations", plugin: "automations", scope: "read", exposable: true, defaultExposed: true, input: z.object({}), output: z.array(z.object({ activationId: z.string(), ruleId: z.string(), trigger: z.string(), scheduledFor: z.string().nullable(), startedAt: z.string(), finishedAt: z.string().optional(), summary: z.unknown().optional() })), handler: () => svc.activations() as never }));
  return { service: svc, scheduler };
}
