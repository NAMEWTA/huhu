import { Button, Dialog, EmptyState } from "@huhu/ui";
import type { RichEditorPort } from "@huhu/editor/rich";
import { onOpenRequest, queryKey, takeOpenRequest, useCapability, useEngine, useQueryClient, type ModuleProps } from "@huhu/workbench";
import { FileText, Folder, Plus } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { n, t } from "./i18n.js";
import { a } from "./archives/i18n.js";
import { NoteContextMenu, type NoteContextMenuProps } from "./NoteContextMenu.js";
import { MoveDialog, NameDialog, NewNoteDialog, TrashList } from "./NoteDialogs.js";
import { activeTab, tabFilePath, tabKey } from "./tabs/docTabs.js";
import { archiveRecordTab, archiveSelectionOf, archiveTypeTab, archivesHomeTab, fileTab, loadTabs, restoreShellState, saveTabs, shellReducer } from "./tabs/shellState.js";
import { TabStrip } from "./tabs/TabStrip.js";
import { NoteDocument, preloadEditorSurface } from "./NoteDocument.js";
import { NoteExplorer, type NoteRef, type Section } from "./NoteExplorer.js";
import { NoteInspector, type InspectorTab } from "./NoteInspector.js";
import { ArchiveTypeView, ArchivesHome } from "./archives/ArchivesViews.js";
import { ArchiveRecordView } from "./archives/ArchiveRecordView.js";
import { ArchivesSidebar } from "./archives/ArchivesSidebar.js";
import { archiveFolderRoute, archiveNoteRoute, archiveOfFile, folderName } from "./archives/route.js";

