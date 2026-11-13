import { Badge, Button, ChoiceSwitch, DataTable, Dialog, EmptyState, Field, PageHead, SearchBox, Segmented } from "@huhu/ui";
import { Activity, BookOpen, Blocks, Code2, Command, Copy, Database, Folder, HeartPulse, Monitor, Play, Plug, Server, Settings, ShieldCheck } from "lucide-react";
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
  const location = useCapability<{ root: string }>("vault.location", {});
  const [configOpen, setConfigOpen] = useState(false);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  /** 复制外部 MCP 客户端的配置片段：stdio 用 `huhu mcp --vault <目录>`，HTTP 用本机端点（令牌在“服务端”里创建）。 */
  async function copyClientConfig() {
    const cfg =
      mcp.transport === "stdio"
        ? { mcpServers: { huhu: { command: "huhu", args: ["mcp", "--vault", location.data?.root ?? ""] } } }
        : { mcpServers: { huhu: { url: `${engine.endpoint.baseUrl}/mcp`, headers: { Authorization: "Bearer <在“服务端”里创建的令牌>" } } } };
    const text = JSON.stringify(cfg, null, 2);
    const host = (window as unknown as { huhuHost?: { copyText?(v: string): Promise<void> } }).huhuHost;
    try {
      await (host?.copyText ? host.copyText(text) : navigator.clipboard.writeText(text));
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }
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
        <PageHead
          eyebrow="ONE CAPABILITY, EVERYWHERE"
          title={TITLE[section] ?? TITLE["mcp"]!}
          description="统一注册、统一鉴权、统一应用服务。任何客户端都可以调用，无需绑定大模型。"
          actions={
            <Button
              icon={BookOpen}
              data-testid="gateway-guide"
              onClick={() => {
                ui.getState().setSection("settings", "agent-access");
                ui.getState().openModule("settings");
              }}
            >
              HUHU 使用指南
            </Button>
          }
        />
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
                  <DataTable
                    label="访问令牌"
                    rows={tokens.data ?? []}
                    rowKey={(t) => t.id}
                    rowTestId="token-row"
                    columns={[
                      { id: "name", header: "名称", width: 260, cell: (t) => <strong>{t.name}</strong> },
                      { id: "createdAt", header: "创建时间", width: 200, className: "mono", cell: (t) => new Date(t.createdAt).toLocaleString("zh-CN") },
                      {
                        id: "revoke",
                        header: "",
                        width: 120,
                        cell: (t) => (
                          <Button variant="danger" aria-label={`${g.revoke} ${t.name}`} onClick={() => void act("gateway.tokens.revoke", { id: t.id }).then(() => setFresh(null))}>
                            {g.revoke}
                          </Button>
                        ),
                      },
                    ]}
                  />
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
                  <DataTable
                    label="外部调用记录"
                    rows={(audit.data ?? []).slice(0, 500)}
                    rowKey={(r) => `${r.at}-${r.capability}-${r.entry}-${r.ms}`}
                    rowTestId="audit-row"
                    columns={[
                      { id: "at", header: "时间", width: 150, cell: (r) => r.at.slice(5, 19).replace("T", " ") },
                      { id: "entry", header: "入口", width: 90, cell: (r) => r.entry },
                      { id: "capability", header: "能力", width: 260, cell: (r) => <code>{r.capability}</code> },
                      { id: "code", header: "结果", width: 130, cell: (r) => <Badge tone={r.code === "OK" ? "success" : "danger"}>{r.code}</Badge> },
                      { id: "ms", header: "耗时", width: 90, cell: (r) => `${r.ms} ms` },
                    ]}
                  />
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
                  <button type="button" data-testid="gateway-mcp-config" onClick={() => setConfigOpen(true)}>
                    <Settings size={14} aria-hidden /> 配置传输
                  </button>
                  <button type="button" data-testid="gateway-mcp-copy" disabled={mcp.transport === "stdio" && !location.data?.root} onClick={() => void copyClientConfig()}>
                    <Copy size={14} aria-hidden /> 复制客户端配置
                  </button>
                  <button type="button" onClick={() => ui.getState().openModule("plugins")}>
                    <Blocks size={14} aria-hidden /> 管理所属插件
                  </button>
                </div>
                {copied ? (
                  <p role="status" className="small muted">
                    {copied === "ok" ? "客户端配置已复制" : "复制失败：剪贴板不可用"}
                  </p>
                ) : null}
              </section>
              <Dialog open={configOpen} title="MCP 配置" description="选择外部客户端连接 HUHU 的方式。" onClose={() => setConfigOpen(false)} testId="gateway-mcp-dialog" actions={<Button onClick={() => setConfigOpen(false)}>完成</Button>}>
                <Field label={g.transport}>
                  <select aria-label={g.transport} value={mcp.transport} onChange={(e) => (setCopied(null), void act("gateway.mcp.update", { enabled: mcp.enabled, transport: e.target.value }))}>
                    <option value="stdio">{g.stdio}</option>
                    <option value="http">{g.http}</option>
                  </select>
                </Field>
              </Dialog>
              <div className="capabilities-toolbar">
                <Segmented<McpTab> label="MCP 条目类型" value={mcpTab} onChange={setMcpTab} options={MCP_TABS} />
                {mcpTab === "tools" ? <SearchBox value={filter} onChange={setFilter} placeholder={g.filter} /> : null}
              </div>
              {mcpTab !== "tools" ? (
                <section className="card" data-testid={`mcp-${mcpTab}`}>
                  <DataTable
                    label={`MCP ${mcpTab}`}
                    rows={MCP_STATIC[mcpTab]}
                    rowKey={(r) => r.name}
                    columns={[
                      { id: "name", header: "名称", width: 260, cell: (r) => <code>{r.name}</code> },
                      { id: "desc", header: "说明", width: 420, cell: (r) => r.desc },
                      { id: "source", header: "来源", width: 160, className: "small muted", cell: (r) => r.source },
                    ]}
                  />
                </section>
              ) : null}
              <section className="card" hidden={mcpTab !== "tools"}>
                <DataTable
                  label="能力开放列表"
                  rows={list}
                  rowKey={(c) => c.name}
                  rowTestId="cap-row"
                  rowAttrs={(c) => ({ "data-cap": c.name })}
                  columns={[
                    { id: "name", header: "能力", width: 280, cell: (c) => <code>{c.name}</code> },
                    { id: "plugin", header: "所属模块", width: 130, cell: (c) => (c.plugin === "kernel" ? "基础能力" : c.plugin) },
                    { id: "scope", header: "访问范围", width: 110, cell: (c) => <Badge tone={c.scope === "read" ? "neutral" : "warning"}>{g.scope[c.scope]}</Badge> },
                    { id: "state", header: "有效状态", width: 120, cell: (c) => <Badge tone={c.exposed ? "success" : "neutral"}>{c.exposable ? (c.exposed ? "可调用" : g.closed) : g.never}</Badge> },
                    {
                      id: "expose",
                      header: "开放",
                      width: 110,
                      cell: (c) =>
                        c.exposable ? <ChoiceSwitch checked={c.exposed} label={`暴露 ${c.name}`} onChange={(v) => void act("gateway.update", { capability: c.name, exposed: v })} /> : <span className="small muted">{g.never}</span>,
                    },
                  ]}
                />
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
