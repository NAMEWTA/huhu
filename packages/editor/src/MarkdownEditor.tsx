import { defaultKeymap, history, historyKeymap, indentWithTab, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { HighlightStyle, Language, LanguageSupport, defineLanguageFacet, ensureSyntaxTree, languageDataProp, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { closeSearchPanel, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorSelection, EditorState, StateEffect, StateField, Transaction, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, drawSelection, dropCursor, highlightSpecialChars, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { tags as syntaxTags } from "@lezer/highlight";
import { GFM, parser } from "@lezer/markdown";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { atomicMarkdownSyntax } from "./vendor/atomic/atomic-theme.js";
import { huhuCompositionEffect, huhuCompositionField } from "./vendor/atomic/huhu-composition.js";
import { inlinePreview } from "./vendor/atomic/inline-preview.js";
import { readOnlyExtension } from "./vendor/atomic/read-only.js";
import { treeGrowthEffect } from "./vendor/atomic/tree-progress.js";
import { wikiLinks } from "./vendor/atomic/wiki-links.js";

// 一份 Markdown 源文本是唯一事实来源；这些扩展只改变呈现。CodeMirror / Lezer 与经审计的 Atomic 渲染是复用的，不重新实现。
const externalUpdate = Annotation.define<boolean>();
const mdData = defineLanguageFacet({ commentTokens: { block: { open: "<!--", close: "-->" } } });
const mdParser = parser.configure([GFM, { props: [languageDataProp.add({ Document: mdData })] }]);
const mdLanguage = new Language(mdData, mdParser, [], "markdown");
const markdownSupport = new LanguageSupport(mdLanguage);
// 保留上游语法配色，只加一个稳定的应用类名控制正文字重
const huhuMarkdownTypography = syntaxHighlighting(
  HighlightStyle.define([{ tag: [syntaxTags.heading1, syntaxTags.heading2, syntaxTags.heading3, syntaxTags.heading4, syntaxTags.heading5, syntaxTags.heading6, syntaxTags.strong], class: "huhu-md-semibold" }], { scope: mdLanguage }),
);

export type EditorMode = "live" | "source" | "preview" | "split";
export const normalizeEditorMode = (mode: string | undefined): EditorMode => (mode === "live" || mode === "source" || mode === "preview" || mode === "split" ? mode : "live");

/** 用选区包裹（粗体 / 斜体 / 标题…）；无选区时放占位文本并选中它。 */
export function applyEditorFormat(view: EditorView | null, before: string, after = "", placeholder = "文本"): boolean {
  if (!view) return false;
  view.dispatch(
    view.state.changeByRange((range) => {
      const chosen = view.state.sliceDoc(range.from, range.to) || placeholder;
      return { changes: { from: range.from, to: range.to, insert: before + chosen + after }, range: EditorSelection.range(range.from + before.length, range.from + before.length + chosen.length) };
    }),
    { userEvent: "input.format" },
  );
  return true;
}

// SoloMD 的块预览约定：未激活的块渲染，进入时编辑原文。表格 DOM 不会被序列化回 Markdown，所以对齐标记、转义竖线和空格都保留。
class TablePreviewWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
  ) {
    super();
  }
  override eq(other: TablePreviewWidget): boolean {
    return other.source === this.source && other.from === this.from;
  }
  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "huhu-live-table";
    const body = document.createElement("div");
    body.className = "markdown huhu-live-table-scroll";
    body.innerHTML = DOMPurify.sanitize(marked.parse(this.source, { gfm: true, breaks: true }) as string, { FORBID_TAGS: ["style", "iframe", "form", "input", "script", "img"], FORBID_ATTR: ["style"] });
    body.querySelectorAll("a").forEach((a) => {
      a.removeAttribute("href");
      a.removeAttribute("target");
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "huhu-live-block-edit";
    edit.textContent = "编辑表格源码";
    edit.setAttribute("aria-label", "编辑表格源码");
    const enter = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: Math.min(this.from, view.state.doc.length) }, scrollIntoView: true });
      view.focus();
    };
    edit.addEventListener("mousedown", (event) => event.preventDefault());
    edit.addEventListener("click", enter);
    body.addEventListener("dblclick", enter);
    wrap.append(body, edit);
    return wrap;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

