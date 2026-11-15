// `@huhu/editor/rich` 的公开类型面（手写）：消费者（plugins/*）用严格的工作区 tsconfig 检查，
// 不应穿过去检查 vendor 源码（vendor 走 tsconfig.vendor.json，OP-D15）。实现见 ./index.ts，改动需同步。
import type { EditorPort } from "@huhu/contracts";
import type { CSSProperties, ReactElement, ReactNode } from "react";

export type EditorViewMode = "rich" | "source" | "read";
export type EditorVariant = "document" | "compact";

export interface RichEditorPort extends EditorPort {
  getSourceSelection(): { from: number; to: number; text: string } | null;
  setSourceSelection(from: number, to?: number): void;
  gotoLine(line: number): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface RichMarkdownEditorProps {
  docName: string;
  value: string;
  onChange(text: string): void;
  mode?: EditorViewMode;
  variant?: EditorVariant;
  readOnly?: boolean;
  placeholder?: string;
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
}
export interface HostDocumentEntry {
  kind: "document" | "asset" | "folder" | "file";
  path?: string;
  docName?: string;
}
export interface CoreRouteDeps {
  listPages(): Promise<HostPageSummary[]> | HostPageSummary[];
  listDocuments(): Promise<HostDocumentEntry[]> | HostDocumentEntry[];
}
export type HostRoutes = Record<string, (req: { url: URL; method: string; body: unknown }) => Promise<unknown> | unknown>;
export function coreRoutes(deps: CoreRouteDeps): HostRoutes;

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
  documentHost?: {
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
  props: CompactBase & { value: string; onChange(text: string): void; placeholder?: string; referenceSearch?: (query: string) => readonly ReferenceCandidate[] },
): ReactElement;
