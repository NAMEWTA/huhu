import type { VaultReadRangeOutput } from "@huhu/contracts";
import {
  OkRoot,
  RichMarkdownEditor,
  coreRoutes,
  markdownSemanticallyUnchanged,
  registerCommentSelectionSource,
  requestFileTreeReveal,
  useCommentsReadOnlySync,
  uploadRoutes,
  type EditorAssetActions,
  type EditorViewMode,
  type HostRoutes,
  type ReferenceCandidate,
  type RichEditorPort,
} from "@huhu/editor/rich";
import { useCapability, useEngine, useEngineEvents, requestOpenPath, useReferenceIndex } from "@huhu/workbench";
import { useLayoutEffect, useMemo, useRef } from "react";
import { hasProtectedSegment, MAX_ATTACH_BYTES } from "../../shared/attachments.js";
import { attachFile } from "../attach.js";
import { useCommentsBridge } from "../comments/useCommentsBridge.js";
import { useKnowledgeLocale } from "../useKnowledgeLocale.js";
import { documentSessions } from "./useDocumentSession.js";
import type { MarkdownEquivalence } from "./DocumentSession.js";

/** 编辑面所需的最小笔记引用（来自 notes.list；不依赖 NoteExplorer 的类型，避免循环）。 */
export interface SurfaceNoteRef {
  path: string;
  title: string;
  tags?: readonly string[];
}