function buildTablePreviews(state: EditorState): DecorationSet {
  const ranges: ReturnType<ReturnType<typeof Decoration.replace>["range"]>[] = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 35) || syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name !== "Table") return;
      const active = state.selection.ranges.some((s) => s.from <= node.to && s.to >= node.from);
      if (!active) ranges.push(Decoration.replace({ widget: new TablePreviewWidget(state.sliceDoc(node.from, node.to), node.from), block: true }).range(node.from, node.to));
      return false;
    },
  });
  return Decoration.set(ranges, true);
}
const tablePreviewField = StateField.define<DecorationSet>({
  create: buildTablePreviews,
  update(value, transaction) {
    if (transaction.state.field(huhuCompositionField, false)) return value.map(transaction.changes);
    if (transaction.docChanged || transaction.selection || transaction.effects.some((e) => e.is(treeGrowthEffect))) return buildTablePreviews(transaction.state);
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** 批注在正文中的范围（源码偏移）；未解决显示淡色下划线，已解决更淡，orphaned 不画。 */
export interface CommentMark {
  id: string;
  start: number;
  end: number;
  resolved: boolean;
}
const setCommentMarks = StateEffect.define<readonly CommentMark[]>();
const commentField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setCommentMarks)) continue;
      const max = tr.state.doc.length;
      next = Decoration.set(
        e.value
          .filter((m) => m.start >= 0 && m.end <= max && m.start < m.end)
          .map((m) => Decoration.mark({ class: m.resolved ? "cm-comment cm-comment-resolved" : "cm-comment", attributes: { "data-comment-id": m.id } }).range(m.start, m.end)),
        true,
      );
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontFamily: "var(--font)", fontSize: "var(--editor-size)", color: "var(--text)", backgroundColor: "var(--bg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "var(--editor-line)", overflow: "auto" },
  ".cm-content": { padding: "12px 0 80px", minWidth: "0", maxWidth: "var(--editor-width, none)", marginInline: "auto", width: "100%", caretColor: "var(--text)" },
  ".cm-line": { padding: "0", overflowWrap: "anywhere" },
  ".cm-cursor,.cm-dropCursor": { borderLeftColor: "var(--text)", borderLeftWidth: "2px" },
  ".cm-gutters": { backgroundColor: "var(--bg)", border: "0", color: "var(--faint)", fontFamily: "var(--mono)", fontSize: "12px", minWidth: "40px" },
  ".cm-gutterElement": { padding: "0 9px 0 4px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground,.cm-selectionBackground": { backgroundColor: "var(--accent-soft)" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "7px" },
  ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)", borderColor: "var(--line)" },
  ".cm-comment": { borderBottom: "2px solid color-mix(in srgb, var(--warning) 55%, transparent)", backgroundColor: "color-mix(in srgb, var(--warning-bg) 70%, transparent)", cursor: "pointer" },
  ".cm-comment-resolved": { borderBottomStyle: "dotted", borderBottomColor: "var(--faint)", backgroundColor: "transparent" },
  ".cm-searchMatch": { backgroundColor: "var(--warning-bg)", outline: "1px solid var(--warning)" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--accent-soft)", outlineColor: "var(--text)" },
});
const phrases: Record<string, string> = {
  Find: "查找",
  Replace: "替换",
  next: "下一处",
  previous: "上一处",
  all: "全部",
  "match case": "区分大小写",
  "by word": "整词",
  regexp: "正则",
  replace: "替换",
  "replace all": "全部替换",
  close: "关闭",
  "current match": "当前匹配",
  "replaced $ matches": "已替换 $ 处",
  "replaced match on line $": "已替换第 $ 行",
  "Find next": "查找下一处",
  "Find previous": "查找上一处",
  "Select all matches": "选择全部匹配",
  "Replace with": "替换为",
  "Go to line": "跳转到行",
  go: "跳转",
  "Fold line": "折叠行",
  "Unfold line": "展开行",
};

