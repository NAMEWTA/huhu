import { Badge, Button, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { t } from "./i18n.js";

interface Capture { id: string; title: string; body: string; source: string; status: "pending" | "processed" | "dismissed"; result: { kind: string; id: string } | null; version: string }
interface ArchiveType { id: string; name: string }

export function InboxModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Capture["status"]>("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = useCapability<Capture[]>("inbox.list", { status });
  const every = useCapability<Capture[]>("inbox.list", {});
  const types = useCapability<ArchiveType[]>("archives.types.list", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  // 选中项按全量列表查找：处理后它会离开当前状态分组，但详情仍需显示（并提供撤销）
  const cur = (every.data ?? []).find((c) => c.id === selected) ?? null;

  async function act(capability: string, input: unknown) {
    setError(null);
    try {
      await engine.call(capability, input, { write: true });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="hu-module" data-testid="inbox-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.title} {status === "pending" ? (list.data?.length ?? 0) : ""}</h2>
        {(Object.keys(t.statuses) as Capture["status"][]).map((s) => (
          <button key={s} type="button" className="hu-nav-item" aria-current={s === status} onClick={() => { setStatus(s); setSelected(null); }}><span>{t.statuses[s]}</span></button>
        ))}
        <ul className="hu-note-list">
          {(list.data ?? []).map((c) => (
            <li key={c.id}><button type="button" className="hu-nav-item" aria-current={c.id === selected} onClick={() => setSelected(c.id)} data-testid="capture-item"><span>{c.title}</span><Badge tone="violet">{c.source}</Badge></button></li>
          ))}
        </ul>
        {list.isSuccess && list.data.length === 0 ? <EmptyState title={status === "pending" ? t.cleared : t.select} /> : null}
      </aside>
      <section className="hu-content">
        <h1>{t.title}</h1>
        <form className="hu-form" onSubmit={(e) => { e.preventDefault(); const body = draft.trim(); if (!body) return; void act("inbox.capture", { body }).then(() => setDraft("")); }}>
          <input className="hu-input" aria-label={t.capture} placeholder={t.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" variant="primary" disabled={!draft.trim()}>{t.capture}</Button>
        </form>
        {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
        {cur ? (
          <article>
            <h2>{cur.title}</h2>
            <Badge tone={cur.status === "pending" ? "violet" : cur.status === "processed" ? "success" : "neutral"}>{t.statuses[cur.status]}</Badge>
            <pre className="hu-capture-body">{cur.body}</pre>
            {cur.status === "pending" ? (
              <>
                <h3>{t.next}</h3>
                <div className="hu-form">
                  <Button onClick={() => void act("inbox.convert", { id: cur.id, target: "task", fields: { title: cur.title, body: cur.body } })}>{t.toTask}</Button>
                  <Button onClick={() => void act("inbox.convert", { id: cur.id, target: "note", fields: { name: cur.title, template: "blank" } })}>{t.toNote}</Button>
                  <Button disabled={(types.data ?? []).length === 0} title={(types.data ?? []).length === 0 ? t.noArchiveType : undefined} onClick={() => void act("inbox.convert", { id: cur.id, target: "archive", fields: { name: cur.title, type: types.data?.[0]?.id, body: cur.body } })}>{t.toArchive}</Button>
                </div>
                <Button variant="ghost" onClick={() => void act("inbox.dismiss", { id: cur.id })}>{t.dismiss}</Button>
              </>
            ) : null}
            {cur.status === "processed" ? (<><p>{t.processed}：{cur.result?.kind} · {cur.result?.id}</p><Button onClick={() => void act("inbox.undo", { id: cur.id })}>{t.undo}</Button></>) : null}
            {cur.status === "dismissed" ? <Button onClick={() => void act("inbox.restore", { id: cur.id })}>{t.restore}</Button> : null}
            <Button variant="danger" onClick={() => void act("inbox.delete", { id: cur.id }).then(() => setSelected(null))}>{t.delete}</Button>
          </article>
        ) : <EmptyState title={t.select} />}
      </section>
    </div>
  );
}
