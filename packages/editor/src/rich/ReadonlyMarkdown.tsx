// 阅读视图：同一个 schema / 同一份 Y.Doc，editable:false（design §3.3；OK 没有独立阅读模式，这里是 Huhu 的“阅读”）。
import { RichMarkdownEditor, type RichMarkdownEditorProps } from "./RichMarkdownEditor";

export function ReadonlyMarkdown(props: Omit<RichMarkdownEditorProps, "mode" | "readOnly" | "onChange">) {
  return <RichMarkdownEditor {...props} mode="read" readOnly onChange={() => {}} />;
}
