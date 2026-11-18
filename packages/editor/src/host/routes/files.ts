// hostFetch 的 files 路由（S5）：OK 文件树（FileTree / use-file-tree-listing）发出的 /api 请求 → Huhu 资源能力。
// 数据与写操作由宿主（plugins/notes）通过 FilesRouteDeps 注入；本包不依赖业务模块。
// 隐藏（hiddenPaths）只在 `showAll=true` 的树列举里叠加：`@` / 双链 / 搜索 / 已打开标签走别的数据源，不经过这里（design §5.2）。
import type { HostRoutes } from "../host-fetch";
import { handleUploadForm, type UploadProvider } from "./upload";

/** 宿主返回的目录条目（与 contracts 的 VaultListEntry 同形，但不引入该依赖）。 */
export interface HostFsEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink";
  size?: number;
  mtimeMs?: number;
  protected?: string;
  /** symlink 且目标越界 / 失效 */
  linkOutside?: boolean;
}

export interface HostListResult {
  entries: HostFsEntry[];
  /** 本目录是否还有未列出的条目 */
  truncated?: boolean;
}

export interface FilesRouteDeps {
  /** 列一层（vault.list）。 */
  list(dir: string): Promise<HostListResult>;
  /** 全部可作页面的 Markdown 文件（不受隐藏影响）；用于 PageList / 非 showAll 的 /api/documents。 */
  listDocumentPaths?(): Promise<HostFsEntry[]>;
  /** 当前隐藏规则；仅叠加在树视图。 */
  hiddenPaths(): readonly string[];
  /** “显示已隐藏项目”开关。 */
  showHidden(): boolean;
  rename(input: { kind: "file" | "folder" | "asset"; fromPath: string; toPath: string }): Promise<{ moved: Record<string, string> }>;
  duplicate(input: { kind: "file" | "folder"; path: string }): Promise<{ path: string; paths: string[] }>;
  /** 移入回收站（可恢复）。 */
  trash(input: { kind: "file" | "folder" | "asset"; path: string }): Promise<{ paths: string[] }>;
  createPage(input: { path: string; template?: string }): Promise<{ path: string }>;
  createFolder(input: { path: string }): Promise<{ path: string }>;
  /** 上传：写入 parentDir 下。 */
  upload?: UploadProvider;
  workspace(): { root: string; separator: "/" | "\\" };
}

const MD_EXT = /\.(md|mdx)$/i;

export const docNameOf = (path: string): string => path.replace(MD_EXT, "");
const dirOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const extOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i) : "";
};
const iso = (ms: number | undefined): string => new Date(ms ?? 0).toISOString();

/** 路径或其祖先命中隐藏规则。 */
export function isHidden(path: string, rules: readonly string[]): boolean {
  return rules.some((r) => path === r || path.startsWith(`${r}/`));
}

/** vault.list 条目 → OK 的 DocumentListEntry（见上游 DocumentListEntrySchema 的 refine 约束）。 */
export function toDocumentEntry(e: HostFsEntry): Record<string, unknown> {
  const isSymlink = e.kind === "symlink";
  if (e.kind === "dir" || (isSymlink && e.linkOutside !== true && !/\.[^/.]+$/.test(e.name))) {
    return {
      kind: "folder",
      path: e.path,
      size: e.size ?? 0,
      modified: iso(e.mtimeMs),
      hasChildren: true,
      isSymlink,
      ...(e.protected ? { protected: e.protected } : {}),
    };
  }
  if (MD_EXT.test(e.name)) {
    return {
      kind: "document",
      docName: docNameOf(e.path),
      docExt: extOf(e.name),
      size: e.size ?? 0,
      modified: iso(e.mtimeMs),
      isSymlink,
    };
  }
  return {
    kind: "file",
    path: e.path,
    assetExt: extOf(e.name) || ".bin",
    size: e.size ?? 0,
    modified: iso(e.mtimeMs),
    isSymlink,
  };
}

function pathFromBody(body: unknown, key: string): string {
  const v = (body as Record<string, unknown> | undefined)?.[key];
  if (typeof v !== "string" || v === "") throw new Error(`缺少 ${key}`);
  return v;
}

