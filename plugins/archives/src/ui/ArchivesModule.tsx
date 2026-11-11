import { Badge, Button, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { useState } from "react";
import { t } from "./i18n.js";

interface Archive {
  id: string;
  version: string;
  name: string;
  type: string;
  fields: Record<string, unknown>;
  relatedIds: string[];
  undefinedFields: string[];
  staleRelations: string[];
}
interface ArchiveType {
  id: string;
  name: string;
  fields: { id: string; label: string; type: string }[];
}

export function ArchivesModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [typeName, setTypeName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const types = useCapability<ArchiveType[]>("archives.types.list", {});
  const list = useCapability<Archive[]>("archives.list", typeId ? { type: typeId } : {});
  const all = useCapability<Archive[]>("archives.list", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const cur = (all.data ?? []).find((a) => a.id === selected) ?? null;
  const curType = (types.data ?? []).find((x) => x.id === cur?.type);
  const activeType = typeId ?? types.data?.[0]?.id ?? null;

  async function act<T>(capability: string, input: unknown): Promise<T | null> {
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
    <div className="hu-module" data-testid="archives-module">
      <aside className="hu-module-sidebar" aria-label={t.title}>
        <h2>{t.title}</h2>
        <button type="button" className="hu-nav-item" aria-current={typeId === null} onClick={() => setTypeId(null)}>
          <span>{t.all}</span>
          <span>{all.data?.length ?? 0}</span>
        </button>
        {(types.data ?? []).map((x) => (
          <button key={x.id} type="button" className="hu-nav-item" aria-current={typeId === x.id} onClick={() => setTypeId(x.id)}>
            <span>{x.name}</span>
            <span>{(all.data ?? []).filter((a) => a.type === x.id).length}</span>
          </button>
        ))}
        <form
          className="hu-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = typeName.trim();
            if (n) void act("archives.types.save", { name: n, fields: [{ id: "note", label: "备注", type: "text" }] }).then(() => setTypeName(""));
          }}
        >
          <input className="hu-input" aria-label={t.typeName} placeholder={t.typeName} value={typeName} onChange={(e) => setTypeName(e.target.value)} />
          <Button type="submit" disabled={!typeName.trim()}>
            {t.newType}
          </Button>
        </form>
      </aside>
      <section className="hu-content">
        <h1>{typeId ? ((types.data ?? []).find((x) => x.id === typeId)?.name ?? t.title) : t.all}</h1>
        {types.isSuccess && types.data.length === 0 ? (
          <EmptyState title={t.noTypes} />
        ) : (
          <form
            className="hu-form"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (n && activeType)
                void act<Archive>("archives.create", { name: n, type: activeType }).then((r) => {
                  if (r) {
                    setName("");
                    setSelected(r.id);
                  }
                });
            }}
          >
            <input className="hu-input" aria-label={t.name} placeholder={t.name} value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="primary" disabled={!name.trim() || !activeType}>
              {t.newArchive}
            </Button>
          </form>
        )}
        {error ? (
          <div role="alert" className="hu-overdue">
            {error}
          </div>
        ) : null}
        {(list.data ?? []).map((a) => (
          <div key={a.id} className="hu-row" data-testid="archive-row">
            <button type="button" className="hu-nav-item" onClick={() => setSelected(a.id)}>
              <span>{a.name}</span>
            </button>
            <Badge>{(types.data ?? []).find((x) => x.id === a.type)?.name ?? a.type}</Badge>
            <span>{a.relatedIds.length}</span>
          </div>
        ))}
        {list.isSuccess && list.data.length === 0 && types.data?.length ? <EmptyState title={t.empty} /> : null}
        {cur ? (
          <article aria-label={cur.name}>
            <h2>{cur.name}</h2>
            <dl>
              {(curType?.fields ?? []).map((f) => (
                <div key={f.id}>
                  <dt>{f.label}</dt>
                  <dd>{String(cur.fields[f.id] ?? t.unfilled)}</dd>
                </div>
              ))}
            </dl>
            {cur.undefinedFields.length ? (
              <>
                <h3>{t.undefinedFields}</h3>
                <dl>
                  {cur.undefinedFields.map((k) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{String(cur.fields[k])}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            <h3>{t.related}</h3>
            <ul>
              {cur.relatedIds.length === 0 ? (
                <li>{t.noRelated}</li>
              ) : (
                cur.relatedIds.map((r) => (
                  <li key={r}>
                    {(all.data ?? []).find((a) => a.id === r)?.name ?? r} {cur.staleRelations.includes(r) ? <Badge tone="warning">{t.stale}</Badge> : null}
                  </li>
                ))
              )}
            </ul>
            <label>
              {t.related}
              <select aria-label={t.related} multiple value={cur.relatedIds} onChange={(e) => void act("archives.setRelations", { id: cur.id, relatedIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
                {(all.data ?? [])
                  .filter((a) => a.id !== cur.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t.changeType}
              <select aria-label={t.changeType} value={cur.type} onChange={(e) => void act("archives.changeType", { id: cur.id, expectedVersion: cur.version, type: e.target.value })}>
                {(types.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="danger" onClick={() => void act("archives.delete", { id: cur.id }).then(() => setSelected(null))}>
              {t.delete}
            </Button>
          </article>
        ) : null}
      </section>
    </div>
  );
}
