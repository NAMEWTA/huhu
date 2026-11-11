import { Badge, Button, EmptyState, IconButton, PageHead, SearchBox } from "@huhu/ui";
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Download, HeartPulse, RefreshCw, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ModuleProps } from "../contributions.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";
import type { UiState } from "../state/ui-store.js";

interface Check {
  id: string;
  title: string;
  status: "ok" | "warning" | "error";
  detail: string;
  action?: { label: string; target: string; capability?: string };
}
interface Run {
  overall: "ok" | "warning" | "error";
  checks: Check[];
}
interface EventRow {
  id: string;
  time: string;
  module: string;
  message: string;
  tone: "success" | "error" | "neutral";
}
interface Notice {
  id: string;
  title: string;
  module: string;
  at: string;
  read: boolean;
}

const TITLE = { all: "健康中心", logs: "事件日志", notifications: "通知中心" } as Record<string, string>;
const STATE = { ok: "success", warning: "warning", error: "danger" } as const;
const UNCHECKED = ["插件", "文件", "索引", "文件监听", "Herdr Core", "保险箱"];
const STATE_TEXT = { ok: "正常", warning: "需留意", error: "需处理" } as const;

/** 健康中心（原型 Health）：系统状态（诊断）/ 事件日志 / 通知中心。 */
export function HealthModule({ section, ui }: ModuleProps & { ui: StoreApi<UiState> }) {
  const engine = useEngine();
  const qc = useQueryClient();
  // 诊断只在用户点“运行诊断”时执行：打开页面时是“尚未检查”，不显示“正常”（ACC-SY-01）
  const [result, setResult] = useState<Run | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done" | "cancelled">("idle");
  const [query, setQuery] = useState("");
  const token = useRef(0);
  const running = state === "running";
  const events = useCapability<{ events: EventRow[]; modules: string[] }>("health.events", { limit: 500, ...(query ? { query } : {}) });
  const notices = useCapability<Notice[]>("notifications.list", {});
  const plugins = useCapability<{ id: string; state: string }[]>("plugins.list", {});
  const vault = useCapability<{ id: string; name: string }>("vault.info", {});
  const refresh = (cap: string) => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === cap });
  const call = (cap: string, input: unknown) => engine.call(cap, input, { write: true });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (iso: string) => new Date(iso).toLocaleString("zh-CN", { timeZone: zone });
  const unread = (notices.data ?? []).filter((n) => !n.read).length;
  const overall = result?.overall;

  function runDiagnostics() {
    if (running) {
      // 取消：在途结果丢弃，之前的结果也不再标为当前（ACC-SY-03）
      token.current += 1;
      setResult(null);
      setState("cancelled");
      return;
    }
    const mine = ++token.current;
    setState("running");
    void engine
      .call<Run>("health.run", {})
      .then((r) => {
        if (token.current !== mine) return;
        setResult(r);
        setState("done");
      })
      .catch(() => {
        if (token.current === mine) setState("idle");
      });
  }
  async function runAction(a: { label: string; target: string; capability?: string }) {
    if (!a.capability) return ui.getState().openModule(a.target);
    await call(a.capability, {}).catch(() => undefined);
    runDiagnostics();
  }
  function exportDiagnostics() {
    // 诊断包只含版本、模块状态和事件记录，不含凭据值或笔记正文
    const body = JSON.stringify({ time: new Date().toISOString(), vault: vault.data, plugins: plugins.data, events: events.data?.events, checks: result?.checks }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = "HUHU-Diagnostics.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="module-layout" data-testid="health-module">
      <div className="view-content">
        <PageHead
          eyebrow="VISIBLE AND RECOVERABLE"
          title={TITLE[section] ?? TITLE["all"]!}
          description="理解系统当前的状态，并从问题现场直接恢复。"
          actions={
            <>
              <Button icon={Download} onClick={exportDiagnostics}>
                导出诊断
              </Button>
              <Button variant="primary" icon={running ? Square : RefreshCw} onClick={runDiagnostics} data-testid="health-run">
                {running ? "取消检查" : tHome.health.run}
              </Button>
            </>
          }
        />
        <div className="system-scroll scroll" tabIndex={0} role="region" aria-label="健康中心内容">
          {section === "notifications" ? (
            <section className="card">
              <div className="card-head">
                <h2>
                  通知 <Badge>{unread} 未读</Badge>
                </h2>
                <div className="row">
                  <Button onClick={() => void call("notifications.markRead", { ids: "all" }).then(() => refresh("notifications.list"))}>全部已读</Button>
                  <Button variant="ghost" onClick={() => void call("notifications.clearRead", {}).then(() => refresh("notifications.list"))}>
                    清除已读
                  </Button>
                </div>
              </div>
              {(notices.data ?? []).length ? (
                (notices.data ?? []).map((n) => (
                  <div className={`health-notification ${n.read ? "" : "unread"}`} key={n.id}>
                    <Bell size={18} aria-hidden />
                    <div className="grow">
                      <h3>{n.title}</h3>
                      <p>{fmt(n.at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void call("notifications.markRead", { ids: [n.id] }).then(() => refresh("notifications.list"));
                        ui.getState().openModule(n.module || "home");
                      }}
                    >
                      查看
                    </Button>
                    <IconButton icon={Trash2} label="删除通知" onClick={() => void call("notifications.delete", { ids: [n.id] }).then(() => refresh("notifications.list"))} />
                  </div>
                ))
              ) : (
                <EmptyState icon={Bell} title="通知已清空" />
              )}
            </section>
          ) : section === "logs" ? (
            <>
              <SearchBox value={query} onChange={setQuery} placeholder="搜索事件内容或来源…" />
              <section className="card system-section">
                <table className="table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>来源</th>
                      <th>事件</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(events.data?.events ?? []).map((e) => (
                      <tr key={e.id} data-testid="event-row">
                        <td className="mono">{fmt(e.time)}</td>
                        <td>{e.module}</td>
                        <td>{e.message}</td>
                        <td>
                          <Badge tone={e.tone === "error" ? "danger" : e.tone === "success" ? "success" : "neutral"}>{e.tone === "error" ? "故障" : e.tone === "success" ? "成功" : "记录"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(events.data?.events ?? []).length === 0 ? <EmptyState title="还没有事件记录" /> : null}
              </section>
            </>
          ) : (
            <>
              <div className="health-hero card">
                <div className="health-orb">
                  <HeartPulse size={36} aria-hidden />
                </div>
                <div>
                  <h1 data-testid="health-overall">{running ? "正在检查Vault…" : state === "cancelled" ? "已取消" : overall ? tHome.health.overall[overall] : "尚未检查"}</h1>
                  <p>{state === "done" ? "检查已完成。" : state === "cancelled" ? "检查已取消，之前的结果不再有效。" : "还没有运行过诊断；运行后这里显示每一项的真实状态。"}</p>
                </div>
                <Badge tone={running ? "warning" : overall === "error" ? "danger" : overall === "warning" ? "warning" : overall ? "success" : "neutral"}>{running ? "检查中" : overall ? "LOCAL READY" : "未检查"}</Badge>
              </div>
              <section className="card system-section">
                {result === null
                  ? UNCHECKED.map((title) => (
                      <div className="health-check" key={title} data-testid="health-check" data-status="unchecked">
                        <span className="health-check-icon">
                          <HeartPulse size={20} aria-hidden />
                        </span>
                        <div className="grow">
                          <h3>{title}</h3>
                          <p>尚未检查</p>
                        </div>
                        <Badge>未检查</Badge>
                      </div>
                    ))
                  : null}
                {(result?.checks ?? []).map((c) => (
                  <div className="health-check" key={c.id} data-testid="health-check" data-status={c.status}>
                    <span className={`health-check-icon ${c.status === "ok" ? "success" : STATE[c.status]}`}>{c.status === "ok" ? <CheckCircle2 size={20} aria-hidden /> : <AlertTriangle size={20} aria-hidden />}</span>
                    <div className="grow">
                      <h3>{c.title}</h3>
                      <p>{c.detail}</p>
                    </div>
                    <Badge tone={STATE[c.status]}>{STATE_TEXT[c.status]}</Badge>
                    {c.action ? (
                      <Button variant="ghost" onClick={() => void runAction(c.action!)}>
                        {c.action.label} <ChevronRight size={14} aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </section>
              <div className="callout system-note">
                <ShieldCheck size={17} aria-hidden />
                <p>诊断导出包含版本、模块状态与事件记录，不包含凭据值或笔记正文。</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
