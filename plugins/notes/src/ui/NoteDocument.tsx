import type { EditorViewMode, RichEditorPort } from "@huhu/editor/rich";
import { Banner, Button, Dialog, IconButton, ReviewDiff, Segmented } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { ChevronRight, MessageSquarePlus, Download, MoreHorizontal, PanelRight, Redo2, Save, Star, Undo2 } from "lucide-react";
import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSession } from "./documents/DocumentSession.js";
import { useDocumentSession } from "./documents/useDocumentSession.js";
import type { NoteRef } from "./NoteExplorer.js";
import { n, t } from "./i18n.js";

/** 新编辑器闭包（OK 编辑器 + Tailwind 作用域样式）按需加载，不进首屏（design §12 懒加载）。 */
const NoteEditorSurface = lazy(() => import("./documents/NoteEditorSurface.js"));

/** 超过这个字符数的文档默认用源码模式打开：富文本要为整份文档建节点视图，1 MiB 级别会让“打开到可编辑”超过 500 ms。 */
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
  registerEditor(h: RichEditorPort | null): void;
  onAddComment(): void;
}

/** 视图模式：富文本（实时预览）/ 源码 / 阅读；三者共用同一份 Y.Text 与同一个会话。 */
type Mode = "live" | "source" | "preview";
const MODES: Mode[] = ["live", "source", "preview"];
const VIEW: Record<Mode, EditorViewMode> = { live: "rich", source: "source", preview: "read" };

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

  const [mode, setMode] = useState<Mode>("live");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
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
  const editor = useRef<RichEditorPort | null>(null);
  const all = useCapability<NoteRef[]>("notes.list", { filter: "all" });

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

  // 先排空编辑器里还在防抖的编辑（输入后立刻关闭 / 切换也不丢最后一个字符），再让会话落盘
  const flush = useCallback(async (): Promise<boolean> => {
    await editor.current?.flush();
    return session ? session.flush() : true;
  }, [session]);
  useEffect(() => {
    registerFlush(flush);
    return () => registerFlush(null);
  }, [flush, registerFlush]);
  const onPort = useCallback(
    (port: RichEditorPort | null) => {
      editor.current = port;
      registerEditor(port);
    },
    [registerEditor],
  );
  useEffect(() => () => registerEditor(null), [registerEditor]);
  const save = useCallback(async (): Promise<boolean> => {
    await editor.current?.flush();
    return session ? session.save() : false;
  }, [session]);
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

  // 编辑器按事务批交出全文：立即进会话（保存 / 退出 flush 看到的永远是最新文本）；
  // 大纲 / 属性面板用的全文：按键路径上不同步给父组件（会让整个笔记模块重渲染），停手 300 ms 后再给
  const onChange = (next: string) => {
    if (!session || next === session.currentText()) return;
    editedText.current = next;
    session.setText(next, "editor");
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => onText(next), 300);
  };

  // 撤销 / 重做按钮的可用状态：编辑器没有逐键事件出口，跟随会话快照（每次文本变化）与模式刷新
  useEffect(() => {
    const e = editor.current;
    setCanUndo(e?.canUndo() ?? false);
    setCanRedo(e?.canRedo() ?? false);
  }, [snap.text, mode]);

  if (text === null) return <p>{t.loading}</p>;
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "根目录";
  const filename = path.split("/").at(-1) ?? path;
  const reading = mode === "preview";

  return (
    <section className="notes-document-area" data-testid="note-document">
      <div className="hu-knowledge-document-toolbar">
        <div className="row grow">
          <span className="notes-breadcrumb">{folder}</span>
          <ChevronRight size={12} aria-hidden />
          <span className="notes-filename">{filename}</span>
        </div>
        <Segmented<Mode> label="编辑模式" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: n.modes[m] }))} />
        <IconButton icon={Star} label={props.favorite ? n.unstar : n.star} className={props.favorite ? "notes-star" : ""} onClick={props.onToggleFavorite} />
        <IconButton icon={PanelRight} label={n.inspector} className={props.inspectorOpen ? "active" : ""} onClick={props.onToggleInspector} />
      </div>
      <div className="knowledge-editor-toolbar">
        <div className="row">
          {/* 格式化由 OK 编辑器自带的气泡菜单与 `/` 命令提供（design §3.4）；这里只保留撤销 / 重做 */}
          <IconButton icon={Undo2} label={n.undoEdit} disabled={!canUndo || reading || mode === "source"} onClick={() => editor.current?.undo()} />
          <IconButton icon={Redo2} label={n.redoEdit} disabled={!canRedo || reading || mode === "source"} onClick={() => editor.current?.redo()} />
        </div>
        <div className="row">
          <IconButton icon={MessageSquarePlus} label={n.addComment} disabled={reading} onClick={props.onAddComment} />
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
        <span>{ed?.autosave === false ? n.manualSave : n.autosave}</span>
      </div>
      <div className="notes-editor-body" data-testid="markdown-editor" data-editor-mode={mode}>
        <Suspense fallback={<p>{t.loading}</p>}>
          <NoteEditorSurface path={path} value={text} onChange={onChange} mode={VIEW[mode]} notes={all.data ?? []} onOpen={props.onOpen} onPort={onPort} />
        </Suspense>
      </div>
      <div className="notes-document-status">
        <span className={`notes-save-dot${state === "saved" ? "" : " notes-unsaved"}`} />
        <span data-testid="save-state">{state === "saved" ? n.status.saved : state === "saving" ? n.status.saving : state === "conflict" ? n.status.conflict : n.status.dirty}</span>
        <span>{n.words(stats.chars)}</span>
        <span>{n.lines(stats.lines)}</span>
        <span className="grow" />
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