export interface NoteEditorSurfaceProps {
  path: string;
  value: string;
  onChange(text: string, equivalentMarkdown: MarkdownEquivalence): void;
  readOnly: boolean;
  retainSession(): () => void;
  mode: EditorViewMode;
  propertiesTarget: HTMLElement | null;
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
const BOARD = /\.excalidraw$/i;
const PDF = /\.pdf$/i;
const MAX_REFERENCE_TEXT_BYTES = 4 * 1024 * 1024;

function assertReferencePath(path: string): void {
  if (path.split("/").some((segment) => !segment || segment === "." || segment === "..") || hasProtectedSegment(path)) {
    throw new Error("无效的引用路径");
  }
}

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
  const vault = useCapability<{ name: string; readOnly: boolean }>("vault.info", {});
  useCommentsReadOnlySync(vault.data?.readOnly !== false);
  useLayoutEffect(() => {
    return registerCommentSelectionSource(
      docNameOf(props.path),
      () => {
        const session = documentSessions.get(engine.vaultId, props.path);
        if (session) return { ...session.id, revision: session.getSnapshot().dirtyRevision };
      },
      engine.vaultId,
    );
  }, [engine.vaultId, props.path]);
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
  const referencePath = useMemo(
    () => (docName: string) => (BOARD.test(docName) || PDF.test(docName) ? docName : (notes.current.find((entry) => docNameOf(entry.path) === docName || entry.path === docName)?.path ?? (MD.test(docName) ? docName : `${docName}.md`))),
    [],
  );
  const subscribers = useMemo(() => new Set<{ docName: string; refresh(): void }>(), [engine]);
  useEngineEvents((event) => {
    if (event.vaultId !== engine.vaultId || subscribers.size === 0) return;
    if (event.type === "entity.changed") {
      const { kind } = event.payload as { kind: string };
      if (kind === "note") for (const { docName, refresh } of subscribers) if (!BOARD.test(docName) && !PDF.test(docName)) refresh();
    }
    if (event.type === "vault.fileChanged" || event.type === "vault.dirChanged") {
      const { path, from } = event.payload as { path: string; from?: string };
      for (const { docName, refresh } of subscribers) {
        const target = referencePath(docName);
        if (target === path || target === from || (event.type === "vault.dirChanged" && target.startsWith(path ? `${path}/` : ""))) refresh();
      }
    }
  });
  const routes = useMemo<HostRoutes>(() => {
    const pathForDocName = (docName: string) => notes.current.find((entry) => docNameOf(entry.path) === docName)?.path;
    return {
      ...commentRoutes,
      "GET /api/reference-text": async ({ url, signal }) => {
        const docName = url.searchParams.get("doc");
        if (!docName || /^__(?:config|system)__\//.test(docName)) throw new Error("无效的引用路径");
        const path = referencePath(docName);
        assertReferencePath(path);
        if (!MD.test(path) && !BOARD.test(path)) throw new Error("无效的引用路径");
        const chunk = await engine.call<VaultReadRangeOutput>("vault.readRange", { path, offset: 0, length: MAX_REFERENCE_TEXT_BYTES }, signal ? { signal } : {});
        if (chunk.size > MAX_REFERENCE_TEXT_BYTES || !chunk.eof || chunk.offset !== 0 || chunk.length !== chunk.size) throw new Error("引用文件超过内嵌读取上限，或读取时发生变化");
        const bytes = Uint8Array.from(atob(chunk.base64), (char) => char.charCodeAt(0));
        if (bytes.length !== chunk.length) throw new Error("引用文件读取不完整");
        return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
      },
      "POST /api/create-page": async ({ body }) => {
        const file = (body as { path?: unknown } | null)?.path;
        if (typeof file !== "string" || !MD.test(file) || hasProtectedSegment(file)) throw new Error("无效的笔记路径");
        const slash = file.lastIndexOf("/");
        const name = file.slice(slash + 1).replace(MD, "");
        const folder = slash < 0 ? "" : file.slice(0, slash);
        const result = await engine.call<{ path: string }>("notes.create", { name, folder }, { write: true });
        return { docName: docNameOf(result.path) };
      },
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
  }, [commentRoutes, engine, referencePath]);
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
      readAsset: async (path: string, requestSignal?: AbortSignal) => {
        if (hasProtectedSegment(path)) throw new Error("附件位于受保护的目录");
        const length = 4 * 1024 * 1024;
        const parts: BlobPart[] = [];
        let offset = 0;
        const scopeSignal = downloadScope.current?.signal;
        if (!scopeSignal) throw new DOMException("下载已取消", "AbortError");
        const signal = requestSignal ? AbortSignal.any([scopeSignal, requestSignal]) : scopeSignal;
        let expectedVersion: string | undefined;
        let expectedSize: number | undefined;
        while (true) {
          signal.throwIfAborted();
          const chunk = await engine.call<VaultReadRangeOutput & { version: string }>("vault.readRange", { path, offset, length, expectedVersion }, { signal }).catch((error: unknown) => {
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

  const localReferences = useMemo(
    () => ({
      subscribe(docName: string, refresh: () => void) {
        const subscriber = { docName, refresh };
        subscribers.add(subscriber);
        return () => {
          subscribers.delete(subscriber);
        };
      },
      readPdf(path: string, signal: AbortSignal) {
        assertReferencePath(path);
        if (!PDF.test(path)) throw new Error("无效的 PDF 路径");
        return documentHost.readAsset(path, signal);
      },
    }),
    [documentHost, subscribers],
  );

  return (
    <OkRoot acceptSidebarDrop {...(config ? { config } : {})} locale={locale} routes={routes} documentHost={documentHost} localReferences={localReferences} poolKey={engine.vaultId} commentScope={engine.vaultId} style={{ height: "100%" }}>
      <RichMarkdownEditor
        referenceSearch={refs.search as (q: string) => readonly ReferenceCandidate[]}
        docName={docNameOf(props.path)}
        value={props.value}
        onChange={(text) => props.onChange(text, markdownSemanticallyUnchanged)}
        readOnly={props.readOnly}
        retainSession={props.retainSession}
        mode={props.mode}
        propertiesTarget={props.propertiesTarget}
        assetActions={assetActions}
        onPort={props.onPort}
        onRevealSource={props.onRevealSource}
        {...(props.fontSize ? { fontSize: props.fontSize } : {})}
        {...(props.contentWidth !== undefined ? { contentWidth: props.contentWidth } : {})}
      />
    </OkRoot>
  );
}
