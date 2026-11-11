import { Badge, Button, Dialog, EmptyState, Field, IconButton, PageHead, SearchBox, Segmented, TerminalView } from "@huhu/ui";
import { Activity, ArrowRight, Cable, Fingerprint, Folder, KeyRound, LockKeyhole, Monitor, Network, Play, Plus, Server, ShieldCheck, Terminal, Unplug, X } from "lucide-react";
import { CapabilityError, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { FilesPanel } from "./FilesPanel.js";
import { t } from "./i18n.js";

interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth?: { kind: string; secretRef?: string };
  jumpHostIds?: string[];
}
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

export function SshModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const hosts = useCapability<Host[]>("ssh.hosts.list", {});
  const [sel, setSel] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", host: "", port: "22", user: "", password: "" });
  const [cmd, setCmd] = useState("");
  const [result, setResult] = useState<ExecResult | null>(null);
  const [activeShell, setActiveShell] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const host = (hosts.data ?? []).find((h) => h.id === sel) ?? hosts.data?.[0] ?? null;
  const shells = useCapability<Shell[]>("ssh.shells.list", host ? { hostId: host.id } : {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("ssh.") });

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

  async function saveHost(): Promise<boolean> {
    setError(null);
    try {
      // 密码只存进保险箱（只允许 ssh 模块引用）；主机配置里只保存 safe:// 引用
      const item = await engine.call<{ id: string }>("safe.items.save", { name: `${form.name} 密码`, type: "password", account: form.user, allowedModules: ["ssh"], value: form.password }, { write: true });
      const h = await engine.call<Host>("ssh.hosts.save", { name: form.name, host: form.host, port: Number(form.port), user: form.user, auth: { kind: "password", secretRef: `safe://${item.id}` } }, { write: true });
      setForm({ name: "", host: "", port: "22", user: "", password: "" });
      setSel(h.id);
      await refresh();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    }
  }
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
    <div className="module-layout execution-module" data-testid="ssh-module">
      <aside className="resource-pane" aria-label={t.title}>
        <div className="resource-head">
          <div className="row">
            <strong className="grow">{t.hosts}</strong>
            <span className="knowledge-count">{(hosts.data ?? []).length}</span>
            <IconButton icon={Plus} label="新增 SSH 主机" onClick={() => setAdding(true)} />
          </div>
          <SearchBox value={query} onChange={setQuery} placeholder="搜索主机…" />
        </div>
        <div className="resource-list">
          <div className="execution-list-label">连接配置</div>
          {shown.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`resource-row execution-session-row${host?.id === h.id ? " active" : ""}`}
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
              <span className={`execution-status-dot ${connected.has(h.id) ? "connected" : "disconnected"}`} aria-label={connected.has(h.id) ? t.connected : t.notConnected} />
            </button>
          ))}
        </div>
        <div className="execution-pane-foot">
          <div className="row">
            <LockKeyhole size={15} aria-hidden /> 凭证以引用方式保存
          </div>
          <span className="muted small">连接、PTY 与 Exec 独立管理</span>
          <Button variant="ghost" icon={Activity} onClick={() => setTab("audit")}>
            连接审计
          </Button>
        </div>
      </aside>
      <main className="view-content">
        <PageHead
          title={host?.name ?? t.title}
          description={host ? `${host.host}:${host.port}` : "通过统一连接配置管理远程工作环境。"}
          actions={
            host ? (
              <>
                {isConn ? (
                  <Button icon={Unplug} onClick={() => disconnect(host)}>
                    {t.disconnect}
                  </Button>
                ) : (
                  <Button variant="primary" icon={Cable} loading={busy} onClick={() => void connect(host)}>
                    {t.connect}
                  </Button>
                )}
              </>
            ) : null
          }
        />
        <div className="toolbar">
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
        {error ? (
          <div role="alert" className="callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        {!host && tab !== "audit" ? (
          <EmptyState
            icon={Server}
            title={t.noHosts}
            action={
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                新增主机
              </Button>
            }
          />
        ) : null}
        {tab === "audit" ? (
          <div className="scroll execution-pad" data-testid="ssh-audit">
            <div className="row execution-section-heading">
              <h3 className="grow">全部连接审计</h3>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>动作</th>
                  <th>主机</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {(audit.data ?? []).map((a, i) => (
                  <tr key={`${a.at}-${i}`}>
                    <td className="mono">{new Date(a.at).toLocaleString("zh-CN")}</td>
                    <td>{a.action}</td>
                    <td>{(hosts.data ?? []).find((h) => h.id === a.hostId)?.name ?? "—"}</td>
                    <td>{a.result ?? a.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(audit.data ?? []).length === 0 ? <EmptyState icon={Activity} title="还没有连接审计记录" /> : null}
          </div>
        ) : host && tab === "overview" ? (
          <div className="scroll execution-pad">
            <div className="execution-connection-hero">
              <div className={`execution-server-icon ${status}`}>
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
            <div className="execution-meta-grid">
              {[
                { Icon: KeyRound, label: "认证方式", value: { key: "SSH 私钥", agent: "SSH Agent", password: "密码引用" }[host.auth?.kind ?? "password"] ?? "密码引用" },
                { Icon: Network, label: "连接路径", value: (host.jumpHostIds ?? []).length > 0 ? "经跳板转发" : "直接连接" },
                { Icon: ShieldCheck, label: "主机信任", value: isConn ? "已保存信任" : "首次连接待确认" },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="execution-stat">
                  <span className="muted small">
                    <Icon size={13} aria-hidden /> {label}
                  </span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <section className="card execution-connection-route" data-testid="ssh-route">
              <div className="execution-section-heading">
                <h3>连接路径</h3>
                <span className="muted small">可视化跳板链</span>
              </div>
              <div className="execution-route">
                <div>
                  <Monitor size={22} aria-hidden />
                  <strong>本地工作台</strong>
                  <span>Desktop host</span>
                </div>
                <ArrowRight size={18} aria-hidden />
                {(host.jumpHostIds ?? []).map((jid) => {
                  const j = (hosts.data ?? []).find((x) => x.id === jid);
                  return (
                    <span key={jid} style={{ display: "contents" }}>
                      <div>
                        <Network size={22} aria-hidden />
                        <strong>{j?.name ?? jid}</strong>
                        <span>{j ? `${j.host} · Proxy jump` : "Proxy jump"}</span>
                      </div>
                      <ArrowRight size={18} aria-hidden />
                    </span>
                  );
                })}
                <div className="execution-route-target">
                  <Server size={22} aria-hidden />
                  <strong>{host.name}</strong>
                  <span>
                    {host.host}:{host.port}
                  </span>
                </div>
              </div>
            </section>
            <section className="card execution-connection-config">
              <h3>连接与安全</h3>
              <p className="muted small">密码只保存在保险箱；这里只保存 safe:// 引用，不保存明文凭证。</p>
              <div className="execution-definition">
                <span>凭证引用</span>
                <code>{host.auth?.secretRef ?? "—"}</code>
                <span>主机密钥</span>
                <code>{isConn ? "已保存信任" : "尚未信任 · 首次连接时确认"}</code>
                <span>会话策略</span>
                <code>独立 PTY / Exec · 用户断开后撤销租约</code>
              </div>
              <div className="row">
                <span className="grow" />
                <Button variant="danger" onClick={() => void engine.call("ssh.hosts.delete", { id: host.id }, { write: true }).then(() => (setSel(null), refresh()))}>
                  删除主机
                </Button>
              </div>
            </section>
          </div>
        ) : host && tab === "exec" ? (
          <div className="scroll execution-pad">
            <div className="execution-section-heading">
              <h3>独立远程命令</h3>
              <p className="muted">Exec 不占用交互终端；输出与连接审计分别记录。</p>
            </div>
            <div className="execution-command-card">
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
                  <div className="execution-command-presets">
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
                {!isConn ? <p className="execution-warning-text small">请先连接主机，才能使用 Exec。</p> : null}
              </form>
            </div>
            {result ? (
              <div className="execution-exec-result">
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
          <div className="ssh-console">
            <div className="ssh-console-bar">
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
                  <div className="ssh-console-panel-head">
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
            <div className="scroll execution-pad">
              <FilesPanel key={host.id} hostId={host.id} />
            </div>
          ) : (
            <EmptyState icon={Folder} title="先连接主机，再浏览文件" />
          )
        ) : null}
      </main>
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
          <div className="stack">
            <div className="execution-trust-heading">
              <Fingerprint size={28} aria-hidden />
              <strong>{prompt.reason === "first" ? t.trustFirst(prompt.hop, prompt.keyType, prompt.fingerprint) : t.trustChanged}</strong>
            </div>
          </div>
        </Dialog>
      ) : null}
      {adding ? (
        <Dialog
          open
          title="新增 SSH 主机"
          description="密码只存进保险箱；主机配置里只保存 safe:// 引用。"
          onClose={() => setAdding(false)}
          error={error}
          testId="ssh-host-dialog"
          actions={
            <>
              <Button onClick={() => setAdding(false)}>{t.cancel}</Button>
              <Button variant="primary" disabled={!form.name || !form.host || !form.user || !form.password} onClick={() => void saveHost().then((ok) => ok && setAdding(false))}>
                {t.newHost}
              </Button>
            </>
          }
        >
          <div className="form-body">
            <Field label={t.hostName}>
              <input aria-label={t.hostName} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t.address}>
              <input aria-label={t.address} placeholder="dev.example.internal" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
            </Field>
            <div className="field-grid">
              <Field label={t.port}>
                <input aria-label={t.port} value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
              </Field>
              <Field label={t.user}>
                <input aria-label={t.user} value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
              </Field>
            </div>
            <Field label={t.password}>
              <input type="password" aria-label={t.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
