import { Badge, Button, ChoiceSwitch, EmptyState, Field, PageHead, SearchBox, Segmented } from "@huhu/ui";
import { Activity, Blocks, Code2, Command, Database, Folder, HeartPulse, Monitor, Play, Plug, Server, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ModuleProps } from "../contributions.js";
import { CapabilityError } from "../engine-client/client.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tGateway as g } from "../i18n/zh-CN.js";
import type { UiState } from "../state/ui-store.js";
import { CliSection } from "./CliSection.js";

interface Cap {
  name: string;
  plugin: string;
  scope: "read" | "write" | "execute" | "admin";
  exposable: boolean;
  exposed: boolean;
}
interface AuditRow {
  at: string;
  entry: string;
  capability: string;
  code: string;
  ms: number;
}
type Verdict = { found: boolean; identities: { identity: string; allowed: boolean; reason: string }[] };

type McpTab = "tools" | "resources" | "templates" | "prompts";
const MCP_TABS: { value: McpTab; label: string }[] = [
  { value: "tools", label: "Tools" },
  { value: "resources", label: "Resources" },
  { value: "templates", label: "Templates" },
  { value: "prompts", label: "Prompts" },
];
/** 随 MCP 服务固定提供的非工具条目（与 packages/kernel/src/mcp.ts 一致）；读取它们仍经同一授权。 */
const MCP_STATIC: Record<Exclude<McpTab, "tools">, { name: string; desc: string; source: string }[]> = {
  resources: [
    { name: "huhu://vault/summary", desc: "Vault 概览（名称、ID、统计）", source: "vault.info" },
    { name: "huhu://notes/recent", desc: "最近修改的 20 篇笔记", source: "vault.tree" },
  ],
  templates: [{ name: "huhu://notes/{id}", desc: "按笔记 ID 或相对路径读取 Markdown 正文", source: "notes.list · notes.read" }],
  prompts: [
    { name: "daily-review", desc: "回顾当天的笔记与任务，整理成每日复盘", source: "参数 date（可选）" },
    { name: "knowledge-synthesis", desc: "围绕主题综合相关笔记并标注来源", source: "参数 topic（必填）" },
  ],
};
const TITLE: Record<string, string> = { mcp: "HUHU MCP 服务", cli: "CLI 命令行", server: "服务端", desktop: "桌面宿主" };

