import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Eye, History, Pin, Search } from "lucide-react";
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
interface Transcript {
  messages: { role: "user" | "assistant"; text: string; at: string | null }[];
  truncated: boolean;
}

function TranscriptDialog({ spaceId, entry, onClose }: { spaceId: string; entry: Entry; onClose: () => void }) {
  const transcript = useCapability<Transcript>("agent.history.read", { spaceId, provider: entry.provider, nativeSessionId: entry.nativeSessionId });
  return (
    <Dialog open title={entry.title} description="只读的对话记录（用户与助手的文字；不含工具调用）。" testId="history-transcript" onClose={onClose}>
      {transcript.isError ? (
        <div role="alert" className="hu-callout danger">
          <p>{transcript.error instanceof Error ? transcript.error.message : String(transcript.error)}</p>
        </div>
      ) : null}
      {!transcript.data && !transcript.isError ? <p className="agent-small-empty">…</p> : null}
      {transcript.data?.truncated ? <p className="agent-small-empty">记录较长，只显示最近的部分。</p> : null}
      <div style={{ display: "grid", gap: 10, maxHeight: "55vh", overflow: "auto" }}>
        {(transcript.data?.messages ?? []).map((m, i) => (
          <div key={i} data-testid="transcript-message" data-role={m.role} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <strong>{m.role === "user" ? "你" : "助手"}</strong>
            <div>{m.text}</div>
          </div>
        ))}
        {transcript.data && transcript.data.messages.length === 0 ? <p className="agent-small-empty">这次会话没有可显示的文字内容。</p> : null}
      </div>
    </Dialog>
  );
}

export function HistoryPanel({ space, installed, onResumed }: { space: { id: string; revision: number; name?: string; root?: string }; installed: Set<string>; onResumed: (sessionId: string) => void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const history = useCapability<{ entries: Entry[]; skipped: number }>("agent.history.list", { spaceId: space.id });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Entry | null>(null);
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
      <div className="agent-sidebar-head">
        <span>
          <History size={15} aria-hidden />
          {t.history.title}
        </span>
        <span className="agent-count">{history.data?.entries.length ?? 0}</span>
      </div>
      <div className="agent-history-space">
        {space.name ?? ""}
        <small title={space.root}>{space.root}</small>
      </div>
      <div className="agent-history-search">
        <Search size={14} aria-hidden />
        <input aria-label={t.history.search} placeholder={t.history.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="agent-history-filters" role="group" aria-label={t.history.filters}>
        {FILTERS.map(([id, label]) => (
          <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="agent-history-list">
        {history.isError ? (
          <div role="alert" className="hu-callout danger">
            <p>{history.error instanceof Error ? history.error.message : String(history.error)}</p>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="hu-callout danger">
            <p>{error}</p>
          </div>
        ) : null}
        {skipped > 0 ? (
          <p className="agent-small-empty" data-testid="history-skipped">
            {t.history.skipped(skipped)}
          </p>
        ) : null}
        {!history.data && !history.isError ? <p className="agent-small-empty">…</p> : null}
        {history.data && entries.length === 0 ? <p className="agent-small-empty">{query || filter !== "all" ? t.history.noMatch : t.history.empty}</p> : null}
        {entries.map((e) => {
          const ok = installed.has(e.provider);
          return (
            <div key={`${e.provider}:${e.nativeSessionId}`} className="agent-history-item" data-testid="history-item">
              <span className={`agent-provider-mark provider-${e.provider}`}>{e.provider.slice(0, 1).toUpperCase()}</span>
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
                className={`agent-pin${e.pinned ? " agent-pinned" : ""}`}
                aria-pressed={e.pinned}
                aria-label={e.pinned ? t.history.unpin(e.title) : t.history.pin(e.title)}
                data-testid="history-pin"
                onClick={() => void togglePin(e)}
              >
                <Pin size={12} aria-hidden />
              </button>
              <button type="button" className="agent-pin" aria-label={`查看记录 ${e.title}`} title="只读查看这次会话的对话记录" data-testid="history-view" onClick={() => setViewing(e)}>
                <Eye size={12} aria-hidden />
              </button>
              <Button disabled={!ok || e.active || busy !== null} loading={busy === e.nativeSessionId} title={ok ? undefined : t.history.notInstalled} data-testid="history-resume" onClick={() => void resume(e)}>
                {busy === e.nativeSessionId ? t.history.resuming : t.history.resume}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="agent-history-footnote">{t.history.note}</div>
      {viewing ? <TranscriptDialog spaceId={space.id} entry={viewing} onClose={() => setViewing(null)} /> : null}
    </section>
  );
}
