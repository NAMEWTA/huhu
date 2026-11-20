import type { VaultReadRangeOutput } from "@huhu/contracts";
import { OkRoot, RichMarkdownEditor, coreRoutes, requestFileTreeReveal, uploadRoutes, type EditorAssetActions, type EditorViewMode, type HostRoutes, type ReferenceCandidate, type RichEditorPort } from "@huhu/editor/rich";
import { useEngine, requestOpenPath, useReferenceIndex } from "@huhu/workbench";
import { useLayoutEffect, useMemo, useRef } from "react";
import { hasProtectedSegment, MAX_ATTACH_BYTES } from "../../shared/attachments.js";
import { attachFile } from "../attach.js";
import { useCommentsBridge } from "../comments/useCommentsBridge.js";
import { useKnowledgeLocale } from "../useKnowledgeLocale.js";

/** 编辑面所需的最小笔记引用（来自 notes.list；不依赖 NoteExplorer 的类型，避免循环）。 */
export interface SurfaceNoteRef {
  path: string;
  title: string;
  tags?: readonly string[];
}

export interface NoteEditorSurfaceProps {
  path: string;
  value: string;
  onChange(text: string): void;
  mode: EditorViewMode;
  onRevealSource(): void;
  notes: readonly SurfaceNoteRef[];
  /** 编辑器内点击 wiki-link / 内部链接：交给笔记模块打开 */
  onOpen(path: string): void;
  onPort(port: RichEditorPort | null): void;
  fontSize?: number;
  linkPreviewsEnabled: boolean;
  /** 正文可读宽度 px；null = 不限制 */
  contentWidth?: number | null;
  /** 批注创建前把编辑落盘（引擎在已保存文本上解析引用文字） */
  flush(): Promise<boolean>;
}

const MD = /\.(md|mdx)$/i;
const docNameOf = (path: string): string => path.replace(MD, "");

/**
 * 笔记的编辑面（整个新编辑器闭包经 `NoteDocument` 的动态 import 加载到这里，不进首屏）：
 * `.ok-root` 作用域 + 宿主路由（页面清单）+ RichMarkdownEditor。
 */
