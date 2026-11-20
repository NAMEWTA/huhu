import { Badge, Button, DataTable, Dialog, EmptyState, Field, IconButton, PageHead, SearchBox, Segmented, TerminalView } from "@huhu/ui";
import { Activity, ArrowRight, Cable, FileUp, Fingerprint, Folder, KeyRound, LockKeyhole, Monitor, Network, Play, Plus, Server, ShieldCheck, Terminal, Unplug, X } from "lucide-react";
import { CapabilityError, host as desktopHost, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { Fragment, useState } from "react";
import type { z } from "zod";
import type { DirectoryView } from "../engine/directory-schema.js";
import { FilesPanel } from "./FilesPanel.js";
import { HostEditorDialog } from "./HostEditorDialog.js";
import { HostImportDialog } from "./HostImportDialog.js";
import { HostRecordActionDialog } from "./HostRecordActionDialog.js";
import { authAvailability, authLabels, isManagedHost, type Host, type ManagedHost } from "./host-record.js";
import { t } from "./i18n.js";

interface Shell {
  id: string;
  hostId: string;
  name: string;
  state: "running" | "ended";
}
interface Prompt {
  attemptId: string;
  hop: number;
  fingerprint: string;
  keyType: string;
  reason: "first" | "changed";
}
interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  ms: number;
  interrupted: boolean;
}

type Tab = "overview" | "terminal" | "exec" | "files" | "audit";
type HostAction = { kind: "create" } | { kind: "edit" | "copy" | "remove"; host: ManagedHost };

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

