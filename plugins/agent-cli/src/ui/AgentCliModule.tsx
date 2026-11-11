import { Badge, Button, EmptyState, TerminalView } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useEffect, useState } from "react";
import { HistoryPanel } from "./history/HistoryPanel.js";
import { ReviewPanel } from "./ReviewPanel.js";
import { t } from "./i18n.js";

interface Space { id: string; name: string; root: string; revision: number }
interface Session { id: string; spaceId: string; provider: string; name: string; state: string; terminalId: string | null; exitCode?: number | null; error?: string }
interface Provider { provider: string; displayName: string; status: string }

export function AgentCliModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const spaces = useCapability<Space[]>("agent.spaces.list", {});
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const space = (spaces.data ?? []).find((s) => s.id === spaceId) ?? spaces.data?.[0] ?? null;
  const sessions = useCapability<Session[]>("agent.sessions.list", space ? { spaceId: space.id } : {});
  const providers = useCapability<Provider[]>("agent.providers.detect", {});
  const core = useCapability<{ state: string; version: string | null }>("agent.core.status", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.") });

  async function launch(provider: string) {
    if (!space) return;
    setError(null);
    try {
      const s = await engine.call<Session>("agent.sessions.launch", { spaceId: space.id, spaceRevision: space.revision, provider, requestId: crypto.randomUUID() }, { write: true });
      setActive(s.id);
      setMenu(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function act(cap: string, id: string) {
    setError(null);
    try {
      await engine.call(cap, { id }, { write: true });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const list = sessions.data ?? [];
  // 有会话在运行时每 5 秒刷新一次列表：程序结束后徽标会自己变成“已结束”
  const anyRunning = list.some((s) => s.state === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "agent.sessions.list" }), 5000);
    return () => clearInterval(id);
  }, [anyRunning, engine.vaultId, qc]);
  const cur = list.find((s) => s.id === active) ?? null;
  return (
    <div className="hu-module" data-testid="agent-cli-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.spaces}</h2>
        {(spaces.data ?? []).map((s) => (
          <button key={s.id} type="button" className="hu-nav-item" aria-current={space?.id === s.id} title={s.root} onClick={() => { setSpaceId(s.id); setActive(null); }}>
            <span>{s.name}</span>
          </button>
        ))}
        <p className="hu-meta" data-testid="core-status">{t.coreStatus} · {core.data?.state === "connected" ? `${core.data.version} ${t.connected}` : t.unavailable}</p>
      </aside>
      <section className="hu-content">
        <h1>{space?.name ?? t.title}</h1>
        {space ? <p className="hu-meta">{space.root}</p> : null}
        {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
        <div role="tablist" aria-label={t.sessions} className="hu-form">
          {list.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === active} className="hu-btn" data-testid="session-tab" onClick={() => setActive(s.id)}>
              {s.name} <Badge tone={s.state === "running" ? "success" : s.state === "exited" ? "neutral" : "danger"}>{s.state === "running" ? t.running : s.state === "exited" ? t.exited : t.failed}</Badge>
            </button>
          ))}
          <Button variant="primary" aria-expanded={menu} onClick={() => setMenu(!menu)}>{t.newTerminal}</Button>
          <Button aria-expanded={showHistory} data-testid="agent-history-toggle" onClick={() => setShowHistory(!showHistory)}>{showHistory ? t.history.close : t.history.open}</Button>
        </div>
        {menu ? (
          <div role="menu" aria-label={t.newTerminal} className="hu-popover" style={{ position: "static" }}>
            <Button role="menuitem" onClick={() => void launch("shell")}>{t.newTerminal}（shell）</Button>
            {(providers.data ?? []).filter((p) => p.status === "found").map((p) => <Button key={p.provider} role="menuitem" onClick={() => void launch(p.provider)}>{p.displayName}</Button>)}
            {(providers.data ?? []).every((p) => p.status !== "found") ? <p>{t.noProviders}</p> : null}
          </div>
        ) : null}
        {showHistory && space ? (
          <HistoryPanel space={space} installed={new Set((providers.data ?? []).filter((p) => p.status === "found").map((p) => p.provider))} onResumed={(id) => { setActive(id); setShowHistory(false); }} />
        ) : null}
        {list.length === 0 && !showHistory ? <EmptyState title={t.noSessions} /> : null}
        {cur && cur.state === "running" ? (
          <div style={{ height: "55vh" }}>
            <div className="hu-form">
              <Button onClick={() => void act("agent.sessions.interrupt", cur.id)}>{t.interrupt}</Button>
              <Button variant="danger" onClick={() => void act("agent.sessions.kill", cur.id)}>{t.kill}</Button>
              <Button aria-expanded={showReview} data-testid="agent-review-toggle" onClick={() => setShowReview(!showReview)}>{showReview ? t.review.close : t.review.open}</Button>
            </div>
            <TerminalView key={cur.id} baseUrl={engine.endpoint.baseUrl} token={engine.endpoint.token} sessionId={cur.id} ariaLabel={t.terminalLabel} />
          </div>
        ) : cur ? <EmptyState title={cur.state === "exited" ? t.exitedTitle(cur.exitCode ?? null) : (cur.error ?? t.failed)} {...(cur.state === "exited" ? { hint: cur.error ?? t.exitedHint } : {})} /> : list.length > 0 ? <EmptyState title={t.selectSession} /> : null}
        {showReview && cur && space ? <ReviewPanel key={cur.id} spaceId={space.id} sessionId={cur.id} running={cur.state === "running"} provider={cur.provider} /> : null}
      </section>
    </div>
  );
}