export default function NoteEditorSurface(props: NoteEditorSurfaceProps) {
  const engine = useEngine();
  const locale = useKnowledgeLocale();
  const host = (globalThis as { huhuHost?: { externalLinkPreview?(url: string): Promise<unknown> } }).huhuHost;
  const requestLinkPreview = host?.externalLinkPreview;
  const config = requestLinkPreview && props.linkPreviewsEnabled ? { linkPreviewsEnabled: true, requestLinkPreview } : undefined;
  // `@` 候选：全 Vault 的文件 / 文件夹（含被“隐藏”的——隐藏只作用于文件树，A02 / A04）
  const refs = useReferenceIndex();
  const notes = useRef(props.notes);
  notes.current = props.notes;
  const onOpen = useRef(props.onOpen);
  onOpen.current = props.onOpen;

  const { commentRoutes } = useCommentsBridge({ paths: props.notes.map((x) => x.path), flush: props.flush });
  const notePath = useRef(props.path);
  notePath.current = props.path;
  const currentText = useRef(props.value);
  currentText.current = props.value;
  const routes = useMemo<HostRoutes>(() => {
    const pathForDocName = (docName: string) => notes.current.find((entry) => docNameOf(entry.path) === docName)?.path;
    return {
      ...commentRoutes,
      // 粘贴 / 拖入图片与文件：落在当前笔记旁的 attachments/（notes.attach：原子写 + OperationLog，同内容去重）
      ...uploadRoutes(async ({ file, name, notePath: parent }) => attachFile(engine, { file, name, notePath: parent ?? notePath.current })),
      ...coreRoutes({
        listPages: () =>
          notes.current.map((x) => ({ docName: docNameOf(x.path), title: x.title, ...(x.tags ? { tags: x.tags } : {}), size: 0, modified: new Date(0).toISOString(), docExt: (/\.(\w+)$/.exec(x.path)?.[1] ?? "md").toLowerCase() })),
        listDocuments: () => notes.current.map((x) => ({ kind: "document" as const, path: x.path, docName: docNameOf(x.path) })),
        suggestions: {
          listTags: () => engine.call<{ tag: string; count: number }[]>("notes.tags", {}),
          readDocument: async (docName) => {
            if (docName === docNameOf(notePath.current)) return currentText.current;
            const path = pathForDocName(docName);
            return path ? (await engine.call<{ text: string }>("notes.read", { path })).text : null;
          },
          listBacklinks: async (docName) => {
            const path = pathForDocName(docName);
            if (!path) return [];
            const backlinks = await engine.call<{ path: string; title: string }[]>("notes.backlinks", { path });
            return backlinks.map((entry) => ({ source: docNameOf(entry.path), title: entry.title }));
          },
        },
      }),
    };
  }, [commentRoutes, engine]);
  const downloadScope = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const controller = new AbortController();
    downloadScope.current = controller;
    return () => {
      controller.abort();
      downloadScope.current = null;
    };
  }, [engine, props.path]);
  const assetActions = useMemo<EditorAssetActions>(
    () => ({
      resolve: (path, kind) => {
        if (hasProtectedSegment(path)) return null;
        if (kind !== "wiki-link") return path;
        const direct = notes.current.find((entry) => entry.path === path);
        return direct?.path ?? notes.current.find((entry) => entry.path === `${docNameOf(path)}/index.md`)?.path ?? null;
      },
      open: (path) => onOpen.current(path),
      reveal: requestFileTreeReveal,
      copy: (path) => {
        const host = (window as Window & { huhuHost?: { copyText?(value: string): Promise<void> } }).huhuHost;
        void (host?.copyText ? host.copyText(path) : navigator.clipboard.writeText(path));
      },
    }),
    [],
  );
  const documentHost = useMemo(
    () => ({
      readAsset: async (path: string) => {
        if (hasProtectedSegment(path)) throw new Error("附件位于受保护的目录");
        const length = 4 * 1024 * 1024;
        const parts: BlobPart[] = [];
        let offset = 0;
        const signal = downloadScope.current?.signal;
        if (!signal) throw new DOMException("下载已取消", "AbortError");
        let expectedVersion: string | undefined;
        let expectedSize: number | undefined;
        while (true) {
          signal.throwIfAborted();
          const chunk = await engine.call<VaultReadRangeOutput & { version: string }>("vault.readRange", { path, offset, length, expectedVersion }).catch((error: unknown) => {
            if ((error as { code?: string })?.code === "VERSION_CONFLICT") throw new Error("附件在读取期间发生变化，请重新下载", { cause: error });
            throw error;
          });
          signal.throwIfAborted();
          expectedVersion ??= chunk.version;
          expectedSize ??= chunk.size;
          if (expectedSize > MAX_ATTACH_BYTES) throw new Error("附件超过下载上限");
          const bytes = Uint8Array.from(atob(chunk.base64), (char) => char.charCodeAt(0));
          if (!expectedVersion || chunk.version !== expectedVersion || chunk.size !== expectedSize || chunk.offset !== offset || bytes.length !== chunk.length || offset + chunk.length > expectedSize || (chunk.length === 0 && !chunk.eof)) {
            throw new Error("附件在读取期间发生变化，请重新下载");
          }
          parts.push(bytes);
          offset += chunk.length;
          if (chunk.eof) {
            if (offset !== expectedSize) throw new Error("附件在读取期间发生变化，请重新下载");
            return new Blob(parts, { type: "application/octet-stream" });
          }
        }
      },
      openDocument: (docName: string) => {
        // OK 的文档名不带扩展名；Huhu 里同名可能是 `名.md`，也可能是文件夹笔记 `名/index.md`（档案 / 文件夹笔记）
        const have = new Set(notes.current.map((x) => x.path));
        const direct = MD.test(docName) ? docName : `${docName}.md`;
        const folder = `${docName.replace(/\/$/, "")}/index.md`;
        onOpen.current(have.has(direct) ? direct : have.has(folder) ? folder : direct);
      },
      openTarget: (t: { kind: string; docName?: string; folderPath?: string; assetPath?: string }) => {
        if ((t.kind === "doc" || t.kind === "folder-index" || t.kind === "large-file") && t.docName) {
          const path = notes.current.find((entry) => docNameOf(entry.path) === t.docName)?.path;
          onOpen.current(path ?? `${t.docName}.md`);
        } else if (t.kind === "folder" && t.folderPath) requestOpenPath(`${t.folderPath}/`);
        else if (t.kind === "asset" && t.assetPath) onOpen.current(t.assetPath);
      },
    }),
    [engine],
  );

  return (
    <OkRoot acceptSidebarDrop {...(config ? { config } : {})} locale={locale} routes={routes} documentHost={documentHost} poolKey={engine.vaultId} style={{ height: "100%" }}>
      <RichMarkdownEditor
        referenceSearch={refs.search as (q: string) => readonly ReferenceCandidate[]}
        docName={docNameOf(props.path)}
        value={props.value}
        onChange={props.onChange}
        mode={props.mode}
        assetActions={assetActions}
        onPort={props.onPort}
        onRevealSource={props.onRevealSource}
        {...(props.fontSize ? { fontSize: props.fontSize } : {})}
        {...(props.contentWidth !== undefined ? { contentWidth: props.contentWidth } : {})}
      />
    </OkRoot>
  );
}
