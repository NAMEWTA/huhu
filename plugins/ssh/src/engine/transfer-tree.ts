import { lstat, mkdir, opendir, realpath, rename, rmdir, utimes } from "node:fs/promises";
import path from "node:path";
import { errors } from "@huhu/contracts";
import type { FileEntryWithStats, SFTPWrapper, Stats } from "ssh2";
import { normalizeRemote, realpath as remoteRealpath } from "./sftp.js";
import { localTransferFile } from "./transfer-io.js";

type Kind = "dir" | "file" | "other";
export interface TreeStat {
  kind: Kind;
  size: number;
  mtime: number;
  mode: number;
  identity?: string;
}
export interface TransferTree {
  path(parts: readonly string[]): string;
  stat(parts: readonly string[]): Promise<TreeStat | null>;
  names(parts: readonly string[]): AsyncIterable<string>;
  mkdir(parts: readonly string[]): Promise<void>;
  touchDirectory(parts: readonly string[], mtime: number): Promise<void>;
  moveDirectory(source: readonly string[], target: readonly string[]): Promise<void>;
  rmdir(parts: readonly string[]): Promise<void>;
}
export type TreeItem = { parts: string[]; stat?: TreeStat; error?: string; parent?: TreeItem };

const call = <T>(op: (callback: (error?: Error | null, value?: T) => void) => void): Promise<T> => new Promise((resolve, reject) => op((error, value) => (error ? reject(error) : resolve(value as T))));
const status = (e: unknown) => (e as { code?: number | string })?.code;

