import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import { Annotation, EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { detectPlainFormat, formatJsonText, lineSeparatorFor, restoreBom, stripBom, type FormatResult } from "./plain-text-format.js";

/** `.txt` / `.json` 的 CodeMirror 6 编辑器：不绑 Y，直接以会话文本为准；保存路径不重写内容（F01 / F02）。 */
export type PlainTextLanguage = "text" | "json";

export interface PlainTextEditorProps {
  /** 文档标识：变化时重建编辑器状态（换文件）。 */
  documentId: string;
  /** 会话里的原样字符串（含 BOM / 原换行）。 */
  value: string;
  language: PlainTextLanguage;
  readOnly?: boolean;
  ariaLabel: string;
  onChange: (next: string) => void;
}

export interface PlainTextEditorHandle {
  focus: () => void;
  /** JSON 显式格式化：解析失败时返回错误且不改动文本。 */
  formatJson: () => FormatResult;
}

const externalUpdate = Annotation.define<boolean>();

const highlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.attributeName], color: "var(--atomic-editor-hl-property)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--atomic-editor-hl-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--atomic-editor-hl-number)" },
  { tag: [tags.keyword, tags.operatorKeyword], color: "var(--atomic-editor-hl-keyword)" },
  { tag: [tags.punctuation, tags.separator, tags.brace, tags.squareBracket], color: "var(--atomic-editor-hl-punctuation)" },
  { tag: tags.invalid, color: "var(--atomic-editor-hl-invalid)" },
]);

const baseTheme = EditorView.theme({
  "&": { height: "100%", color: "var(--atomic-editor-fg)", backgroundColor: "var(--atomic-editor-bg)" },
  ".cm-scroller": { fontFamily: "var(--atomic-editor-font-mono)", fontSize: "var(--atomic-editor-body-size)", lineHeight: "var(--atomic-editor-body-leading)", overflow: "auto" },
  ".cm-content": { caretColor: "var(--atomic-editor-fg)", padding: "8px 0" },
  ".cm-gutters": { backgroundColor: "var(--atomic-editor-bg-panel)", color: "var(--atomic-editor-fg-faint)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": { backgroundColor: "var(--atomic-editor-selection-bg)" },
  ".cm-searchMatch": { backgroundColor: "var(--atomic-editor-search-bg)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--atomic-editor-search-bg-active)" },
  ".cm-panels": { backgroundColor: "var(--atomic-editor-bg-panel)", color: "var(--atomic-editor-fg)", borderColor: "var(--atomic-editor-border)" },
  ".cm-specialChar": { color: "var(--atomic-editor-hl-invalid)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--atomic-editor-hl-invalid)" },
});

function buildExtensions(opts: { language: PlainTextLanguage; readOnly: boolean; separator: string | null; ariaLabel: string; onDoc: (text: string) => void }): Extension[] {
  const ext: Extension[] = [
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    search({ top: true }),
    EditorView.lineWrapping,
    baseTheme,
    syntaxHighlighting(highlight),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    EditorView.contentAttributes.of({ "aria-label": opts.ariaLabel, "aria-multiline": "true" }),
    EditorState.readOnly.of(opts.readOnly),
    EditorView.editable.of(!opts.readOnly),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(externalUpdate))) opts.onDoc(u.state.sliceDoc());
    }),
  ];
  if (opts.separator) ext.push(EditorState.lineSeparator.of(opts.separator));
  if (opts.language === "json") ext.push(json(), linter(jsonParseLinter()), lintGutter());
  return ext;
}

export const PlainTextEditor = forwardRef<PlainTextEditorHandle, PlainTextEditorProps>(function PlainTextEditor({ documentId, value, language, readOnly = false, ariaLabel, onChange }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const bomRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  // 换文件 / 换语言 / 换只读：重建状态（撤销栈随文件隔离）
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const fmt = detectPlainFormat(valueRef.current);
    const sep = lineSeparatorFor(fmt.eol);
    bomRef.current = fmt.bom;
    const state = EditorState.create({
      doc: stripBom(valueRef.current),
      extensions: buildExtensions({
        language,
        readOnly: readOnly || !sep.editable,
        separator: sep.separator,
        ariaLabel,
        onDoc: (text) => onChangeRef.current(restoreBom(text, bomRef.current)),
      }),
    });
    const view = new EditorView({ state, parent: el });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // value 只在“换文件”时用于初始化；之后的外部更新走下面的同步 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, language, readOnly, ariaLabel]);

  // 外部更新（接受磁盘版本 / 保留我的修改后的会话文本）：与编辑器内容不同才替换，且不触发 onChange
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const fmt = detectPlainFormat(value);
    bomRef.current = fmt.bom;
    const current = view.state.sliceDoc();
    const next = stripBom(value);
    // sliceDoc() 以 lineSeparator 连接，因此与会话文本直接可比
    if (current === next) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, annotations: externalUpdate.of(true) });
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      formatJson: () => {
        const view = viewRef.current;
        if (!view) return { ok: false, message: "编辑器未就绪" };
        const current = restoreBom(view.state.sliceDoc(), bomRef.current);
        const r = formatJsonText(current);
        if (!r.ok) return r;
        const next = stripBom(r.text);
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, userEvent: "input.format" });
        return r;
      },
    }),
    [],
  );

  return <div ref={host} className="editor-plain-editor" data-language={language} data-testid="plain-text-editor" />;
});
