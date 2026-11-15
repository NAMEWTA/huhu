import { MarkdownEditor, MarkdownPreview, type CommentMark, type EditorMode, type EditorStatus, type MarkdownEditorHandle } from "@huhu/editor";
import { Banner, Button, Dialog, IconButton, ReviewDiff, Segmented } from "@huhu/ui";
import { requestOpenPath, useCapability } from "@huhu/workbench";
import { folderNoteDir, resolveFolderLink } from "@huhu/vault/markdown";
import { ChevronRight, Code2, MessageSquarePlus, Download, Heading2, Link2, ListChecks, MoreHorizontal, PanelRight, Quote, Redo2, Save, Search, Star, Table2, Undo2, Bold, Italic, Minus } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSession } from "./documents/DocumentSession.js";
import { useDocumentSession } from "./documents/useDocumentSession.js";
import type { NoteRef } from "./NoteExplorer.js";
import { n, t } from "./i18n.js";

/** 超过这个字符数的文档默认用源码模式打开：实时预览要为整份文档建装饰，1 MiB 级别会让“打开到可编辑”超过 500 ms。 */
const LARGE_DOC_CHARS = 256 * 1024;

export type SaveState = "saved" | "dirty" | "saving" | "conflict";
export interface NoteDocumentProps {
  path: string;
  favorite: boolean;
  inspectorOpen: boolean;
  onToggleInspector(): void;
  onToggleFavorite(): void;
  onOpen(path: string): void;
  onMenu(anchor: HTMLElement): void;
  onText(text: string): void;
  /** 父级用它在改名 / 移动 / 移入回收站之前先把未保存的编辑落盘。 */
  registerFlush(fn: (() => Promise<boolean>) | null): void;
  registerEditor(h: MarkdownEditorHandle | null): void;
  /** 正文里的批注装饰与交互。 */
  comments: readonly CommentMark[];
  onCommentClick(id: string): void;
  onAddComment(): void;
}

const MODES: EditorMode[] = ["live", "source", "preview", "split"];