export function filesRoutes(deps: FilesRouteDeps): HostRoutes {
  // 上游文件请求里 kind:'file' 的路径是 docName（不含扩展名）；按列举过的真实扩展名还原，没见过则按 .md
  const docExt = new Map<string, string>();
  const remember = (entries: readonly HostFsEntry[]): void => {
    for (const e of entries) if (e.kind !== "dir" && MD_EXT.test(e.name)) docExt.set(docNameOf(e.path), extOf(e.name));
  };
  const realFile = (kind: string, p: string): string => {
    if (kind !== "file") return p;
    const known = docExt.get(p);
    if (known !== undefined) return `${p}${known}`;
    return /\.[^/.]+$/.test(p.split("/").at(-1) ?? "") ? p : `${p}.md`;
  };
  const sameExt = (from: string, to: string): string => (MD_EXT.test(to) || /\.[^/.]+$/.test(to.split("/").at(-1) ?? "") ? to : `${to}${extOf(from)}`);
  return {
    "GET /api/documents": async ({ url }) => {
      const showAll = url.searchParams.get("showAll") === "true";
      if (!showAll) {
        const all = (await deps.listDocumentPaths?.()) ?? [];
        remember(all);
        return { documents: all.filter((e) => MD_EXT.test(e.name)).map(toDocumentEntry) };
      }
      const dir = url.searchParams.get("dir") ?? "";
      const { entries, truncated } = await deps.list(dir);
      remember(entries);
      const rules = deps.showHidden() ? [] : deps.hiddenPaths();
      return { documents: entries.filter((e) => !isHidden(e.path, rules)).map(toDocumentEntry), truncated: truncated === true };
    },
    "GET /api/workspace": () => {
      const w = deps.workspace();
      return { contentDir: w.root, pathSeparator: w.separator, symlinkResolved: false };
    },
    "POST /api/rename-path": async ({ body }) => {
      const kind = ((body as { kind?: "file" | "folder" | "asset" }).kind ?? "file") as "file" | "folder" | "asset";
      const fromPath = realFile(kind, pathFromBody(body, "fromPath"));
      const toPath = kind === "file" ? sameExt(fromPath, pathFromBody(body, "toPath")) : pathFromBody(body, "toPath");
      const { moved } = await deps.rename({ kind, fromPath, toPath });
      const renamed: { fromDocName: string; toDocName: string }[] = [];
      const renamedAssets: { fromPath: string; toPath: string }[] = [];
      for (const [from, to] of Object.entries(moved)) {
        if (MD_EXT.test(from)) renamed.push({ fromDocName: docNameOf(from), toDocName: docNameOf(to) });
        else renamedAssets.push({ fromPath: from, toPath: to });
      }
      return { renamed, renamedAssets };
    },
    "POST /api/duplicate-path": async ({ body }) => {
      const kind = ((body as { kind?: "file" | "folder" }).kind ?? "file") as "file" | "folder";
      const r = await deps.duplicate({ kind, path: realFile(kind, pathFromBody(body, "path")) });
      return { kind, path: r.path, duplicatedDocNames: r.paths.filter((p) => MD_EXT.test(p)).map(docNameOf) };
    },
    "POST /api/delete-path": async ({ body }) => {
      const kind = ((body as { kind?: "file" | "folder" | "asset" }).kind ?? "file") as "file" | "folder" | "asset";
      const r = await deps.trash({ kind, path: realFile(kind, pathFromBody(body, "path")) });
      return { deletedDocNames: r.paths.filter((p) => MD_EXT.test(p)).map(docNameOf) };
    },
    // 回收站清理：Huhu 的“永久删除”在回收站列表里完成（需要 trashId），树里没有该入口。
    "POST /api/trash/cleanup": () => ({ deletedDocNames: [] }),
    "POST /api/create-page": async ({ body }) => {
      const path = pathFromBody(body, "path");
      const template = (body as { template?: string }).template;
      const r = await deps.createPage({ path, ...(template ? { template } : {}) });
      return { docName: docNameOf(r.path) };
    },
    "POST /api/upload": ({ body }) => handleUpload(deps, body as FormData),
    "POST /api/create-folder": async ({ body }) => {
      const r = await deps.createFolder({ path: pathFromBody(body, "path") });
      return { path: r.path };
    },
  };
}

/** 树里的“上传”走 FormData，hostFetch 的 JSON 路由收不到文件：单独导出，由宿主在需要时包装 fetch。 */
export function handleUpload(deps: FilesRouteDeps, form: FormData): Promise<{ src: string; path: string; deduped?: boolean }> {
  return handleUploadForm(deps.upload, form);
}

export const __test = { dirOf };
