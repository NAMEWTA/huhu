import { McpLocalPortSchema, type CapabilityCatalogEntry, type GatewayMcpStatus, type McpCatalogView, type McpEntryKind, type ToolAccessSnapshot } from "@huhu/contracts";
import { Badge, Button, ChoiceSwitch, DataTable, Dialog, EmptyState, Field, PageHead, SearchBox, Segmented } from "@huhu/ui";
import { Activity, BookOpen, Blocks, Code2, Command, Copy, Database, Folder, HeartPulse, Monitor, Play, Plug, Server, Settings, ShieldCheck } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ModuleProps } from "../contributions.js";
import { CapabilityError } from "../engine-client/client.js";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tGateway as g } from "../i18n/zh-CN.js";
import { openSettings, type UiState } from "../state/ui-store.js";
import { CliSection } from "./CliSection.js";
import { SshHostGrants } from "./SshHostGrants.js";
import { ToolPolicyCatalog } from "./ToolPolicyCatalog.js";
import { WebSharePanel } from "./WebSharePanel.js";

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
const MCP_KIND: Record<McpTab, McpEntryKind> = { tools: "tool", resources: "resource", templates: "resource-template", prompts: "prompt" };
const TITLE: Record<string, string> = { mcp: "HUHU MCP 服务", cli: "CLI 命令行", server: "服务端", desktop: "桌面宿主" };

