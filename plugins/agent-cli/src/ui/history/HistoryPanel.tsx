import { Badge, Button, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { t } from "../i18n.js";

interface Entry {
  provider: "claude" | "codex";
  nativeSessionId: string;
  cwd: string;
  title: string;
  updatedAt: string;
  active: boolean;
}
interface Session {
  id: string;
}

export function HistoryPanel({ space, installed, onResumed }: { space: { id: string; revision: number }; installed: Set<string>; onResumed: (sessionId: string) => void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const history = useCapability<{ entries: Entry[]; skipped: number }>("agent.history.list", { spaceId: space.id });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (history.isError)
    return (
      <div role="alert" className="hu-overdue">
        {history.error instanceof Error ? history.error.message : String(history.error)}
      </div>
    );
  if (!history.data) return <p>…</p>;
  const { entries, skipped } = history.data;
  return (
    <section data-testid="agent-history" aria-label={t.history.title}>
      <h2>{t.history.title}</h2>
      <p className="hu-meta">{t.history.note}</p>
      {skipped > 0 ? (
        <p className="hu-meta" data-testid="history-skipped">
          {t.history.skipped(skipped)}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="hu-overdue">
          {error}
        </div>
      ) : null}
      {entries.length === 0 ? (
        <EmptyState title={t.history.empty} />
      ) : (
        entries.map((e) => {
          const ok = installed.has(e.provider);
          return (
            <div key={`${e.provider}:${e.nativeSessionId}`} className="hu-row" data-testid="history-item">
              <Badge tone="blue">{t.history.provider[e.provider] ?? e.provider}</Badge>
              <span style={{ flex: 1 }}>
                <strong data-testid="history-title">{e.title}</strong>
                <span className="hu-meta" style={{ display: "block" }}>
                  {new Date(e.updatedAt).toLocaleString()} · {e.cwd}
                </span>
              </span>
              {e.active ? <Badge tone="success">{t.history.active}</Badge> : null}
              <Button disabled={!ok || e.active || busy !== null} loading={busy === e.nativeSessionId} title={ok ? undefined : t.history.notInstalled} data-testid="history-resume" onClick={() => void resume(e)}>
                {busy === e.nativeSessionId ? t.history.resuming : t.history.resume}
              </Button>
            </div>
          );
        })
      )}
    </section>
  );
}
