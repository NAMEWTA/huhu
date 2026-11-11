import { Button, Dialog, EmptyState, Field } from "@huhu/ui";
import type { MarkdownEditorHandle } from "@huhu/editor";
import { useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { FileText, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { n, t } from "./i18n.js";
import { NoteDocument } from "./NoteDocument.js";
import { NoteExplorer, type NoteRef, type Section } from "./NoteExplorer.js";
import { NoteInspector } from "./NoteInspector.js";

type DialogState = { kind: "new"; folder: string } | { kind: "folder"; parent: string } | { kind: "rename"; note: NoteRef } | { kind: "move"; note: NoteRef } | { kind: "trash"; note: NoteRef } | { kind: "purge"; note: NoteRef } | null;
const today = () => new Date().toISOString().slice(0, 10);

/** 知识库（原型 NotesView）：左侧文件资源管理器 + 文档区 + 右侧详情抽屉。 */
export function NotesModule({ onNavigate }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<{ note: NoteRef; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspector, setInspector] = useState(false);
  const [docText, setDocText] = useState("");
  const [dailyDate, setDailyDate] = useState(today());
  const [undo, setUndo] = useState<{ label: string; trashId: string } | null>(null);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const filter = section === "tags" ? (tag ? { tag } : "all") : section === "all" ? "all" : section;
  const list = useCapability<NoteRef[]>("notes.list", { filter });
  const every = useCapability<NoteRef[]>("notes.list", { filter: "all" });
  const folders = useCapability<string[]>("notes.folders", {});
  const tags = useCapability<{ tag: string; count: number }[]>("notes.tags", {});
  const vault = useCapability<{ name: string }>("vault.info", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });

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
  /** 改名 / 移动 / 移入回收站之前先把打开着的这篇的编辑落盘：这些操作会移走旧路径，之后的卸载写入会落空。失败（如冲突）则不继续。 */
  const beforeMove = async (note: NoteRef): Promise<boolean> => (note.path === selected && flushRef.current ? flushRef.current() : true);

  const q = query.trim().toLowerCase();
  const notes = (list.data ?? []).filter((x) => !q || `${x.path}`.toLowerCase().includes(q));
  const current = (every.data ?? []).find((x) => x.path === selected) ?? null;
  const folderOptions = ["", ...new Set([...(folders.data ?? []), ...(every.data ?? []).flatMap((x) => (x.path.includes("/") ? [x.path.slice(0, x.path.lastIndexOf("/"))] : []))])].sort();
  const toggleFolder = (p: string) => setExpanded((s) => (s.has(p) ? new Set([...s].filter((x) => x !== p)) : new Set(s).add(p)));
  const openNote = (path: string) => {
    setSelected(path);
    setSection((s) => (s === "trash" ? "all" : s));
    // 展开它所在的文件夹，树里能定位到
    const parts = path.split("/").slice(0, -1);
    setExpanded((s) => new Set([...s, ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))]));
  };

  return (
    <div className="module-layout knowledge-root knowledge-notes" data-testid="notes-module" onClick={() => setMenu(null)}>
      <NoteExplorer
        vaultName={vault.data?.name ?? "Vault"}
        section={section}
        onSection={(s) => {
          setSection(s);
          setTag(null);
        }}
        notes={notes}
        allCount={(every.data ?? []).length}
        folders={folders.data ?? []}
        tags={tags.data ?? []}
        tag={tag}
        onTag={setTag}
        query={query}
        onQuery={setQuery}
        selected={selected}
        onOpen={openNote}
        expanded={expanded}
        onToggleFolder={toggleFolder}
        onNewNote={(folder) => setDialog({ kind: "new", folder: folder ?? "" })}
        onNewFolder={(parent) => setDialog({ kind: "folder", parent: parent ?? "" })}
        onMenu={(note, el) => {
          const r = el.getBoundingClientRect();
          setMenu({ note, x: r.right, y: r.bottom });
        }}
        onOpenDaily={(date) => void run<{ path: string }>("notes.openDaily", { date }).then((r) => r && openNote(r.path))}
        onImport={(files) =>
          void (async () => {
            for (const f of Array.from(files)) {
              const text = await f.text();
              const created = await run<{ path: string }>("notes.create", { name: f.name.replace(/\.(md|markdown|txt)$/i, "") });
              if (created) {
                const read = await engine.call<{ version: string }>("notes.read", { path: created.path });
                await run("notes.save", { path: created.path, text, expectedVersion: read.version });
              }
            }
          })()
        }
        dailyDate={dailyDate}
        onDailyDate={setDailyDate}
      />
      <div className="knowledge-main">
        {error ? (
          <div role="alert" className="field-error">
            {error}
          </div>
        ) : null}
        {selected && section !== "trash" ? (
          <NoteDocument
            key={selected}
            path={selected}
            favorite={current?.favorite === true}
            inspectorOpen={inspector}
            onToggleInspector={() => setInspector((v) => !v)}
            onToggleFavorite={() => void run("notes.setFavorite", { path: selected, favorite: !(current?.favorite === true) })}
            onOpen={openNote}
            onMenu={(el) => {
              const r = el.getBoundingClientRect();
              if (current) setMenu({ note: current, x: r.right, y: r.bottom });
            }}
            onText={setDocText}
            registerFlush={(fn) => (flushRef.current = fn)}
            registerEditor={(h) => (editorRef.current = h)}
          />
        ) : section === "trash" && selected && current === null ? null : (
          <section className="knowledge-document-area">
            <EmptyState
              icon={FileText}
              title={section === "trash" ? n.noTrashDoc : n.noDoc}
              hint={n.noDocHint}
              action={
                <Button variant="primary" icon={Plus} onClick={() => setDialog({ kind: "new", folder: "" })}>
                  {n.newNote}
                </Button>
              }
            />
          </section>
        )}
        {section === "trash" ? <TrashList notes={list.data ?? []} onRestore={(x) => x.trashId && void run("notes.restore", { trashId: x.trashId })} onPurge={(x) => setDialog({ kind: "purge", note: x })} /> : null}
        {undo ? (
          <div className="knowledge-undo-banner">
            <span>{n.undoRemoved(undo.label)}</span>
            <button
              type="button"
              onClick={() =>
                void run("notes.restore", { trashId: undo.trashId }).then(() => {
                  setUndo(null);
                })
              }
            >
              {n.undo}
            </button>
            <button type="button" aria-label={n.closeUndo} onClick={() => setUndo(null)}>
              ×
            </button>
          </div>
        ) : null}
      </div>
      {inspector && selected && section !== "trash" ? (
        <NoteInspector
          path={selected}
          text={docText}
          tags={current?.tags ?? []}
          onClose={() => setInspector(false)}
          onOpen={openNote}
          onJump={(line) => {
            const v = editorRef.current?.view;
            if (v) {
              const pos = v.state.doc.line(Math.min(line, v.state.doc.lines)).from;
              editorRef.current?.setSelectionRange(pos);
              editorRef.current?.focus();
            }
          }}
          onOpenHistory={() => onNavigate?.("versioning")}
        />
      ) : null}
      {menu ? (
        <div className="knowledge-file-menu" role="menu" aria-label="文件操作菜单" style={{ position: "fixed", left: Math.max(8, menu.x - 200), top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div className="knowledge-menu-caption">{menu.note.path.split("/").at(-1)}</div>
          {section === "trash" ? (
            <>
              <button type="button" role="menuitem" onClick={() => (menu.note.trashId && void run("notes.restore", { trashId: menu.note.trashId }), setMenu(null))}>
                {n.menu.restore}
              </button>
              <button type="button" role="menuitem" className="danger" onClick={() => (setDialog({ kind: "purge", note: menu.note }), setMenu(null))}>
                {n.menu.purge}
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => (openNote(menu.note.path), setMenu(null))}>
                {n.menu.open}
              </button>
              <button type="button" role="menuitem" onClick={() => (setDialog({ kind: "rename", note: menu.note }), setMenu(null))}>
                {n.menu.rename}
              </button>
              <button type="button" role="menuitem" onClick={() => (setDialog({ kind: "move", note: menu.note }), setMenu(null))}>
                {n.menu.move}
              </button>
              <button type="button" role="menuitem" onClick={() => void run<{ path: string }>("notes.duplicate", { path: menu.note.path }).then((r) => (r && openNote(r.path), setMenu(null)))}>
                {n.menu.duplicate}
              </button>
              <button type="button" role="menuitem" onClick={() => (void run("notes.setFavorite", { path: menu.note.path, favorite: menu.note.favorite !== true }), setMenu(null))}>
                {menu.note.favorite ? n.menu.unstar : n.menu.star}
              </button>
              <hr />
              <button type="button" role="menuitem" className="danger" onClick={() => (setDialog({ kind: "trash", note: menu.note }), setMenu(null))}>
                {n.menu.trash}
              </button>
            </>
          )}
        </div>
      ) : null}

      {dialog?.kind === "new" ? (
        <NewNoteDialog
          folder={dialog.folder}
          folders={folderOptions}
          error={error}
          onClose={() => setDialog(null)}
          onCreate={async (v) => {
            const r = await run<{ path: string }>("notes.create", { name: v.name, ...(v.folder ? { folder: v.folder } : {}), template: v.template });
            if (r) {
              setDialog(null);
              openNote(r.path);
            }
          }}
        />
      ) : null}
      {dialog?.kind === "folder" ? (
        <NameDialog
          title={n.newFolderTitle}
          label={n.fileName}
          submit={n.createFolder}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const path = dialog.parent ? `${dialog.parent}/${name}` : name;
            if (await run("folders.create", { path })) {
              setDialog(null);
              setExpanded((s) => new Set([...s, ...path.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"))]));
            }
          }}
        />
      ) : null}
      {dialog?.kind === "rename" ? (
        <NameDialog
          title={n.renameTitle}
          description={n.renameDesc}
          label={t.rename}
          initial={dialog.note.path.split("/").at(-1)?.replace(/\.md$/, "") ?? ""}
          submit={n.renameTitle}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            if (!(await beforeMove(dialog.note))) return;
            const r = await run("notes.rename", { path: dialog.note.path, newName: name });
            if (r) {
              if (selected === dialog.note.path) setSelected(`${dialog.note.path.includes("/") ? dialog.note.path.slice(0, dialog.note.path.lastIndexOf("/") + 1) : ""}${name.endsWith(".md") ? name : `${name}.md`}`);
              setDialog(null);
            }
          }}
        />
      ) : null}
      {dialog?.kind === "move" ? (
        <MoveDialog
          note={dialog.note}
          folders={folderOptions}
          error={error}
          onClose={() => setDialog(null)}
          onMove={async (dir) => {
            if (!(await beforeMove(dialog.note))) return;
            const r = await run("notes.move", { path: dialog.note.path, targetDir: dir });
            if (r) {
              if (selected === dialog.note.path) setSelected(`${dir ? `${dir}/` : ""}${dialog.note.path.split("/").at(-1)}`);
              setDialog(null);
            }
          }}
        />
      ) : null}
      {dialog?.kind === "trash" ? (
        <Dialog
          open
          title={n.trashTitle}
          description={`「${dialog.note.title}」会移到回收站，可以恢复。`}
          error={error}
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button onClick={() => setDialog(null)}>{n.cancel}</Button>
              <Button
                variant="danger"
                onClick={() =>
                  void (async () => {
                    if (!(await beforeMove(dialog.note))) return;
                    const r = await run<{ trashId: string }>("notes.trash", { path: dialog.note.path });
                    if (r) {
                      if (selected === dialog.note.path) setSelected(null);
                      setUndo({ label: `${dialog.note.title}.md`, trashId: r.trashId });
                      setDialog(null);
                    }
                  })()
                }
              >
                {n.trashDo}
              </Button>
            </>
          }
        >
          <p className="confirm-description">内部 ID 与关联保留；恢复后双链继续有效。</p>
        </Dialog>
      ) : null}
      {dialog?.kind === "purge" ? (
        <Dialog
          open
          title={n.purgeTitle}
          description={n.purgeDesc}
          error={error}
          onClose={() => setDialog(null)}
          actions={
            <>
              <Button onClick={() => setDialog(null)}>{n.cancel}</Button>
              <Button variant="danger" onClick={() => dialog.note.trashId && void run("notes.deletePermanent", { trashId: dialog.note.trashId }).then((r) => r && setDialog(null))}>
                {n.purgeDo}
              </Button>
            </>
          }
        >
          <p className="confirm-description">「{dialog.note.title}」将被永久删除。</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function TrashList({ notes, onRestore, onPurge }: { notes: NoteRef[]; onRestore(n: NoteRef): void; onPurge(n: NoteRef): void }) {
  if (notes.length === 0) return null;
  return (
    <div className="knowledge-trash-banner" role="list" aria-label="已删除的笔记" data-testid="trash-list">
      {notes.map((x) => (
        <div key={x.trashId ?? x.path} role="listitem" className="row">
          <span className="grow">
            {x.path} · {n.trashBanner(x.deletedAt ? new Date(x.deletedAt).toLocaleString("zh-CN") : "")}
          </span>
          <Button onClick={() => onRestore(x)}>{n.menu.restore}</Button>
          <Button variant="danger" onClick={() => onPurge(x)}>
            {n.menu.purge}
          </Button>
        </div>
      ))}
    </div>
  );
}

function NameDialog({
  title,
  description,
  label,
  initial = "",
  submit,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  label: string;
  initial?: string;
  submit: string;
  error: string | null;
  onClose(): void;
  onSubmit(name: string): Promise<void>;
}) {
  const [name, setName] = useState(initial);
  return (
    <Dialog
      open
      title={title}
      {...(description ? { description } : {})}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{n.cancel}</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void onSubmit(name.trim())} data-testid="name-dialog-submit">
            {submit}
          </Button>
        </>
      }
    >
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void onSubmit(name.trim());
        }}
      >
        <Field label={label}>
          <input autoFocus aria-label={label} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function NewNoteDialog({ folder, folders, error, onClose, onCreate }: { folder: string; folders: string[]; error: string | null; onClose(): void; onCreate(v: { name: string; folder: string; template: string }): Promise<void> }) {
  const [name, setName] = useState("");
  const [dir, setDir] = useState(folder);
  const [template, setTemplate] = useState("blank");
  return (
    <Dialog
      open
      title={n.newTitle}
      description={n.newDesc}
      error={error}
      onClose={onClose}
      testId="new-note-dialog"
      actions={
        <>
          <Button onClick={onClose}>{n.cancel}</Button>
          <Button variant="primary" icon={FileText} disabled={!name.trim()} onClick={() => void onCreate({ name: name.trim(), folder: dir, template })} data-testid="new-note-submit">
            {n.create}
          </Button>
        </>
      }
    >
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void onCreate({ name: name.trim(), folder: dir, template });
        }}
      >
        <Field label={n.fileName} description={n.fileNameHint}>
          <input autoFocus aria-label={n.fileName} placeholder={n.fileNameHint} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={n.folderLabel}>
          <select aria-label={n.folderLabel} value={dir} onChange={(e) => setDir(e.target.value)}>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f || n.folderHint}
              </option>
            ))}
          </select>
        </Field>
        <Field label={n.template}>
          <select aria-label={n.template} value={template} onChange={(e) => setTemplate(e.target.value)}>
            {(Object.keys(n.templates) as (keyof typeof n.templates)[]).map((k) => (
              <option key={k} value={k}>
                {n.templates[k]}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Dialog>
  );
}

function MoveDialog({ note, folders, error, onClose, onMove }: { note: NoteRef; folders: string[]; error: string | null; onClose(): void; onMove(dir: string): Promise<void> }) {
  const [dir, setDir] = useState("");
  return (
    <Dialog
      open
      title={n.moveTitle}
      description={`把「${note.title}」移到另一个文件夹；指向它的双链会同步更新。`}
      error={error}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{n.cancel}</Button>
          <Button variant="primary" onClick={() => void onMove(dir)}>
            {n.moveDo}
          </Button>
        </>
      }
    >
      <Field label={n.folderLabel}>
        <select aria-label={n.folderLabel} value={dir} onChange={(e) => setDir(e.target.value)}>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f || "Vault 根目录"}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}
