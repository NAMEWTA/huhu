import type { VaultListEntry, VaultListOutput } from "@huhu/contracts";
import { attachFile } from "../attach.js";

/** 资源管理器的宿主依赖（OK 文件树 → Huhu 能力）。纯逻辑，可单测；React 与 vendor 都不在这里。 */
export interface EngineLike {
  call<T>(capability: string, input?: unknown, opts?: { write?: boolean }): Promise<T>;
}

export interface HostFsEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "symlink";
  size?: number;
  mtimeMs?: number;
  protected?: string;
  linkOutside?: boolean;
  linkCycle?: boolean;
}

export interface ListedDirState {
  entries: { path: string; kind: "file" | "dir" | "symlink" }[];
  truncated: boolean;
}

export interface FilesDepsOptions {
  engine: EngineLike;
  getHidden(): readonly string[];
  getShowHidden(): boolean;
  /** A08：移动 / 重命名 / 复制 / 删除之前，把打开着的相关文档落盘；返回 false 表示失败（不继续、不丢草稿）。 */
  beforeMutate(paths: string[]): Promise<boolean>;
  holdOpenPaths?<T>(from: string, move: () => Promise<T>): Promise<T>;
  /** 内部改名 / 移动完成：标签、选中项、展开状态据此重定位。 */
  onMoved(moved: Record<string, string>): void;
  /** 移到回收站完成（用于“撤销”横幅）。 */
  onTrashed?(path: string, trashId: string): void;
  /** 一层列举完成（计数用）。 */
  onListed?(dir: string, state: ListedDirState): void;
  getRoot(): string;
}

/** 单层分页上限：2000 条 × 10 页；超出标“已加载”，不冒充完整（A09）。 */
export const LIST_PAGE_LIMIT = 2000;
export const LIST_MAX_PAGES = 10;

const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseOf = (p: string): string => p.split("/").at(-1) ?? p;
const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);

export function noteTemplateInput(template: string) {
  return ["blank", "meeting", "project", "daily"].includes(template) ? { template } : { templatePath: template };
}

/** 把“先移动、再改名”两步的结果合成 from → to。 */
export function composeMoves(first: Record<string, string>, second: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [a, b] of Object.entries(first)) out[a] = second[b] ?? b;
  for (const [a, b] of Object.entries(second)) if (!Object.values(first).includes(a)) out[a] = b;
  return out;
}

const toFs = (e: VaultListEntry): HostFsEntry => ({
  name: e.name,
  path: e.path,
  kind: e.kind,
  ...(e.size !== undefined ? { size: e.size } : {}),
  ...(e.mtimeMs !== undefined ? { mtimeMs: e.mtimeMs } : {}),
  ...(e.protected ? { protected: e.protected } : {}),
  ...(e.linkTarget && !e.linkTarget.inside ? { linkOutside: true } : {}),
  ...(e.linkTarget?.cycle ? { linkCycle: true } : {}),
});

export function createFilesDeps(o: FilesDepsOptions) {
  const ensureFlushed = async (paths: string[]): Promise<void> => {
    if (!(await o.beforeMutate(paths))) throw new Error("打开的文档有未保存的修改且无法落盘，已取消操作（草稿未丢失）");
  };
  return {
    async list(dir: string) {
      const entries: HostFsEntry[] = [];
      let cursor: string | undefined;
      let truncated = false;
      for (let page = 0; page < LIST_MAX_PAGES; page++) {
        const r = await o.engine.call<VaultListOutput>("vault.list", { dir, includeProtected: true, limit: LIST_PAGE_LIMIT, ...(cursor ? { cursor } : {}) });
        entries.push(...r.entries.map(toFs));
        cursor = r.nextCursor;
        if (!cursor) break;
        if (page === LIST_MAX_PAGES - 1) truncated = true;
      }
      o.onListed?.(dir, { entries: entries.map((e) => ({ path: e.path, kind: e.kind })), truncated });
      return { entries, truncated };
    },
    async listDocumentPaths(): Promise<HostFsEntry[]> {
      const notes = await o.engine.call<{ path: string }[]>("notes.list", { filter: "all" });
      return notes.map((n) => ({ name: baseOf(n.path), path: n.path, kind: "file" as const }));
    },
    hiddenPaths: () => o.getHidden(),
    showHidden: () => o.getShowHidden(),
    async rename(i: { kind: "file" | "folder" | "asset"; fromPath: string; toPath: string }) {
      const rename = async () => {
        await ensureFlushed([i.fromPath]);
        let moved: Record<string, string> = {};
        let cur = i.fromPath;
        try {
          if (dirOf(i.fromPath) !== dirOf(i.toPath)) {
            const r = await o.engine.call<{ moved: Record<string, string> }>("notes.move", { path: cur, targetDir: dirOf(i.toPath) }, { write: true });
            moved = r.moved;
            cur = join(dirOf(i.toPath), baseOf(i.fromPath));
          }
          if (baseOf(cur) !== baseOf(i.toPath)) {
            const r = await o.engine.call<{ moved: Record<string, string> }>("notes.rename", { path: cur, newName: baseOf(i.toPath) }, { write: true });
            moved = composeMoves(moved, r.moved);
          }
          return { moved };
        } finally {
          if (Object.keys(moved).length) o.onMoved(moved);
        }
      };
      return o.holdOpenPaths ? o.holdOpenPaths(i.fromPath, rename) : rename();
    },
    async duplicate(i: { kind: "file" | "folder" | "asset"; path: string }) {
      await ensureFlushed([i.path]);
      const r = await o.engine.call<{ path: string; paths?: string[] }>("notes.duplicate", { path: i.path }, { write: true });
      return { path: r.path, paths: r.paths ?? [r.path] };
    },
    async trash(i: { kind: "file" | "folder" | "asset"; path: string }) {
      await ensureFlushed([i.path]);
      const r = await o.engine.call<{ trashId: string }>("notes.trash", { path: i.path }, { write: true });
      o.onTrashed?.(i.path, r.trashId);
      return { paths: [i.path] };
    },
    listTemplates: () => o.engine.call<string[]>("notes.templates.list"),
    importTemplate: (sourcePath: string) => o.engine.call<{ path: string }>("notes.templates.import", { path: sourcePath }, { write: true }),
    async createPage(i: { path: string; template?: string }) {
      const name = baseOf(i.path);
      if (/\.[A-Za-z0-9]+$/.test(name) && !/\.(md|mdx)$/i.test(name)) throw new Error("目前只能创建 Markdown 笔记（.md）");
      const folder = dirOf(i.path);
      const template = i.template ? noteTemplateInput(i.template) : {};
      const r = await o.engine.call<{ path: string }>("notes.create", { name: name.replace(/\.(md|mdx)$/i, ""), ...(folder ? { folder } : {}), ...template }, { write: true });
      return { path: r.path };
    },
    async createFolder(i: { path: string }) {
      await o.engine.call("folders.create", { path: i.path }, { write: true });
      return { path: i.path };
    },
    async upload(i: { file: File; dir: string; name: string; notePath?: string }) {
      const r = await attachFile(o.engine, { file: i.file, name: i.name, ...(i.notePath ? { notePath: i.notePath } : { dir: i.dir }) });
      return { path: r.path, ...(r.deduped ? { deduped: true } : {}) };
    },
    workspace: () => ({ root: o.getRoot(), separator: "/" as const }),
  };
}
