// `@huhu/editor/rich` 的公开类型面（手写）：消费者（plugins/*）用严格的工作区 tsconfig 检查，
// 不应穿过去检查 vendor 源码（vendor 走 tsconfig.vendor.json，OP-D15）。实现见 ./index.ts，改动需同步。
import type { EditorPort } from "@huhu/contracts";
import type { CSSProperties, ReactElement, ReactNode } from "react";

export type EditorViewMode = "rich" | "source" | "read";
export type EditorVariant = "document" | "compact";

export interface RichEditorPort extends EditorPort {
  gotoLine(line: number): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  isComposing(): boolean;
}

export interface EditorAssetActions {
  resolve(path: string, kind: "asset" | "wiki-link" | "image"): string | null;
  open(path: string): void;
  reveal(path: string): void;
  copy(path: string): void;
}
export function requestFileTreeReveal(path: string): void;

export interface RichMarkdownEditorProps {
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
  fontSize?: number;
  contentWidth?: number | null;
  referenceSearch?: (query: string) => readonly { path: string; kind: "file" | "folder" }[];
  onPort?(port: RichEditorPort | null): void;
  onError?(error: Error): void;
  className?: string;
}
export function RichMarkdownEditor(props: RichMarkdownEditorProps): ReactElement;
export function ReadonlyMarkdown(props: Omit<RichMarkdownEditorProps, "mode" | "readOnly" | "onChange">): ReactElement;
export function SourceMarkdownEditor(props: Omit<RichMarkdownEditorProps, "mode">): ReactElement;

export interface HostPageSummary {
  docName: string;
  title: string;
  size: number;
  modified: string;
  docExt: string;
  icon?: string;
  tags?: readonly string[];
}
export interface HostDocumentEntry {
  kind: "document" | "asset" | "folder" | "file";
  path?: string;
  docName?: string;
}
export interface CoreRouteDeps {
  listPages(): Promise<HostPageSummary[]> | HostPageSummary[];
  listDocuments(): Promise<HostDocumentEntry[]> | HostDocumentEntry[];
  suggestions?: {
    listTags(): Promise<{ tag: string; count: number }[]>;
    readDocument(docName: string): Promise<string | null>;
    listBacklinks(docName: string): Promise<{ source: string; title: string }[]>;
  };
}
export type HostRoutes = Record<string, (req: { url: URL; method: string; body: unknown }) => Promise<unknown> | unknown>;
export function coreRoutes(deps: CoreRouteDeps): HostRoutes;
export interface UploadRequest {
  file: File;
  dir: string;
  name: string;
  notePath?: string;
}
export type UploadProvider = (input: UploadRequest) => Promise<{ path: string; deduped?: boolean }>;
export function uploadRoutes(upload: UploadProvider): HostRoutes;

export interface OkHostFeatures {
  lint: false;
  share: false;
  presence: false;
  history: false;
  openWithAi: false;
  linkPreview: boolean;
}
export interface OkHost {
  features: OkHostFeatures;
  openExternal(url: string): void | Promise<void>;
}
export const DEFAULT_FEATURES: OkHostFeatures;

export interface OkRootProps {
  children: ReactNode;
  locale?: string;
  host?: Partial<OkHost>;
  routes?: HostRoutes;
  config?: { wordWrap?: boolean; showHiddenFiles?: boolean; showOnlyMarkdownFiles?: boolean; linkPreviewsEnabled?: boolean };
  poolKey?: string;
  acceptSidebarDrop?: boolean;
  documentHost?: {
    readAsset?(path: string): Promise<Blob>;
    openDocument?(docName: string): void;
    openTarget?(target: { kind: string; docName?: string; folderPath?: string; assetPath?: string }): void;
  };
  className?: string;
  style?: CSSProperties;
}
export function OkRoot(props: OkRootProps): ReactElement | null;
export function dropProvider(docName: string): void;

export interface ReferenceCandidate {
  path: string;
  kind: "file" | "folder";
}
export interface CompactPage {
  path: string;
  title?: string;
}
interface CompactBase {
  id: string;
  pages?: readonly CompactPage[];
  onOpenPath?(path: string): void;
  className?: string;
}
export function CompactMarkdownView(props: CompactBase & { value: string }): ReactElement;
export function CompactMarkdownInput(
  props: CompactBase & { value: string; onChange(text: string): void; onPort?(port: RichEditorPort | null): void; placeholder?: string; ariaLabel?: string; referenceSearch?: (query: string) => readonly ReferenceCandidate[] },
): ReactElement;

// S4 评论宿主
export interface HuhuComment {
  id: string;
  documentPath: string;
  target: "body" | "file" | "property";
  property: string | null;
  anchor: { exact: string; prefix: string; suffix: string; start: number; end: number } | null;
  state: "anchored" | "orphaned";
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  messages: { at: string; author: string; text: string }[];
}
export interface PassageInput {
  quote?: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
}
export interface CommentsPort {
  list(path?: string): Promise<HuhuComment[]>;
  create(input: PassageInput & { path: string; target: "body" | "file" | "property"; property?: string; text: string }): Promise<HuhuComment>;
  reply(id: string, text: string): Promise<HuhuComment>;
  resolve(id: string): Promise<HuhuComment>;
  reopen(id: string): Promise<HuhuComment>;
  relocate(id: string, range: PassageInput): Promise<HuhuComment>;
  delete(id: string): Promise<void>;
}
export interface CommentRouteDeps {
  port: CommentsPort;
  pathOf(docName: string): string;
  docNameOf(path: string): string;
  flush(docName: string): Promise<void>;
}
export function commentRoutes(deps: CommentRouteDeps): HostRoutes;
export function notifyCommentsChanged(): void;
export function startComment(): void;
export function onCommentPosted(handler: () => void): () => void;
export function onCommentThreadOpened(handler: () => void): () => void;
export function dismissOpenCommentThread(): void;
export interface CommentsPanelHostProps {
  docName: string;
  routes: HostRoutes;
  locale?: string;
  readOnly?: boolean;
  readOnlyReason?: string;
  labels: { wholeNote: string; wholeNotePlaceholder: string; add: string };
}
export function CommentsPanelHost(props: CommentsPanelHostProps): ReactElement;
