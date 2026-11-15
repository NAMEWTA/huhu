import { OkRoot, RichMarkdownEditor, coreRoutes, type EditorViewMode, type HostRoutes, type RichEditorPort } from "@huhu/editor/rich";
import { useEngine, requestOpenPath } from "@huhu/workbench";
import { useMemo, useRef } from "react";

/** 编辑面所需的最小笔记引用（来自 notes.list；不依赖 NoteExplorer 的类型，避免循环）。 */
export interface SurfaceNoteRef {
  path: string;
  title: string;
}

export interface NoteEditorSurfaceProps {
  path: string;
  value: string;
  onChange(text: string): void;
  mode: EditorViewMode;
  notes: readonly SurfaceNoteRef[];
  /** 编辑器内点击 wiki-link / 内部链接：交给笔记模块打开 */
  onOpen(path: string): void;
  onPort(port: RichEditorPort | null): void;
}

const MD = /\.(md|mdx)$/i;
const docNameOf = (path: string): string => path.replace(MD, "");

/**
 * 笔记的编辑面（整个新编辑器闭包经 `NoteDocument` 的动态 import 加载到这里，不进首屏）：
 * `.ok-root` 作用域 + 宿主路由（页面清单）+ RichMarkdownEditor。
 */
export default function NoteEditorSurface(props: NoteEditorSurfaceProps) {
  const engine = useEngine();
  const notes = useRef(props.notes);
  notes.current = props.notes;
  const onOpen = useRef(props.onOpen);
  onOpen.current = props.onOpen;

  const routes = useMemo<HostRoutes>(
    () =>
      coreRoutes({
        listPages: () => notes.current.map((x) => ({ docName: docNameOf(x.path), title: x.title, size: 0, modified: new Date(0).toISOString(), docExt: (/\.(\w+)$/.exec(x.path)?.[1] ?? "md").toLowerCase() })),
        listDocuments: () => notes.current.map((x) => ({ kind: "document" as const, path: x.path, docName: docNameOf(x.path) })),
      }),
    [],
  );
  const documentHost = useMemo(
    () => ({
      openDocument: (docName: string) => onOpen.current(MD.test(docName) ? docName : `${docName}.md`),
      openTarget: (t: { kind: string; docName?: string; folderPath?: string; assetPath?: string }) => {
        if ((t.kind === "doc" || t.kind === "folder-index") && t.docName) onOpen.current(`${t.docName}.md`);
        else if (t.kind === "folder" && t.folderPath) requestOpenPath(`${t.folderPath}/`);
        else if (t.kind === "asset" && t.assetPath) onOpen.current(t.assetPath);
      },
    }),
    [],
  );

  return (
    <OkRoot locale="zh-Hans" routes={routes} documentHost={documentHost} poolKey={engine.vaultId} style={{ height: "100%" }}>
      <RichMarkdownEditor docName={docNameOf(props.path)} value={props.value} onChange={props.onChange} mode={props.mode} onPort={props.onPort} />
    </OkRoot>
  );
}
