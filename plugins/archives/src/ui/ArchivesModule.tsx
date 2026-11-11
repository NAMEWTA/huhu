import { Badge, Button, CompletionCircle, Dialog, EmptyState, Field, IconButton, PageHead, SearchBox, Segmented } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Archive, ArrowRight, ArrowUpRight, Download, FileText, Hash, LayoutGrid, Link2, MoreHorizontal, Network, Pencil, Plus, SlidersHorizontal, Table2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { t } from "./i18n.js";

interface FieldDef {
  id: string;
  label: string;
  type: string;
}
interface ArchiveRow {
  id: string;
  path: string;
  noteIds?: string[];
  version: string;
  name: string;
  type: string;
  fields: Record<string, unknown>;
  relatedIds: string[];
  undefinedFields: string[];
  staleRelations: string[];
  updatedAt?: string;
  body?: string;
}
interface ArchiveType {
  id: string;
  version?: string;
  name: string;
  body?: string;
  fields: FieldDef[];
}
type View = "table" | "cards";
type DialogState =
  | { kind: "archive"; entity: ArchiveRow | null }
  | { kind: "relations"; entity: ArchiveRow }
  | { kind: "linkNote"; entity: ArchiveRow }
  | { kind: "newTask"; entity: ArchiveRow }
  | { kind: "types" }
  | { kind: "type"; type: ArchiveType | null }
  | { kind: "delete"; entity: ArchiveRow }
  | { kind: "changeType"; entity: ArchiveRow }
  | { kind: "deleteType"; type: ArchiveType }
  | null;

const slug = (label: string, i: number): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || `field-${i + 1}`;
const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("zh-CN") : "—");