/** 前后文本的最小差异：外部同步时只替换变化的那一段，光标和撤销栈不被打乱。 */
export function sourceChange(previous: string, next: string): { from: number; to: number; insert: string } {
  let from = 0;
  const max = Math.min(previous.length, next.length);
  while (from < max && previous.charCodeAt(from) === next.charCodeAt(from)) from++;
  let a = previous.length;
  let b = next.length;
  while (a > from && b > from && previous.charCodeAt(a - 1) === next.charCodeAt(b - 1)) {
    a--;
    b--;
  }
  return { from, to: a, insert: next.slice(from, b) };
}

export interface EditorStatus {
  line: number;
  column: number;
  selected: number;
  canUndo: boolean;
  canRedo: boolean;
}
export interface MarkdownEditorHandle {
  readonly view: EditorView | null;
  scrollTop: number;
  focus(): void;
  getText(): string;
  getSelectionText(): string;
  /** 当前主选区的源码偏移（折叠选区时 from === to）。 */
  getSelectionRange(): { from: number; to: number };
  setSelectionRange(from: number, to?: number): void;
  insert(before: string, after?: string, placeholder?: string): boolean;
  undo(): void;
  redo(): void;
  openSearch(): void;
  closeSearch(): void;
  setScrollRatio(ratio: number): void;
}
export interface MarkdownEditorProps {
  /** 每篇文档一个 id：切换时各自保留撤销历史与滚动位置。 */
  documentId: string;
  value: string;
  mode?: EditorMode;
  onChange(value: string, documentId: string): void;
  onSave?(): void;
  onStatus?(s: EditorStatus): void;
  onWikiOpen?(target: string): void;
  onOpenLink?(url: string): void;
  /** 滚动比例 0–1（双栏同步滚动用）。 */
  onScroll?(ratio: number): void;
  lineNumbers?: boolean;
  spellcheck?: boolean;
  readOnly?: boolean;
  /** 正文字号（px）、行高、最大宽度（px，缺省不限）。 */
  fontSize?: number;
  lineHeight?: number;
  maxWidth?: number | null;
  ariaLabel?: string;
  /** 批注范围装饰；点击装饰触发 onCommentClick。 */
  comments?: readonly CommentMark[];
  onCommentClick?(id: string): void;
}

interface DocRecord {
  id: string;
  state: EditorState;
  scrollTop: number;
  scrollLeft: number;
  visual: Compartment;
  gutter: Compartment;
  readOnly: Compartment;
  attributes: Compartment;
  previewExtensions: Extension[];
}

