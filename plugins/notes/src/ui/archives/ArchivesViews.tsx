import type { ArchiveDetailDto, ArchiveDto, ArchiveFieldDef, ArchiveTypeDto } from "@huhu/contracts";
import { MarkdownEditor } from "@huhu/editor";
import { Badge, Button, DataTable, Dialog, EmptyState, Field, IconButton, SearchBox, type DataTableColumn } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { ArrowUpRight, FilePlus2, FileText, Folder, MoreHorizontal, Paperclip, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { archiveIcon } from "./icons.js";
import { a } from "./i18n.js";
import { folderName } from "./route.js";
import { TypeEditorDialog } from "./TypeEditorDialog.js";

/** 档案写操作的公共外壳：调用能力、刷新所有查询、把错误交给调用方显示。 */
function useArchiveCall() {
  const engine = useEngine();
  const qc = useQueryClient();
  return async <T,>(capability: string, input: unknown): Promise<T> => {
    const r = await engine.call<T>(capability, input, { write: true });
    await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
    return r;
  };
}
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 打开窗口或重新聚焦时重新读取（空文件夹不进索引，命令行新建的目录靠这里发现）。 */
function useRefetchOnFocus(refetch: () => unknown): void {
  useEffect(() => {
    const on = () => void refetch();
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, [refetch]);
}

// ---------------------------------------------------------------- 首页
export function ArchivesHome({ onOpenType }: { onOpenType(path: string): void }) {
  const call = useArchiveCall();
  const types = useCapability<ArchiveTypeDto[]>("archives.types.list", {});
  useRefetchOnFocus(types.refetch);
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = types.data ?? [];
  return (
    <section className="notes-document-area notes-archive-view" data-testid="archives-home">
      <header className="notes-archive-head">
        <div>
          <h2>{a.homeTitle}</h2>
          <p className="small muted">{a.homeHint}</p>
        </div>
        <div className="row">
          <IconButton icon={RefreshCw} label={a.refresh} onClick={() => void types.refetch()} />
          <Button variant="primary" icon={Plus} onClick={() => setDialog(true)} data-testid="archive-category-new">
            {a.newType}
          </Button>
        </div>
      </header>
      {list.length === 0 && !types.isLoading ? (
        <EmptyState
          icon={Folder}
          title={a.noTypes}
          hint={a.noTypesHint}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setDialog(true)}>
              {a.newFirstType}
            </Button>
          }
        />
      ) : (
        <div className="notes-archive-cards">
          {list.map((t) => {
            const Icon = archiveIcon(t.icon);
            return (
              <button key={t.path} type="button" className="notes-archive-card" data-testid="archive-category-card" onClick={() => onOpenType(t.path)}>
                <Icon size={22} aria-hidden />
                <strong>{t.name}</strong>
                <small>{a.archiveCount(t.count)}</small>
              </button>
            );
          })}
        </div>
      )}
      {dialog ? (
        <TypeEditorDialog
          type={null}
          error={error}
          onClose={() => (setDialog(false), setError(null))}
          onSave={async (v) => {
            try {
              const created = await call<ArchiveTypeDto>("archives.types.save", { name: v.name, icon: v.icon, fields: v.fields });
              setDialog(false);
              setError(null);
              onOpenType(created.path);
            } catch (e) {
              setError(message(e));
            }
          }}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- 类型视图
export function ArchiveTypeView({ path, onOpenArchive, onOpenHome }: { path: string; onOpenArchive(path: string): void; onOpenHome(): void }) {
  const call = useArchiveCall();
  const types = useCapability<ArchiveTypeDto[]>("archives.types.list", {});
  const [query, setQuery] = useState("");
  const rows = useCapability<ArchiveDto[]>("archives.list", { type: path, ...(query.trim() ? { query: query.trim() } : {}) });
  useRefetchOnFocus(() => (void types.refetch(), void rows.refetch()));
  const type = (types.data ?? []).find((t) => t.path === path) ?? null;
  const [dialog, setDialog] = useState<null | "new" | "fields" | "rename" | "delete">(null);
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = () => (setDialog(null), setError(null), setName(""));
  if (types.data && !type)
    return (
      <section className="notes-document-area notes-archive-view">
        <EmptyState icon={Folder} title={a.noTypes} action={<Button onClick={onOpenHome}>{a.homeTitle}</Button>} />
      </section>
    );
  const defs: ArchiveFieldDef[] = type?.fields ?? [];
  const columns: DataTableColumn<ArchiveDto>[] = [
    { id: "name", header: a.columnName, width: 220, cell: (r) => <strong>{r.name}</strong> },
    ...defs.map((f): DataTableColumn<ArchiveDto> => ({ id: `f:${f.name}`, header: f.name, cell: (r) => <FieldCell row={r} field={f} /> })),
    { id: "updatedAt", header: a.columnUpdated, width: 160, cell: (r) => <span className="muted">{r.updatedAt.replace("T", " ").replace("Z", "")}</span> },
  ];
  const Icon = archiveIcon(type?.icon ?? "folder");
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      close();
    } catch (e) {
      setError(message(e));
    }
  };
  return (
    <section className="notes-document-area notes-archive-view" data-testid="archive-category-view">
      <header className="notes-archive-head">
        <div className="row">
          <Icon size={22} aria-hidden />
          <div>
            <h2>{type?.name ?? folderName(path)}</h2>
            <p className="small muted">{a.archiveCount(type?.count ?? 0)}</p>
          </div>
        </div>
        <div className="row">
          <SearchBox value={query} onChange={setQuery} placeholder={a.search} />
          <IconButton icon={RefreshCw} label={a.refresh} onClick={() => void rows.refetch()} />
          <Button icon={Pencil} onClick={() => setDialog("fields")} data-testid="archive-edit-fields">
            {a.editFields}
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setDialog("new")} data-testid="archive-new">
            {a.newArchive}
          </Button>
          <div className="notes-archive-more">
            <IconButton icon={MoreHorizontal} label={a.more} onClick={() => setMenu((v) => !v)} />
            {menu ? (
              <div className="shell-knowledge-file-menu notes-archive-menu" role="menu" onClick={() => setMenu(false)}>
                <button type="button" role="menuitem" onClick={() => (setName(type?.name ?? ""), setDialog("rename"))}>
                  {a.renameType}
                </button>
                <button type="button" role="menuitem" onClick={() => setDialog("delete")}>
                  {a.deleteType}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <DataTable
        label={a.homeTitle}
        columns={columns}
        rows={rows.data ?? []}
        rowKey={(r) => r.path}
        rowTestId="archive-row"
        onOpen={(r) => onOpenArchive(r.path)}
        onSelect={(r) => onOpenArchive(r.path)}
        empty={<EmptyState icon={Folder} title={a.noArchives} />}
      />
      {dialog === "new" ? (
        <Dialog
          open
          title={a.newArchiveTitle(type?.name ?? "")}
          error={error}
          onClose={close}
          testId="archive-dialog"
          actions={
            <>
              <Button onClick={close}>{a.cancel}</Button>
              <Button variant="primary" disabled={!name.trim()} data-testid="archive-save" onClick={() => void run(async () => onOpenArchive((await call<ArchiveDto>("archives.create", { type: path, name: name.trim() })).path))}>
                {a.create}
              </Button>
            </>
          }
        >
          <Field label={a.archiveName}>
            <input autoFocus aria-label={a.archiveName} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </Dialog>
      ) : null}
      {dialog === "fields" && type ? (
        <TypeEditorDialog type={type} error={error} onClose={close} onSave={(v) => run(() => call("archives.types.save", { path, name: type.name, icon: v.icon, fields: v.fields, renames: v.renames }))} />
      ) : null}
      {dialog === "rename" ? (
        <Dialog
          open
          title={a.renameType}
          error={error}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{a.cancel}</Button>
              <Button
                variant="primary"
                disabled={!name.trim()}
                onClick={() =>
                  void run(async () => {
                    const t = await call<ArchiveTypeDto>("archives.types.save", { path, name: name.trim(), icon: type?.icon, fields: defs });
                    if (t.path !== path) onOpenArchive(t.path);
                  })
                }
              >
                {a.save}
              </Button>
            </>
          }
        >
          <Field label={a.typeName}>
            <input autoFocus aria-label={a.typeName} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </Dialog>
      ) : null}
      {dialog === "delete" ? (
        <Dialog
          open
          title={a.deleteType}
          description={a.deleteTypeConfirm(type?.name ?? "", (type?.count ?? 0) + 1)}
          error={error}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{a.cancel}</Button>
              <Button
                variant="danger"
                data-testid="archive-delete-confirm"
                onClick={() =>
                  void run(async () => {
                    await call("archives.types.delete", { path });
                    onOpenHome();
                  })
                }
              >
                {a.deleteType}
              </Button>
            </>
          }
        >
          <span />
        </Dialog>
      ) : null}
    </section>
  );
}

function FieldCell({ row, field }: { row: ArchiveDto; field: ArchiveFieldDef }) {
  const v = row.fields[field.name];
  const bad = row.invalidFields.find((x) => x.name === field.name);
  if (v === undefined || v === "") return <span className="muted">—</span>;
  return (
    <span className={bad ? "notes-archive-invalid" : undefined} title={bad?.reason}>
      {String(v)}
    </span>
  );
}

// ---------------------------------------------------------------- 档案视图
export function ArchiveView({ path, onOpenType, onOpenFile, onOpenFolder, onGone }: { path: string; onOpenType(path: string): void; onOpenFile(path: string): void; onOpenFolder(path: string): void; onGone(): void }) {
  const call = useArchiveCall();
  const detail = useCapability<ArchiveDetailDto>("archives.read", { path });
  const types = useCapability<ArchiveTypeDto[]>("archives.types.list", {});
  useRefetchOnFocus(detail.refetch);
  const d = detail.data ?? null;
  const type = d ? ((types.data ?? []).find((t) => t.path === d.type) ?? null) : null;
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "rename" | "move" | "delete" | "note">(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [menu, setMenu] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => (setDialog(null), setError(null), setName(""));
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      close();
    } catch (e) {
      setError(message(e));
    }
  };
  if (detail.isError && !d)
    return (
      <section className="notes-document-area notes-archive-view">
        <EmptyState icon={Folder} title={a.notFound} />
      </section>
    );
  if (!d) return <p>{a.loading}</p>;

  const save = async (patch: { fields?: Record<string, unknown>; body?: string; removeKeys?: string[] }) => {
    try {
      setError(null);
      await call("archives.update", { path: d.path, ...(d.version ? { expectedVersion: d.version } : {}), ...patch });
    } catch (e) {
      setError(message(e));
      await detail.refetch();
    }
  };
  const defs = type?.fields ?? [];
  return (
    <section className="notes-document-area notes-archive-view" data-testid="archive-view">
      <header className="notes-archive-head">
        <div>
          <button type="button" className="notes-archive-crumb" onClick={() => onOpenType(d.type)} data-testid="archive-category-link">
            {folderName(d.type)}
          </button>
          <h2>{d.name}</h2>
        </div>
        <div className="notes-archive-more">
          <IconButton icon={MoreHorizontal} label={a.more} onClick={() => setMenu((v) => !v)} />
          {menu ? (
            <div className="shell-knowledge-file-menu notes-archive-menu" role="menu" onClick={() => setMenu(false)}>
              <button type="button" role="menuitem" onClick={() => (setName(d.name), setDialog("rename"))}>
                {a.rename}
              </button>
              <button type="button" role="menuitem" onClick={() => (setTarget((types.data ?? []).find((t) => t.path !== d.type)?.path ?? ""), setDialog("move"))}>
                {a.moveToType}
              </button>
              <button type="button" role="menuitem" onClick={() => setDialog("delete")}>
                {a.deleteArchive}
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {error ? (
        <div role="alert" className="hu-field-error">
          {error}
        </div>
      ) : null}
      <h3>{a.fields}</h3>
      {defs.length === 0 ? <p className="small muted">{a.noFields}</p> : null}
      <div className="notes-archive-fields" data-testid="archive-fields">
        {defs.map((f) => (
          <FieldInput key={`${d.path}:${f.name}:${String(d.fields[f.name] ?? "")}`} def={f} value={d.fields[f.name]} problem={d.invalidFields.find((x) => x.name === f.name)?.reason} onCommit={(v) => save({ fields: { [f.name]: v } })} />
        ))}
      </div>
      {d.undefinedFields.length > 0 ? (
        <>
          <h3>{a.undefinedFields}</h3>
          <p className="small muted">{a.undefinedHint}</p>
          <div className="archive-undefined" data-testid="archive-undefined">
            {d.undefinedFields.map((k) => (
              <div key={k} className="row">
                <code>{k}</code>
                <IconButton icon={Trash2} label={a.removeKey(k)} onClick={() => void save({ removeKeys: [k] })} />
              </div>
            ))}
          </div>
        </>
      ) : null}
      <h3>{a.body}</h3>
      <BodyEditor key={d.path} path={d.path} body={d.body} onSave={(body) => save({ body })} />
      <h3>
        {a.files}
        <span className="notes-archive-actions">
          <Button icon={FilePlus2} onClick={() => setDialog("note")} data-testid="archive-new-note">
            {a.newNote}
          </Button>
          <Button icon={Paperclip} onClick={() => fileInput.current?.click()} data-testid="archive-add-file">
            {a.addFile}
          </Button>
          <input
            ref={fileInput}
            type="file"
            hidden
            data-testid="archive-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void f.arrayBuffer().then((buf) => {
                let bin = "";
                for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
                return run(() => call("archives.addFile", { path: d.path, name: f.name, dataBase64: btoa(bin) }));
              });
            }}
          />
        </span>
      </h3>
      {d.files.length === 0 ? <p className="small muted">{a.noFiles}</p> : null}
      <div className="archive-files" data-testid="archive-files">
        {d.files.map((f) => (
          <button key={f.path} type="button" className="notes-link-row" data-testid="archive-file" onClick={() => (f.kind === "folder" ? onOpenFolder(f.path) : onOpenFile(f.path))}>
            {f.kind === "folder" ? <Folder size={15} aria-hidden /> : <FileText size={15} aria-hidden />}
            <span>{f.name}</span>
            <Badge>{f.kind === "note" ? "笔记" : f.kind === "folder" ? "文件夹" : "附件"}</Badge>
          </button>
        ))}
      </div>
      <h3>{a.outgoing}</h3>
      {d.outgoing.length === 0 ? <p className="small muted">{a.noOutgoing}</p> : null}
      {d.outgoing.map((l, i) => (
        <button key={`${l.target}:${i}`} type="button" className="notes-link-row" data-testid="archive-outgoing" disabled={!l.exists} onClick={() => onOpenFile(l.target)}>
          <ArrowUpRight size={15} aria-hidden />
          <span>{l.target}</span>
          {l.exists ? null : <Badge tone="warning">不存在</Badge>}
        </button>
      ))}
      <h3>{a.backlinks}</h3>
      {d.backlinks.length === 0 ? <p className="small muted">{a.noBacklinks}</p> : null}
      {d.backlinks.map((b) => (
        <button key={b.path} type="button" className="notes-link-row" data-testid="archive-backlink" onClick={() => onOpenFile(b.path)}>
          <FileText size={15} aria-hidden />
          <span>{b.title}</span>
          <small className="muted">{b.path}</small>
        </button>
      ))}

      {dialog === "rename" ? (
        <Dialog
          open
          title={a.rename}
          error={error}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{a.cancel}</Button>
              <Button variant="primary" disabled={!name.trim()} data-testid="archive-rename-save" onClick={() => void run(async () => onOpenFolder((await call<ArchiveDto>("archives.update", { path: d.path, name: name.trim() })).path))}>
                {a.save}
              </Button>
            </>
          }
        >
          <Field label={a.newName}>
            <input autoFocus aria-label={a.newName} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </Dialog>
      ) : null}
      {dialog === "move" ? (
        <Dialog
          open
          title={a.moveToType}
          error={error}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{a.cancel}</Button>
              <Button variant="primary" disabled={!target} data-testid="archive-move-save" onClick={() => void run(async () => onOpenFolder((await call<ArchiveDto>("archives.move", { path: d.path, type: target })).path))}>
                {a.save}
              </Button>
            </>
          }
        >
          <Field label={a.targetType}>
            <select aria-label={a.targetType} value={target} onChange={(e) => setTarget(e.target.value)}>
              {(types.data ?? [])
                .filter((t) => t.path !== d.type)
                .map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
        </Dialog>
      ) : null}
      {dialog === "delete" ? (
        <Dialog
          open
          title={a.deleteArchive}
          description={a.deleteArchiveConfirm(d.name, d.files.length + 1)}
          error={error}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{a.cancel}</Button>
              <Button
                variant="danger"
                data-testid="archive-delete-confirm"
                onClick={() =>
                  void run(async () => {
                    await call("archives.delete", { path: d.path });
                    onGone();
                  })
                }
              >
                {a.deleteArchive}
              </Button>
            </>
          }
        >
          <span />
        </Dialog>
      ) : null}
      {dialog === "note" ? (
        <Dialog
          open
          title={a.newNote}
          error={error}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{a.cancel}</Button>
              <Button
                variant="primary"
                disabled={!name.trim()}
                data-testid="archive-note-save"
                onClick={() => void run(async () => onOpenFile((await call<{ path: string }>("notes.create", { name: name.trim(), folder: d.path.replace(/\/$/, "") })).path))}
              >
                {a.create}
              </Button>
            </>
          }
        >
          <Field label={a.noteName}>
            <input autoFocus aria-label={a.noteName} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </Dialog>
      ) : null}
    </section>
  );
}

