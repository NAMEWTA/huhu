import { Badge, Button, DataTable, EmptyState, Field, IconButton, PageHead, SearchBox, Segmented } from "@huhu/ui";
import { Activity, ArrowRight, Cable, FileUp, Fingerprint, Folder, KeyRound, LockKeyhole, Monitor, Network, Play, Plus, Server, ShieldCheck, Terminal, Unplug, X } from "lucide-react";
import { host as desktopHost, queryKey, useCapability, useEngine, useEngineEvents, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { z } from "zod";
import type { DirectoryView } from "../engine/directory-schema.js";
import type { ConnectionHop, ConnectionStatus, HostKeyPrompt } from "../shared/trust.js";
import { AttachedFiles, FileWorkspace } from "./FileWorkspace.js";
import type { FileSession } from "../shared/files.js";
import { HostEditorDialog } from "./HostEditorDialog.js";
import { HostImportDialog } from "./HostImportDialog.js";
import { HostKeyDialog, hostEndpoint } from "./HostKeyDialog.js";
import { HostRecordActionDialog } from "./HostRecordActionDialog.js";
import { KnownHostsPanel } from "./KnownHostsPanel.js";
import { AuthenticationDialog } from "./AuthenticationDialog.js";
import { KeyLibraryPanel } from "./KeyLibraryPanel.js";
import { authAvailability, authLabels, isManagedHost, type Host, type ManagedHost } from "./host-record.js";
import { WorkspaceLibrary } from "./WorkspaceLibrary.js";
import { ForwardingPanel } from "./ForwardingPanel.js";
import { MonitorDashboard } from "./MonitorDashboard.js";
import { SshTerminal } from "./SshTerminal.js";
import { RoutePanel } from "./RoutePanel.js";
import { directJumpIds, routeForHost } from "../shared/route.js";
import { t } from "./i18n.js";

interface Shell {
  id: string;
  hostId: string;
  name: string;
  state: "running" | "ended";
}
interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  ms: number;
  interrupted: boolean;
}

type Tab = "overview" | "terminal" | "exec" | "files" | "audit" | "known";
type HostAction = { kind: "create" } | { kind: "edit" | "copy" | "remove"; host: ManagedHost };
const CONNECTIONS = "ssh.connections.status";
const routeStages: Record<ConnectionHop["stage"], string> = {
  dialing: "拨号",
  trust: "核对指纹",
  authenticating: "认证",
  answering: "等待回答",
  forwarding: "打开跳板连接",
  connected: "成功",
  failed: "失败",
};

function groupPath(directory: z.output<typeof DirectoryView> | undefined, hostId: string): string {
  if (!directory) return "";
  const groups = new Map(directory.groups.map((group) => [group.groupId, group]));
  const parts: string[] = [];
  let groupId = directory.hosts.find((host) => host.hostId === hostId)?.groupId;
  while (groupId) {
    const group = groups.get(groupId);
    if (!group) break;
    groups.delete(groupId);
    parts.unshift(group.name);
    groupId = group.parentId;
  }
  return parts.join(" / ");
}

