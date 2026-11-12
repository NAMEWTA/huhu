import { MarkdownEditor, MarkdownPreview, type CommentMark, type EditorMode, type EditorStatus, type MarkdownEditorHandle } from "@huhu/editor";
import { Banner, Button, Dialog, IconButton, ReviewDiff, Segmented } from "@huhu/ui";
import { CapabilityError, queryKey, registerDirtyDoc, registerFlusher, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { ChevronRight, Code2, MessageSquarePlus, Download, Heading2, Link2, ListChecks, MoreHorizontal, PanelRight, Quote, Redo2, Save, Search, Star, Table2, Undo2, Bold, Italic, Minus } from "lucide-react";
import { diff3Merge } from "node-diff3";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { NoteRef } from "./NoteExplorer.js";
import { n, t } from "./i18n.js";

const AUTOSAVE_MS = 800;
/** 超过这个字符数的文档默认用源码模式打开：实时预览要为整份文档建装饰，1 MiB 级别会让“打开到可编辑”超过 500 ms。 */
const LARGE_DOC_CHARS = 256 * 1024;

interface NoteFile {
  path: string;
  text: string;
  version: string;
}
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
  const engine = useEngine();
  const qc = useQueryClient();
  const [text, setText] = useState<string | null>(null);
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

  const [state, setState] = useState<SaveState>("saved");
  const [mode, setMode] = useState<EditorMode>("live");
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [sync, setSync] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const latest = useRef({ text: "", version: "" });
  const savedText = useRef<string | null>(null); // 最近一次已落盘的内容；离开时据此判断是否有未保存的编辑
  const editor = useRef<MarkdownEditorHandle>(null);
  const reading = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const all = useCapability<NoteRef[]>("notes.list", { filter: "all" });
  const settings = useCapability<{ editor: { fontSize: number; lineHeight: number; autosave: boolean; lineNumbers: boolean; spellcheck: boolean; readableWidth: "680" | "760" | "880" | "full" } }>("settings.get", {});
  const ed = settings.data?.editor;
  const { registerFlush, registerEditor, onText } = props;

  const load = useCallback(async () => {
    const f = await engine.call<NoteFile>("notes.read", { path });
    if (f.text.length > LARGE_DOC_CHARS) setMode((m) => (m === "live" ? "source" : m));
    setText(f.text);
    latest.current = { text: f.text, version: f.version };
    savedText.current = f.text;
    setState("saved");
    pushText(f.text);
    // 手动保存模式离开时留下的草稿
    const d = await engine.call<{ text: string; baseVersion: string; savedAt: string } | null>("notes.draft.get", { path }).catch(() => null);
    if (d && d.text !== f.text) setDraft(d);
    else {
      setDraft(null);
      if (d) void engine.call("notes.draft.discard", { path }, { write: true }).catch(() => undefined);
    }
  }, [engine, path, onText]);
  useEffect(() => {
    void load();
  }, [load]);
  // 外部（同步、其他工具）改了当前文件：没有未保存编辑就直接载入；有未保存编辑则提示冲突，由用户决定
  const stateRef = useRef(state);
  stateRef.current = state;
  useEngineEvents((e) => {
    if (e.type !== "vault.fileChanged") return;
    const p = e.payload as { path?: string; change?: string };
    if (p.path !== path || p.change === "deleted") return;
    if (savedText.current !== null && latest.current.text === savedText.current && stateRef.current !== "saving") void load();
    else if (stateRef.current !== "saving") setState("conflict");
  });
  // 有未保存编辑时兜底轮询磁盘版本（文件事件偶尔迟到 / 丢失）：版本变了就进入冲突状态，让“合并”可用
  useEffect(() => {
    if (state !== "dirty") return;
    const id = setInterval(() => {
      if (stateRef.current !== "dirty") return;
      void engine
        .call<NoteFile>("notes.read", { path })
        .then((f) => {
          if (stateRef.current === "dirty" && f.version !== latest.current.version && f.text !== latest.current.text) setState("conflict");
        })
        .catch(() => undefined);
    }, 2500);
    return () => clearInterval(id);
  }, [state, engine, path]);
  const [flushError, setFlushError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; baseVersion: string; savedAt: string } | null>(null);
  const autosaveRef = useRef(true);
  autosaveRef.current = ed?.autosave !== false;
  const [confirmReload, setConfirmReload] = useState(false);
  const [diffOf, setDiffOf] = useState<string | null>(null); // 外部修改后的磁盘内容（查看差异对话框）
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const doSave = useCallback(async (): Promise<boolean> => {
    const { text: body, version: v } = latest.current;
    setState("saving");
    try {
      const r = await engine.call<{ version: string }>("notes.save", { path, text: body, expectedVersion: v }, { write: true });
      latest.current.version = r.version;
      savedText.current = body;
      setState(latest.current.text === body ? "saved" : "dirty");
      setFlushError(null);
      if (latest.current.text === body) {
        setDraft(null);
        void engine.call("notes.draft.discard", { path }, { write: true }).catch(() => undefined);
      }
      void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, "notes.backlinks", { path }) });
      return true;
    } catch (e) {
      const conflict = e instanceof CapabilityError && e.code === "VERSION_CONFLICT";
      setState(conflict ? "conflict" : "dirty");
      setFlushError(conflict ? null : e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [engine, path, qc]);
  // 保存串行化：自动保存在途时，Mod+S 或改名前的落盘要等它完成，否则会拿旧版本号造成假冲突
  const inflight = useRef<Promise<boolean> | null>(null);
  const save = useCallback((): Promise<boolean> => {
    const prev = inflight.current;
    const run = async (): Promise<boolean> => {
      if (prev) await prev.catch(() => false);
      if (savedText.current !== null && latest.current.text === savedText.current) return true;
      return doSave();
    };
    const p = run();
    inflight.current = p;
    void p.finally(() => {
      if (inflight.current === p) inflight.current = null;
    });
    return p;
  }, [doSave]);
  saveRef.current = save;
  // 离开（切换笔记、关闭模块）时把未保存的编辑写入；走串行队列，在途的自动保存完成后再用新版本号写，不会丢最后几个字
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (savedText.current !== null && latest.current.text !== savedText.current) {
        // 手动保存模式：不改动文件，留下草稿，下次打开时可恢复（ACC-KN-04）；自动保存模式：直接落盘
        if (autosaveRef.current) {
          const snap = { text: latest.current.text, version: latest.current.version };
          // 离开时的落盘失败（版本冲突 / I/O 错误）不能让编辑静默丢失：改存草稿
          void saveRef
            .current?.()
            .then((ok) => (ok ? undefined : engine.call("notes.draft.save", { path, text: snap.text, baseVersion: snap.version }, { write: true })))
            .catch(() => undefined);
        } else void engine.call("notes.draft.save", { path, text: latest.current.text, baseVersion: latest.current.version }, { write: true }).catch(() => undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在卸载时运行；path / engine 在这个实例的生命周期内不变（NotesModule 以 path 作 key）
    [],
  );
  // 应用退出前：自动保存模式落盘，手动模式留草稿（与离开笔记时一致）
  useEffect(
    () =>
      registerFlusher(async () => {
        if (timer.current) clearTimeout(timer.current);
        if (savedText.current === null || latest.current.text === savedText.current) return;
        if (autosaveRef.current) await saveRef.current?.();
        else await engine.call("notes.draft.save", { path, text: latest.current.text, baseVersion: latest.current.version }, { write: true });
      }),
    [engine, path],
  );
  // 切换 Vault 前，设置页据此列出未保存的文档，让用户选“全部保存”或“保留草稿”
  useEffect(
    () =>
      registerDirtyDoc({
        label: path,
        isDirty: () => savedText.current !== null && latest.current.text !== savedText.current,
        save: () => saveRef.current?.() ?? Promise.resolve(false),
        keepDraft: async () => {
          if (timer.current) clearTimeout(timer.current);
          await engine.call("notes.draft.save", { path, text: latest.current.text, baseVersion: latest.current.version }, { write: true });
        },
      }),
    [engine, path],
  );
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (savedText.current !== null && latest.current.text !== savedText.current) return save();
    return true;
  }, [save]);
  useEffect(() => {
    registerFlush(flush);
    return () => registerFlush(null);
  }, [flush, registerFlush]);
  useEffect(() => {
    registerEditor(editor.current);
    return () => registerEditor(null);
  });

  /** 查看差异：读出磁盘上的新内容，与我的未保存修改并排对比。 */
  const viewDiff = async (): Promise<void> => {
    setFlushError(null);
    try {
      setDiffOf((await engine.call<NoteFile>("notes.read", { path })).text);
    } catch (e) {
      setFlushError(e instanceof Error ? e.message : String(e));
    }
  };
  /** 保留我的修改：以磁盘上的新版本为基线，继续编辑；下次保存会覆盖磁盘上的外部修改（用户明确选择）。 */
  const keepMine = async (): Promise<void> => {
    setFlushError(null);
    try {
      const theirs = await engine.call<NoteFile>("notes.read", { path });
      latest.current = { text: latest.current.text, version: theirs.version };
      savedText.current = theirs.text;
      setState(latest.current.text === theirs.text ? "saved" : "dirty");
      setDiffOf(null);
    } catch (e) {
      setFlushError(e instanceof Error ? e.message : String(e));
    }
  };

  /** 合并：以最后一次保存的内容为基线，把我的修改与磁盘上的新内容做三方合并；冲突处写入标记，由用户处理后再保存。 */
  const merge = async (): Promise<void> => {
    setFlushError(null);
    try {
      const theirs = await engine.call<NoteFile>("notes.read", { path });
      const base = savedText.current ?? "";
      const parts = diff3Merge(latest.current.text.split("\n"), base.split("\n"), theirs.text.split("\n"), { excludeFalseConflicts: true });
      const lines: string[] = [];
      let conflicts = 0;
      for (const part of parts) {
        if ("ok" in part && part.ok) lines.push(...part.ok);
        else if (part.conflict) {
          conflicts++;
          lines.push("<<<<<<< 我的修改", ...part.conflict.a, "=======", ...part.conflict.b, ">>>>>>> 磁盘上的新内容");
        }
      }
      const merged = lines.join("\n");
      // 之后的保存以磁盘上的新版本为准；合并结果相对它就是“我的未保存修改”
      latest.current = { text: merged, version: theirs.version };
      savedText.current = theirs.text;
      setText(merged);
      pushText(merged);
      setState(merged === theirs.text ? "saved" : "dirty");
      setConfirmReload(false);
      if (conflicts > 0) setFlushError(n.mergeConflicts(conflicts));
    } catch (e) {
      setFlushError(e instanceof Error ? e.message : String(e));
    }
  };

  const onChange = (next: string) => {
    if (text === null || next === latest.current.text) return;
    latest.current.text = next;
    setText(next);
    // 大纲 / 属性面板用的全文：按键路径上不同步给父组件（会让整个笔记模块重渲染），停手 300 ms 后再给
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => onText(next), 300);
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    if (ed?.autosave !== false) timer.current = setTimeout(() => void save(), AUTOSAVE_MS); // 关闭自动保存：只在 Mod+S 或点“保存”时写入
  };

  const known = new Set((all.data ?? []).flatMap((x) => [x.path, x.path.replace(/\.md$/, ""), x.title]));
  const openWiki = (target: string) => {
    const hit = (all.data ?? []).find((x) => x.path === target || x.path === `${target}.md` || x.title === target);
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
    <section className="knowledge-document-area" data-testid="note-document">
      <div className="knowledge-document-toolbar">
        <div className="row grow">
          <span className="knowledge-breadcrumb">{folder}</span>
          <ChevronRight size={12} aria-hidden />
          <span className="knowledge-filename">{filename}</span>
        </div>
        <Segmented<EditorMode> label="编辑模式" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: n.modes[m] }))} />
        <IconButton icon={Star} label={props.favorite ? n.unstar : n.star} className={props.favorite ? "knowledge-star" : ""} onClick={props.onToggleFavorite} />
        <IconButton icon={PanelRight} label={n.inspector} className={props.inspectorOpen ? "active" : ""} onClick={props.onToggleInspector} />
      </div>
      <div className="knowledge-editor-toolbar">
        <div className="row">
          <IconButton icon={Undo2} label={n.undoEdit} disabled={!status?.canUndo || mode === "preview"} onClick={() => editor.current?.undo()} />
          <IconButton icon={Redo2} label={n.redoEdit} disabled={!status?.canRedo || mode === "preview"} onClick={() => editor.current?.redo()} />
          <span className="knowledge-toolbar-divider" />
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
        <div className="row huhu-editor-secondary">
          <IconButton icon={MessageSquarePlus} label={n.addComment} disabled={mode === "preview"} onClick={props.onAddComment} />
          <IconButton icon={Search} label={n.find} disabled={mode === "preview"} onClick={() => editor.current?.openSearch()} />
          <IconButton
            icon={Download}
            label={n.exportMd}
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([latest.current.text], { type: "text/markdown" }));
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
                {latest.current.text !== savedText.current ? (
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
                <Button onClick={() => (latest.current.text === savedText.current ? void load() : setConfirmReload(true))}>{t.reload}</Button>
              </>
            )
          }
        >
          {confirmReload ? n.discardReloadHint : t.conflict}
        </Banner>
      ) : null}
      {diffOf !== null ? (
        <Dialog open wide title={n.diffTitle} onClose={() => setDiffOf(null)} testId="note-diff-dialog" actions={<Button onClick={() => setDiffOf(null)}>关闭</Button>}>
          <ReviewDiff before={diffOf} after={latest.current.text} path={path} />
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
                onClick={() => {
                  latest.current.text = draft.text;
                  // 草稿之后磁盘被外部改过：沿用草稿的基线版本，保存时会走冲突流程（合并 / 载入），而不是静默覆盖外部改动
                  if (draft.baseVersion !== latest.current.version) latest.current.version = draft.baseVersion;
                  setText(draft.text);
                  pushText(draft.text);
                  setState("dirty");
                  setDraft(null);
                  if (timer.current) clearTimeout(timer.current);
                  if (ed?.autosave !== false) timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
                }}
              >
                {n.restoreDraft}
              </Button>
              <Button
                onClick={() => {
                  setDraft(null);
                  void engine.call("notes.draft.discard", { path }, { write: true }).catch(() => undefined);
                }}
              >
                {n.discardDraft}
              </Button>
            </>
          }
        >
          {n.draftFound(draft.savedAt.replace("T", " ").slice(0, 16))}
        </Banner>
      ) : null}
      {flushError ? <Banner tone="danger">{n.saveFailed(flushError)}</Banner> : null}
      <div className="knowledge-editor-mode-hint">
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
      <div className={`knowledge-editor-body${split ? " is-split" : ""}`}>
        <div className="knowledge-source-pane huhu-cm-pane" hidden={!showSource}>
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
          <div className="knowledge-reading-pane" data-editor-mode={mode} ref={reading} onScroll={onReadingScroll}>
            <MarkdownPreview source={text} resolveWikiLink={(target) => known.has(target)} onOpenWikiLink={openWiki} />
          </div>
        ) : null}
      </div>
      <div className="knowledge-document-status">
        <span className={`knowledge-save-dot${state === "saved" ? "" : " unsaved"}`} />
        <span data-testid="save-state">{state === "saved" ? n.status.saved : state === "saving" ? n.status.saving : state === "conflict" ? n.status.conflict : n.status.dirty}</span>
        <span>{n.words(stats.chars)}</span>
        <span>{n.lines(stats.lines)}</span>
        <span className="grow" />
        <span className="huhu-editor-position">{status ? n.position(status.line, status.column, status.selected) : ""}</span>
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