/** 文档区（原型 knowledge-document-area）：面包屑 + 模式切换 + 编辑工具条 → 编辑 / 阅读（含双栏）→ 状态栏。 */
export function NoteDocument(props: NoteDocumentProps) {
  const { path } = props;
  const settings = useCapability<{ editor: { fontSize: number; lineHeight: number; autosave: boolean; lineNumbers: boolean; spellcheck: boolean; readableWidth: "680" | "760" | "880" | "full" } }>("settings.get", {});
  const ed = settings.data?.editor;
  // 保存 / 冲突 / 草稿 / flush 全部在 DocumentSession 里（按 (vaultId, path) 引用计数，生命周期长于本组件）
  const { session, snap } = useDocumentSession(path, ed?.autosave !== false);
  const text: string | null = snap.loaded ? snap.text : null;
  const state: SaveState = snap.state === "error" ? "dirty" : snap.state;
  const draft = snap.draft;
  const flushError = snap.flushError;
  const deferredText = useDeferredValue(text);
  // 字数 / 行数：对延后的文本单遍统计（5,000 行文档每次按键都做正则 + split 会占掉输入延迟预算）
  const stats = useMemo(() => {
    const t = deferredText ?? "";
    let chars = 0;
    let lines = 1;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c === 10) lines++;
      // ASCII 空白快速判断；非 ASCII 才用正则（全角空格 U+3000、NBSP 等也不算字数）
      if (c > 127 ? !/\s/.test(t[i] as string) : c !== 32 && c !== 10 && c !== 13 && c !== 9) chars++;
    }
    return { chars, lines };
  }, [deferredText]);

  const [mode, setMode] = useState<EditorMode>("live");
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [sync, setSync] = useState(true);
  const [confirmReload, setConfirmReload] = useState(false);
  const [diffOf, setDiffOf] = useState<string | null>(null); // 外部修改后的磁盘内容（查看差异对话框）
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedText = useRef<string | null>(null); // 编辑器最近一次交给会话的全文：与之不同的文本变化 = 载入 / 合并 / 恢复草稿
  const { registerFlush, registerEditor, onText } = props;
  /** 立即把全文交给父组件（载入 / 合并 / 恢复草稿等），并取消还在等待的防抖，避免旧文本稍后覆盖新文本。 */
  const pushText = (t: string) => {
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = null;
    onText(t);
  };
  useEffect(
    () => () => {
      if (textTimer.current) clearTimeout(textTimer.current); // 卸载（切换笔记）后不再回调
    },
    [],
  );
  const editor = useRef<MarkdownEditorHandle>(null);
  const reading = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const all = useCapability<NoteRef[]>("notes.list", { filter: "all" });
  const dirs = useCapability<string[]>("notes.folders", {});

  // 超大文档默认源码模式（每次载入）；非编辑器来源的文本变化（载入 / 合并 / 恢复草稿）立即交给父组件
  const loadedOnce = useRef<DocumentSession | null>(null);
  useEffect(() => {
    if (!session || !snap.loaded) return;
    if (loadedOnce.current !== session) {
      loadedOnce.current = session;
      if (snap.text.length > LARGE_DOC_CHARS) setMode((m) => (m === "live" ? "source" : m));
    }
    if (snap.text !== editedText.current) pushText(snap.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushText 只用 ref 与稳定的 onText
  }, [session, snap.loaded, snap.text]);

  const flush = useCallback(async (): Promise<boolean> => (session ? session.flush() : true), [session]);
  useEffect(() => {
    registerFlush(flush);
    return () => registerFlush(null);
  }, [flush, registerFlush]);
  useEffect(() => {
    registerEditor(editor.current);
    return () => registerEditor(null);
  });
  const save = useCallback((): Promise<boolean> => (session ? session.save() : Promise.resolve(false)), [session]);
  const load = useCallback(async () => {
    await session?.load();
  }, [session]);

  /** 查看差异：读出磁盘上的新内容，与我的未保存修改并排对比。 */
  const viewDiff = async (): Promise<void> => {
    session?.clearError();
    try {
      setDiffOf((await session?.readDisk()) ?? null);
    } catch (e) {
      void e;
    }
  };
  const keepMine = async (): Promise<void> => {
    await session?.keepMine();
    setDiffOf(null);
  };
  const merge = async (): Promise<void> => {
    const conflicts = await session?.merge();
    setConfirmReload(false);
    if (conflicts && conflicts > 0) session?.setError(n.mergeConflicts(conflicts));
  };

  const onChange = (next: string) => {
    if (!session || text === null || next === session.currentText()) return;
    editedText.current = next;
    session.setText(next, "editor");
    // 大纲 / 属性面板用的全文：按键路径上不同步给父组件（会让整个笔记模块重渲染），停手 300 ms 后再给
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => onText(next), 300);
  };

  // 文件夹笔记：`[[目录/]]` 解析为 `目录/index.md`；index.md 不参与裸名匹配（标题是文件夹名，不能让 `[[index]]` 命中所有文件夹笔记）
  const paths = new Set((all.data ?? []).map((x) => x.path));
  const known = new Set((dirs.data ?? []).map((d) => `${d}/`));
  for (const x of all.data ?? []) {
    const dir = folderNoteDir(x.path);
    if (dir !== null) [x.path, `${dir}/`, dir].forEach((k) => known.add(k));
    else [x.path, x.path.replace(/\.md$/, ""), x.title].forEach((k) => known.add(k));
  }
  const openWiki = (target: string) => {
    const folderNote = resolveFolderLink(target, (rel) => paths.has(rel));
    if (folderNote) return props.onOpen(folderNote);
    if (target.endsWith("/")) return requestOpenPath(target); // 没有 index.md 的文件夹：在文件树里展开并定位
    const hit = (all.data ?? []).find((x) => x.path === target || x.path === `${target}.md` || (folderNoteDir(x.path) === null && x.title === target));
    if (hit) props.onOpen(hit.path);
  };
  if (text === null) return <p>{t.loading}</p>;
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "根目录";
  const filename = path.split("/").at(-1) ?? path;
  const edit = (before: string, after = "", ph?: string) => editor.current?.insert(before, after, ph);
  const split = mode === "split";
  const showSource = mode !== "preview";
  const showReading = mode === "preview" || split;
  const onEditorScroll = (ratio: number) => {
    if (!split || !sync || lock.current || !reading.current) return;
    lock.current = true;
    reading.current.scrollTop = ratio * (reading.current.scrollHeight - reading.current.clientHeight);
    requestAnimationFrame(() => (lock.current = false));
  };
  const onReadingScroll = () => {
    if (!split || !sync || lock.current || !reading.current) return;
    lock.current = true;
    const r = reading.current;
    const extent = r.scrollHeight - r.clientHeight;
    editor.current?.setScrollRatio(extent > 0 ? r.scrollTop / extent : 0);
    requestAnimationFrame(() => (lock.current = false));
  };

  return (
    <section className="notes-document-area" data-testid="note-document">
      <div className="hu-knowledge-document-toolbar">
        <div className="row grow">
          <span className="notes-breadcrumb">{folder}</span>
          <ChevronRight size={12} aria-hidden />
          <span className="notes-filename">{filename}</span>
        </div>
        <Segmented<EditorMode> label="编辑模式" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: n.modes[m] }))} />
        <IconButton icon={Star} label={props.favorite ? n.unstar : n.star} className={props.favorite ? "notes-star" : ""} onClick={props.onToggleFavorite} />
        <IconButton icon={PanelRight} label={n.inspector} className={props.inspectorOpen ? "active" : ""} onClick={props.onToggleInspector} />
      </div>
      <div className="knowledge-editor-toolbar">
        <div className="row">
          <IconButton icon={Undo2} label={n.undoEdit} disabled={!status?.canUndo || mode === "preview"} onClick={() => editor.current?.undo()} />
          <IconButton icon={Redo2} label={n.redoEdit} disabled={!status?.canRedo || mode === "preview"} onClick={() => editor.current?.redo()} />
          <span className="notes-toolbar-divider" />
          <IconButton icon={Heading2} label={n.heading} disabled={mode === "preview"} onClick={() => edit("\n## ", "", "标题")} />
          <IconButton icon={Bold} label={n.bold} disabled={mode === "preview"} onClick={() => edit("**", "**")} />
          <IconButton icon={Italic} label={n.italic} disabled={mode === "preview"} onClick={() => edit("*", "*")} />
          <IconButton icon={Minus} label={n.rule} disabled={mode === "preview"} onClick={() => edit("\n\n---\n\n", "", "")} />
          <IconButton icon={Link2} label={n.link} disabled={mode === "preview"} onClick={() => edit("[[", "]]", "笔记名称")} />
          <IconButton icon={ListChecks} label={n.todo} disabled={mode === "preview"} onClick={() => edit("\n- [ ] ", "", "待办事项")} />
          <IconButton icon={Quote} label={n.quote} disabled={mode === "preview"} onClick={() => edit("\n> ", "", "引用")} />
          <IconButton icon={Code2} label={n.code} disabled={mode === "preview"} onClick={() => edit("\n```ts\n", "\n```\n", "代码")} />
          <IconButton icon={Table2} label={n.table} disabled={mode === "preview"} onClick={() => edit("\n| 列 1 | 列 2 |\n| --- | --- |\n| ", " |  |\n", "内容")} />
        </div>
        <div className="row">
          <IconButton icon={MessageSquarePlus} label={n.addComment} disabled={mode === "preview"} onClick={props.onAddComment} />
          <IconButton icon={Search} label={n.find} disabled={mode === "preview"} onClick={() => editor.current?.openSearch()} />
          <IconButton
            icon={Download}
            label={n.exportMd}
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([session?.currentText() ?? ""], { type: "text/markdown" }));
              a.download = filename;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          />
          <IconButton icon={MoreHorizontal} label={n.noteActions} onClick={(e) => (e.stopPropagation(), props.onMenu(e.currentTarget))} />
        </div>
      </div>
      {state === "conflict" ? (
        <Banner
          tone="danger"
          action={
            confirmReload ? (
              <>
                <Button variant="danger" onClick={() => (setConfirmReload(false), void load())}>
                  {n.discardReload}
                </Button>
                <Button onClick={() => setConfirmReload(false)}>{n.keepEditing}</Button>
              </>
            ) : (
              <>
                {session!.currentText() !== session!.lastSavedText() ? (
                  <>
                    <Button variant="primary" data-testid="note-merge" onClick={() => void merge()}>
                      {n.merge}
                    </Button>
                    <Button data-testid="note-view-diff" onClick={() => void viewDiff()}>
                      {n.viewDiff}
                    </Button>
                    <Button data-testid="note-keep-mine" onClick={() => void keepMine()}>
                      {n.keepMine}
                    </Button>
                  </>
                ) : null}
                <Button onClick={() => (session!.currentText() === session!.lastSavedText() ? void load() : setConfirmReload(true))}>{t.reload}</Button>
              </>
            )
          }
        >
          {confirmReload ? n.discardReloadHint : t.conflict}
        </Banner>
      ) : null}
      {diffOf !== null ? (
        <Dialog open wide title={n.diffTitle} onClose={() => setDiffOf(null)} testId="note-diff-dialog" actions={<Button onClick={() => setDiffOf(null)}>关闭</Button>}>
          <ReviewDiff before={diffOf} after={session?.currentText() ?? ""} path={path} />
        </Dialog>
      ) : null}
      {draft ? (
        <Banner
          tone="blue"
          action={
            <>
              <Button
                variant="primary"
                data-testid="note-draft-restore"
                onClick={() => session?.restoreDraft()}
              >
                {n.restoreDraft}
              </Button>
              <Button onClick={() => session?.discardDraft()}>
                {n.discardDraft}
              </Button>
            </>
          }
        >
          {n.draftFound(draft.savedAt.replace("T", " ").slice(0, 16))}
        </Banner>
      ) : null}
      {flushError ? <Banner tone="danger">{n.saveFailed(flushError)}</Banner> : null}
      <div className="notes-editor-mode-hint">
        <strong>{n.modes[mode]}</strong>
        <span>{n.modeHint[mode]}</span>
        <span className="grow" />
        {split ? (
          <button type="button" aria-pressed={sync} onClick={() => setSync(!sync)}>
            <Link2 size={12} aria-hidden /> {n.syncScroll(sync)}
          </button>
        ) : (
          <span>{ed?.autosave === false ? n.manualSave : n.autosave}</span>
        )}
      </div>
      <div className={`notes-editor-body${split ? " is-split" : ""}`}>
        <div className="notes-source-pane notes-huhu-cm-pane" hidden={!showSource}>
          <MarkdownEditor
            ref={editor}
            documentId={path}
            mode={mode}
            value={text}
            onChange={onChange}
            onSave={() => void save()}
            onStatus={setStatus}
            onWikiOpen={openWiki}
            comments={props.comments}
            onCommentClick={props.onCommentClick}
            onScroll={onEditorScroll}
            ariaLabel={t.editorLabel}
            lineNumbers={ed?.lineNumbers ?? true}
            spellcheck={ed?.spellcheck ?? false}
            {...(ed ? { fontSize: ed.fontSize, lineHeight: ed.lineHeight, maxWidth: ed.readableWidth === "full" ? null : Number(ed.readableWidth) } : {})}
          />
        </div>
        {showReading ? (
          <div className="notes-reading-pane" data-testid="notes-reading-pane" data-editor-mode={mode} ref={reading} onScroll={onReadingScroll}>
            <MarkdownPreview source={text} resolveWikiLink={(target) => known.has(target)} onOpenWikiLink={openWiki} />
          </div>
        ) : null}
      </div>
      <div className="notes-document-status">
        <span className={`notes-save-dot${state === "saved" ? "" : " notes-unsaved"}`} />
        <span data-testid="save-state">{state === "saved" ? n.status.saved : state === "saving" ? n.status.saving : state === "conflict" ? n.status.conflict : n.status.dirty}</span>
        <span>{n.words(stats.chars)}</span>
        <span>{n.lines(stats.lines)}</span>
        <span className="grow" />
        <span className="notes-huhu-editor-position">{status ? n.position(status.line, status.column, status.selected) : ""}</span>
        <span>UTF-8</span>
        {ed?.autosave === false ? (
          <Button variant="primary" icon={Save} disabled={state !== "dirty"} data-testid="note-save" onClick={() => void save()}>
            {t.save}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