export function safeTreeName(name: string): boolean {
  return (
    Boolean(name) &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !/[<>:"|?*]|[ .]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
    ![...name].some((character) => character.charCodeAt(0) < 32) &&
    !name.startsWith(".huhu-transfer-")
  );
}

export function localTree(root: string): TransferTree {
  // Reuse the Windows path/name guard for the supplied absolute base.
  const base = path.dirname(localTransferFile(path.join(root, ".huhu-directory-probe")).path);
  const at = (parts: readonly string[]) => path.join(base, ...parts);
  const guard = async (file: string) => {
    if ((await realpath(file)).toLowerCase() !== file.toLowerCase()) throw errors.invalidInput("目录经过链接或已变更");
  };
  return {
    path: at,
    async stat(parts) {
      const file = at(parts);
      try {
        const stat = await lstat(file);
        const kind = stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
        if (kind === "dir") await guard(file);
        else await guard(path.dirname(file));
        return { kind, size: stat.size, mtime: stat.mtimeMs, mode: stat.mode & 0o7777, identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` };
      } catch (error) {
        if (status(error) === "ENOENT") return null;
        throw error;
      }
    },
    async *names(parts) {
      const dir = at(parts);
      await guard(dir);
      for await (const item of await opendir(dir)) yield item.name;
    },
    async mkdir(parts) {
      const file = at(parts);
      await guard(path.dirname(file));
      await mkdir(file);
    },
    async touchDirectory(parts, mtime) {
      const file = at(parts);
      await guard(file);
      const stamp = new Date(mtime);
      await utimes(file, stamp, stamp);
    },
    async moveDirectory(source, target) {
      await guard(at(source));
      await guard(path.dirname(at(target)));
      await rename(at(source), at(target));
    },
    async rmdir(parts) {
      await guard(path.dirname(at(parts)));
      await rmdir(at(parts));
    },
  };
}

export function remoteTree(channel: SFTPWrapper, root: string): TransferTree {
  if (!root.startsWith("/") || root.split("/").includes("..")) throw errors.invalidInput("远端目录必须是绝对路径");
  const base = normalizeRemote(root);
  const at = (parts: readonly string[]) => path.posix.join(base, ...parts);
  const guard = async (file: string) => {
    if ((await remoteRealpath(channel, file)) !== file) throw errors.invalidInput("远端目录经过链接或已变更");
  };
  return {
    path: at,
    async stat(parts) {
      const file = at(parts);
      try {
        const stat = await call<Stats>((callback) => channel.lstat(file, callback));
        const type = stat.mode & 0o170000;
        const kind = type === 0o040000 ? "dir" : type === 0o100000 ? "file" : "other";
        if (kind === "dir") await guard(file);
        else await guard(path.posix.dirname(file));
        return { kind, size: stat.size, mtime: stat.mtime * 1000, mode: stat.mode & 0o7777 };
      } catch (error) {
        if (status(error) === 2) return null;
        throw error;
      }
    },
    async *names(parts) {
      const dir = at(parts);
      await guard(dir);
      const handle = await call<Buffer>((callback) => channel.opendir(dir, callback));
      try {
        for (;;) {
          const entries = await call<FileEntryWithStats[]>((callback) => channel.readdir(handle, (error, rows) => (status(error) === 1 ? callback(undefined, []) : callback(error, rows))));
          if (entries.length === 0) break;
          for (const row of entries) if (row.filename !== "." && row.filename !== "..") yield row.filename;
        }
      } finally {
        await call<void>((callback) => channel.close(handle, callback)).catch(() => undefined);
      }
    },
    async mkdir(parts) {
      const file = at(parts);
      await guard(path.posix.dirname(file));
      await call<void>((callback) => channel.mkdir(file, callback));
    },
    async touchDirectory(parts, mtime) {
      const file = at(parts);
      await guard(file);
      const stamp = Math.floor(mtime / 1000);
      await call<void>((callback) => channel.setstat(file, { atime: stamp, mtime: stamp }, callback));
    },
    async moveDirectory(source, target) {
      await guard(at(source));
      await guard(path.posix.dirname(at(target)));
      await call<void>((callback) => channel.rename(at(source), at(target), callback));
    },
    async rmdir(parts) {
      await guard(path.posix.dirname(at(parts)));
      await call<void>((callback) => channel.rmdir(at(parts), callback));
    },
  };
}

export async function scanTree(tree: TransferTree, selected: string[], limit: number, caseInsensitive: boolean, signal: AbortSignal): Promise<TreeItem[]> {
  if ((await tree.stat([]))?.kind !== "dir") throw errors.invalidInput("来源目录不存在或不可用");
  const items: TreeItem[] = [];
  const seen = new Set<string>();
  const capacity = errors.invalidInput("目录展开超过当前任务容量或深度上限");
  async function visit(name: string, parent?: TreeItem): Promise<void> {
    signal.throwIfAborted();
    const parts = [...(parent?.parts ?? []), name];
    if (items.length >= limit || parts.length > 16) throw capacity;
    const item: TreeItem = { parts, ...(parent ? { parent } : {}) };
    items.push(item);
    if (!safeTreeName(name)) {
      item.error = "名称无法安全映射到目标";
      return;
    }
    const coordinate = parts.join("/");
    const key = caseInsensitive ? coordinate.toLowerCase() : coordinate;
    if (seen.has(key)) {
      item.error = "多个条目会映射到同一目标";
      return;
    }
    seen.add(key);
    try {
      const stat = await tree.stat(parts);
      if (stat) item.stat = stat;
    } catch (error) {
      item.error = error instanceof Error ? error.message : "无法核对源条目";
      return;
    }
    if (!item.stat || item.stat.kind === "other") {
      item.error = "源条目已移除或是非普通文件，未遍历链接";
      return;
    }
    if (item.stat.kind === "dir") {
      // Enumerate separately so a capacity failure propagates before any job is created.
      try {
        for await (const child of tree.names(parts)) await visit(child, item);
      } catch (error) {
        if (error === capacity || signal.aborted) throw error;
        item.error = error instanceof Error ? error.message : "无法读取子目录";
      }
    }
  }
  for (const name of selected) await visit(name);
  return items;
}

export function sameDirectory(a: TreeStat | null, b: TreeStat | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === "dir" && b.kind === "dir" && a.mode === b.mode && a.mtime === b.mtime && a.identity === b.identity;
}