export function SshModule({ onNavigate }: Pick<ModuleProps, "onNavigate">) {
  const engine = useEngine();
  const qc = useQueryClient();
  const desktop = Boolean(desktopHost());
  const hosts = useCapability<Host[]>("ssh.hosts.list", {});
  const directory = useCapability<z.output<typeof DirectoryView>>("ssh.hosts.directory", {});
  const connections = useCapability<ConnectionStatus[]>(CONNECTIONS, {});
  const refetchConnections = connections.refetch;
  const [sel, setSel] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [knownReview, setKnownReview] = useState<HostKeyPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<{ hostId: string; message: string } | null>(null);
  const [requestHost, setRequestHost] = useState<string | null>(null);
  const [hostAction, setHostAction] = useState<HostAction | null>(null);
  const [cmd, setCmd] = useState("");
  const [result, setResult] = useState<ExecResult | null>(null);
  const [activeShell, setActiveShell] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [workspaces, setWorkspaces] = useState(false);
  const [keyLibrary, setKeyLibrary] = useState(false);
  const [routes, setRoutes] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [fileView, showFileView] = useState(false);
  const [selectedFile, selectFile] = useState("");
  const [fileSeed, setFileSeed] = useState<FileSession | null>(null);
  const [importVault, setImportVault] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ vaultId: string; text: string; pending: boolean } | null>(null);
  const importStatus = importResult?.vaultId === engine.vaultId ? importResult : null;
  const recoveredHostId = connections.data?.find((status) => (status.state === "waiting" || status.state === "auth-waiting") && !status.workspace)?.hostId;
  const host = (hosts.data ?? []).find((h) => h.id === (sel ?? recoveredHostId)) ?? hosts.data?.[0] ?? null;
  const shells = useCapability<Shell[]>("ssh.shells.list", host ? { hostId: host.id } : {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("ssh.") });
  async function hostApplied(hostId: string | null) {
    setSel(hostId);
    setActiveShell(null);
    setResult(null);
    setTab("overview");
    await refresh();
    setHostAction(null);
  }

  useEffect(() => {
    void refetchConnections();
  }, [refetchConnections]);
  useEffect(() => {
    if (recoveredHostId) setSel((current) => current ?? recoveredHostId);
  }, [recoveredHostId]);
  useEngineEvents((e) => {
    if (e.type === "ssh.hostKeyPrompt" || e.type === "ssh.connectionChanged") {
      void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, CONNECTIONS), exact: true });
    }
  });

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  async function connect(h: Host) {
    setConnectError(null);
    setRequestHost(h.id);
    setSel(h.id);
    setTab("overview");
    try {
      await engine.call("ssh.connect", { hostId: h.id, ...(desktop && { background: true }) }, { write: true });
    } catch (e) {
      setConnectError({ hostId: h.id, message: message(e) });
    } finally {
      await refetchConnections();
      setRequestHost((current) => (current === h.id ? null : current));
    }
  }
  async function run() {
    if (!host || !cmd.trim()) return;
    setError(null);
    try {
      setResult(await engine.call<ExecResult>("ssh.exec.run", { hostId: host.id, command: cmd, timeoutSec: 60 }, { write: true }));
    } catch (e) {
      setError(message(e));
    }
  }
  async function newShell() {
    if (!host) return;
    setError(null);
    try {
      const s = await engine.call<Shell>("ssh.shells.open", { hostId: host.id }, { write: true });
      setActiveShell(s.id);
      await refresh();
    } catch (e) {
      setError(message(e));
    }
  }

  const byHost = new Map(connections.data?.map((entry) => [entry.hostId, entry]));
  const connection = host ? byHost.get(host.id) : undefined;
  const isConn = connection?.state === "connected";
  const waiting = connection?.state === "waiting";
  const authWaiting = connection?.state === "auth-waiting";
  const authPrompt = authWaiting && !connection.workspace ? connection.authPrompt : null;
  const changed = connection?.state === "key-changed";
  const workspacePrompt = (waiting || changed) && connection.workspace;
  const prompt = waiting || changed ? connection.prompt : null;
  const connecting = connection?.state === "connecting" || (host !== null && requestHost === host.id);
  const status = isConn ? "connected" : connecting || waiting || authWaiting ? "connecting" : "disconnected";
  const failure = connection?.state === "failed" ? connection : null;
  const requestError = connectError?.hostId === host?.id ? connectError?.message : null;
  const openReview = (item: HostKeyPrompt | null) => {
    if (item) setDismissed(item.promptId);
    setKnownReview(item);
    setTab("known");
  };
  const audit = useCapability<{ at: string; action: string; hostId: string; result?: string; detail?: string }[]>("ssh.audit.list", { limit: 100 });
  const shown = (hosts.data ?? []).filter((h) => `${h.name}${h.host}`.toLowerCase().includes(query.toLowerCase()));
  let nextRoute: Host[] = [];
  if (host) {
    try {
      nextRoute = routeForHost(new Map(hosts.data?.map((item) => [item.id, item])), host.id).slice(0, -1);
    } catch {
      // The route editor displays missing or invalid configuration separately from the last connection.
    }
  }
  async function disconnect(h: Host) {
    setConnectError(null);
    try {
      await engine.call("ssh.disconnect", { hostId: h.id }, { write: true });
      await refetchConnections();
    } catch (e) {
      setConnectError({ hostId: h.id, message: message(e) });
    }
  }
  function openFiles(session?: FileSession) {
    if (session) {
      setFileSeed(session);
      selectFile(session.fileSessionId);
    }
    showFileView(true);
  }
  const withFileWorkspace = (content: ReactNode) => (
    <>
      <div className="ssh-file-view" hidden={fileView}>
        {content}
      </div>
      <FileWorkspace active={fileView} selectedId={selectedFile} seed={fileSeed} select={selectFile} onBack={() => showFileView(false)} />
    </>
  );
  if (workspaces) return withFileWorkspace(<WorkspaceLibrary shown={!fileView} onHosts={() => setWorkspaces(false)} onFiles={openFiles} />);
  if (keyLibrary) return <KeyLibraryPanel onBack={() => { setKeyLibrary(false); void refresh(); }} />;
  if (routes) return <RoutePanel hosts={hosts.data ?? []} onBack={() => setRoutes(false)} onChanged={refresh} />;
  if (monitoring)
    return withFileWorkspace(
      <MonitorDashboard
        directory={directory.data}
        onBack={() => setMonitoring(false)}
        onReview={(prompt) => {
          setMonitoring(false);
          openReview(prompt);
        }}
      />,
    );
  if (forwarding)
    return withFileWorkspace(
      <ForwardingPanel
        hosts={hosts.data ?? []}
        onBack={() => setForwarding(false)}
        onReview={(prompt) => {
          setForwarding(false);
          openReview(prompt);
        }}
      />,
    );
  return withFileWorkspace(
    <div className="hu-module-layout hu-execution-module" data-testid="ssh-module">
      <aside className="hu-resource-pane" aria-label={t.title}>
        <div className="hu-resource-head ssh-resource-head">
          <Button variant="ghost" onClick={() => setWorkspaces(true)}>
            工作区
          </Button>
          <Button variant="ghost" onClick={() => openFiles()}>
            独立文件会话
          </Button>
          {desktop && (
            <Button variant="ghost" onClick={() => setForwarding(true)}>
              端口转发
            </Button>
          )}
          {desktop && (
            <Button variant="ghost" onClick={() => setMonitoring(true)}>
              监控
            </Button>
          )}
          <div className="row">
            <span className="hu-flex-fill ssh-resource-title">{t.hosts}</span>
            <span className="ssh-count">{(hosts.data ?? []).length}</span>
            {desktop ? <IconButton icon={Plus} label="新增 SSH 主机" onClick={() => setHostAction({ kind: "create" })} /> : null}
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder="搜索主机…" />
        </div>
        <div className="hu-resource-list">
          <div className="ssh-list-label">连接配置</div>
          {shown.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`ssh-resource-row ssh-session-row${host?.id === h.id ? " active" : ""}`}
              aria-current={host?.id === h.id}
              onClick={() => {
                setSel(h.id);
                setActiveShell(null);
                setResult(null);
                setTab("overview");
              }}
            >
              <Server size={17} aria-hidden />
              <span className="hu-flex-fill">
                <strong>{h.name}</strong>
                <span className="small muted">
                  {h.user}@{h.host}
                </span>
              </span>
              {byHost.get(h.id)?.state === "waiting" ? <Badge tone="warning">待核对</Badge> : null}
              {byHost.get(h.id)?.state === "auth-waiting" ? <Badge tone="warning">待认证</Badge> : null}
              {byHost.get(h.id)?.state === "key-changed" ? <Badge tone="danger">密钥变化</Badge> : null}
              {!isManagedHost(h) && <Badge tone="warning">需要修复</Badge>}
              <span className={`hu-execution-status-dot ${byHost.get(h.id)?.state === "connected" ? "connected" : "disconnected"}`} aria-label={byHost.get(h.id)?.state === "connected" ? t.connected : t.notConnected} />
            </button>
          ))}
        </div>
        <div className="ssh-pane-foot">
          <div className="row">
            <LockKeyhole size={15} aria-hidden /> 本机 SSH 认证
          </div>
          <span className="muted small">连接、PTY 与 Exec 独立管理</span>
          {onNavigate && (
            <Button variant="ghost" onClick={() => onNavigate("settings", "ssh")}>
              SSH 设置
            </Button>
          )}
          <Button variant="ghost" icon={Fingerprint} onClick={() => openReview(null)}>
            已知主机
          </Button>
          {desktop && <Button variant="ghost" icon={KeyRound} onClick={() => setKeyLibrary(true)}>密钥</Button>}
          {desktop && <Button variant="ghost" icon={Network} onClick={() => setRoutes(true)}>跳板路由</Button>}
          <Button variant="ghost" icon={Activity} onClick={() => setTab("audit")}>
            全部连接审计
          </Button>
        </div>
      </aside>
      <main className="hu-view-content">
        <PageHead
          title={tab === "known" ? "已知主机" : (host?.name ?? t.title)}
          description={tab === "known" ? "核对 HUHU 已保存的服务器指纹。" : host ? hostEndpoint(host) : "通过统一连接配置管理远程工作环境。"}
          actions={
            <>
              {desktop ? (
                <Button icon={FileUp} onClick={() => setImportVault(engine.vaultId)}>
                  {importStatus?.pending ? "补齐导入分组" : "导入主机"}
                </Button>
              ) : null}
              {host && tab !== "known" ? (
                isConn ? (
                  <Button icon={Unplug} onClick={() => void disconnect(host)}>
                    {t.disconnect}
                  </Button>
                ) : authWaiting ? (
                  <Button variant="primary" onClick={() => {
                    if (connection.workspace) setWorkspaces(true);
                    else {
                      setTab("overview");
                      setDismissed(null);
                    }
                  }}>继续交互认证</Button>
                ) : waiting ? (
                  <Button
                    icon={Fingerprint}
                    variant="primary"
                    onClick={() => {
                      if (workspacePrompt) {
                        setWorkspaces(true);
                        return;
                      }
                      setTab("overview");
                      setDismissed(null);
                    }}
                  >
                    {workspacePrompt ? "在工作区核对主机指纹" : "核对主机指纹"}
                  </Button>
                ) : connecting ? (
                  <Button onClick={() => void disconnect(host)}>取消连接</Button>
                ) : (
                  <Button variant="primary" icon={Cable} disabled={!isManagedHost(host)} onClick={() => void connect(host)}>
                    {t.connect}
                  </Button>
                )
              ) : null}
            </>
          }
        />
        <div className="hu-toolbar">
          <Segmented<Tab>
            label="SSH 功能"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview", label: "连接概览", icon: Server },
              { value: "terminal", label: "交互终端", icon: Terminal },
              { value: "exec", label: "Exec", icon: Terminal },
              { value: "files", label: "文件", icon: Folder },
              { value: "audit", label: "审计", icon: Activity },
              { value: "known", label: "已知主机", icon: Fingerprint },
            ]}
          />
          <span className="hu-flex-fill" />
          {host && tab !== "known" ? (
            <Badge tone={isConn ? "success" : changed ? "danger" : waiting ? "warning" : "neutral"}>{isConn ? t.connected : changed ? "密钥变化，连接已阻断" : waiting ? "等待核对主机指纹" : connecting ? "连接中" : t.notConnected}</Badge>
          ) : null}
        </div>
        <div role="status">
          {importStatus ? (
            <div className="hu-callout">
              <p>{importStatus.text}</p>
            </div>
          ) : null}
        </div>
        {error ? (
          <div role="alert" className="hu-callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        {tab !== "known" && changed ? (
          <div role="alert" className="hu-callout danger">
            <p>
              连接到「{connection.prompt.target.name}」时，第 {connection.prompt.hop + 1} 跳「{connection.prompt.server.name}」的主机密钥发生变化。
            </p>
            <Button onClick={() => openReview(connection.prompt)}>到已知主机复核</Button>
          </div>
        ) : null}
        {tab !== "known" && (failure || (requestError && !changed)) ? (
          <div role="alert" className="hu-callout danger">
            <p>
              {failure?.server ? `第 ${(failure.hop ?? 0) + 1} 跳 · ${failure.server.name} · ` : ""}
              {failure?.message ?? requestError}
            </p>
          </div>
        ) : null}
        {!host && tab !== "audit" && tab !== "known" ? (
          <EmptyState
            icon={Server}
            title={desktop ? t.noHosts : "还没有 SSH 主机"}
            action={
              desktop ? (
                <Button variant="primary" icon={Plus} onClick={() => setHostAction({ kind: "create" })}>
                  新增主机
                </Button>
              ) : null
            }
          />
        ) : null}
        {tab === "known" ? (
          <KnownHostsPanel desktop={desktop} review={knownReview} />
        ) : tab === "audit" ? (
          <div className="hu-scroll ssh-pad" data-testid="ssh-audit">
            <div className="row ssh-section-heading">
              <h3 className="hu-flex-fill">全部连接审计</h3>
            </div>
            <DataTable
              label="连接审计"
              rows={(audit.data ?? []).map((a, i) => ({ ...a, key: `${a.at}-${i}` }))}
              rowKey={(a) => a.key}
              rowTestId="ssh-audit-row"
              columns={[
                { id: "at", header: "时间", width: 170, className: "mono", cell: (a) => new Date(a.at).toLocaleString("zh-CN") },
                { id: "action", header: "动作", width: 140, cell: (a) => a.action },
                { id: "host", header: "主机", width: 200, cell: (a) => (hosts.data ?? []).find((h) => h.id === a.hostId)?.name ?? "—" },
                { id: "result", header: "结果", width: 260, cell: (a) => a.result ?? a.detail ?? "" },
              ]}
            />
            {(audit.data ?? []).length === 0 ? <EmptyState icon={Activity} title="还没有连接审计记录" /> : null}
          </div>
        ) : host && tab === "overview" ? (
          <div className="hu-scroll ssh-pad">
            <div className="ssh-connection-hero">
              <div className={`ssh-server-icon ${status}`}>
                <Server size={30} aria-hidden />
              </div>
              <div className="hu-flex-fill">
                <h2>
                  {host.user}@{host.host}
                </h2>
                <p>{isConn ? "连接已就绪，可打开终端、执行命令或浏览文件。" : "连接前会验证主机密钥，并要求你确认指纹。"}</p>
              </div>
              {isConn ? (
                <Button variant="primary" icon={Terminal} onClick={() => setTab("terminal")}>
                  打开终端
                </Button>
              ) : null}
            </div>
            <div className="ssh-meta-grid">
              {[
                { Icon: KeyRound, label: "认证方式", value: authLabels[host.auth.kind] },
                { Icon: Network, label: "下次连接路径", value: directJumpIds(host).length > 0 ? "经跳板转发" : "直接连接" },
                { Icon: ShieldCheck, label: "主机信任", value: isConn ? "已核验本次连接" : changed ? "指纹变化，待复核" : "连接时核验主机身份" },
                { Icon: Folder, label: "分组", value: groupPath(directory.data, host.id) },
              ]
                .filter(({ value }) => value)
                .map(({ Icon, label, value }) => (
                  <div key={label} className="ssh-stat">
                    <span className="muted small">
                      <Icon size={13} aria-hidden /> {label}
                    </span>
                    <strong>{value}</strong>
                  </div>
                ))}
            </div>
            <section className="hu-card-alt hu-execution-connection-route" data-testid="ssh-route">
              <div className="ssh-section-heading">
                <h3>下次连接路径</h3>
              </div>
              <div className="ssh-route">
                <div>
                  <Monitor size={22} aria-hidden />
                  <strong>本地工作台</strong>
                  <span>Desktop host</span>
                </div>
                <ArrowRight size={18} aria-hidden />
                {nextRoute.map((jump) => {
                  return (
                    <Fragment key={jump.id}>
                      <div>
                        <Network size={22} aria-hidden />
                        <strong>{jump.name}</strong>
                        <span>{jump.host}</span>
                      </div>
                      <ArrowRight size={18} aria-hidden />
                    </Fragment>
                  );
                })}
                <div className="ssh-route-target">
                  <Server size={22} aria-hidden />
                  <strong>{host.name}</strong>
                  <span>
                    {host.host}:{host.port}
                  </span>
                </div>
              </div>
            </section>
            {Boolean(connection?.route?.length) && (
              <section className="hu-card-alt ssh-connection-config" aria-label="实际连接路径">
                <h3>实际连接路径</h3>
                {connection?.connectionId && <p>连接 {connection.connectionId} · {shells.data?.filter((shell) => shell.state === "running").length ?? 0} 个活动终端</p>}
                <ol>
                  {connection?.route?.map((hop, index) => (
                    <li key={`${hop.id}:${index}`}>
                      {hop.name} · {hop.user}@{hostEndpoint(hop)} · {hop.auth === "key-library" ? "密钥库" : hop.auth === "keyboard-interactive" ? "交互认证" : authLabels[hop.auth]} · {routeStages[hop.stage]}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="hu-card-alt ssh-connection-config">
              <h3>连接与安全</h3>
              <div className="ssh-definition">
                <span>认证状态</span>
                <span data-testid="ssh-host-auth-state">{authAvailability(host)}</span>
                <span>主机密钥</span>
                <code>{isConn ? "已核验本次连接" : "首次连接时确认指纹"}</code>
                <span>会话策略</span>
                <code>独立 PTY / Exec · 用户断开后撤销租约</code>
              </div>
              {desktop && isManagedHost(host) ? (
                <div className="row">
                  <span className="hu-flex-fill" />
                  <Button data-testid="ssh-host-edit" onClick={() => setHostAction({ kind: "edit", host })}>
                    编辑主机
                  </Button>
                  <Button onClick={() => setHostAction({ kind: "copy", host })}>复制主机</Button>
                  <Button variant="danger" onClick={() => setHostAction({ kind: "remove", host })}>
                    删除主机
                  </Button>
                </div>
              ) : null}
            </section>
          </div>
        ) : host && tab === "exec" ? (
          <div className="hu-scroll ssh-pad">
            <div className="ssh-section-heading">
              <h3>独立远程命令</h3>
              <p className="muted">Exec 不占用交互终端；输出与连接审计分别记录。</p>
            </div>
            <div className="ssh-command-card">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run();
                }}
              >
                <Field label={t.exec}>
                  <input aria-label={t.exec} placeholder="uname -a" value={cmd} onChange={(e) => setCmd(e.target.value)} disabled={!isConn} />
                </Field>
                <div className="row">
                  <div className="ssh-command-presets">
                    {["uname -a", "pwd", "df -h", "whoami"].map((c) => (
                      <button key={c} type="button" onClick={() => setCmd(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <span className="hu-flex-fill" />
                  <Button type="submit" variant="primary" icon={Play} disabled={!cmd.trim() || !isConn}>
                    {t.run}
                  </Button>
                </div>
                {!isConn ? <p className="ssh-warning-text small">请先连接主机，才能使用 Exec。</p> : null}
              </form>
            </div>
            {result ? (
              <div className="ssh-exec-result">
                <div className="row">
                  <code className="hu-flex-fill">$ {cmd}</code>
                  <span className="small muted">{result.ms} ms</span>
                  <Badge tone={result.exitCode === 0 ? "success" : "danger"}>{result.interrupted ? "已中断" : `exit ${result.exitCode ?? "?"}`}</Badge>
                </div>
                <pre data-testid="exec-output" aria-label={t.output}>
                  {result.stdout}
                  {result.stderr}
                  {`\n${t.exitCode}: ${result.exitCode ?? "?"}`}
                </pre>
              </div>
            ) : (
              <EmptyState icon={Terminal} title="命令输出会显示在这里" hint="试试 uname -a 或 df -h。" />
            )}
          </div>
        ) : host && tab === "terminal" ? (
          <div className="hu-ssh-console">
            <div className="hu-ssh-console-bar">
              <div className="ssh-console-tabs" role="tablist" aria-label={t.shells}>
                {(shells.data ?? []).map((s) => (
                  <button key={s.id} type="button" role="tab" aria-selected={s.id === activeShell} className={s.id === activeShell ? "active" : ""} data-testid="shell-tab" onClick={() => setActiveShell(s.id)}>
                    <Terminal size={13} aria-hidden /> {s.name} {s.state === "ended" ? "（已结束）" : ""}
                  </button>
                ))}
              </div>
              <span className="hu-flex-fill" />
              <IconButton icon={Plus} label={t.newShell} disabled={!isConn} onClick={() => void newShell()} />
            </div>
            {activeShell ? (
              <div className="ssh-console-stage">
                <div className="ssh-console-panel" style={{ height: "52vh" }}>
                  <div className="hu-ssh-console-panel-head">
                    <Terminal size={13} aria-hidden />
                    <strong className="hu-flex-fill">{(shells.data ?? []).find((s) => s.id === activeShell)?.name}</strong>
                    <Button variant="danger" icon={X} onClick={() => void engine.call("ssh.shells.close", { id: activeShell }, { write: true }).then(refresh)}>
                      {t.endShell}
                    </Button>
                  </div>
                  <SshTerminal key={activeShell} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={activeShell} ariaLabel={t.terminalLabel} />
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Terminal}
                title={isConn ? "为这台主机打开交互终端" : "先连接主机，再打开终端"}
                hint="SSH shell、单次 Exec 和文件传输共用主机连接，各自保有独立的通道与生命周期。"
                action={
                  <Button variant="primary" icon={Plus} disabled={!isConn} onClick={() => void newShell()}>
                    {t.newShell}
                  </Button>
                }
              />
            )}
          </div>
        ) : host && tab === "files" ? (
          isConn ? (
            <div className="hu-scroll ssh-pad">
              <AttachedFiles key={`${host.id}:${activeShell ?? ""}`} hostId={host.id} shellId={activeShell} onOpen={openFiles} />
            </div>
          ) : (
            <EmptyState icon={Folder} title="先连接主机，再浏览文件" />
          )
        ) : null}
      </main>
      {desktop ? (
        <HostImportDialog
          key={engine.vaultId}
          open={importVault === engine.vaultId}
          onClose={() => setImportVault((current) => (current === engine.vaultId ? null : current))}
          onResult={async ({ imported, groups }) => {
            const pending = groups.state === "pending";
            setImportResult({ vaultId: engine.vaultId, text: pending ? `已保存 ${imported.length} 台主机，分组待补齐。` : `已导入 ${imported.length} 台主机。`, pending });
            await qc.invalidateQueries({ predicate: ({ queryKey: [vault, capability] }) => vault === engine.vaultId && (capability === "ssh.hosts.list" || capability === "ssh.hosts.directory") });
          }}
        />
      ) : null}
      {prompt && !workspacePrompt && tab === "overview" && dismissed !== prompt.promptId && !hostAction && importVault !== engine.vaultId ? (
        <HostKeyDialog key={prompt.promptId} prompt={prompt} changed={changed} onClose={() => setDismissed(prompt.promptId)} onReview={() => openReview(prompt)} onRefresh={refetchConnections} />
      ) : null}
      {authPrompt && tab === "overview" && dismissed !== authPrompt.promptId && !hostAction && importVault !== engine.vaultId && (
        <AuthenticationDialog key={authPrompt.promptId} prompt={authPrompt} onClose={() => setDismissed(authPrompt.promptId)} onAnswered={refetchConnections} />
      )}
      {desktop && (hostAction?.kind === "create" || hostAction?.kind === "edit") ? (
        <HostEditorDialog
          editing={hostAction.kind === "edit" ? hostAction.host : null}
          hosts={hosts.data ?? []}
          group={hostAction.kind === "edit" ? groupPath(directory.data, hostAction.host.id) : ""}
          onClose={() => setHostAction(null)}
          onSaved={hostApplied}
        />
      ) : null}
      {desktop && (hostAction?.kind === "copy" || hostAction?.kind === "remove") ? (
        <HostRecordActionDialog
          action={hostAction.kind}
          host={hostAction.host}
          hosts={hosts.data ?? []}
          onClose={() => setHostAction(null)}
          onApplied={hostApplied}
          onEdit={(host) => setHostAction({ kind: "edit", host })}
          onRefresh={refresh}
        />
      ) : null}
    </div>,
  );
}
