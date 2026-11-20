// RichMarkdownEditor：封装 vendor 的 TiptapEditor / SourceEditor（design §3.2 / §3.3 / §3.4）。
// 数据流：宿主传入 `value`（DocumentSession 的缓冲）→ LocalDocProvider 装载 Y.Doc（Y.Text('source') 为真源）；
// 编辑 → Y.Text 变化 → 防抖 300 ms → `onChange(全文)` 交给会话；会话把外部版本（载入 / 合并 / 恢复草稿）经 `value` 带回，
// 只有与“最近交给会话的文本”不同的 `value` 才会被当作外部变化，用 replaceRawBody 写回（不进撤销栈）。
// 无编辑 = Y.Text 不变 = 不触发 onChange = 不写盘（B10）。
import type { EditorPort } from "@huhu/contracts";
import { useLingui } from "@lingui/react/macro";
import { Component, type ErrorInfo, type ReactNode, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type * as Y from "yjs";
import { Toaster } from "sonner";
import { getEditorForDoc, subscribeEditorRegistry } from "@/editor/active-editor";
import { EmojiInsertPopover } from "@/editor/components/EmojiInsertPopover";
import { TagDialog } from "@/editor/components/TagDialog";
import { requestViewInSource } from "@/editor/mode-switch-landing";
import { VIEW_IN_SOURCE_EVENT, type ViewInSourceDetail } from "@/editor/view-in-source-event";
import { matchesKeyboardShortcut } from "@/lib/keyboard-shortcuts";
import { isOverlayLayerOpen } from "@/lib/overlay-layers";
import { FindReplaceController } from "@/editor/find-replace/FindReplaceController";
import { getMarkdownSourceViewForDoc } from "@/editor/full-page-cm-views";
import { PropertyPanel } from "@/components/PropertyPanel";
import { SourceEditor } from "@/editor/SourceEditor";
import { TiptapEditor } from "@/editor/TiptapEditor";
import { replaceRawBody } from "../vendor/open-knowledge/server-bridge/bridge-intake";
import { acquireProvider, releaseProvider } from "../host/provider-pool";
import { registerAtReference, type ReferenceCandidate } from "./at-reference";
import { EditorAssetMenu, type EditorAssetActions } from "./EditorAssetMenu";
import { FILE_LOAD_ORIGIN } from "../host/doc-source";
import { registerOfflineEmojiRoutes } from "../host/offline-emoji";
import type { LocalDocProvider } from "../host/hocuspocus-provider";
import { DocumentProvider, useDocumentContext } from "../host/document-context";

export type EditorViewMode = "rich" | "source" | "read";
export type EditorVariant = "document" | "compact";

/** EditorPort + 大纲跳转 / 撤销重做。批注锚点不经由这里：富文本选区不会被换算成源码偏移（S4，D05）。 */
export interface RichEditorPort extends EditorPort {
  /** 把源码偏移所在行设为光标（大纲跳转） */
  gotoLine(line: number): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  isComposing(): boolean;
}

export interface RichMarkdownEditorProps {
  /** 会话内唯一名（建议 `${vaultId}:${path}`） */
  docName: string;
  value: string;
  onChange(text: string): void;
  mode?: EditorViewMode;
  onRevealSource?(): void;
  assetActions?: EditorAssetActions;
  variant?: EditorVariant;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** 顶部 YAML 属性面板（OK PropertyPanel；默认：document 变体开启）。属性与正文共用同一 Y.Text，只改 frontmatter 段。 */
  properties?: boolean;
  /** 字号（px）与正文可读宽度（px，null = 不限制）：来自笔记设置 */
  fontSize?: number;
  contentWidth?: number | null;
  /** `@` 引用候选（提供则启用 `@` 补全，插入 wikiLink 节点） */
  referenceSearch?: (query: string) => readonly ReferenceCandidate[];
  onPort?(port: RichEditorPort | null): void;
  onError?(error: Error): void;
  className?: string;
}

class Boundary extends Component<{ onError?(e: Error): void; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(error);
  }
  override render() {
    return this.state.error ? (
      <div role="alert" className="ok-editor-error">
        {this.state.error.message}
      </div>
    ) : (
      this.props.children
    );
  }
}

