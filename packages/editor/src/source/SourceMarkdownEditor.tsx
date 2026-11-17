// 源码视图：vendor 的 CodeMirror 6 + y-codemirror.next，绑定同一份 Y.Text('source')（design §3.2）。
import { RichMarkdownEditor, type RichMarkdownEditorProps } from "../rich/RichMarkdownEditor";

export function SourceMarkdownEditor(props: Omit<RichMarkdownEditorProps, "mode">) {
  return <RichMarkdownEditor {...props} mode="source" />;
}