/** 字段输入：就地编辑，失焦后保存；不合法的值标红并显示原因。 */
function FieldInput({ def, value, problem, onCommit }: { def: ArchiveFieldDef; value: unknown; problem?: string | undefined; onCommit(v: string): Promise<unknown> }) {
  const [v, setV] = useState(value === undefined || value === null ? "" : String(value));
  return (
    <Field label={def.name} error={problem ?? null}>
      <input
        aria-label={def.name}
        data-testid="archive-field"
        aria-invalid={problem ? true : undefined}
        type={def.type === "date" ? "text" : def.type === "number" ? "text" : "text"}
        placeholder={def.type === "date" ? "YYYY-MM-DD" : def.type === "url" ? "https://" : ""}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v !== (value === undefined || value === null ? "" : String(value))) void onCommit(v);
        }}
      />
    </Field>
  );
}

/** 正文编辑：普通笔记编辑器编辑 index.md 的正文；停手 800 ms 或失焦后条件写。 */
function BodyEditor({ path, body, onSave }: { path: string; body: string; onSave(body: string): Promise<unknown> }) {
  const [text, setText] = useState(body);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(body);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (latest.current !== body) void onSave(latest.current);
  };
  useEffect(() => {
    // 卸载（切换到别的档案或模块）时把未保存的正文落盘
    return () => {
      if (latest.current !== body) void onSave(latest.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="notes-archive-body" data-testid="archive-body" onBlur={flush}>
      <MarkdownEditor
        documentId={`archive:${path}`}
        value={text}
        onChange={(v) => {
          latest.current = v;
          setText(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
        onSave={flush}
        ariaLabel={a.body}
        lineNumbers={false}
      />
    </div>
  );
}
