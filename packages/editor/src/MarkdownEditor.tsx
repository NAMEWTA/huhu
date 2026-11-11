import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef } from "react";

export interface MarkdownEditorProps {
  value: string;
  onChange(value: string): void;
  onSave?(): void;
  lineNumbers?: boolean;
  spellcheck?: boolean;
  /** 正文字号（px）、行高、最大宽度（px，缺省不限）。 */
  fontSize?: number;
  lineHeight?: number;
  maxWidth?: number | null;
  ariaLabel: string;
}

/** CodeMirror 6 源码模式编辑器。受控：外部 value 变化（且不等于当前内容）时替换文档。 */
export function MarkdownEditor({ value, onChange, onSave, lineNumbers: showLines = false, spellcheck = false, fontSize, lineHeight, maxWidth, ariaLabel }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onSave });
  cb.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          markdown(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: spellcheck ? "true" : "false" }),
          ...(showLines ? [lineNumbers()] : []),
          keymap.of([{ key: "Mod-s", run: () => (cb.current.onSave?.(), true) }, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // 仅在挂载/切换行号时重建；内容通过下面的 effect 同步
  }, [showLines, spellcheck, ariaLabel]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  const style: Record<string, string> = {};
  if (fontSize) style["--editor-font-size"] = `${fontSize}px`;
  if (lineHeight) style["--editor-line-height"] = String(lineHeight);
  if (maxWidth) style["--editor-width"] = `${maxWidth}px`;
  return <div ref={host} className="hu-editor" data-testid="markdown-editor" style={style} />;
}