/** 能力网关（原型 Interfaces）：MCP / CLI / 服务端 / 桌面宿主四个分区。不可开放的能力（保险箱明文、Agent/SSH 执行）没有开关。 */
export function GatewayModule({ section, ui }: ModuleProps & { ui: StoreApi<UiState> }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const caps = useCapability<Cap[]>("capabilities.list", {});
  const gw = useCapability<{ mcp: { enabled: boolean; transport: "stdio" | "http" }; tokens: number }>("gateway.get", {});
  const tokens = useCapability<{ id: string; name: string; createdAt: string }[]>("gateway.tokens.list", {});
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mcpTab, setMcpTab] = useState<McpTab>("tools");
  const [bench, setBench] = useState("");
  const [argsText, setArgsText] = useState("{}");
  const [invoked, setInvoked] = useState<{ ok: boolean; code: string; body: string } | null>(null);
  const audit = useCapability<AuditRow[]>("gateway.audit.list", {});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  async function act<T>(cap: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(cap, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  const mcp = gw.data?.mcp ?? { enabled: false, transport: "stdio" as const };
  const all = caps.data ?? [];
  const list = all.filter((c) => c.name.includes(filter.trim()));
  const open = all.filter((c) => c.exposed).length;

  const argsError = (() => {
    try {
      const v: unknown = JSON.parse(argsText);
      return v !== null && typeof v === "object" && !Array.isArray(v) ? null : "参数必须是 JSON 对象";
    } catch {
      return "不是合法的 JSON";
    }
  })();
  async function invoke(): Promise<void> {
    if (argsError || !bench.trim()) return;
    try {
      const data = await engine.call<unknown>(bench.trim(), JSON.parse(argsText), { write: true });
      setInvoked({ ok: true, code: "OK", body: JSON.stringify(data, null, 2) ?? "null" });
    } catch (e) {
      setInvoked({ ok: false, code: e instanceof CapabilityError ? e.code : "ERROR", body: e instanceof Error ? e.message : String(e) });
    }
    await refresh();
  }

  const tester = (
    <section className="card capability-tester" id="capability-tester">
      <div className="card-head">
        <h2>
          <Code2 size={17} aria-hidden /> {g.bench}
        </h2>
        <Badge>共享应用服务</Badge>
      </div>
      <p className="hint-text">{g.benchHint}</p>
      <form
        className="tester-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void act<Verdict>("gateway.check", { capability: bench.trim() }).then((r) => setVerdict(r));
        }}
      >
        <div className="stack">
          <Field label="能力">
            <input
              aria-label={g.bench}
              placeholder="tasks.create"
              value={bench}
              onChange={(e) => {
                setBench(e.target.value);
                setVerdict(null);
              }}
            />
          </Field>
          <Button type="submit" variant="primary" icon={Play} disabled={!bench.trim()}>
            {g.check}
          </Button>
        </div>
        <div className="tester-output">
          {verdict ? (
            verdict.found ? (
              verdict.identities.map((v) => (
                <div key={v.identity} className="row" data-testid="bench-row" data-identity={v.identity} data-allowed={v.allowed}>
                  <strong>{v.identity}</strong>
                  <Badge tone={v.allowed ? "success" : "danger"}>{v.allowed ? g.allowed : g.denied}</Badge>
                  <span className="small muted">{v.reason}</span>
                </div>
              ))
            ) : (
              <p role="status" data-testid="bench-notfound">
                {g.notFound}
              </p>
            )
          ) : (
            <div className="tester-empty">
              <Plug size={27} aria-hidden />
              <p>
                选择能力并发起检查
                <br />
                这里会显示每个入口是否允许调用
              </p>
            </div>
          )}
        </div>
      </form>
      <form
        className="tester-invoke"
        onSubmit={(e) => {
          e.preventDefault();
          void invoke();
        }}
      >
        <Field label="参数（JSON）" error={argsError}>
          <textarea aria-label="调用参数 JSON" rows={5} spellCheck={false} className="mono" value={argsText} onChange={(e) => (setArgsText(e.target.value), setInvoked(null))} />
        </Field>
        <div className="row">
          <Button type="submit" variant="primary" icon={Play} disabled={!bench.trim() || argsError !== null} data-testid="bench-invoke">
            调用
          </Button>
          <span className="small muted">测试台以桌面身份调用，与外部开放状态无关；写入类调用会真实执行。</span>
        </div>
        {invoked ? (
          <div className="tester-output" data-testid="bench-result" data-ok={invoked.ok}>
            <Badge tone={invoked.ok ? "success" : "danger"}>{invoked.ok ? "成功" : `失败 · ${invoked.code}`}</Badge>
            <pre className="code-block">{invoked.body}</pre>
          </div>
        ) : null}
      </form>
    </section>
  );

  return (
    <div className="module-layout" data-testid="gateway-module">
      <div className="view-content interfaces-view">
        <PageHead eyebrow="ONE CAPABILITY, EVERYWHERE" title={TITLE[section] ?? TITLE["mcp"]!} description="统一注册、统一鉴权、统一应用服务。任何客户端都可以调用，无需绑定大模型。" />
        <div className="system-scroll scroll">
          {error ? (
            <div role="alert" className="callout danger">
              <p>{error}</p>
            </div>
          ) : null}
          {section === "cli" ? (
            <CliSection />
          ) : section === "server" ? (
            <>
              <section className="card gateway-overview">
                <div className="row">
                  <span className="plugin-large-icon">
                    <Server size={24} aria-hidden />
                  </span>
                  <div className="grow">
                    <h2>HUHU 本地服务</h2>
                    <p>127.0.0.1 · Bearer 令牌 · 与 CLI、MCP 共享同一套能力</p>
                  </div>
                  <Badge tone="success">随引擎运行</Badge>
                </div>
              </section>
              <section className="settings-section card">
                <div className="card-head">
                  <h2>{g.tokens}</h2>
                </div>
                <form
                  className="form-body"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (name.trim())
                      void act<{ token: string }>("gateway.tokens.create", { name: name.trim() }).then((r) => {
                        if (r) {
                          setFresh(r.token);
                          setName("");
                        }
                      });
                  }}
                >
                  <Field label={g.tokenName}>
                    <div className="row">
                      <input aria-label={g.tokenName} placeholder={g.tokenName} value={name} onChange={(e) => setName(e.target.value)} />
                      <Button type="submit" variant="primary" disabled={!name.trim()}>
                        {g.createToken}
                      </Button>
                    </div>
                  </Field>
                </form>
                {fresh ? (
                  <div role="status" data-testid="fresh-token" className="callout">
                    <p>
                      {g.tokenOnce}
                      <code>{fresh}</code>
                    </p>
                  </div>
                ) : null}
                {(tokens.data ?? []).length === 0 ? (
                  <EmptyState title={g.noTokens} />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>名称</th>
                        <th>创建时间</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(tokens.data ?? []).map((t) => (
                        <tr key={t.id} data-testid="token-row">
                          <td>
                            <strong>{t.name}</strong>
                          </td>
                          <td className="mono">{new Date(t.createdAt).toLocaleString("zh-CN")}</td>
                          <td>
                            <Button variant="danger" aria-label={`${g.revoke} ${t.name}`} onClick={() => void act("gateway.tokens.revoke", { id: t.id }).then(() => setFresh(null))}>
                              {g.revoke}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <section className="card" data-testid="gateway-audit">
                <div className="card-head">
                  <h2>调用记录</h2>
                  <Button disabled={(audit.data ?? []).length === 0} data-testid="audit-clear" onClick={() => void act("gateway.audit.clear", {})}>
                    清空
                  </Button>
                </div>
                <p className="hint-text">只记录外部入口（CLI / MCP / HTTP）的调用：时间、入口、能力、结果与耗时，不含输入内容。</p>
                {(audit.data ?? []).length === 0 ? (
                  <EmptyState icon={Activity} title="还没有外部调用" />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>入口</th>
                        <th>能力</th>
                        <th>结果</th>
                        <th>耗时</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(audit.data ?? []).slice(0, 100).map((r) => (
                        <tr key={`${r.at}-${r.capability}-${r.entry}-${r.ms}`} data-testid="audit-row">
                          <td>{r.at.slice(5, 19).replace("T", " ")}</td>
                          <td>{r.entry}</td>
                          <td>
                            <code>{r.capability}</code>
                          </td>
                          <td>
                            <Badge tone={r.code === "OK" ? "success" : "danger"}>{r.code}</Badge>
                          </td>
                          <td>{r.ms} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              {tester}
            </>
          ) : section === "desktop" ? (
            <>
              <section className="card gateway-overview">
                <div className="row">
                  <span className="plugin-large-icon">
                    <Monitor size={26} aria-hidden />
                  </span>
                  <div className="grow">
                    <h2>Electron Desktop</h2>
                    <p>React Renderer → Typed Preload → Main Adapter → Engine（HTTP 能力调度）</p>
                  </div>
                  <Badge tone="success">Electron Vault 端口已接入</Badge>
                </div>
              </section>
              <div className="desktop-layer-grid">
                {[
                  ["Renderer", Monitor, "React 视图与交互状态", "不直接访问文件、数据库、凭据或进程。"],
                  ["Preload Bridge", ShieldCheck, "窄接口 / 输入验证", "按能力提供类型化入口，禁止暴露任意 invoke。"],
                  ["Main / Runtime", Blocks, "装配 / 调度 / 生命周期", "Engine 在独立进程里托管插件与能力调度，Main 只负责窗口与系统集成。"],
                  ["Infrastructure", Database, "文件 / 进程 / 网络", "通过端口注入。其他宿主可以替换适配实现。"],
                ].map(([title, Icon, strong, text]) => {
                  const I = Icon as typeof Monitor;
                  return (
                    <div className="card desktop-layer" key={String(title)}>
                      <I size={24} aria-hidden />
                      <h3>{String(title)}</h3>
                      <strong>{String(strong)}</strong>
                      <p>{String(text)}</p>
                    </div>
                  );
                })}
              </div>
              <section className="card system-section">
                <div className="card-head">
                  <h2>桌面交互入口</h2>
                </div>
                <div className="desktop-action-grid">
                  <Button icon={Folder} onClick={() => ui.getState().openModule("settings")}>
                    Vault配置
                  </Button>
                  <Button icon={Command} onClick={() => ui.getState().setPaletteOpen(true)}>
                    命令面板
                  </Button>
                  <Button icon={Blocks} onClick={() => ui.getState().openModule("plugins")}>
                    插件生命周期
                  </Button>
                  <Button icon={HeartPulse} onClick={() => ui.getState().openModule("health")}>
                    宿主诊断
                  </Button>
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="card gateway-overview">
                <div className="row">
                  <span className="plugin-large-icon">
                    <Plug size={24} aria-hidden />
                  </span>
                  <div className="grow">
                    <h2>MCP Server</h2>
                    <p>当前Vault · {mcp.transport === "stdio" ? "stdio" : "Streamable HTTP"} · 能力按模块授权</p>
                  </div>
                  <Badge tone={mcp.enabled ? "success" : "neutral"}>{mcp.enabled ? `已开启 · ${open}/${all.length}` : `已关闭 · 0/${all.length}`}</Badge>
                  <ChoiceSwitch checked={mcp.enabled} label={g.mcpEnabled} onChange={(v) => void act("gateway.mcp.update", { enabled: v, transport: mcp.transport })} />
                </div>
                <div className="gateway-meta">
                  <label className="row">
                    {g.transport}
                    <select aria-label={g.transport} value={mcp.transport} onChange={(e) => void act("gateway.mcp.update", { enabled: mcp.enabled, transport: e.target.value })}>
                      <option value="stdio">{g.stdio}</option>
                      <option value="http">{g.http}</option>
                    </select>
                  </label>
                </div>
              </section>
              <div className="capabilities-toolbar">
                <Segmented<McpTab> label="MCP 条目类型" value={mcpTab} onChange={setMcpTab} options={MCP_TABS} />
                {mcpTab === "tools" ? <SearchBox value={filter} onChange={setFilter} placeholder={g.filter} /> : null}
              </div>
              {mcpTab !== "tools" ? (
                <section className="card" data-testid={`mcp-${mcpTab}`}>
                  <table className="table capability-table">
                    <thead>
                      <tr>
                        <th>名称</th>
                        <th>说明</th>
                        <th>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MCP_STATIC[mcpTab].map((r) => (
                        <tr key={r.name}>
                          <td>
                            <code>{r.name}</code>
                          </td>
                          <td>{r.desc}</td>
                          <td className="small muted">{r.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
              <section className="card" hidden={mcpTab !== "tools"}>
                <table className="table capability-table">
                  <thead>
                    <tr>
                      <th>能力</th>
                      <th>所属模块</th>
                      <th>访问范围</th>
                      <th>有效状态</th>
                      <th>开放</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.name} data-testid="cap-row" data-cap={c.name}>
                        <td>
                          <code>{c.name}</code>
                        </td>
                        <td>{c.plugin === "kernel" ? "基础能力" : c.plugin}</td>
                        <td>
                          <Badge tone={c.scope === "read" ? "neutral" : "warning"}>{g.scope[c.scope]}</Badge>
                        </td>
                        <td>
                          <Badge tone={c.exposed ? "success" : "neutral"}>{c.exposable ? (c.exposed ? "可调用" : g.closed) : g.never}</Badge>
                        </td>
                        <td>{c.exposable ? <ChoiceSwitch checked={c.exposed} label={`暴露 ${c.name}`} onChange={(v) => void act("gateway.update", { capability: c.name, exposed: v })} /> : <span className="small muted">{g.never}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.length === 0 ? <EmptyState icon={Activity} title="没有匹配的能力" /> : null}
              </section>
              <div className="callout system-note">
                <ShieldCheck size={17} aria-hidden />
                <p>列表发现和实际调用都会检查模块状态与开放设置。Agent 执行永不对外。</p>
              </div>
              {tester}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