/**
 * 包着一个持久 CodeMirror 视图的适配器（原型 editor.jsx）。
 * 每篇打开的文档有自己的 EditorState / 撤销历史；模式切换只重配置 Compartment，不替换编辑器。
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
  const { documentId, value, mode = "live", lineNumbers: showNumbers = true, spellcheck = false, readOnly = false, fontSize, lineHeight, maxWidth, ariaLabel = "Markdown 编辑器" } = props;
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const records = useRef(new Map<string, DocRecord>());
  const active = useRef<DocRecord | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  const status = (view: EditorView | null) => {
    if (!view) return;
    const range = view.state.selection.main;
    const line = view.state.doc.lineAt(range.head);
    latest.current.onStatus?.({ line: line.number, column: range.head - line.from + 1, selected: range.to - range.from, canUndo: undoDepth(view.state) > 0, canRedo: redoDepth(view.state) > 0 });
  };
  const modes = (record: DocRecord) => {
    const cfg = latest.current;
    const m = normalizeEditorMode(cfg.mode);
    return [
      record.visual.reconfigure(m === "live" ? record.previewExtensions : []),
      record.gutter.reconfigure(cfg.lineNumbers !== false ? lineNumbers() : []),
      record.readOnly.reconfigure(readOnlyExtension(!!cfg.readOnly || m === "preview")),
      record.attributes.reconfigure(EditorView.contentAttributes.of({ "aria-label": cfg.ariaLabel ?? "Markdown 编辑器", "aria-multiline": "true", spellcheck: String(!!cfg.spellcheck) })),
    ];
  };
  const createRecord = (id: string, text: string): DocRecord => {
    const cfg = latest.current;
    const m = normalizeEditorMode(cfg.mode);
    const visual = new Compartment();
    const gutter = new Compartment();
    const ro = new Compartment();
    const attributes = new Compartment();
    const openLink = (url: string) => latest.current.onOpenLink?.(url);
    const previewExtensions: Extension[] = [
      inlinePreview({ onLinkClick: openLink }),
      wikiLinks({ openOnClick: false, resolve: async (target: string) => ({ target, label: target, status: "unresolved" }), onOpen: (target: string) => latest.current.onWikiOpen?.(target) }),
      tablePreviewField,
    ];
    const record: DocRecord = { id, state: undefined as unknown as EditorState, scrollTop: 0, scrollLeft: 0, visual, gutter, readOnly: ro, attributes, previewExtensions };
    record.state = EditorState.create({
      doc: text,
      extensions: [
        markdownSupport,
        history(),
        highlightSpecialChars(),
        drawSelection(),
        dropCursor(),
        EditorView.lineWrapping,
        EditorState.allowMultipleSelections.of(true),
        EditorState.tabSize.of(2),
        EditorState.phrases.of(phrases),
        atomicMarkdownSyntax,
        huhuMarkdownTypography,
        editorTheme,
        huhuCompositionField,
        commentField,
        visual.of(m === "live" ? previewExtensions : []),
        gutter.of(cfg.lineNumbers !== false ? lineNumbers() : []),
        ro.of(readOnlyExtension(!!cfg.readOnly || m === "preview")),
        attributes.of(EditorView.contentAttributes.of({ "aria-label": cfg.ariaLabel ?? "Markdown 编辑器", "aria-multiline": "true", spellcheck: String(!!cfg.spellcheck) })),
        search({ top: true }),
        keymap.of([
          { key: "Mod-s", run: () => (latest.current.onSave?.(), true) },
          { key: "Mod-b", run: (view) => !view.state.readOnly && applyEditorFormat(view, "**", "**") },
          { key: "Mod-i", run: (view) => !view.state.readOnly && applyEditorFormat(view, "*", "*") },
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.domEventHandlers({
          click(event) {
            const id = (event.target as HTMLElement | null)?.closest?.("[data-comment-id]")?.getAttribute("data-comment-id");
            if (id) latest.current.onCommentClick?.(id);
            return false;
          },
          scroll(event, view) {
            if (event.target === view.scrollDOM) {
              record.scrollTop = view.scrollDOM.scrollTop;
              record.scrollLeft = view.scrollDOM.scrollLeft;
              const extent = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
              latest.current.onScroll?.(extent > 0 ? record.scrollTop / extent : 0);
            }
          },
          compositionstart(_event, view) {
            view.dispatch({ effects: huhuCompositionEffect.of(true) });
            return false;
          },
          compositionend(_event, view) {
            if (flushTimer.current) clearTimeout(flushTimer.current);
            flushTimer.current = setTimeout(() => {
              if (alive.current && viewRef.current === view) view.dispatch({ effects: [huhuCompositionEffect.of(false), treeGrowthEffect.of(null)] });
            }, 0);
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          record.state = update.state;
          if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalUpdate))) latest.current.onChange(update.state.doc.toString(), record.id);
          if (update.docChanged || update.selectionSet || update.transactions.some((tr) => tr.reconfigured)) status(update.view);
        }),
      ],
    });
    records.current.set(id, record);
    return record;
  };

  useLayoutEffect(() => {
    if (!host.current) return;
    alive.current = true;
    const record = createRecord(latest.current.documentId, latest.current.value);
    active.current = record;
    const view = new EditorView({ state: record.state, parent: host.current });
    viewRef.current = view;
    status(view);
    return () => {
      alive.current = false;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      view.destroy();
      viewRef.current = null;
      records.current.clear();
    };
    // 只在挂载 / 卸载时建立视图；之后的变化都经 Compartment 与 setState 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    const current = active.current;
    if (!view || !current) return;
    if (current.id !== documentId) {
      current.state = view.state;
      current.scrollTop = view.scrollDOM.scrollTop;
      current.scrollLeft = view.scrollDOM.scrollLeft;
      const record = records.current.get(documentId) ?? createRecord(documentId, value);
      active.current = record;
      view.setState(record.state);
      view.scrollDOM.scrollTop = record.scrollTop;
      view.scrollDOM.scrollLeft = record.scrollLeft;
      if (records.current.size > 32) {
        for (const key of records.current.keys()) {
          if (key !== documentId) {
            records.current.delete(key);
            break;
          }
        }
      }
    }
    const before = view.state.doc.toString();
    if (before !== value) view.dispatch({ changes: sourceChange(before, value), annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)] });
    view.dispatch({ effects: modes(active.current as DocRecord) });
    view.requestMeasure();
    status(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, mode, showNumbers, spellcheck, readOnly, ariaLabel]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || active.current?.id !== documentId) return;
    const before = view.state.doc.toString();
    if (before !== value) view.dispatch({ changes: sourceChange(before, value), annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)] });
  }, [documentId, value]);

  useImperativeHandle(
    ref,
    () => ({
      get view() {
        return viewRef.current;
      },
      get scrollTop() {
        return viewRef.current?.scrollDOM.scrollTop ?? 0;
      },
      set scrollTop(v: number) {
        if (viewRef.current) viewRef.current.scrollDOM.scrollTop = v;
      },
      focus: () => viewRef.current?.focus(),
      getText: () => viewRef.current?.state.doc.toString() ?? "",
      getSelectionText: () => {
        const v = viewRef.current;
        return v ? v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to) : "";
      },
      getSelectionRange: () => {
        const r = viewRef.current?.state.selection.main;
        return r ? { from: r.from, to: r.to } : { from: 0, to: 0 };
      },
      setSelectionRange: (from: number, to = from) => {
        const v = viewRef.current;
        if (v) {
          const max = v.state.doc.length;
          v.dispatch({ selection: EditorSelection.range(Math.max(0, Math.min(max, from)), Math.max(0, Math.min(max, to))), scrollIntoView: true });
        }
      },
      insert: (before: string, after = "", placeholder = "文本") => applyEditorFormat(viewRef.current, before, after, placeholder),
      undo: () => {
        const v = viewRef.current;
        if (v && !v.state.readOnly) {
          undo(v);
          v.focus();
        }
      },
      redo: () => {
        const v = viewRef.current;
        if (v && !v.state.readOnly) {
          redo(v);
          v.focus();
        }
      },
      openSearch: () => {
        if (viewRef.current) openSearchPanel(viewRef.current);
      },
      closeSearch: () => {
        if (viewRef.current) closeSearchPanel(viewRef.current);
      },
      setScrollRatio: (ratio: number) => {
        const v = viewRef.current;
        if (v) v.scrollDOM.scrollTop = Math.max(0, Math.min(1, ratio)) * (v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight);
      },
    }),
    [],
  );

  // 批注范围变化（或切换文档）后重画装饰；范围随编辑被 CodeMirror 的变更映射带着走，保存后由引擎重新定位
  const marks = props.comments;
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setCommentMarks.of(marks ?? []) });
  }, [marks, documentId]);

  const style: Record<string, string> = {};
  if (fontSize) style["--editor-size"] = `${fontSize}px`;
  if (lineHeight) style["--editor-line"] = String(lineHeight);
  if (maxWidth) style["--editor-width"] = `${maxWidth}px`;
  return <div className={`huhu-markdown-editor mode-${normalizeEditorMode(mode)}`} data-editor-engine="codemirror6" data-testid="markdown-editor" ref={host} style={style} />;
});

export { EditorView };
