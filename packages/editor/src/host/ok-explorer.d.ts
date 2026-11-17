// `@huhu/editor/ok-explorer` 的公共类型（package.json exports 的 "types" 条件指向这里）。
// 实现（explorer.tsx）依赖 Vite 的 `@/` 别名与 Lingui 宏，只能被 vendor tsconfig 检查；消费者（plugins/notes）靠这份声明获得类型。
import type { ComponentType } from "react";

export interface HostFsEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink";
  size?: number;
  mtimeMs?: number;
  protected?: string;
  linkOutside?: boolean;
}

export interface FilesRouteDeps {
  list(dir: string): Promise<{ entries: HostFsEntry[]; truncated?: boolean }>;
  listDocumentPaths?(): Promise<HostFsEntry[]>;
  hiddenPaths(): readonly string[];
  showHidden(): boolean;
  rename(input: { kind: "file" | "folder" | "asset"; fromPath: string; toPath: string }): Promise<{ moved: Record<string, string> }>;
  duplicate(input: { kind: "file" | "folder"; path: string }): Promise<{ path: string; paths: string[] }>;
  trash(input: { kind: "file" | "folder" | "asset"; path: string }): Promise<{ paths: string[] }>;
  createPage(input: { path: string; template?: string }): Promise<{ path: string }>;
  createFolder(input: { path: string }): Promise<{ path: string }>;
  upload?(input: { file: File; dir: string; name: string }): Promise<{ path: string; deduped?: boolean }>;
  workspace(): { root: string; separator: "/" | "\\" };
}

export interface OkExplorerProps {
  deps: FilesRouteDeps;
  onOpen(target: { kind: "file" | "folder" | "asset"; path: string }): void;
  onHide(path: string, kind: "file" | "folder"): void | Promise<void>;
  locale?: "en" | "zh-Hans";
  refreshToken?: number;
  mode?: "light" | "dark";
  menuItems?: (path: string, kind: "file" | "folder") => readonly { id: string; label: string; onSelect: () => void }[];
  activePath?: string | null;
}

export const OkExplorer: ComponentType<OkExplorerProps>;
export function notifyExplorerChanged(): void;
