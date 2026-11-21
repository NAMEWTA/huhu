import { isWorkbenchCaller } from "@huhu/contracts";
import { z } from "zod";
import type { EventLog } from "../event-log.js";
import type { PluginManager } from "../plugin-manager.js";
import type { CapabilityRegistry } from "./define.js";
import { registerKernelCapability } from "./system.js";

export interface HealthDeps {
  plugins: PluginManager;
  /** 语义文件问题列表（坏 YAML、缺 id、id 冲突、schema 不符）。 */
  fileProblems(): { path: string; kind: string; code: string; message: string }[];
  index: { indexing: boolean; counts(): Record<string, number> };
  vault: { readOnly: boolean; id: string };
  watcherMode(): "native" | "polling";
  /** 事件日志（健康中心的“事件日志”与首页“最近活动”共用）。 */
  events?: import("../event-log.js").EventLog;
  /** 其他模块贡献的检查（例如 Herdr Core、保险箱）。 */
  extra?: () => Promise<HealthCheck[]> | HealthCheck[];
}

export interface HealthCheck {
  id: string;
  title: string;
  status: "ok" | "warning" | "error";
  detail: string;
  /** 界面可直接渲染的修复入口。 */
  action?: { label: string; target: string; /** 有值时界面直接调用这个能力（如“重启 Core”），而不是跳转模块 */ capability?: string };
}

const CheckDto = z.object({ id: z.string(), title: z.string(), status: z.enum(["ok", "warning", "error"]), detail: z.string(), action: z.object({ label: z.string(), target: z.string(), capability: z.string().optional() }).optional() });

const diagnosticModules = new Set(["任务", "笔记", "档案", "收件箱", "自动化", "插件", "同步", "远程"]);
const eventStatuses = { success: "操作完成", error: "操作出错", neutral: "状态已更新" };
const checkStatuses = { ok: "正常", warning: "需要检查", error: "检查失败" };

function publicEvents(events: EventLog, query: { limit?: number | undefined; module?: string | undefined; query?: string | undefined }) {
  const recent = events.list({ limit: 1000, module: query.module });
  const needle = query.query?.trim().toLowerCase();
  return recent
    .filter((event) => diagnosticModules.has(event.module) && Object.hasOwn(eventStatuses, event.tone))
    .map(({ id, time, module, tone }) => ({ id, time, module, tone, message: eventStatuses[tone] }))
    .filter((event) => !needle || `${event.module} ${event.message}`.toLowerCase().includes(needle))
    .slice(0, query.limit ?? 100);
}

function publicChecks(checks: HealthCheck[]): HealthCheck[] {
  return checks.map(({ id, title, status }) => ({ id, title, status, detail: checkStatuses[status] }));
}

/** 健康检查：只读，汇总各子系统的真实状态。 */
export async function runHealth(d: HealthDeps): Promise<{ overall: "ok" | "warning" | "error"; checks: HealthCheck[] }> {
  const checks: HealthCheck[] = [];
  const failed = d.plugins.list().filter((p) => p.state === "failed");
  checks.push(
    failed.length === 0
      ? { id: "plugins", title: "插件", status: "ok", detail: `${d.plugins.list().filter((p) => p.state === "active").length} 个插件运行正常` }
      : { id: "plugins", title: "插件", status: "error", detail: failed.map((p) => `${p.id}：${p.error ?? "启动失败"}`).join("；"), action: { label: "打开插件中心", target: "plugins" } },
  );
  const problems = d.fileProblems();
  checks.push(
    problems.length === 0
      ? { id: "files", title: "文件", status: "ok", detail: "所有语义文件都可解析" }
      : {
          id: "files",
          title: "文件",
          status: "warning",
          detail: `${problems.length} 个文件有问题：${problems
            .slice(0, 3)
            .map((p) => `${p.path}（${p.message}）`)
            .join("；")}`,
        },
  );
  checks.push({ id: "index", title: "索引", status: d.index.indexing ? "warning" : "ok", detail: d.index.indexing ? "正在建立索引" : `已索引 ${d.index.counts()["files"] ?? 0} 个文件` });
  checks.push(
    d.watcherMode() === "native"
      ? { id: "watcher", title: "文件监听", status: "ok", detail: "使用系统原生监听" }
      : { id: "watcher", title: "文件监听", status: "warning", detail: "原生监听不可用，已回退为每 30 秒轮询（外部修改可能延迟出现）" },
  );
  if (d.vault.readOnly) checks.push({ id: "readonly", title: "Vault 模式", status: "warning", detail: "以只读方式打开，对笔记等 Vault 文件的写入都会被拒绝" });
  checks.push(...((await d.extra?.()) ?? []));
  const overall = checks.some((c) => c.status === "error") ? "error" : checks.some((c) => c.status === "warning") ? "warning" : "ok";
  return { overall, checks };
}