const FileViewer = lazy(() => import("./viewers/FileViewer.js").then(({ FileViewer }) => ({ default: FileViewer })));
const UnindexedFileViewer = lazy(() => import("./viewers/FileViewer.js").then(({ UnindexedFileViewer }) => ({ default: UnindexedFileViewer })));

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
  const vaultId = engine.vaultId;
  /** 标签 + 侧栏上下文的组合状态（同一个纯 reducer，没有互相触发的 effect，E02）。 */
  const [shell, dispatch] = useReducer(shellReducer, vaultId, (v) => restoreShellState(v, loadTabs(v)));
  const vaultRef = useRef(vaultId);
  vaultRef.current = vaultId;
  const tab = activeTab(shell.tabs);
  /** 当前标签对应的真实文件：文件标签 = 其路径；档案记录标签 = 该档案的 index.md（同一文件同一会话，E04）。 */
  const selected = tab ? tabFilePath(tab) : null;
  const activeTabRef = useRef(tab);
  activeTabRef.current = tab;
  const archiveTab = tab && tab.kind !== "file" ? tab : null;
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<NoteContextMenuProps["menu"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspector, setInspector] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [docText, setDocText] = useState("");
  const [dailyDate, setDailyDate] = useState(today());
  const [undo, setUndo] = useState<{ label: string; trashId: string } | null>(null);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const editorRef = useRef<RichEditorPort | null>(null);
  const registerFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    flushRef.current = flush;
  }, []);
  const registerEditor = useCallback((port: RichEditorPort | null) => {
    editorRef.current = port;
  }, []);
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

  /** 工具栏“添加批注”：触发 OK 的选区入口（选区 / 取消 / 上下文冻结都在编辑器里；引用文字在已保存文本上由引擎解析）。 */
  const addComment = () => {
    setInspector(true);
    setInspectorTab("comments");
    void import("@huhu/editor/rich").then((m) => m.startComment());
  };
  // 在编辑器里发表批注（OK 的选区入口）之后，打开详情栏的批注页
  useEffect(() => {
    let off: (() => void) | null = null;
    let live = true;
    void import("@huhu/editor/rich").then((m) => {
      if (live) off = m.onCommentPosted(() => (setInspector(true), setInspectorTab("comments")));
    });
    return () => {
      live = false;
      off?.();
    };
  }, []);
  const flushForComments = (): Promise<boolean> => (flushRef.current ? flushRef.current() : Promise.resolve(true));
  const q = query.trim().toLowerCase();
  // 非 Markdown 文件的元信息来自索引（vault.indexEntries）：只用于搜索结果、FileViewer 与标签存活判断；树本身直接列举文件系统
  const indexEntries = useCapability<{ path: string; type: "file" | "dir"; size?: number; mtimeMs?: number }[]>("vault.indexEntries", {});
  const fileRefs: NoteRef[] = useMemo(
    () =>
      (indexEntries.data ?? [])
        .filter((e) => e.type === "file" && !/\.md$/i.test(e.path) && !e.path.split("/").some((seg) => seg.startsWith(".")))
        .map((f) => ({ path: f.path, id: null, title: f.path.split("/").at(-1) ?? f.path, file: { size: f.size ?? 0, mtimeMs: f.mtimeMs ?? 0 } })),
    [indexEntries.data],
  );
  const notes = [...(list.data ?? []), ...(section === "all" ? fileRefs : [])].filter((x) => !q || `${x.path}`.toLowerCase().includes(q));
  const current = (every.data ?? []).find((x) => x.path === selected) ?? null;
  const selectedFile = tab?.kind === "file" ? (fileRefs.find((f) => f.path === tab.path) ?? null) : null;
  const folderOptions = ["", ...new Set([...(folders.data ?? []), ...(every.data ?? []).flatMap((x) => (x.path.includes("/") ? [x.path.slice(0, x.path.lastIndexOf("/"))] : []))])].sort();
  // 知识库界面出现就预载编辑器块（F09：打开第一篇笔记不再等块下载与求值）
  useEffect(() => preloadEditorSurface(), []);

  // 打开的文档标签（DocTab 联合标签）；文件已不存在（回收 / 永久删除 / 改名后）的文件标签自动消失。
  // 只在两份列表都已加载后才裁剪（否则恢复出来的标签会在加载前被清空）。
  const listsReady = every.data !== undefined && indexEntries.data !== undefined;
  const aliveKey = listsReady ? [...(every.data ?? []).map((x) => x.path), ...fileRefs.map((f) => f.path)].sort().join("\n") : null;
  useEffect(() => {
    if (aliveKey === null) return;
    dispatch({ type: "prune", alive: new Set(aliveKey ? aliveKey.split("\n") : []) });
  }, [aliveKey]);
  // 标签随 Vault 记录；切 Vault 时重新读取该库的标签
  const restoredVault = useRef(vaultId);
  useEffect(() => {
    if (restoredVault.current === vaultId) return;
    restoredVault.current = vaultId;
    const saved = loadTabs(vaultId);
    dispatch({ type: "restore", vaultId, tabs: saved?.tabs ?? [], activeKey: saved?.activeKey ?? null });
  }, [vaultId]);
  useEffect(() => {
    if (shell.tabs.vaultId === vaultId) saveTabs(vaultId, shell.tabs);
  }, [shell.tabs, vaultId]);
  const closeTab = (key: string) => dispatch({ type: "close", key });
  const remapSelected = (from: string, to: string) => dispatch({ type: "remap", from, to });
  const expandTo = (dir: string) => {
    const parts = dir.split("/").filter(Boolean);
    parts.forEach((_, i) => dispatch({ type: "sidebar", action: { type: "expand", path: parts.slice(0, i + 1).join("/"), open: true, context: "files" } }));
  };
  const revealInArchives = (key: string | null) => {
    if (!key) return;
    const parts = key.split("/");
    if (parts.length >= 2) dispatch({ type: "sidebar", action: { type: "expand", path: parts.slice(0, 2).join("/"), open: true, context: "archives" } });
  };
  /** 打开档案首页（唯一的标签，重复点击只聚焦）。 */
  const openArchivesHome = () => {
    setSection((s) => (s === "trash" ? "all" : s));
    dispatch({ type: "open", tab: archivesHomeTab(vaultRef.current) });
  };
  /** 打开档案类型页（真实标签）。 */
  const openArchiveType = (typePath: string) => {
    const t = archiveTypeTab(vaultRef.current, typePath);
    if (!t) return openArchivesHome();
    setSection((s) => (s === "trash" ? "all" : s));
    dispatch({ type: "open", tab: t });
    revealInArchives(archiveSelectionOf(t));
  };
  /** 档案以文件夹路径标识；打开的是真实的档案记录标签（同一 index.md 与 Markdown 视图共用会话）。 */
  const openArchive = (dir: string): void => {
    const t = archiveRecordTab(vaultRef.current, dir);
    if (!t) return openTarget(dir);
    const show = () => {
      setSection((s) => (s === "trash" ? "all" : s));
      dispatch({ type: "open", tab: t });
      revealInArchives(archiveSelectionOf(t));
    };
    const current = activeTabRef.current;
    if (current?.kind !== "file" || current.path !== tabFilePath(t)) {
      show();
      return;
    }
    const route = archiveNoteRoute(current.path);
    const flush = flushRef.current;
    void (async () => {
      if (route?.kind !== "archive" || (flush && !(await flush()))) return;
      if (activeTabRef.current !== current || vaultRef.current !== t.vaultId) return;
      // Markdown 落盘后才读取档案字段，避免表单拿着同一文件的旧版本提交。
      qc.removeQueries({ queryKey: queryKey(t.vaultId, "archives.read", { path: route.path }), exact: true });
      show();
    })();
  };
  /** 打开档案首页或类型视图（旧入口名：按路径深度分派）。 */
  const openArchiveFolder = (dir: string) => (archiveFolderRoute(dir)?.kind === "type" ? openArchiveType(dir) : openArchivesHome());
  /** 双链 / 出链 / 反链的目标：文件夹按文件夹打开，其余在笔记里找；档案的 index.md 打开为档案记录标签。 */
  const openTarget = (target: string): void => {
    if (target.endsWith("/")) {
      const dir = target.replace(/\/+$/, "");
      const idx = (every.data ?? []).find((x) => x.path.toLowerCase() === `${dir.toLowerCase()}/index.md`);
      if (idx) return openLinked(idx.path);
      return archiveFolderRoute(dir) ? openArchiveFolder(dir) : (setSection("all"), expandTo(dir));
    }
    const hit = (every.data ?? []).find((x) => x.path === target || x.path === `${target}.md`);
    if (hit) openLinked(hit.path);
    else if (/\.[A-Za-z0-9]+$/.test(target) && target.includes("/")) openLinked(target); // 刚创建、列表还没刷新的文件
  };
  /** 文件树 / 标签条的打开：永远是文件标签（Markdown 视图）；档案的 index.md 在这里也是 Markdown（E04）。 */
  const openNote = (path: string) => {
    setSection((s) => (s === "trash" ? "all" : s));
    dispatch({ type: "open", tab: fileTab(vaultRef.current, path) });
    expandTo(path.split("/").slice(0, -1).join("/")); // 展开它所在的文件夹，树里能定位到
  };
  /** 链接 / 请求 / 命令面板的打开：档案的 index.md 就是档案记录标签，其余是文件标签。 */
  const openLinked = (path: string): void => (archiveNoteRoute(path) ? openArchive(path) : openNote(path));
  const focusTab = (key: string) => {
    const next = shell.tabs.tabs.find((x) => tabKey(x) === key);
    if (next?.kind === "archive-record" && tab?.kind === "file" && tab.path === tabFilePath(next)) {
      openArchive(tab.path);
      return;
    }
    dispatch({ type: "focus", key });
  };
  /** 档案记录标签 → 同一文件的 Markdown 标签。 */
  const openAsMarkdown = (path: string) => openNote(path);

  const everyRef = useRef(every.data);
  everyRef.current = every.data;
  // 其他模块（例如任务里的 [[路径]]）请求打开某个路径：文件直接打开，文件夹在文件树里展开并定位
  useEffect(() => {
    const take = () => {
      const r = takeOpenRequest();
      if (!r) return;
      if (!r.folder) return openLinked(r.path);
      const folderNote = (everyRef.current ?? []).find((x) => x.path.toLowerCase() === `${r.path.toLowerCase()}/index.md`);
      if (folderNote) return openLinked(folderNote.path); // 文件夹笔记：直接打开 index.md（档案则是档案记录标签）
      if (archiveFolderRoute(r.path)?.kind === "archive") return openArchive(r.path); // 还没有 index.md 的档案
      if (archiveFolderRoute(r.path)) return openArchiveFolder(r.path);
      setSection("all");
      expandTo(r.path);
    };
    take();
    return onOpenRequest(take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owningArchive = tab?.kind === "file" ? archiveOfFile(tab.path) : null;
  const archiveIndexOfTab = tab?.kind === "file" && archiveNoteRoute(tab.path) ? tab.path : null;
  const archivesActive = shell.sidebar.context === "archives";
  const detail =
    inspector && selected && tab?.kind === "file" && section !== "trash" ? (
      <NoteInspector
        path={selected}
        text={docText}
        tags={current?.tags ?? []}
        tab={inspectorTab}
        onTab={setInspectorTab}
        notePaths={(every.data ?? []).map((x) => x.path)}
        flush={flushForComments}
        readOnly={false}
        onClose={() => setInspector(false)}
        onOpen={openLinked}
        onJump={(line) => editorRef.current?.gotoLine(line)}
        onOpenHistory={() => onNavigate?.("versioning")}
        {...(onNavigate ? { onNavigate } : {})}
      />
    ) : null;
  return (
    <div className="hu-module-layout hu-knowledge-root notes-notes" data-testid="notes-module" onClick={() => setMenu(null)}>
      <NoteExplorer
        vaultName={vault.data?.name ?? "Vault"}
        section={section}
        onSection={(s) => {
          setSection(s);
          setTag(null);
          // 点“文件”分类只切显示上下文，不关闭任何标签（E02）
          dispatch({ type: "sidebar", action: { type: "choose", context: "files" } });
        }}
        notes={notes}
        allCount={(every.data ?? []).length}
        beforeMutate={async (paths) => (selected && paths.some((x) => selected === x || selected.startsWith(`${x}/`)) && flushRef.current ? flushRef.current() : true)}
        onMoved={(moved) => {
          // 内部改名 / 移动：标签与选中项按映射重定位（文件夹按前缀）
          for (const [from, to] of Object.entries(moved)) remapSelected(from, to);
          void refresh();
        }}
        isFavorite={(path) => (every.data ?? []).find((x) => x.path === path)?.favorite === true}
        onMenuAction={(action, path, kind) => {
          const note: NoteRef = (every.data ?? []).find((x) => x.path === path) ?? { path, id: null, title: path.split("/").at(-1) ?? path, ...(kind === "folder" ? { folder: true } : {}) };
          if (action === "favorite") void run("notes.setFavorite", { path, favorite: !(note.favorite === true) });
          else setDialog({ kind: action, note });
        }}
        onTrashed={(path, trashId) => setUndo({ label: path.split("/").at(-1) ?? path, trashId })}
        tags={tags.data ?? []}
        tag={tag}
        onTag={setTag}
        query={query}
        onQuery={setQuery}
        selected={tab?.kind === "file" ? tab.path : null}
        onOpen={openNote}
        onOpenArchives={openArchivesHome}
        archivesActive={archivesActive}
        archivesPanel={
          <ArchivesSidebar
            expanded={shell.sidebar.views.archives.expanded}
            selected={archiveSelectionOf(archiveTab)}
            onToggle={(key) => dispatch({ type: "sidebar", action: { type: "expand", path: key, open: !shell.sidebar.views.archives.expanded.includes(key), context: "archives" } })}
            onOpenHome={openArchivesHome}
            onOpenType={openArchiveType}
            onOpenArchive={openArchive}
          />
        }
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
        {section !== "trash" && shell.tabs.tabs.length > 0 ? <TabStrip tabs={shell.tabs.tabs} activeKey={shell.tabs.activeKey} onFocus={focusTab} onClose={closeTab} onNew={() => setDialog({ kind: "new", folder: "" })} /> : null}
        {error ? (
          <div role="alert" className="hu-field-error">
            {error}
          </div>
        ) : null}
        {section !== "trash" && archiveTab ? (
          archiveTab.kind === "archives-home" ? (
            <ArchivesHome onOpenType={openArchiveType} />
          ) : archiveTab.kind === "archive-type" ? (
            <ArchiveTypeView key={tabKey(archiveTab)} path={`Archives/${archiveTab.type}/`} onOpenArchive={openArchive} onOpenHome={openArchivesHome} />
          ) : (
            <>
              <div className="notes-archive-crumb-bar">
                <Folder size={13} aria-hidden />
                <button type="button" data-testid="archive-open-markdown" onClick={() => openAsMarkdown(tabFilePath(archiveTab) ?? "")}>
                  {a.openAsMarkdown}
                </button>
              </div>
              <ArchiveRecordView
                key={tabKey(archiveTab)}
                indexPath={tabFilePath(archiveTab) ?? ""}
                path={`Archives/${archiveTab.type}/${archiveTab.name}/`}
                onOpenType={openArchiveType}
                onOpenFile={openTarget}
                onOpenFolder={(p) => {
                  // 改名 / 移动：记录标签随之替换（旧名字的标签不留）；档案里的子文件夹仍按文件夹打开
                  const next = archiveRecordTab(vaultRef.current, p);
                  if (next && tabKey(next) !== tabKey(archiveTab)) {
                    dispatch({ type: "close", key: tabKey(archiveTab) });
                    openArchive(p);
                  } else openTarget(p);
                }}
                onGone={() => {
                  dispatch({ type: "close", key: tabKey(archiveTab) });
                  openArchiveType(`Archives/${archiveTab.type}/`);
                }}
              />
            </>
          )
        ) : selectedFile?.file && section !== "trash" ? (
          <>
            <Suspense fallback={<p role="status">{t.loading}</p>}>
              <FileViewer path={selectedFile.path} size={selectedFile.file.size} mtimeMs={selectedFile.file.mtimeMs} />
            </Suspense>
            {detail}
          </>
        ) : tab?.kind === "file" && section !== "trash" && !/\.md$/i.test(tab.path) ? (
          <>
            <Suspense fallback={<p role="status">{t.loading}</p>}>
              <UnindexedFileViewer key={tab.path} path={tab.path} />
            </Suspense>
            {detail}
          </>
        ) : tab?.kind === "file" && section !== "trash" ? (
          <>
            {archiveIndexOfTab ? (
              <div className="notes-archive-crumb-bar">
                <Folder size={13} aria-hidden />
                <button type="button" data-testid="archive-open-record-view" onClick={() => openArchive(archiveIndexOfTab)}>
                  {a.openAsArchive}
                </button>
              </div>
            ) : null}
            {owningArchive ? (
              <div className="notes-archive-crumb-bar">
                <Folder size={13} aria-hidden />
                <button type="button" data-testid="archive-breadcrumb" onClick={() => openArchive(owningArchive)}>
                  {a.breadcrumbBack(folderName(owningArchive))}
                </button>
              </div>
            ) : null}
            <NoteDocument
              key={tab.path}
              path={tab.path}
              favorite={current?.favorite === true}
              inspectorOpen={inspector}
              detail={detail}
              onToggleInspector={() => setInspector((v) => !v)}
              onToggleFavorite={() => void run("notes.setFavorite", { path: tab.path, favorite: !(current?.favorite === true) })}
              onOpen={openLinked}
              onMenu={(el, actions) => {
                const r = el.getBoundingClientRect();
                if (current) setMenu({ note: current, x: r.right, y: r.bottom, actions });
              }}
              onText={setDocText}
              registerFlush={registerFlush}
              registerEditor={registerEditor}
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
              expandTo(path);
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
