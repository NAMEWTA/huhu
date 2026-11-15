import { Button, Dialog, EmptyState } from "@huhu/ui";
import type { RichEditorPort } from "@huhu/editor/rich";
import { onOpenRequest, takeOpenRequest, useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { FileText, Folder, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CommentActions, CommentView } from "./CommentsPanel.js";
import { n, t } from "./i18n.js";
import { a } from "./archives/i18n.js";
import { FileCard } from "./FileCard.js";
import { NoteContextMenu } from "./NoteContextMenu.js";
import { CommentComposer, MoveDialog, NameDialog, NewNoteDialog, TrashList } from "./NoteDialogs.js";
import { TabStrip } from "./tabs/TabStrip.js";
import { NoteDocument } from "./NoteDocument.js";
import { NoteExplorer, type NoteRef, type Section } from "./NoteExplorer.js";
import { NoteInspector, type InspectorTab } from "./NoteInspector.js";
import { ArchiveTypeView, ArchiveView, ArchivesHome } from "./archives/ArchivesViews.js";
import { archiveFolderRoute, archiveNoteRoute, archiveOfFile, folderName } from "./archives/route.js";

export type DialogState =
  | { kind: "new"; folder: string }
  | { kind: "folder"; parent: string }
  | { kind: "rename"; note: NoteRef }
  | { kind: "move"; note: NoteRef }
  | { kind: "trash"; note: NoteRef }
  | { kind: "purge"; note: NoteRef }
  | { kind: "version"; note: NoteRef }
  | null;
const today = () => new Date().toISOString().slice(0, 10);

/** 知识库（原型 NotesView）：左侧文件资源管理器 + 文档区 + 右侧详情抽屉。 */
export function NotesModule({ onNavigate }: ModuleProps) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  /** 档案首页 / 类型视图对应的文件夹（Archives、Archives/<类型>）；打开笔记后清除。 */
  const [folderView, setFolderView] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<{ note: NoteRef; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspector, setInspector] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ from: number; to: number; quote: string } | null>(null);
  const [docText, setDocText] = useState("");
  const [dailyDate, setDailyDate] = useState(today());
  const [undo, setUndo] = useState<{ label: string; trashId: string } | null>(null);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const editorRef = useRef<RichEditorPort | null>(null);
  const commentsQ = useCapability<CommentView[]>("comments.list", { path: selected ?? "" });
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
  const beforeMove = async (note: NoteRef): Promise<boolean> => ((note.path === selected || (note.folder === true && selected?.startsWith(`${note.path}/`))) && flushRef.current ? flushRef.current() : true);

  const openComments = (id: string | null) => {
    setActiveComment(id);
    setInspector(true);
    setInspectorTab("comments");
  };
  /** 批注锚点基于磁盘上的文本：先把编辑落盘，选区偏移才与引擎看到的文本一致。 */
  const savedSelection = async (): Promise<{ from: number; to: number; quote: string } | null> => {
    if (flushRef.current && !(await flushRef.current())) return null;
    const r = editorRef.current?.getSourceSelection();
    const quote = r?.text ?? "";
    if (!r || r.from === r.to || !quote.trim()) {
      setError(n.selectFirst);
      return null;
    }
    setError(null);
    return { from: r.from, to: r.to, quote };
  };
  const addComment = () => {
    void savedSelection().then((sel) => sel && setComposer(sel));
  };
  const commentActions: CommentActions = {
    add: async (text) => void (await run("comments.create", { path: selected, target: "file", text })),
    reply: async (id, text) => void (await run("comments.reply", { id, text })),
    setResolved: async (id, resolved) => void (await run(resolved ? "comments.resolve" : "comments.reopen", { id })),
    remove: async (id) => void (await run("comments.delete", { id })),
    relocate: async (id) => {
      const sel = await savedSelection();
      if (sel) await run("comments.relocate", { id, start: sel.from, end: sel.to });
    },
    jump: (c) => {
      setActiveComment(c.id);
      if (c.anchor) {
        editorRef.current?.setSourceSelection(c.anchor.start, c.anchor.end);
        editorRef.current?.focus();
      }
    },
  };
  const q = query.trim().toLowerCase();
  const otherFiles = useCapability<{ path: string; size: number; mtimeMs: number }[]>("notes.files", {});
  const fileRefs: NoteRef[] = (otherFiles.data ?? []).map((f) => ({ path: f.path, id: null, title: f.path.split("/").at(-1) ?? f.path, file: { size: f.size, mtimeMs: f.mtimeMs } }));
  const notes = [...(list.data ?? []), ...(section === "all" ? fileRefs : [])].filter((x) => !q || `${x.path}`.toLowerCase().includes(q));
  const current = (every.data ?? []).find((x) => x.path === selected) ?? null;
  const selectedFile = fileRefs.find((f) => f.path === selected) ?? null;
  /** 拖放移动：与“移动到…”对话框同一条路径（未保存的修改先落盘；已在目标文件夹则不动）。 */
  async function moveByDrop(path: string, dir: string) {
    const cur = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (cur === dir || dir === path || dir.startsWith(`${path}/`)) return; // 已在目标处，或把文件夹拖进自己 / 后代：什么都不做
    const note = (every.data ?? []).find((x) => x.path === path);
    if (note) {
      if (!(await beforeMove(note))) return;
    } else if ((folders.data ?? []).includes(path)) {
      // 拖的是文件夹：先让正在编辑的、位于其中的笔记落盘
      const open = selected ? (every.data ?? []).find((x) => x.path === selected && x.path.startsWith(`${path}/`)) : undefined;
      if (open && !(await beforeMove(open))) return;
    } else return;
    const r = await run("notes.move", { path, targetDir: dir });
    if (r) remapSelected(path, `${dir ? `${dir}/` : ""}${path.split("/").at(-1)}`);
  }
  const folderOptions = ["", ...new Set([...(folders.data ?? []), ...(every.data ?? []).flatMap((x) => (x.path.includes("/") ? [x.path.slice(0, x.path.lastIndexOf("/"))] : []))])].sort();
  /** 改名 / 移动之后，打开着的笔记路径跟着变（文件夹则按前缀）。 */
  // 打开的文档标签（原型：编辑区上方的文档标签条）；文件已不存在（回收 / 永久删除 / 改名后）的标签自动消失
  const [tabs, setTabs] = useState<string[]>([]);
  useEffect(() => {
    if (selected && section !== "trash") setTabs((t) => (t.includes(selected) ? t : [...t, selected]));
  }, [selected, section]);
  const alive = new Set([...(every.data ?? []).map((x) => x.path), ...fileRefs.map((f) => f.path)]);
  const visibleTabs = tabs.filter((p) => alive.has(p));
  const closeTab = (p: string) => {
    const i = visibleTabs.indexOf(p);
    setTabs((t) => t.filter((x) => x !== p));
    if (selected === p) setSelected(visibleTabs[i + 1] ?? visibleTabs[i - 1] ?? null);
  };
  const remapSelected = (from: string, to: string) => {
    const re = (s: string) => (s === from ? to : s.startsWith(`${from}/`) ? `${to}${s.slice(from.length)}` : s);
    setTabs((t) => t.map(re));
    setSelected((s) => (s === null ? s : re(s)));
    setExpanded((set) => new Set([...set].map(re)));
  };
  const toggleFolder = (p: string) => setExpanded((s) => (s.has(p) ? new Set([...s].filter((x) => x !== p)) : new Set(s).add(p)));
  const expandTo = (dir: string) => {
    const parts = dir.split("/").filter(Boolean);
    setExpanded((set) => new Set([...set, ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))]));
  };
  /** 打开档案首页或类型视图。 */
  const openArchiveFolder = (dir: string) => {
    const norm = dir.replace(/\/+$/, "");
    setFolderView(norm);
    setSection((s) => (s === "trash" ? "all" : s));
    expandTo(norm);
  };
  /** 档案以文件夹路径标识；它的 index.md 就是档案视图。 */
  const openArchive = (dir: string) => openNote(`${dir.replace(/\/+$/, "")}/index.md`);
  /** 双链 / 出链 / 反链的目标：文件夹按文件夹打开，其余在笔记里找。 */
  const openTarget = (target: string) => {
    if (target.endsWith("/")) {
      const dir = target.replace(/\/+$/, "");
      const idx = (every.data ?? []).find((x) => x.path.toLowerCase() === `${dir.toLowerCase()}/index.md`);
      if (idx) return openNote(idx.path);
      return archiveFolderRoute(dir) ? openArchiveFolder(dir) : (setSection("all"), expandTo(dir));
    }
    const hit = (every.data ?? []).find((x) => x.path === target || x.path === `${target}.md`);
    if (hit) openNote(hit.path);
    else if (/\.[A-Za-z0-9]+$/.test(target) && target.includes("/")) openNote(target); // 刚创建、列表还没刷新的文件
  };
  const openNote = (path: string) => {
    setFolderView(null);
    setSelected(path);
    setSection((s) => (s === "trash" ? "all" : s));
    // 展开它所在的文件夹，树里能定位到
    const parts = path.split("/").slice(0, -1);
    setExpanded((s) => new Set([...s, ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))]));
  };

  const everyRef = useRef(every.data);
  everyRef.current = every.data;
  // 其他模块（例如任务里的 [[路径]]）请求打开某个路径：文件直接打开，文件夹在文件树里展开并定位
  useEffect(() => {
    const take = () => {
      const r = takeOpenRequest();
      if (!r) return;
      if (!r.folder) return openNote(r.path);
      const folderNote = (everyRef.current ?? []).find((x) => x.path.toLowerCase() === `${r.path.toLowerCase()}/index.md`);
      if (folderNote) return openNote(folderNote.path); // 文件夹笔记：直接打开 index.md
      if (archiveFolderRoute(r.path)?.kind === "archive") return openNote(`${r.path}/index.md`); // 还没有 index.md 的档案
      if (archiveFolderRoute(r.path)) return openArchiveFolder(r.path);
      setSection("all");
      const parts = r.path.split("/").filter(Boolean);
      setExpanded((set) => new Set([...set, ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))]));
    };
    take();
    return onOpenRequest(take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const archiveRoute = folderView ? archiveFolderRoute(folderView) : selected ? archiveNoteRoute(selected) : null;
  const owningArchive = selected ? archiveOfFile(selected) : null;
  return (
    <div className="hu-module-layout hu-knowledge-root notes-notes" data-testid="notes-module" onClick={() => setMenu(null)}>
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
        onMoveNote={(path, dir) => void moveByDrop(path, dir)}
        tags={tags.data ?? []}
        tag={tag}
        onTag={setTag}
        query={query}
        onQuery={setQuery}
        selected={selected}
        onOpen={openNote}
        expanded={expanded}
        onToggleFolder={toggleFolder}
        onOpenArchives={() => openArchiveFolder("Archives")}
        onFolderClick={(dir) => {
          if (archiveFolderRoute(dir)?.kind === "home" || archiveFolderRoute(dir)?.kind === "type") openArchiveFolder(dir);
        }}
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
      <div className="notes-main">
        {section !== "trash" && visibleTabs.length > 0 ? (
          <TabStrip tabs={visibleTabs} selected={selected} onOpen={openNote} onClose={closeTab} onNew={() => setDialog({ kind: "new", folder: "" })} />
        ) : null}
        {error ? (
          <div role="alert" className="hu-field-error">
            {error}
          </div>
        ) : null}
        {section !== "trash" && archiveRoute ? (
          archiveRoute.kind === "home" ? (
            <ArchivesHome onOpenType={openArchiveFolder} />
          ) : archiveRoute.kind === "type" ? (
            <ArchiveTypeView path={archiveRoute.path} onOpenArchive={openArchive} onOpenHome={() => openArchiveFolder("Archives")} />
          ) : (
            <ArchiveView
              key={archiveRoute.path}
              path={archiveRoute.path}
              onOpenType={openArchiveFolder}
              onOpenFile={openTarget}
              onOpenFolder={openArchive}
              onGone={() => (setSelected(null), openArchiveFolder(archiveRoute.path.split("/").slice(0, 2).join("/")))}
            />
          )
        ) : selectedFile?.file && section !== "trash" ? (
          <FileCard path={selectedFile.path} size={selectedFile.file.size} mtimeMs={selectedFile.file.mtimeMs} />
        ) : selected && section !== "trash" ? (
          <>
            {owningArchive ? (
              <div className="notes-archive-crumb-bar">
                <Folder size={13} aria-hidden />
                <button type="button" data-testid="archive-breadcrumb" onClick={() => openArchive(owningArchive)}>
                  {a.breadcrumbBack(folderName(owningArchive))}
                </button>
              </div>
            ) : null}
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
              onAddComment={addComment}
            />
          </>
        ) : section === "trash" && selected && current === null ? null : (
          <section className="notes-document-area">
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
          <div className="hu-knowledge-undo-banner">
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
          tab={inspectorTab}
          onTab={setInspectorTab}
          comments={commentsQ.data ?? []}
          activeComment={activeComment}
          commentActions={commentActions}
          readOnly={false}
          onClose={() => setInspector(false)}
          onOpen={openNote}
          onJump={(line) => editorRef.current?.gotoLine(line)}
          onOpenHistory={() => onNavigate?.("versioning")}
          {...(onNavigate ? { onNavigate } : {})}
        />
      ) : null}
      {menu ? (
        <NoteContextMenu
          menu={menu}
          trash={section === "trash"}
          onOpen={openNote}
          onDialog={setDialog}
          onClose={() => setMenu(null)}
          onRestore={(trashId) => void run("notes.restore", { trashId })}
          onDuplicate={(path) => void run<{ path: string }>("notes.duplicate", { path }).then((r) => r && openNote(r.path))}
          onFavorite={(note) => void run("notes.setFavorite", { path: note.path, favorite: note.favorite !== true })}
        />
      ) : null}

      {composer ? (
        <CommentComposer
          quote={composer.quote}
          error={error}
          onClose={() => setComposer(null)}
          onSubmit={async (text) => {
            const r = await run<{ id: string }>("comments.create", { path: selected, target: "body", start: composer.from, end: composer.to, text });
            if (r) {
              setComposer(null);
              openComments(r.id);
            }
          }}
        />
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
              const dir = dialog.note.path.includes("/") ? dialog.note.path.slice(0, dialog.note.path.lastIndexOf("/") + 1) : "";
              remapSelected(dialog.note.path, `${dir}${dialog.note.folder || name.endsWith(".md") ? name : `${name}.md`}`);
              setDialog(null);
            }
          }}
        />
      ) : null}
      {dialog?.kind === "version" ? (
        <NameDialog
          title={n.saveVersionTitle}
          description={n.saveVersionDesc}
          label={n.versionName}
          initial=""
          submit={n.menu.saveVersion}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={async (title) => {
            if (!(await beforeMove(dialog.note))) return; // 先把未保存的修改落盘，版本里才是眼前这份内容
            if (await run("history.checkpoint", { path: dialog.note.path, title })) setDialog(null);
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
              remapSelected(dialog.note.path, `${dir ? `${dir}/` : ""}${dialog.note.path.split("/").at(-1)}`);
              setDialog(null);
            }
          }}
        />
      ) : null}
      {dialog?.kind === "trash" ? (
        <Dialog
          open
          title={n.trashTitle}
          description={
            dialog.note.folder
              ? `文件夹「${dialog.note.title}」及其中的 ${(every.data ?? []).filter((x) => x.path.startsWith(`${dialog.note.path}/`)).length} 篇笔记会整体移到回收站，可以恢复。`
              : `「${dialog.note.title}」会移到回收站，可以恢复。`
          }
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
                      if (selected === dialog.note.path || selected?.startsWith(`${dialog.note.path}/`)) setSelected(null);
                      setUndo({ label: dialog.note.folder ? dialog.note.title : `${dialog.note.title}.md`, trashId: r.trashId });
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
          <p className="hu-confirm-description">内部 ID 与关联保留；恢复后双链继续有效。</p>
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
          <p className="hu-confirm-description">「{dialog.note.title}」将被永久删除。</p>
        </Dialog>
      ) : null}
    </div>
  );
}