/** 能力网关（原型 Interfaces）：MCP / CLI / 服务端 / 桌面宿主四个分区。不可开放的能力（保险箱明文、Agent/SSH 执行）没有开关。 */
export function GatewayModule({ section, ui, onNavigate }: ModuleProps & { ui: StoreApi<UiState> }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const caps = useCapability<CapabilityCatalogEntry[]>("capabilities.list", { includeInactive: true });
  const gw = useCapability<{ mcp: GatewayMcpStatus; tokens: number; toolAccess: ToolAccessSnapshot }>("gateway.get", {});
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
  const mcp = gw.data?.mcp;
  const mcpCatalog = useCapability<McpCatalogView>("mcp.catalog.list", {}, { enabled: section === "mcp" });
  const protocolEntries = (mcpCatalog.data?.entries ?? []).filter((entry) => entry.kind === MCP_KIND[mcpTab] &&
    (mcpTab !== "tools" || (entry.sourceId !== "builtin" && entry.publicKey.toLowerCase().includes(filter.toLowerCase()))));
  const [configOpen, setConfigOpen] = useState(false);
  const [portDraft, setPortDraft] = useState("");
  const [invalidPort, setInvalidPort] = useState(false);
  const portId = useId();
  const portInput = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  async function configurePort(): Promise<void> {
    if (!mcp) return;
    const port = McpLocalPortSchema.safeParse(Number(portDraft));
    if (!port.success) {
      setInvalidPort(true);
      setError("请输入 1–65535 范围内且浏览器允许的 HTTP 端口。");
      portInput.current?.focus();
      return;
    }
    const status = await act<GatewayMcpStatus>("gateway.mcp.update", { enabled: mcp.enabled, port: port.data });
    if (status) setConfigOpen(false);
  }
  async function copyClientConfig() {
    if (!mcp?.enabled || !mcp.url) return;
    const cfg = { mcpServers: { huhu: { url: mcp.url, headers: { Authorization: "Bearer <在“服务端”里创建的令牌>" } } } };
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
  const open = all.filter((c) => c.exposed).length;
  const eligible = all.filter((c) => c.exposable).length;

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
    <section className="hu-card-alt shell-capability-tester" id="capability-tester">
      <div className="shell-card-head">
        <h2>
          <Code2 size={17} aria-hidden /> {g.bench}
        </h2>
        <Badge>共享应用服务</Badge>
      </div>
      <p className="hu-hint-text">{g.benchHint}</p>
      <form
        className="shell-tester-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void act<Verdict>("gateway.check", { capability: bench.trim() }).then((r) => setVerdict(r));
        }}
      >
        <div className="hu-stack">
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
        <div className="shell-tester-output">
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
            <div className="shell-tester-empty">
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
          <div className="shell-tester-output" data-testid="bench-result" data-ok={invoked.ok}>
            <Badge tone={invoked.ok ? "success" : "danger"}>{invoked.ok ? "成功" : `失败 · ${invoked.code}`}</Badge>
            <pre className="code-block">{invoked.body}</pre>
          </div>
        ) : null}
      </form>
    </section>
  );

  return (
    <div className="hu-module-layout" data-testid="gateway-module">
      <div className="hu-view-content interfaces-view">
        <PageHead
          eyebrow="ONE CAPABILITY, EVERYWHERE"
          title={TITLE[section] ?? TITLE["mcp"]!}
          description="统一注册、统一鉴权、统一应用服务。任何客户端都可以调用，无需绑定大模型。"
          actions={
            <Button
              icon={BookOpen}
              data-testid="gateway-guide"
              onClick={() => {
                if (onNavigate) onNavigate("settings", "agent-access");
                else openSettings(ui, "agent-access");
              }}
            >
              HUHU 使用指南
            </Button>
          }
        />
        <div className="shell-system-scroll hu-scroll">
          {error ? (
            <div role="alert" className="hu-callout danger">
              <p>{error}</p>
            </div>
          ) : null}
          {section === "cli" ? (
            <CliSection />
          ) : section === "server" ? (
            <>
              {engine.endpoint.token ? <WebSharePanel /> : null}
              <section className="hu-card-alt hu-gateway-overview">
                <div className="row">
                  <span className="shell-plugin-large-icon">
                    <Server size={24} aria-hidden />
                  </span>
                  <div className="hu-flex-fill">
                    <h2>HUHU 本地服务</h2>
                    <p>127.0.0.1 · Bearer 令牌 · 与 CLI、MCP 共享同一套能力</p>
                  </div>
                  <Badge tone="success">随引擎运行</Badge>
                </div>
              </section>
              <section className="hu-settings-section hu-card-alt">
                <div className="shell-card-head">
                  <h2>{g.tokens}</h2>
                </div>
                <form
                  className="hu-form-body"
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
                  <div role="status" data-testid="fresh-token" className="hu-callout">
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
              <section className="hu-card-alt" data-testid="gateway-audit">
                <div className="shell-card-head">
                  <h2>调用记录</h2>
                  <Button disabled={(audit.data ?? []).length === 0} data-testid="audit-clear" onClick={() => void act("gateway.audit.clear", {})}>
                    清空
                  </Button>
                </div>
                <p className="hu-hint-text">只记录外部入口（CLI / MCP / HTTP）的调用：时间、入口、能力、结果与耗时，不含输入内容。</p>
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
              <section className="hu-card-alt hu-gateway-overview">
                <div className="row">
                  <span className="shell-plugin-large-icon">
                    <Monitor size={26} aria-hidden />
                  </span>
                  <div className="hu-flex-fill">
                    <h2>Electron Desktop</h2>
                    <p>React Renderer → Typed Preload → Main Adapter → Engine（HTTP 能力调度）</p>
                  </div>
                  <Badge tone="success">Electron Vault 端口已接入</Badge>
                </div>
              </section>
              <div className="shell-desktop-layer-grid">
                {[
                  ["Renderer", Monitor, "React 视图与交互状态", "不直接访问文件、数据库、凭据或进程。"],
                  ["Preload Bridge", ShieldCheck, "窄接口 / 输入验证", "按能力提供类型化入口，禁止暴露任意 invoke。"],
                  ["Main / Runtime", Blocks, "装配 / 调度 / 生命周期", "Engine 在独立进程里托管插件与能力调度，Main 只负责窗口与系统集成。"],
                  ["Infrastructure", Database, "文件 / 进程 / 网络", "通过端口注入。其他宿主可以替换适配实现。"],
                ].map(([title, Icon, strong, text]) => {
                  const I = Icon as typeof Monitor;
                  return (
                    <div className="hu-card-alt shell-desktop-layer" key={String(title)}>
                      <I size={24} aria-hidden />
                      <h3>{String(title)}</h3>
                      <strong>{String(strong)}</strong>
                      <p>{String(text)}</p>
                    </div>
                  );
                })}
              </div>
              <section className="hu-card-alt shell-system-section">
                <div className="shell-card-head">
                  <h2>桌面交互入口</h2>
                </div>
                <div className="shell-desktop-action-grid">
                  <Button icon={Folder} onClick={() => openSettings(ui, "vault")}>
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
              <section className="hu-card-alt hu-gateway-overview">
                <div className="row">
                  <span className="shell-plugin-large-icon">
                    <Plug size={24} aria-hidden />
                  </span>
                  <div className="hu-flex-fill">
                    <h2>MCP Server</h2>
                    <p>当前 Vault · Streamable HTTP · 能力按模块授权</p>
                  </div>
                  <Badge tone={open ? "success" : "neutral"}>{`可调用工具 ${open}/${eligible}`}</Badge>
                  <ChoiceSwitch checked={mcp?.enabled ?? false} label={g.mcpEnabled} onChange={(enabled) => void act("gateway.mcp.update", { enabled })} />
                </div>
                <p className="small muted">
                  {mcp?.enabled ? "本机端点已启用。请从运行 Engine 的机器使用服务端令牌连接。" : "MCP 服务当前关闭。"}
                  {mcp?.url && <> <code>{mcp.url}</code></>}
                </p>
                {mcp?.restartRequired && <p role="status" className="small muted">重启 Engine 后将使用端口 {mcp.configuredPort}。</p>}
                <div className="shell-gateway-meta">
                  <button type="button" data-testid="gateway-mcp-config" disabled={!mcp} onClick={() => {
                    setPortDraft(String(mcp?.configuredPort ?? mcp?.activePort ?? ""));
                    setInvalidPort(false);
                    setError(null);
                    setConfigOpen(true);
                  }}>
                    <Settings size={14} aria-hidden /> 配置本机端点
                  </button>
                  <button type="button" data-testid="gateway-mcp-copy" disabled={!mcp?.enabled || !mcp.url} onClick={() => void copyClientConfig()}>
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
              <Dialog open={configOpen} title="MCP 配置" description="端口设置在 Engine 下次启动时生效。" error={error} onClose={() => setConfigOpen(false)} testId="gateway-mcp-dialog" actions={<Button type="submit" form={portId}>保存端口</Button>}>
                <form id={portId} className="hu-field" noValidate onSubmit={(event) => {
                  event.preventDefault();
                  void configurePort();
                }}>
                  <label className="hu-field-label" htmlFor={`${portId}-value`}>本机端口</label>
                  <input id={`${portId}-value`} ref={portInput} type="number" required min={1} max={65535} step={1} aria-invalid={invalidPort || undefined} value={portDraft} onChange={(event) => {
                    setPortDraft(event.target.value);
                    if (invalidPort) {
                      setInvalidPort(false);
                      setError(null);
                    }
                  }} />
                </form>
              </Dialog>
              <div className="hu-capabilities-toolbar">
                <Segmented<McpTab> label="MCP 条目类型" value={mcpTab} onChange={setMcpTab} options={MCP_TABS} />
                {mcpTab === "tools" ? <SearchBox value={filter} onChange={setFilter} placeholder={g.filter} /> : null}
              </div>
              <section className="hu-card-alt" data-testid={`mcp-${mcpTab}`}>
                {mcpCatalog.isPending ? <p role="status">正在读取能力目录…</p> : mcpCatalog.isError ? (
                  <p role="alert">{mcpCatalog.error.message}</p>
                ) : (
                  <DataTable
                    label={`MCP ${mcpTab}`}
                    rows={protocolEntries}
                    rowKey={(entry) => JSON.stringify([entry.sourceId, entry.upstreamIdentity])}
                    columns={[
                      { id: "name", header: "名称", width: 260, cell: (entry) => <code>{entry.publicKey}</code> },
                      { id: "desc", header: "说明", width: 420, cell: (entry) => entry.description },
                      { id: "source", header: "来源", width: 160, cell: (entry) => entry.sourceId === "builtin" ? "Huhu 内置" : "外部 MCP" },
                      { id: "policy", header: "开放状态", width: 110, cell: (entry) => entry.selected ? "已选择" : "未开放" },
                    ]}
                  />
                )}
              </section>
              <div hidden={mcpTab !== "tools"}>
                <SshHostGrants policy={gw.data?.toolAccess} />
                <ToolPolicyCatalog entries={all} filter={filter} policy={gw.data?.toolAccess} />
              </div>
              <div className="hu-callout shell-system-note">
                <ShieldCheck size={17} aria-hidden />
                <p>发现工具与调用都会检查模块状态和工具开放设置。任务派遣需要单独授权，执行回执由所属模块签收。</p>
              </div>
              {tester}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
