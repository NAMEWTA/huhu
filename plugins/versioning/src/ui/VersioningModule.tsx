import { Badge, Button, EmptyState } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { t } from "./i18n.js";

interface Entry { id: string; at: string; source: string; title: string | null; path: string }
interface NoteRef { path: string; title: string }
interface GitStatus { isRepo: boolean; branch: string | null; files: { path: string; index: string; worktree: string; from?: string }[] }
interface Commit { id: string; short: string; author: string; at: string; subject: string }

export function VersioningModule() {
  const [tab, setTab] = useState<"history" | "git">("history");
  return (
    <div className="hu-module" data-testid="versioning-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.title}</h2>
        {(["history", "git"] as const).map((k) => (
          <button key={k} type="button" className="hu-nav-item" aria-current={tab === k} onClick={() => setTab(k)}><span>{t.nav[k]}</span></button>
        ))}
      </aside>
      <section className="hu-content">{tab === "history" ? <FileHistory /> : <GitPage />}</section>
    </div>
  );
}

function useAct() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const act = async <T,>(cap: string, input: unknown): Promise<T | null> => {
    setError(null);
    try {
      const r = await engine.call<T>(cap, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof CapabilityError && e.code === "VERSION_CONFLICT" ? t.conflict : e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  return { engine, act, error };
}

function FileHistory() {
  const { engine, act, error } = useAct();
  const notes = useCapability<NoteRef[]>("notes.list", { filter: "all" });
  const [path, setPath] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ok, setOk] = useState(false);
  const file = path ?? notes.data?.[0]?.path ?? null;
  const timeline = useCapability<Entry[]>("history.timeline", file ? { path: file } : { path: "x.md" });
  const entries = file ? (timeline.data ?? []) : [];
  const chosen = entries.find((e) => e.id === sel) ?? entries[0] ?? null;
  const content = useCapability<{ text: string }>("history.read", chosen && file ? { path: chosen.path, entryId: chosen.id } : { path: "x.md", entryId: "0".repeat(40) });

  async function restore() {
    if (!file || !chosen) return;
    const cur = await engine.call<{ version: string }>("notes.read", { path: file });
    const r = await act("history.restore", { path: file, entryId: chosen.id, expectedCurrentVersion: cur.version });
    setOk(r !== null);
  }
  return (
    <div data-testid="file-history">
      <h1>{t.nav.history}</h1>
      <label>{t.pickFile}
        <select aria-label={t.pickFile} value={file ?? ""} onChange={(e) => { setPath(e.target.value); setSel(null); setOk(false); }}>
          {(notes.data ?? []).map((n) => <option key={n.path} value={n.path}>{n.path}</option>)}
        </select>
      </label>
      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); if (file && name.trim()) void act("history.checkpoint", { path: file, title: name.trim() }).then(() => setName("")); }}>
        <input className="hu-input" aria-label={t.checkpointName} placeholder={t.checkpointName} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!file || !name.trim()}>{t.checkpoint}</Button>
      </form>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      {ok ? <div role="status">{t.restored}</div> : null}
      {entries.length === 0 ? <EmptyState title={t.noHistory} /> : entries.map((e) => (
        <button key={e.id} type="button" className="hu-nav-item" aria-current={chosen?.id === e.id} data-testid="history-entry" onClick={() => { setSel(e.id); setOk(false); }}>
          <span>{e.title ?? new Date(e.at).toLocaleString()}</span><Badge>{(t.source as Record<string, string>)[e.source] ?? e.source}</Badge>
        </button>
      ))}
      {chosen ? (
        <>
          <pre data-testid="history-content">{content.data?.text ?? ""}</pre>
          <Button variant="danger" onClick={() => void restore()}>{t.restore}</Button>
        </>
      ) : null}
    </div>
  );
}

function GitPage() {
  const { act, error } = useAct();
  const status = useCapability<GitStatus>("git.status", {});
  const log = useCapability<Commit[]>("git.log", { limit: 50 });
  const [msg, setMsg] = useState("");
  if (!status.data) return <p>…</p>;
  if (!status.data.isRepo) {
    return (
      <div data-testid="git-not-repo">
        <EmptyState title={t.git.notRepo} hint={t.git.initNote} action={<Button variant="primary" onClick={() => void act("git.init", {})}>{t.git.init}</Button>} />
        {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      </div>
    );
  }
  const staged = status.data.files.filter((f) => f.index !== " " && f.index !== "?");
  const changes = status.data.files.filter((f) => f.worktree !== " " || f.index === "?");
  return (
    <div data-testid="git-page">
      <h1>{t.nav.git} <Badge>{t.git.branch}: {status.data.branch ?? "-"}</Badge></h1>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      <h2>{t.git.status}</h2>
      {status.data.files.length === 0 ? <EmptyState title={t.git.clean} /> : null}
      {changes.map((f) => <div key={f.path} className="hu-row" data-testid="git-change"><span>{f.path}</span><Button onClick={() => void act("git.stage", { paths: [f.path] })}>{t.git.stage}</Button></div>)}
      {staged.map((f) => <div key={`s-${f.path}`} className="hu-row" data-testid="git-staged"><span>{f.path}</span><Badge tone="success">{f.index}</Badge><Button onClick={() => void act("git.unstage", { paths: [f.path] })}>{t.git.unstage}</Button></div>)}
      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); if (msg.trim() && staged.length) void act("git.commit", { message: msg }).then(() => setMsg("")); }}>
        <input className="hu-input" aria-label={t.git.message} placeholder={t.git.message} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <Button type="submit" variant="primary" disabled={!msg.trim() || staged.length === 0}>{t.git.commit}</Button>
      </form>
      <h2>{t.git.log}</h2>
      {(log.data ?? []).map((c) => <div key={c.id} className="hu-row" data-testid="git-commit"><code>{c.short}</code><span>{c.subject}</span><span className="hu-meta">{c.author}</span></div>)}
    </div>
  );
}