export function registerHealthCapabilities(registry: CapabilityRegistry, d: HealthDeps): () => void {
  const off = registerKernelCapability(registry, {
    name: "health.run",
    plugin: "kernel",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.object({}),
    output: z.object({ overall: z.enum(["ok", "warning", "error"]), checks: z.array(CheckDto) }),
    handler: async ({ caller }) => {
      const result = await runHealth(d);
      return isWorkbenchCaller(caller) ? result : { ...result, checks: publicChecks(result.checks) };
    },
  });
  const off2 = d.events
    ? registerKernelCapability(registry, {
        name: "health.events",
        plugin: "kernel",
        scope: "read",
        risk: "high",
        exposable: true,
        defaultExposed: false,
        input: z.object({ limit: z.number().int().min(1).max(1000).optional(), module: z.string().optional(), query: z.string().optional() }),
        output: z.object({ events: z.array(z.object({ id: z.string(), time: z.string(), module: z.string(), message: z.string(), tone: z.enum(["success", "error", "neutral"]) })), modules: z.array(z.string()) }),
        handler: ({ caller }, i) =>
          isWorkbenchCaller(caller) ? { events: d.events!.list(i), modules: d.events!.modules() } : { events: publicEvents(d.events!, i), modules: d.events!.modules().filter((module) => diagnosticModules.has(module)) },
      })
    : () => undefined;
  // 诊断包：只含版本 / 模块状态 / 检查结果 / 事件记录（事件里是面向用户的一行描述），由引擎生成，不含笔记正文与凭据值
  const off3 = registerKernelCapability(registry, {
    name: "health.exportDiagnostics",
    plugin: "kernel",
    scope: "read",
    risk: "high",
    exposable: true,
    defaultExposed: false,
    input: z.object({ module: z.string().optional() }),
    output: z.object({
      time: z.string(),
      vault: z.object({ id: z.string(), readOnly: z.boolean(), counts: z.record(z.string(), z.number()) }),
      plugins: z.array(z.object({ id: z.string(), version: z.string(), state: z.string(), error: z.string().optional() })),
      overall: z.string(),
      checks: z.array(CheckDto),
      events: z.array(z.object({ time: z.string(), module: z.string(), message: z.string(), tone: z.string() })),
    }),
    handler: async ({ caller }, { module }) => {
      const workbench = isWorkbenchCaller(caller);
      const r = await runHealth(d);
      const events = !d.events ? [] : workbench ? d.events.list({ limit: 500, module }) : publicEvents(d.events, { limit: 500, module });
      return {
        time: new Date().toISOString(),
        vault: { id: d.vault.id, readOnly: d.vault.readOnly, counts: d.index.counts() },
        plugins: d.plugins.list().map((p) => ({ id: p.id, version: p.manifest.version, state: p.state, ...(workbench && p.error ? { error: p.error } : {}) })),
        overall: r.overall,
        checks: workbench ? r.checks : publicChecks(r.checks),
        events: events.map(({ time, module, message, tone }) => ({ time, module, message, tone })),
      };
    },
  });
  return () => {
    off();
    off2();
    off3();
  };
}
