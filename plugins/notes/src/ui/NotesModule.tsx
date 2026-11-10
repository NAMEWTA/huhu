import { MarkdownEditor, MarkdownPreview } from "@huhu/editor";
import { Badge, Banner, Button, EmptyState } from "@huhu/ui";
import { CapabilityError, queryKey, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "./i18n.js";

type Filter = "all" | "favorites" | "daily" | "trash";
interface NoteRef { path: string; id: string | null; title: string }
interface NoteFile { path: string; text: string; version: string }
const AUTOSAVE_MS = 800;

export function NotesModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const notes = useCapability<NoteRef[]>("notes.list", { filter });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId && String(q.queryKey[1]).startsWith("notes.") });

  async function run<T>(capability: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(capability, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  return (
    <div className="hu-module" data-testid="notes-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.title}</h2>
        {(Object.keys(t.filters) as Filter[]).map((f) => (
          <button key={f} type="button" className="hu-nav-item" aria-current={f === filter} onClick={() => { setFilter(f); setSelected(null); }}>
            <span>{t.filters[f]}</span>
          </button>
        ))}
        <form className="hu-form" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (!n) return; void run<{ path: string }>("notes.create", { name: n }).then((r) => { if (r) { setName(""); setSelected(r.path); } }); }}>
          <input className="hu-input" aria-label={t.noteName} placeholder={t.noteName} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" disabled={!name.trim()}>{t.newNote}</Button>
        </form>
        {filter === "daily" ? <Button onClick={() => void run<{ path: string }>("notes.openDaily", {}).then((r) => r && setSelected(r.path))}>{t.openDaily}</Button> : null}
        {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
        <ul className="hu-note-list" aria-label={t.filters[filter]}>
          {(notes.data ?? []).map((n) => (
            <li key={n.path}>
              <button type="button" className="hu-nav-item" aria-current={n.path === selected} onClick={() => setSelected(n.path)} data-testid="note-item">
                <span>{n.path}</span>
              </button>
            </li>
          ))}
        </ul>
        {notes.isSuccess && notes.data.length === 0 ? <EmptyState title={t.empty} /> : null}
      </aside>
      <section className="hu-content hu-note-pane">
        {selected && filter !== "trash" ? (
          <NoteEditor key={selected} path={selected} onRename={(newName) => run("notes.rename", { path: selected, newName }).then((r) => { if (r) setSelected(newName.endsWith(".md") ? newName : `${newName}.md`); })} onTrash={() => run("notes.trash", { path: selected }).then(() => setSelected(null))} onOpen={(p) => setSelected(p)} />
        ) : (
          <EmptyState title={t.noSelection} />
        )}
      </section>
    </div>
  );
}

function NoteEditor({ path, onRename, onTrash, onOpen }: { path: string; onRename(newName: string): Promise<unknown>; onTrash(): Promise<unknown>; onOpen(path: string): void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "conflict">("saved");
  const [mode, setMode] = useState<"source" | "preview">("source");
  const [renaming, setRenaming] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ text: "", version: "" });
  const all = useCapability<NoteRef[]>("notes.list", { filter: "all" });
  const backlinks = useCapability<{ path: string; title: string }[]>("notes.backlinks", { path });

  const load = useCallback(async () => {
    const f = await engine.call<NoteFile>("notes.read", { path });
    setText(f.text);
    latest.current = { text: f.text, version: f.version };
    setState("saved");
  }, [engine, path]);
  useEffect(() => { void load(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [load]);

  const save = useCallback(async () => {
    const { text: body, version: v } = latest.current;
    setState("saving");
    try {
      const r = await engine.call<{ version: string }>("notes.save", { path, text: body, expectedVersion: v }, { write: true });
      latest.current.version = r.version;
      setState(latest.current.text === body ? "saved" : "dirty");
      void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, "notes.backlinks", { path }) });
    } catch (e) {
      setState(e instanceof CapabilityError && e.code === "VERSION_CONFLICT" ? "conflict" : "dirty");
    }
  }, [engine, path, qc]);

  const onChange = (next: string) => {
    if (text === null || next === latest.current.text) return;
    latest.current.text = next;
    setText(next);
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  const known = new Set((all.data ?? []).flatMap((n) => [n.path, n.path.replace(/\.md$/, ""), n.title]));
  if (text === null) return <p>{t.loading}</p>;
  return (
    <div className="hu-note">
      <header className="hu-note-head">
        <h1>{path.replace(/\.md$/, "")}</h1>
        <Badge tone={state === "saved" ? "success" : state === "conflict" ? "danger" : "warning"}>{state === "saved" ? t.saved : state === "saving" ? t.saving : state === "conflict" ? t.conflict : t.dirty}</Badge>
        <div role="group" aria-label="模式">
          <Button variant={mode === "source" ? "primary" : "secondary"} onClick={() => setMode("source")}>{t.modeSource}</Button>
          <Button variant={mode === "preview" ? "primary" : "secondary"} onClick={() => setMode("preview")}>{t.modePreview}</Button>
        </div>
        {renaming === null ? (
          <Button onClick={() => setRenaming(path.replace(/\.md$/, ""))}>{t.rename}</Button>
        ) : (
          <form className="hu-form" onSubmit={(e) => { e.preventDefault(); void onRename(renaming); setRenaming(null); }}>
            <input className="hu-input" aria-label={t.rename} value={renaming} onChange={(e) => setRenaming(e.target.value)} autoFocus />
            <Button type="submit">{t.rename}</Button>
          </form>
        )}
        <Button variant="danger" onClick={() => void onTrash()}>{t.trash}</Button>
      </header>
      {state === "conflict" ? <Banner tone="danger" action={<Button onClick={() => void load()}>{t.reload}</Button>}>{t.conflict}</Banner> : null}
      {mode === "source" ? (
        <MarkdownEditor value={text} onChange={onChange} onSave={() => void save()} ariaLabel={t.editorLabel} />
      ) : (
        <MarkdownPreview source={text} resolveWikiLink={(target) => known.has(target)} onOpenWikiLink={(target) => { const hit = (all.data ?? []).find((n) => n.path === target || n.path === `${target}.md` || n.title === target); if (hit) onOpen(hit.path); }} />
      )}
      <section aria-label={t.backlinks}>
        <h3>{t.backlinks}</h3>
        <ul>{(backlinks.data ?? []).map((b) => <li key={b.path}><button type="button" className="hu-nav-item" onClick={() => onOpen(b.path)}>{b.title}</button></li>)}</ul>
      </section>
    </div>
  );
}
