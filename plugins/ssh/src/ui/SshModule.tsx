import { Badge, Button, EmptyState, TerminalView } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { FilesPanel } from "./FilesPanel.js";
import { t } from "./i18n.js";

interface Host { id: string; name: string; host: string; port: number; user: string }
interface Shell { id: string; hostId: string; name: string; state: "running" | "ended" }
interface Prompt { attemptId: string; hop: number; fingerprint: string; keyType: string; reason: "first" | "changed" }
interface ExecResult { stdout: string; stderr: string; exitCode: number | null; ms: number; interrupted: boolean }

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
  const host = (hosts.data ?? []).find((h) => h.id === sel) ?? hosts.data?.[0] ?? null;
  const shells = useCapability<Shell[]>("ssh.shells.list", host ? { hostId: host.id } : {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("ssh.") });

  useEngineEvents((e) => {
    if (e.type === "ssh.hostKeyPrompt") setPrompt(e.payload as Prompt);
    if (e.type === "ssh.connectionChanged") {
      const p = e.payload as { hostId: string; state: string };
      setConnected((s) => { const n = new Set(s); if (p.state === "connected") n.add(p.hostId); else n.delete(p.hostId); return n; });
    }
  });

  const message = (e: unknown) => (e instanceof CapabilityError && e.code === "SAFE_LOCKED" ? t.safeLocked : e instanceof Error ? e.message : String(e));

  async function saveHost() {
    setError(null);
    try {
      // 密码只存进保险箱（只允许 ssh 模块引用）；主机配置里只保存 safe:// 引用
      const item = await engine.call<{ id: string }>("safe.items.save", { name: `${form.name} 密码`, type: "password", account: form.user, allowedModules: ["ssh"], value: form.password }, { write: true });
      const h = await engine.call<Host>("ssh.hosts.save", { name: form.name, host: form.host, port: Number(form.port), user: form.user, auth: { kind: "password", secretRef: `safe://${item.id}` } }, { write: true });
      setForm({ name: "", host: "", port: "22", user: "", password: "" });
      setSel(h.id);
      await refresh();
    } catch (e) {
      setError(message(e));
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
  return (
    <div className="hu-module" data-testid="ssh-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.hosts}</h2>
        {(hosts.data ?? []).map((h) => (
          <button key={h.id} type="button" className="hu-nav-item" aria-current={host?.id === h.id} onClick={() => { setSel(h.id); setActiveShell(null); setResult(null); }}>
            <span>{h.name}</span><Badge tone={connected.has(h.id) ? "success" : "neutral"}>{connected.has(h.id) ? t.connected : t.notConnected}</Badge>
          </button>
        ))}
        <form className="hu-form" style={{ flexDirection: "column" }} onSubmit={(e) => { e.preventDefault(); void saveHost(); }}>
          <input className="hu-input" aria-label={t.hostName} placeholder={t.hostName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="hu-input" aria-label={t.address} placeholder={t.address} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          <input className="hu-input" aria-label={t.port} placeholder={t.port} value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
          <input className="hu-input" aria-label={t.user} placeholder={t.user} value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
          <input className="hu-input" type="password" aria-label={t.password} placeholder={t.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Button type="submit" disabled={!form.name || !form.host || !form.user || !form.password}>{t.newHost}</Button>
        </form>
      </aside>
      <section className="hu-content">
        <h1>{host?.name ?? t.title}</h1>
        {host ? <p className="hu-meta">{host.user}@{host.host}:{host.port}</p> : <EmptyState title={t.noHosts} />}
        {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
        {prompt ? (
          <div role="alertdialog" aria-label={t.trustTitle} data-testid="hostkey-dialog">
            <p>{prompt.reason === "first" ? t.trustFirst(prompt.hop, prompt.keyType, prompt.fingerprint) : t.trustChanged}</p>
            {prompt.reason === "first" ? <Button variant="primary" onClick={() => decide(true)}>{t.trust}</Button> : null}
            <Button onClick={() => decide(false)}>{t.cancel}</Button>
          </div>
        ) : null}
        {host ? (
          <div className="hu-form">
            {isConn ? <Button onClick={() => void engine.call("ssh.disconnect", { hostId: host.id }, { write: true }).then(() => setConnected((s) => { const n = new Set(s); n.delete(host.id); return n; }))}>{t.disconnect}</Button> : <Button variant="primary" loading={busy} onClick={() => void connect(host)}>{t.connect}</Button>}
          </div>
        ) : null}
        {host && isConn ? (
          <>
            <form className="hu-form" onSubmit={(e) => { e.preventDefault(); void run(); }}>
              <input className="hu-input" aria-label={t.exec} placeholder={t.exec} value={cmd} onChange={(e) => setCmd(e.target.value)} />
              <Button type="submit" disabled={!cmd.trim()}>{t.run}</Button>
            </form>
            {result ? <pre data-testid="exec-output" aria-label={t.output}>{result.stdout}{result.stderr}{`\n${t.exitCode}: ${result.exitCode ?? "?"}`}</pre> : null}
            <div className="hu-form" role="tablist" aria-label={t.shells}>
              {(shells.data ?? []).map((s) => <button key={s.id} type="button" role="tab" aria-selected={s.id === activeShell} className="hu-btn" data-testid="shell-tab" onClick={() => setActiveShell(s.id)}>{s.name} {s.state === "ended" ? "（已结束）" : ""}</button>)}
              <Button onClick={() => void newShell()}>{t.newShell}</Button>
            </div>
            {activeShell ? (
              <div style={{ height: "40vh" }}>
                <Button variant="danger" onClick={() => void engine.call("ssh.shells.close", { id: activeShell }, { write: true }).then(refresh)}>{t.endShell}</Button>
                <TerminalView key={activeShell} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={activeShell} ariaLabel={t.terminalLabel} />
              </div>
            ) : null}
            <FilesPanel key={host.id} hostId={host.id} />
          </>
        ) : null}
      </section>
    </div>
  );
}