export function SshModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const desktop = Boolean(desktopHost());
  const hosts = useCapability<Host[]>("ssh.hosts.list", {});
  const directory = useCapability<z.output<typeof DirectoryView>>("ssh.hosts.directory", {});
  const [sel, setSel] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hostAction, setHostAction] = useState<HostAction | null>(null);
  const [cmd, setCmd] = useState("");
  const [result, setResult] = useState<ExecResult | null>(null);
  const [activeShell, setActiveShell] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [importVault, setImportVault] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ vaultId: string; text: string; pending: boolean } | null>(null);
  const importStatus = importResult?.vaultId === engine.vaultId ? importResult : null;
  const host = (hosts.data ?? []).find((h) => h.id === sel) ?? hosts.data?.[0] ?? null;
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

  useEngineEvents((e) => {
    if (e.type === "ssh.hostKeyPrompt") setPrompt(e.payload as Prompt);
    if (e.type === "ssh.connectionChanged") {
      const p = e.payload as { hostId: string; state: string };
      setConnected((s) => {
        const n = new Set(s);
        if (p.state === "connected") n.add(p.hostId);
        else n.delete(p.hostId);
        return n;
      });
    }
  });

  const message = (e: unknown) => (e instanceof CapabilityError && e.code === "SAFE_LOCKED" ? t.safeLocked : e instanceof Error ? e.message : String(e));

  async function connect(h: Host) {
    setError(null);
    setBusy(true);
    try {
      await engine.call("ssh.connect", { hostId: h.id }, { write: true });
      setConnected((s) => new Set(s).add(h.id));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setPrompt(null);
    }
  }
  const decide = (accept: boolean) => {
    if (!prompt) return;
    void engine.call("ssh.hostKey.decide", { attemptId: prompt.attemptId, hop: prompt.hop, accept }, { write: true }).finally(() => setPrompt(null));
  };
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

  const isConn = host ? connected.has(host.id) : false;
  const status = host ? (isConn ? "connected" : busy && sel === host.id ? "connecting" : "disconnected") : "disconnected";
  const audit = useCapability<{ at: string; action: string; hostId: string; result?: string; detail?: string }[]>("ssh.audit.list", { limit: 100 });
  const shown = (hosts.data ?? []).filter((h) => `${h.name}${h.host}`.toLowerCase().includes(query.toLowerCase()));
  const disconnect = (h: Host) =>
    void engine.call("ssh.disconnect", { hostId: h.id }, { write: true }).then(() =>
      setConnected((x) => {
        const n = new Set(x);
        n.delete(h.id);
        return n;
      }),
    );
  return (
    <div className="hu-module-layout hu-execution-module" data-testid="ssh-module">
      <aside className="hu-resource-pane" aria-label={t.title}>
        <div className="hu-resource-head ssh-resource-head">
          <div className="row">
            <span className="grow ssh-resource-title">{t.hosts}</span>
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
              <span className="grow">
                <strong>{h.name}</strong>
                <span className="small muted">
                  {h.user}@{h.host}
                </span>
              </span>
              <span className={`hu-execution-status-dot ${connected.has(h.id) ? "connected" : "disconnected"}`} aria-label={connected.has(h.id) ? t.connected : t.notConnected} />
            </button>
          ))}
        </div>
        <div className="ssh-pane-foot">
          <div className="row">
            <LockKeyhole size={15} aria-hidden /> 本机 SSH 认证
          </div>
          <span className="muted small">连接、PTY 与 Exec 独立管理</span>
          <Button variant="ghost" icon={Activity} onClick={() => setTab("audit")}>
            全部连接审计
          </Button>
        </div>
      </aside>
      <main className="hu-view-content">
        <PageHead
          title={host?.name ?? t.title}
          description={host ? `${host.host}:${host.port}` : "通过统一连接配置管理远程工作环境。"}
          actions={
            <>
              {desktop ? (
                <Button icon={FileUp} onClick={() => setImportVault(engine.vaultId)}>
                  {importStatus?.pending ? "补齐导入分组" : "导入主机"}
                </Button>
              ) : null}
              {host ? (
                isConn ? (
                  <Button icon={Unplug} onClick={() => disconnect(host)}>
                    {t.disconnect}
                  </Button>
                ) : (
                  <Button variant="primary" icon={Cable} loading={busy} onClick={() => void connect(host)}>
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
            ]}
          />
          <span className="grow" />
          {host ? <Badge tone={status === "connected" ? "success" : "neutral"}>{status === "connected" ? t.connected : status === "connecting" ? "连接中" : t.notConnected}</Badge> : null}
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
        {!host && tab !== "audit" ? (
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
        {tab === "audit" ? (
          <div className="hu-scroll ssh-pad" data-testid="ssh-audit">
            <div className="row ssh-section-heading">
              <h3 className="grow">全部连接审计</h3>
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
              <div className="grow">
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
                { Icon: Network, label: "连接路径", value: (host.jumpHostIds ?? []).length > 0 ? "经跳板转发" : "直接连接" },
                { Icon: ShieldCheck, label: "主机信任", value: isConn ? "已保存信任" : "首次连接待确认" },
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
                <h3>连接路径</h3>
                <span className="muted small">可视化跳板链</span>
              </div>
              <div className="ssh-route">
                <div>
                  <Monitor size={22} aria-hidden />
                  <strong>本地工作台</strong>
                  <span>Desktop host</span>
                </div>
                <ArrowRight size={18} aria-hidden />
                {(host.jumpHostIds ?? []).map((jid) => {
                  const j = (hosts.data ?? []).find((x) => x.id === jid);
                  return (
                    <Fragment key={jid}>
                      <div>
                        <Network size={22} aria-hidden />
                        <strong>{j?.name ?? jid}</strong>
                        <span>{j ? `${j.host} · Proxy jump` : "Proxy jump"}</span>
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
            <section className="hu-card-alt ssh-connection-config">
              <h3>连接与安全</h3>
              <div className="ssh-definition">
                <span>认证状态</span>
                <span data-testid="ssh-host-auth-state">{authAvailability(host)}</span>
                <span>主机密钥</span>
                <code>{isConn ? "已保存信任" : "尚未信任 · 首次连接时确认"}</code>
                <span>会话策略</span>
                <code>独立 PTY / Exec · 用户断开后撤销租约</code>
              </div>
              {desktop && isManagedHost(host) ? (
                <div className="row">
                  <span className="grow" />
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
                  <span className="grow" />
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
                  <code className="grow">$ {cmd}</code>
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
              <span className="grow" />
              <IconButton icon={Plus} label={t.newShell} disabled={!isConn} onClick={() => void newShell()} />
            </div>
            {activeShell ? (
              <div className="ssh-console-stage">
                <div className="ssh-console-panel" style={{ height: "52vh" }}>
                  <div className="hu-ssh-console-panel-head">
                    <Terminal size={13} aria-hidden />
                    <strong className="grow">{(shells.data ?? []).find((s) => s.id === activeShell)?.name}</strong>
                    <Button variant="danger" icon={X} onClick={() => void engine.call("ssh.shells.close", { id: activeShell }, { write: true }).then(refresh)}>
                      {t.endShell}
                    </Button>
                  </div>
                  <TerminalView key={activeShell} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={activeShell} ariaLabel={t.terminalLabel} />
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
              <FilesPanel key={host.id} hostId={host.id} />
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
      {prompt ? (
        <Dialog
          open
          title={prompt.reason === "changed" ? "主机密钥发生变化" : "首次连接：确认主机身份"}
          description={prompt.reason === "first" ? "请核对指纹后再保存信任记录。" : "请重新核对指纹。"}
          testId="hostkey-dialog"
          onClose={() => decide(false)}
          actions={
            <>
              <Button onClick={() => decide(false)}>{t.cancel}</Button>
              {prompt.reason === "first" ? (
                <Button variant="primary" icon={ShieldCheck} onClick={() => decide(true)}>
                  {t.trust}
                </Button>
              ) : null}
            </>
          }
        >
          <div className="hu-stack">
            <div className="ssh-trust-heading">
              <Fingerprint size={28} aria-hidden />
              <strong>{prompt.reason === "first" ? t.trustFirst(prompt.hop, prompt.keyType, prompt.fingerprint) : t.trustChanged}</strong>
            </div>
          </div>
        </Dialog>
      ) : null}
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
    </div>
  );
}