/** 档案（原型 ArchivesView）：左侧类型树 + 主区表格 / 卡片 + 右侧详情；关系与类型管理走对话框。 */
export function ArchivesModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("table");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);
  const types = useCapability<ArchiveType[]>("archives.types.list", {});
  const all = useCapability<ArchiveRow[]>("archives.list", {});
  // 关联笔记 / 任务来自可选依赖：对应插件停用时这两个分区显示提示，不影响档案本身
  const notesQ = useCapability<{ id: string | null; path: string; title: string }[]>("notes.list", { filter: "all" });
  const tasksQ = useCapability<{ id: string; version: string; title: string; completed: boolean; path: string; resources: { path: string }[] }[]>("tasks.list", { category: "all" });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const typeList = types.data ?? [];
  const rows = all.data ?? [];
  const cur = rows.find((a) => a.id === selected) ?? null;
  const curType = typeList.find((x) => x.id === cur?.type);
  const activeType = typeList.find((x) => x.id === typeId) ?? null;
  const visible = rows.filter((a) => (!typeId || a.type === typeId) && `${a.name}${a.body ?? ""}${Object.values(a.fields).join("")}`.toLowerCase().includes(query.toLowerCase()));

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
  const newArchive = () => (typeList.length === 0 ? setDialog({ kind: "types" }) : setDialog({ kind: "archive", entity: null }));

  return (
    <div className="module-layout knowledge-root knowledge-archives" data-testid="archives-module">
      <aside className="resource-pane knowledge-archive-types" aria-label={t.title}>
        <div className="resource-head">
          <div className="row">
            <strong className="grow">{t.title}</strong>
            <IconButton icon={SlidersHorizontal} label="管理档案类型" onClick={() => setDialog({ kind: "types" })} />
          </div>
          <p className="muted small">按类型组织长期资料</p>
        </div>
        <div className="resource-list">
          <button type="button" className={`knowledge-project-row ${typeId === null ? "active" : ""}`} onClick={() => setTypeId(null)}>
            <Archive size={16} aria-hidden />
            <span>{t.all}</span>
            <small>{rows.length}</small>
          </button>
          <div className="archive-type-caption">
            <span>档案类型</span>
            <IconButton icon={Plus} label="新建或编辑档案类型" onClick={() => setDialog({ kind: "type", type: null })} />
          </div>
          <nav className="knowledge-archive-filter-tree" aria-label="档案类型">
            {typeList.map((x) => (
              <button key={x.id} type="button" className={`knowledge-project-row ${typeId === x.id ? "active" : ""}`} aria-current={typeId === x.id ? "page" : undefined} onClick={() => setTypeId(x.id)}>
                <Hash size={15} aria-hidden />
                <span>{x.name}</span>
                <small>{rows.filter((a) => a.type === x.id).length}</small>
              </button>
            ))}
          </nav>
        </div>
        <div className="knowledge-resource-footer">
          <Button variant="ghost" icon={SlidersHorizontal} onClick={() => setDialog({ kind: "types" })}>
            类型与字段
          </Button>
          <span>{typeList.length} 种类型</span>
        </div>
      </aside>
      <section className="view-content knowledge-archive-main">
        <PageHead
          title={activeType ? `${activeType.name}档案` : "所有档案"}
          description={activeType?.body || "项目、联系人、书籍与资源的长期资料。"}
          actions={
            <Button variant="primary" icon={Plus} onClick={newArchive} data-testid="archive-new">
              新建{activeType?.name ?? "档案"}
            </Button>
          }
        />
        <div className="knowledge-task-toolbar">
          <SearchBox value={query} onChange={setQuery} placeholder="搜索名称、简介或字段…" />
          <span className="grow" />
          <Segmented<View>
            label="档案视图"
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: "表格", icon: Table2 },
              { value: "cards", label: "卡片", icon: LayoutGrid },
            ]}
          />
        </div>
        {error ? (
          <div role="alert" className="field-error">
            {error}
          </div>
        ) : null}
        <div className="knowledge-archive-surface">
          {visible.length === 0 ? (
            <EmptyState
              icon={Archive}
              title={typeList.length === 0 ? t.noTypes : "还没有这样的档案"}
              hint="调整筛选条件，或创建一个新的条目。"
              action={
                <>
                  {query ? <Button onClick={() => setQuery("")}>清空筛选</Button> : null}
                  <Button variant="primary" onClick={newArchive}>
                    新建档案
                  </Button>
                </>
              }
            />
          ) : view === "table" ? (
            <div className="knowledge-archive-table">
              <div className="knowledge-archive-table-head">
                <span>名称</span>
                <span>类型</span>
                <span>关联</span>
                <span>更新日期</span>
                <span />
              </div>
              {visible.map((a) => (
                <div key={a.id} className={`knowledge-archive-table-row ${a.id === selected ? "is-current" : ""}`} data-testid="archive-row">
                  <button type="button" className="knowledge-archive-name" onClick={() => setSelected(a.id)}>
                    <span className="knowledge-type-icon">
                      <Hash size={17} aria-hidden />
                    </span>
                    <div>
                      <strong>{a.name}</strong>
                      <small>{a.body?.slice(0, 40)}</small>
                    </div>
                  </button>
                  <span className="small">{typeList.find((x) => x.id === a.type)?.name ?? "自定义"}</span>
                  <button type="button" className="knowledge-table-link-count" title="查看档案关系" onClick={() => setSelected(a.id)}>
                    <Link2 size={12} aria-hidden /> {a.relatedIds.length}
                  </button>
                  <span className="small muted">{shortDate(a.updatedAt)}</span>
                  <IconButton icon={MoreHorizontal} label={`编辑档案 ${a.name}`} onClick={() => setDialog({ kind: "archive", entity: a })} />
                </div>
              ))}
            </div>
          ) : (
            <div className="knowledge-archive-cards">
              {visible.map((a) => {
                const ty = typeList.find((x) => x.id === a.type);
                return (
                  <article key={a.id} className={`knowledge-archive-card ${a.id === selected ? "is-current" : ""}`} data-testid="archive-row">
                    <div className="row">
                      <span className="knowledge-type-icon">
                        <Hash size={21} aria-hidden />
                      </span>
                      <span className="grow" />
                    </div>
                    <button type="button" className="knowledge-card-title" onClick={() => setSelected(a.id)}>
                      {a.name}
                    </button>
                    <p>{a.body}</p>
                    <div className="knowledge-card-fields">
                      {(ty?.fields ?? []).slice(0, 2).map((f) => (
                        <div key={f.id}>
                          <span>{f.label}</span>
                          <strong>{String(a.fields[f.id] ?? "未设置")}</strong>
                        </div>
                      ))}
                    </div>
                    <footer>
                      <span>
                        <Link2 size={13} aria-hidden /> {a.relatedIds.length} 个档案关联
                      </span>
                      <button type="button" onClick={() => setSelected(a.id)}>
                        查看详情 <ArrowUpRight size={13} aria-hidden />
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </div>
        <div className="knowledge-task-footer">
          <span>
            {visible.length} 个档案 · {typeList.length} 种类型
          </span>
          <button
            type="button"
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([JSON.stringify(visible, null, 2)], { type: "application/json" }));
              a.download = "HUHU_档案.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Download size={13} aria-hidden /> 导出当前视图
          </button>
        </div>
      </section>
      {cur ? (
        <aside className="knowledge-archive-detail" aria-label={cur.name} data-testid="archive-detail">
          <header>
            <span className="small muted">档案详情</span>
            <div className="row">
              <IconButton icon={Pencil} label="编辑档案" onClick={() => setDialog({ kind: "archive", entity: cur })} />
              <IconButton icon={X} label="关闭档案详情" onClick={() => setSelected(null)} />
            </div>
          </header>
          <div className="knowledge-detail-scroll">
            <div className="knowledge-entity-cover">
              <Hash size={30} aria-hidden />
              <span>{curType?.name ?? "自定义"}</span>
            </div>
            <h2>{cur.name}</h2>
            <p className="knowledge-task-description">{cur.body || "还没有添加简介。"}</p>
            <dl className="knowledge-property-grid">
              {(curType?.fields ?? []).map((f) => (
                <div key={f.id}>
                  <dt>{f.label}</dt>
                  <dd>{String(cur.fields[f.id] ?? "") || "未填写"}</dd>
                </div>
              ))}
              {cur.undefinedFields.map((k) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>
                    {String(cur.fields[k])} <Badge tone="warning">{t.undefinedFields}</Badge>
                  </dd>
                </div>
              ))}
            </dl>
            <section className="knowledge-detail-section">
              <div className="row">
                <h3 className="grow">{t.related}</h3>
                <IconButton icon={Plus} label="编辑档案关系" onClick={() => setDialog({ kind: "relations", entity: cur })} />
              </div>
              {cur.relatedIds.map((r) => {
                const rel = rows.find((a) => a.id === r);
                return (
                  <button key={r} type="button" className="knowledge-link-row" onClick={() => rel && setSelected(rel.id)}>
                    <Network size={15} aria-hidden />
                    <span>{rel?.name ?? r}</span>
                    {cur.staleRelations.includes(r) ? <Badge tone="warning">{t.stale}</Badge> : <ArrowUpRight size={13} aria-hidden />}
                  </button>
                );
              })}
              {cur.relatedIds.length === 0 ? <p className="small muted">建立关系，让长期信息串联起来。</p> : null}
            </section>
            <section className="knowledge-detail-section" data-testid="archive-notes">
              <div className="row">
                <h3 className="grow">关联笔记</h3>
                {notesQ.isError ? null : <IconButton icon={Plus} label="关联已有笔记" onClick={() => setDialog({ kind: "linkNote", entity: cur })} />}
              </div>
              {notesQ.isError ? <p className="small muted">知识库插件已停用，无法选择笔记。</p> : null}
              {(cur.noteIds ?? []).map((nid) => {
                const note = (notesQ.data ?? []).find((n) => n.id === nid);
                return (
                  <div key={nid} className="knowledge-link-row">
                    <FileText size={15} aria-hidden />
                    <span className="grow">{note?.title ?? nid}</span>
                    {note ? null : <Badge tone="warning">{t.stale}</Badge>}
                    <IconButton icon={X} label={`解除关联 ${note?.title ?? nid}`} onClick={() => void act("archives.unlinkNote", { id: cur.id, noteId: nid })} />
                  </div>
                );
              })}
              {(cur.noteIds ?? []).length === 0 && !notesQ.isError ? <p className="small muted">把相关笔记关联到这里。</p> : null}
            </section>
            <section className="knowledge-detail-section" data-testid="archive-tasks">
              <div className="row">
                <h3 className="grow">关联任务</h3>
                {tasksQ.isError ? null : <IconButton icon={Plus} label="新建关联任务" onClick={() => setDialog({ kind: "newTask", entity: cur })} />}
              </div>
              {tasksQ.isError ? <p className="small muted">任务插件已停用，无法显示关联任务。</p> : null}
              {(tasksQ.data ?? [])
                .filter((tk) => tk.resources.some((r) => r.path === cur.path))
                .map((tk) => (
                  <div key={tk.id} className="knowledge-link-row" data-testid="archive-task">
                    <CompletionCircle
                      checked={tk.completed}
                      label={`${tk.completed ? "已完成" : "未完成"}：${tk.title}`}
                      onToggle={() => void act("tasks.setCompleted", { id: tk.id, completed: !tk.completed, expectedVersion: tk.version })}
                    />
                    <span className="grow">{tk.title}</span>
                  </div>
                ))}
            </section>
            <section className="knowledge-detail-section">
              <h3>更多操作</h3>
              <Button icon={ArrowRight} onClick={() => setDialog({ kind: "changeType", entity: cur })}>
                {t.changeType}
              </Button>
            </section>
          </div>
          <footer>
            <Button variant="danger" icon={Trash2} onClick={() => setDialog({ kind: "delete", entity: cur })}>
              删除档案
            </Button>
          </footer>
        </aside>
      ) : null}

      {dialog?.kind === "archive" ? (
        <ArchiveDialog
          error={error}
          entity={dialog.entity}
          types={typeList}
          defaultType={activeType?.id ?? typeList[0]?.id ?? ""}
          onClose={() => setDialog(null)}
          onSave={async (v) => {
            const r = dialog.entity
              ? await act<ArchiveRow>("archives.update", { id: dialog.entity.id, expectedVersion: dialog.entity.version, patch: { name: v.name, fields: v.fields, body: v.body } })
              : await act<ArchiveRow>("archives.create", { name: v.name, type: v.type, fields: v.fields, body: v.body });
            if (r) {
              setDialog(null);
              setSelected(r.id);
            }
          }}
        />
      ) : null}
      {dialog?.kind === "relations" ? (
        <RelationsDialog
          error={error}
          entity={dialog.entity}
          candidates={rows.filter((a) => a.id !== dialog.entity.id)}
          types={typeList}
          onClose={() => setDialog(null)}
          onSave={async (ids) => {
            if (await act("archives.setRelations", { id: dialog.entity.id, relatedIds: ids })) setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "types" ? (
        <Dialog
          open
          wide
          title="档案类型与字段"
          description="用统一的档案引擎，组织不同种类的长期信息。"
          onClose={() => setDialog(null)}
          testId="archive-types-dialog"
          actions={
            <>
              <Button variant="primary" icon={Plus} onClick={() => setDialog({ kind: "type", type: null })}>
                新建类型
              </Button>
              <Button onClick={() => setDialog(null)}>完成</Button>
            </>
          }
        >
          <div className="knowledge-type-grid">
            {typeList.map((x) => (
              <article key={x.id} className="knowledge-type-card">
                <div className="row">
                  <span className="knowledge-type-icon">
                    <Hash size={19} aria-hidden />
                  </span>
                  <strong className="grow">{x.name}</strong>
                  <Badge>{rows.filter((a) => a.type === x.id).length}</Badge>
                </div>
                <p>{x.body}</p>
                <div className="knowledge-type-fields">
                  {x.fields.map((f) => (
                    <span key={f.id}>
                      <Hash size={11} aria-hidden /> {f.label}
                    </span>
                  ))}
                </div>
                <div className="row">
                  <Button variant="ghost" icon={Pencil} onClick={() => setDialog({ kind: "type", type: x })}>
                    编辑字段
                  </Button>
                  <IconButton icon={Trash2} label={`删除类型 ${x.name}`} onClick={() => setDialog({ kind: "deleteType", type: x })} />
                </div>
              </article>
            ))}
            {typeList.length === 0 ? <EmptyState title={t.noTypes} /> : null}
          </div>
        </Dialog>
      ) : null}
      {dialog?.kind === "type" ? (
        <TypeDialog
          error={error}
          type={dialog.type}
          onClose={() => setDialog(null)}
          onSave={async (v) => {
            const fields = v.fields.map((label, i) => ({ id: dialog.type?.fields.find((f) => f.label === label)?.id ?? slug(label, i), label, type: /日期|时间/.test(label) ? "date" : "text" }));
            const r = await act<ArchiveType>("archives.types.save", {
              ...(dialog.type ? { id: dialog.type.id, ...(dialog.type.version ? { expectedVersion: dialog.type.version } : {}) } : {}),
              name: v.name,
              fields,
              ...(v.body ? { body: v.body } : {}),
            });
            if (r) setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "deleteType" ? (
        <DeleteTypeDialog
          error={error}
          type={dialog.type}
          others={typeList.filter((x) => x.id !== dialog.type.id)}
          count={rows.filter((a) => a.type === dialog.type.id).length}
          onClose={() => setDialog(null)}
          onConfirm={async (migrateTo) => {
            const r = await act("archives.types.delete", { id: dialog.type.id, ...(migrateTo ? { migrateTo } : {}) });
            if (r) setDialog(null);
            return r !== null;
          }}
        />
      ) : null}
      {dialog?.kind === "changeType" ? (
        <Dialog open title="更改档案类型" description="原始字段值保留，展示字段采用新的类型定义。" onClose={() => setDialog(null)} actions={<Button onClick={() => setDialog(null)}>关闭</Button>}>
          <Field label="新类型">
            <select
              aria-label={t.changeType}
              value={dialog.entity.type}
              onChange={(e) => void act("archives.changeType", { id: dialog.entity.id, expectedVersion: dialog.entity.version, type: e.target.value }).then((r) => r && setDialog(null))}
            >
              {typeList.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        </Dialog>
      ) : null}
      {dialog?.kind === "linkNote" ? (
        <PickDialog
          title="关联已有笔记"
          label="笔记"
          error={error}
          options={(notesQ.data ?? []).filter((n) => n.id && !(dialog.entity.noteIds ?? []).includes(n.id)).map((n) => ({ value: n.id as string, label: n.title }))}
          submit="关联"
          onClose={() => setDialog(null)}
          onSubmit={async (noteId) => {
            if (await act("archives.linkNote", { id: dialog.entity.id, noteId })) setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "newTask" ? (
        <NewTaskDialog
          error={error}
          archive={dialog.entity}
          onClose={() => setDialog(null)}
          onSubmit={async (title) => {
            const project = typeList.find((x) => x.id === dialog.entity.type)?.name === "项目" ? dialog.entity.name : null;
            if (await act("tasks.create", { title, project, resources: [{ kind: "file", path: dialog.entity.path, id: dialog.entity.id }] })) setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <Dialog
          open
          error={error}
          title="删除这个档案？"
          description={`「${dialog.entity.name}」会被删除。关联笔记与任务将保留，同时解除档案关联。`}
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button onClick={() => setDialog(null)}>取消</Button>
              <Button
                variant="danger"
                onClick={() =>
                  void act("archives.delete", { id: dialog.entity.id }).then((r) => {
                    if (r) {
                      setSelected(null);
                      setDialog(null);
                    }
                  })
                }
              >
                删除档案
              </Button>
            </>
          }
        >
          <p className="confirm-description">档案文件会移到回收站。</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function ArchiveDialog({
  error,
  entity,
  types,
  defaultType,
  onClose,
  onSave,
}: {
  error: string | null;
  entity: ArchiveRow | null;
  types: ArchiveType[];
  defaultType: string;
  onClose(): void;
  onSave(v: { name: string; type: string; fields: Record<string, unknown>; body: string }): Promise<void>;
}) {
  const [typeId, setTypeId] = useState(entity?.type ?? defaultType);
  const [name, setName] = useState(entity?.name ?? "");
  const [body, setBody] = useState(entity?.body ?? "");
  const [fields, setFields] = useState<Record<string, unknown>>(entity?.fields ?? {});
  const ty = types.find((x) => x.id === typeId);
  return (
    <Dialog
      open
      error={error}
      title={entity ? "编辑档案" : `新建${ty?.name ?? ""}档案`}
      description={`类型：${ty?.name ?? "—"} · 字段来自这个类型的结构定义。`}
      onClose={onClose}
      testId="archive-dialog"
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!name.trim() || !typeId} onClick={() => void onSave({ name: name.trim(), type: typeId, fields, body })} data-testid="archive-save">
            {entity ? "保存修改" : "创建档案"}
          </Button>
        </>
      }
    >
      <div className="form-body">
        {entity ? null : (
          <Field label={t.type}>
            <select aria-label={t.type} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t.name}>
          <input autoFocus aria-label={t.name} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="简介">
          <textarea aria-label="简介" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {(ty?.fields ?? []).map((f) => (
          <Field key={f.id} label={f.label}>
            <input aria-label={f.label} type={f.type === "date" ? "date" : "text"} value={String(fields[f.id] ?? "")} onChange={(e) => setFields({ ...fields, [f.id]: e.target.value })} />
          </Field>
        ))}
      </div>
    </Dialog>
  );
}

function RelationsDialog({ error, entity, candidates, types, onClose, onSave }: { error: string | null; entity: ArchiveRow; candidates: ArchiveRow[]; types: ArchiveType[]; onClose(): void; onSave(ids: string[]): Promise<void> }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(new Set(entity.relatedIds));
  const list = candidates.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog
      open
      error={error}
      title="编辑档案关系"
      description="关联是双向的，在两边都能找到彼此。"
      onClose={onClose}
      testId="relations-dialog"
      actions={
        <>
          <span className="small muted grow">已选择 {sel.size} 个档案</span>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => void onSave([...sel])}>
            保存关系
          </Button>
        </>
      }
    >
      <SearchBox value={q} onChange={setQ} placeholder="搜索要关联的档案…" />
      <div className="knowledge-relations-picker">
        {list.map((a) => (
          <label key={a.id}>
            <input
              type="checkbox"
              aria-label={a.name}
              checked={sel.has(a.id)}
              onChange={(e) =>
                setSel((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(a.id);
                  else n.delete(a.id);
                  return n;
                })
              }
            />
            <FileText size={18} aria-hidden />
            <div>
              <strong>{a.name}</strong>
              <span>{types.find((x) => x.id === a.type)?.name}</span>
            </div>
          </label>
        ))}
        {list.length === 0 ? <EmptyState icon={Archive} title="没有匹配的档案" hint="尝试换一个搜索关键词。" /> : null}
      </div>
    </Dialog>
  );
}

function TypeDialog({ error, type, onClose, onSave }: { error: string | null; type: ArchiveType | null; onClose(): void; onSave(v: { name: string; body: string; fields: string[] }): Promise<void> }) {
  const [name, setName] = useState(type?.name ?? "");
  const [body, setBody] = useState(type?.body ?? "");
  const [fields, setFields] = useState(type?.fields.map((f) => f.label).join(", ") ?? "");
  const list = fields
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <Dialog
      open
      error={error}
      title={type ? "编辑档案类型" : "新建档案类型"}
      description="类型定义名称和自定义字段。现有数据的原始字段值会保留。"
      onClose={onClose}
      testId="archive-type-dialog"
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!name.trim() || list.length === 0} onClick={() => void onSave({ name: name.trim(), body, fields: list })} data-testid="type-save">
            保存类型
          </Button>
        </>
      }
    >
      <div className="form-body">
        <Field label={t.typeName}>
          <input autoFocus aria-label={t.typeName} placeholder="例如：课程、产品、旅行" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="用途说明">
          <input aria-label="用途说明" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="自定义字段" description={list.length === 0 ? "请至少定义一个字段。" : undefined}>
          <input aria-label="自定义字段" placeholder="使用逗号分隔，例如：负责人, 地址, 目标日期" value={fields} onChange={(e) => setFields(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function DeleteTypeDialog({ error, type, others, count, onClose, onConfirm }: { error: string | null; type: ArchiveType; others: ArchiveType[]; count: number; onClose(): void; onConfirm(migrateTo?: string): Promise<boolean | undefined> }) {
  const [to, setTo] = useState(others[0]?.id ?? "");
  const blocked = count > 0 && others.length === 0;
  return (
    <Dialog
      open
      error={error}
      title={count > 0 ? "迁移档案并删除类型" : "删除这个档案类型？"}
      description={count > 0 ? `这个类型下有 ${count} 个档案。请选择新的类型；原始字段值保留，展示按新类型定义。` : "此类型下没有档案，可以直接删除。"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="danger" disabled={blocked} onClick={() => void onConfirm(count > 0 ? to : undefined)}>
            {count > 0 ? "迁移并删除类型" : "删除类型"}
          </Button>
        </>
      }
    >
      {blocked ? <p className="field-error">请先创建另一个类型，才能迁移现有档案。</p> : null}
      {count > 0 && !blocked ? (
        <Field label="迁移到">
          <select aria-label="迁移到" value={to} onChange={(e) => setTo(e.target.value)}>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="confirm-description">「{type.name}」类型会被删除。</p>
      )}
    </Dialog>
  );
}

function PickDialog({
  title,
  label,
  options,
  submit,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  options: { value: string; label: string }[];
  submit: string;
  error: string | null;
  onClose(): void;
  onSubmit(value: string): Promise<void>;
}) {
  const [value, setValue] = useState(options[0]?.value ?? "");
  return (
    <Dialog
      open
      title={title}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!value} data-testid="pick-submit" onClick={() => void onSubmit(value)}>
            {submit}
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <p className="muted">没有可选择的{label}。</p>
      ) : (
        <Field label={label}>
          <select aria-label={label} value={value} onChange={(e) => setValue(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Dialog>
  );
}

function NewTaskDialog({ archive, error, onClose, onSubmit }: { archive: ArchiveRow; error: string | null; onClose(): void; onSubmit(title: string): Promise<void> }) {
  const [title, setTitle] = useState("");
  return (
    <Dialog
      open
      title="新建关联任务"
      description={`任务会带上「${archive.name}」作为资源。`}
      error={error}
      testId="archive-task-dialog"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!title.trim()} data-testid="archive-task-save" onClick={() => void onSubmit(title.trim())}>
            创建任务
          </Button>
        </>
      }
    >
      <Field label="任务名称">
        <input aria-label="任务名称" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
    </Dialog>
  );
}
