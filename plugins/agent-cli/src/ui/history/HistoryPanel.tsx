import { Button } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { History, Pin, Search } from "lucide-react";
import { useState } from "react";
import { t } from "../i18n.js";

interface Entry {
  provider: "claude" | "codex";
  nativeSessionId: string;
  cwd: string;
  title: string;
  updatedAt: string;
  active: boolean;
  pinned: boolean;
}
interface Session {
  id: string;
}

export function HistoryPanel({ space, installed, onResumed }: { space: { id: string; revision: number; name?: string; root?: string }; installed: Set<string>; onResumed: (sessionId: string) => void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const history = useCapability<{ entries: Entry[]; skipped: number }>("agent.history.list", { spaceId: space.id });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "resumable">("all");

  async function resume(e: Entry) {
    setBusy(e.nativeSessionId);
    setError(null);
    try {
      const s = await engine.call<Session>("agent.history.resume", { spaceId: space.id, spaceRevision: space.revision, provider: e.provider, nativeSessionId: e.nativeSessionId, requestId: crypto.randomUUID() }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("agent.") });
      onResumed(s.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function togglePin(e: Entry) {
    setError(null);
    try {
      await engine.call("agent.history.pin", { spaceId: space.id, provider: e.provider, nativeSessionId: e.nativeSessionId, pinned: !e.pinned }, { write: true });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && q.queryKey[1] === "agent.history.list" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const entries = (history.data?.entries ?? []).filter((e) => (filter === "all" ? true : filter === "active" ? e.active : !e.active) && (query.trim() === "" || e.title.toLowerCase().includes(query.trim().toLowerCase())));
  const skipped = history.data?.skipped ?? 0;
  const FILTERS: ["all" | "active" | "resumable", string][] = [
    ["all", t.history.filterAll],
    ["active", t.history.active],
    ["resumable", t.history.filterResumable],
  ];
  return (
    <section data-testid="agent-history" aria-label={t.history.title} style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div className="v9-sidebar-head">
        <span>
          <History size={15} aria-hidden />
          {t.history.title}
        </span>
        <span className="v9-count">{history.data?.entries.length ?? 0}</span>
      </div>
      <div className="v9-history-space">
        {space.name ?? ""}
        <small title={space.root}>{space.root}</small>
      </div>
      <div className="v9-history-search">
        <Search size={14} aria-hidden />
        <input aria-label={t.history.search} placeholder={t.history.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="v9-history-filters" role="group" aria-label={t.history.filters}>
        {FILTERS.map(([id, label]) => (
          <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="v9-history-list">
        {history.isError ? (
          <div role="alert" className="callout danger">
            <p>{history.error instanceof Error ? history.error.message : String(history.error)}</p>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        {skipped > 0 ? (
          <p className="v9-small-empty" data-testid="history-skipped">
            {t.history.skipped(skipped)}
          </p>
        ) : null}
        {!history.data && !history.isError ? <p className="v9-small-empty">…</p> : null}
        {history.data && entries.length === 0 ? <p className="v9-small-empty">{query || filter !== "all" ? t.history.noMatch : t.history.empty}</p> : null}
        {entries.map((e) => {
          const ok = installed.has(e.provider);
          return (
            <div key={`${e.provider}:${e.nativeSessionId}`} className="v9-history-item" data-testid="history-item">
              <span className={`v9-provider-mark provider-${e.provider}`}>{e.provider.slice(0, 1).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong data-testid="history-title">{e.title}</strong>
                <small>
                  {t.history.provider[e.provider] ?? e.provider}
                  {e.active ? ` · ${t.history.active}` : ""}
                </small>
                <time>{new Date(e.updatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
              </span>
              <button
                type="button"
                className={`v9-pin${e.pinned ? " pinned" : ""}`}
                aria-pressed={e.pinned}
                aria-label={e.pinned ? t.history.unpin(e.title) : t.history.pin(e.title)}
                data-testid="history-pin"
                onClick={() => void togglePin(e)}
              >
                <Pin size={12} aria-hidden />
              </button>
              <Button disabled={!ok || e.active || busy !== null} loading={busy === e.nativeSessionId} title={ok ? undefined : t.history.notInstalled} data-testid="history-resume" onClick={() => void resume(e)}>
                {busy === e.nativeSessionId ? t.history.resuming : t.history.resume}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="v9-history-footnote">{t.history.note}</div>
    </section>
  );
}