export function RichMarkdownEditor(props: RichMarkdownEditorProps) {
  const { t } = useLingui();
  const { docName, value, onChange, mode = "rich", variant = "document", readOnly = false, placeholder, properties, onPort, className, fontSize, contentWidth, referenceSearch, ariaLabel } = props;
  const [provider, setProvider] = useState<LocalDocProvider | null>(null);
  const editorScope = useRef<HTMLDivElement>(null);
  const { onRevealSource } = props;
  const enableEmojiPicker = mode === "rich" && !readOnly;
  const documentHost = useDocumentContext();
  const documentEditor = variant === "document" && mode === "rich";
  const linkShortcut = documentEditor && !readOnly;
  const activeDocumentHost = useMemo(() => ({ ...documentHost, activeDocName: documentEditor ? docName : null }), [documentHost, documentEditor, docName]);
  // The vendor shortcut edits a collapsed Markdown link through its property dialog.
  // Select the current link first so the same shortcut uses the selection toolbar.
  useLayoutEffect(() => {
    if (!linkShortcut) return;
    function selectCurrentLink(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.isComposing || !matchesKeyboardShortcut(event, "add-link") || isOverlayLayerOpen()) return;
      if (!(event.target instanceof Element) || !editorScope.current?.contains(event.target)) return;
      const editor = getEditorForDoc(docName);
      if (!editor?.isFocused || !editor.state.selection.empty || !editor.isActive("link")) return;
      editor.commands.extendMarkRange("link");
    }
    window.addEventListener("keydown", selectCurrentLink, true);
    return () => window.removeEventListener("keydown", selectCurrentLink, true);
  }, [docName, linkShortcut]);
  const showProperties = (properties ?? variant === "document") && !readOnly && mode !== "read";
  const needsEmojiData = enableEmojiPicker || showProperties;
  useEffect(() => (needsEmojiData ? registerOfflineEmojiRoutes() : undefined), [needsEmojiData]);
  useEffect(() => {
    if (!onRevealSource || !enableEmojiPicker) return;
    const revealSource = (event: Event) => {
      const { detail } = event as CustomEvent<ViewInSourceDetail>;
      if (detail?.docName === docName) onRevealSource();
    };
    const requestSource = (event: KeyboardEvent) => {
      if (!matchesKeyboardShortcut(event, "view-source-at-cursor") || isOverlayLayerOpen()) return;
      if (!(event.target instanceof Element) || !editorScope.current?.contains(event.target)) return;
      const editor = getEditorForDoc(docName);
      if (!editor?.isFocused || !provider) return;
      event.preventDefault();
      requestViewInSource({ editor, docName, ytext: provider.document.getText("source") });
    };
    window.addEventListener(VIEW_IN_SOURCE_EVENT, revealSource);
    window.addEventListener("keydown", requestSource, true);
    return () => {
      window.removeEventListener(VIEW_IN_SOURCE_EVENT, revealSource);
      window.removeEventListener("keydown", requestSource, true);
    };
  }, [docName, enableEmojiPicker, onRevealSource, provider]);
  // 滚动容器 / 内容挂载点：命令式创建（不归 React 管），由 TiptapEditor 的 chrome 搬进自己的 slot
  const [portal] = useState(() => {
    const el = document.createElement("div");
    el.style.display = "contents"; // OK 的栅格布局要求 portal 容器与 slot 两层都是 display:contents（globals.css .tiptap-editor-portal-content 注释）
    return el;
  });
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = useRef<string>(value);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef(false);
  // 输入法组合进行中不把未提交的拼音交给会话（否则 800 ms 自动保存会把拼音写进磁盘）；组合结束后补一次交付。flush / 卸载仍然无条件交付。
  const composing = useRef(false);
  const deferredWhileComposing = useRef(false);
  const ytextRef = useRef<Y.Text | null>(null);
  const providerRef = useRef<LocalDocProvider | null>(null);
  // 源码优先打开的大文档：富文本表示（解析 + Y.XmlFragment）延后到第一次需要时才构建（P-S3：F09）
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [richReady, setRichReady] = useState(false);

  const emitNow = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    const yt = ytextRef.current;
    if (!yt) return;
    providerRef.current?.settleNow(); // 大文档的桥结算可能被推迟：先结算再读 Y.Text
    const text = yt.toString();
    if (text === lastEmitted.current) return;
    lastEmitted.current = text;
    onChangeRef.current(text);
  }, []);

  useEffect(() => {
    const inEditor = (e: Event) => e.target instanceof Element && e.target.closest(".ProseMirror") !== null && editorScope.current?.contains(e.target);
    const start = (e: Event) => {
      if (inEditor(e)) composing.current = true;
    };
    const end = (e: Event) => {
      if (!inEditor(e)) return;
      composing.current = false;
      // compositionend 之后 ProseMirror 才把最终文本写进文档：下一个宏任务再交付
      setTimeout(() => {
        if (composing.current || !deferredWhileComposing.current) return;
        deferredWhileComposing.current = false;
        emitNow();
      }, 0);
    };
    document.addEventListener("compositionstart", start, true);
    document.addEventListener("compositionend", end, true);
    return () => {
      document.removeEventListener("compositionstart", start, true);
      document.removeEventListener("compositionend", end, true);
    };
  }, [emitNow]);

  // 创建 / 销毁 provider（每个 docName 一个；park 的编辑器 DOM 由 vendor 的 editor-cache 管）
  useEffect(() => {
    const pooled = acquireProvider(docName, () => valueRef.current, { lazyRich: modeRef.current === "source" });
    const p = pooled.provider;
    providerRef.current = p;
    let disposeObserve: (() => void) | null = null;
    const onSynced = () => {
      if (disposeObserve) return;
      const yt = p.document.getText("source");
      ytextRef.current = yt;
      // 复用 park 住的 provider 时，Y.Doc 里可能是旧文本：以 Y.Doc 为准，随后由 value 副作用决定是否 replaceRawBody
      lastEmitted.current = yt.toString();
      const observer = (_e: Y.YTextEvent, tr: Y.Transaction) => {
        if (tr.origin === FILE_LOAD_ORIGIN) return;
        // 同一事务批内合并为一次交付（微任务）：会话的文本始终与编辑器保持同步，退出前 flush 不依赖定时器
        if (composing.current) {
          deferredWhileComposing.current = true;
          return;
        }
        if (queued.current) return;
        queued.current = true;
        queueMicrotask(() => {
          queued.current = false;
          emitNow();
        });
      };
      yt.observe(observer);
      disposeObserve = () => yt.unobserve(observer);
      setProvider(p);
    };
    const cancelSync = pooled.whenSynced(onSynced);
    return () => {
      // 卸载前把还在防抖里的编辑交给会话（防止“输入后立刻关闭丢最后字符”）
      emitNow();
      cancelSync();
      providerRef.current = null;
      disposeObserve?.();
      ytextRef.current = null;
      setProvider(null);
      setRichReady(false);
      releaseProvider(docName); // provider 留在池里，直到 editor-cache 一起驱逐
    };
  }, [docName, emitNow]);

  // 需要富文本（非源码模式，或已构建过）时确保富文本表示就绪后再挂 Tiptap
  useEffect(() => {
    if (!provider) return;
    if (provider.richReady) {
      setRichReady(true);
      return;
    }
    if (mode === "source") return;
    let live = true;
    void provider.ensureRich().then(() => live && setRichReady(true));
    return () => {
      live = false;
    };
  }, [provider, mode]);

  // 切到源码前先结算被推迟的桥，使 CodeMirror 看到最新的 Y.Text
  useEffect(() => {
    if (mode === "source") providerRef.current?.settleNow();
  }, [mode]);

  // layout 阶段先于宿主 passive 清理执行：保证 flush 先于会话释放
  useLayoutEffect(() => () => emitNow(), [emitNow]);

  // 外部变化：value 与最近交给会话的文本不同 → replaceRawBody 写回（FILE_LOAD_ORIGIN：不进撤销栈、不触发 onChange）
  useEffect(() => {
    const yt = ytextRef.current;
    if (!provider || !yt) return;
    if (value === lastEmitted.current || value === yt.toString()) return;
    provider.document.transact(() => {
      replaceRawBody(provider.document, value);
    }, FILE_LOAD_ORIGIN);
    lastEmitted.current = value;
  }, [value, provider]);

  // `@` 引用补全：编辑器出现（含 park 后重新出现）时注册，消失时注销
  const searchRef = useRef(referenceSearch);
  searchRef.current = referenceSearch;
  const wantsReference = referenceSearch !== undefined;
  useEffect(() => {
    if (!wantsReference) return;
    let off: (() => void) | null = null;
    let bound: Editor | null = null;
    const sync = () => {
      const ed = getEditorForDoc(docName);
      if (ed === bound) return;
      off?.();
      off = null;
      bound = ed && !ed.isDestroyed ? ed : null;
      if (bound) off = registerAtReference(bound, (q) => searchRef.current?.(q) ?? []);
    };
    sync();
    const unsub = subscribeEditorRegistry(sync);
    return () => {
      unsub();
      off?.();
    };
  }, [docName, wantsReference, provider]);

  // selectionchange 异步分发。先用 ProseMirror 自己的 DOMObserver 读到
  // 最新浏览器选区，避免输入和命令在下一次同步前改写旧选区。
  useEffect(() => {
    type DOMSelectionRange = Pick<Selection, "anchorNode" | "anchorOffset" | "focusNode" | "focusOffset">;
    type SelectionObserver = { currentSelection: { eq(selection: DOMSelectionRange): boolean }; flush(): void };
    let bound: Editor | null = null;
    let detach: (() => void) | undefined;
    const sync = () => {
      const editor = getEditorForDoc(docName);
      const next = editor && !editor.isDestroyed ? editor : null;
      if (next === bound) return;
      detach?.();
      bound = next;
      detach = undefined;
      if (!next) return;

      const view = next.view;
      // Use the same snapshot and shadow-root handling as DOMObserver. Ordinary
      // keys with an already synchronized selection avoid a second flush.
      const selectionView = view as unknown as { domObserver?: SelectionObserver; domSelectionRange(): DOMSelectionRange };
      const flushSelection = (event: Event) => {
        if (view.composing || (event as KeyboardEvent | InputEvent).isComposing) return;
        const observer = selectionView.domObserver;
        if (observer && !observer.currentSelection.eq(selectionView.domSelectionRange())) observer.flush();
      };
      view.dom.addEventListener("keydown", flushSelection, true);
      view.dom.addEventListener("beforeinput", flushSelection, true);
      detach = () => {
        view.dom.removeEventListener("keydown", flushSelection, true);
        view.dom.removeEventListener("beforeinput", flushSelection, true);
      };
    };
    sync();
    const unsub = subscribeEditorRegistry(sync);
    return () => {
      unsub();
      detach?.();
    };
  }, [docName, provider]);

  // 只读 / 阅读模式
  useEffect(() => {
    const apply = () => {
      const ed = getEditorForDoc(docName);
      if (ed && !ed.isDestroyed) {
        const editable = !(readOnly || mode === "read");
        if (ed.isEditable !== editable) ed.setEditable(editable, false);
        if (ariaLabel) {
          ed.view.dom.setAttribute("role", "textbox");
          ed.view.dom.setAttribute("aria-multiline", "true");
          ed.view.dom.setAttribute("aria-label", ariaLabel);
        }
      }
    };
    apply();
    return subscribeEditorRegistry(apply);
  }, [docName, readOnly, mode, provider, ariaLabel]);

  // EditorPort
  useEffect(() => {
    if (!onPort) return;
    if (!provider) {
      onPort(null);
      return;
    }
    const tip = (): Editor | null => {
      const ed = getEditorForDoc(docName);
      return ed && !ed.isDestroyed ? ed : null;
    };
    const cm = () => getMarkdownSourceViewForDoc(docName);
    const text = () => provider.document.getText("source").toString();
    const isRead = () => readOnly || mode === "read";
    const port: RichEditorPort = {
      get readOnly() {
        return isRead();
      },
      focus() {
        if (mode === "source") cm()?.focus();
        else tip()?.commands.focus();
      },
      getSelection() {
        if (mode === "source") {
          const v = cm();
          if (!v) return null;
          const r = v.state.selection.main;
          return { text: v.state.sliceDoc(r.from, r.to), from: r.from, to: r.to };
        }
        const ed = tip();
        if (!ed) return null;
        const { from, to } = ed.state.selection;
        return { text: ed.state.doc.textBetween(from, to, "\n"), from, to };
      },
      gotoLine(line) {
        const v = cm();
        if (mode === "source" && v) {
          const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
          v.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
          v.focus();
          return;
        }
        const ed = tip();
        if (!ed) return;
        const src = text().split("\n");
        const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(src[Math.max(0, line - 1)] ?? "")?.[1];
        if (!heading) return;
        let pos: number | null = null;
        ed.state.doc.descendants((node, p) => {
          if (pos === null && node.type.name === "heading" && node.textContent.trim() === heading.trim()) pos = p;
        });
        const target = pos as number | null;
        if (target !== null)
          ed.chain()
            .focus()
            .setTextSelection(target + 1)
            .scrollIntoView()
            .run();
      },
      execute(command, args) {
        const ed = tip();
        if (!ed || isRead()) return false;
        const fn = (ed.commands as unknown as Record<string, ((a?: unknown) => boolean) | undefined>)[command];
        return fn ? fn(args) : false;
      },
      canExecute(command) {
        const ed = tip();
        if (!ed || isRead()) return false;
        const fn = (ed.can() as unknown as Record<string, ((a?: unknown) => boolean) | undefined>)[command];
        return fn ? fn() : false;
      },
      reveal(target) {
        if (target.line !== undefined) port.gotoLine(target.line);
        else if (target.heading) {
          const ed = tip();
          let pos: number | null = null;
          ed?.state.doc.descendants((node, p) => {
            if (pos === null && node.type.name === "heading" && node.textContent.trim() === target.heading) pos = p;
          });
          const t = pos as number | null;
          if (ed && t !== null)
            ed.chain()
              .focus()
              .setTextSelection(t + 1)
              .scrollIntoView()
              .run();
        }
      },
      getDraft: text,
      async flush() {
        emitNow();
      },
      undo() {
        if (mode === "source") return void cm()?.focus();
        tip()?.commands.undo();
      },
      redo() {
        tip()?.commands.redo();
      },
      canUndo: () => tip()?.can().undo() ?? false,
      canRedo: () => tip()?.can().redo() ?? false,
      isComposing: () => composing.current,
    };
    onPort(port);
    return () => onPort(null);
  }, [provider, docName, mode, readOnly, onPort, emitNow]);

  const showSource = mode === "source";
  return (
    <div
      className={`editor-ok-surface editor-ok-${variant}${className ? ` ${className}` : ""}`}
      data-ok-editor
      data-editor-link-shortcut={linkShortcut ? "" : undefined}
      ref={editorScope}
      data-mode={mode}
      style={{
        height: "100%",
        minHeight: 0,
        position: "relative",
        ...(variant === "document" ? { display: "flex", flexDirection: "column" } : {}),
        ...(fontSize ? { ["--editor-ok-font-size" as string]: `${fontSize}px` } : {}),
        ...(contentWidth === undefined ? {} : { ["--editor-ok-measure" as string]: contentWidth === null ? "100%" : `${contentWidth}px` }),
      }}
    >
      <Boundary {...(props.onError ? { onError: props.onError } : {})}>
        <Suspense fallback={null}>
          {variant === "document" ? (
            <>
              <Toaster richColors closeButton containerAriaLabel={t`Notifications`} />
              <TagDialog key={docName} scope={editorScope} docName={docName} />
              {props.assetActions && mode !== "source" ? <EditorAssetMenu key={docName} scope={editorScope} docName={docName} actions={props.assetActions} /> : null}
            </>
          ) : null}
          {provider && showProperties ? (
            <div className="editor-ok-properties" data-testid="editor-properties" style={{ flex: "0 0 auto" }}>
              <PropertyPanel provider={provider as never} />
            </div>
          ) : null}
          {provider ? (
            <div style={variant === "document" ? { flex: "1 1 0", minHeight: 0, position: "relative" } : { display: "contents" }}>
              {/* 富文本 / 阅读：Tiptap（其 chrome 是 h-full，内容挂在滚动容器 portal 里）；源码模式整块隐藏 */}
              <div hidden={showSource} data-testid={showSource ? undefined : "editor-scroll-container"} style={{ height: "100%", overflow: "auto" }}>
                {richReady ? (
                  <DocumentProvider host={activeDocumentHost}>
                    <TiptapEditor key={`t-${docName}`} provider={provider as never} isSourceMode={showSource} portalTarget={portal} {...(placeholder ? { placeholder } : {})} />
                  </DocumentProvider>
                ) : mode !== "source" ? (
                  <div role="status" className="ok-editor-loading">
                    …
                  </div>
                ) : null}
              </div>
              {richReady && variant === "document" ? <FindReplaceController activeDocName={docName} isSourceMode={mode !== "rich" || readOnly} /> : null}
              {richReady && enableEmojiPicker ? <EmojiInsertPopover scope={editorScope} /> : null}
              {showSource ? (
                <div data-testid="editor-scroll-container" style={{ height: "100%", overflow: "auto" }}>
                  <SourceEditor key={`s-${docName}`} docName={docName} ytext={provider.document.getText("source")} provider={provider as never} isSourceModeActive />
                </div>
              ) : null}
            </div>
          ) : null}
        </Suspense>
      </Boundary>
    </div>
  );
}
