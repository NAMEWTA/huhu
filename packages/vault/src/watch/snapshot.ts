import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { filesystemIdentity } from "../identity.js";

export const IGNORED_DIRS = new Set([".git", "node_modules", ".huhu", ".agents"]);
export const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);
const HASH_LIMIT = 1024 * 1024;

export interface FileInfo {
  identity: string | null;
  size: number;
  mtimeMs: number;
  /** 仅小文件：内容哈希，用于无 inode 时的重命名配对。 */
  hash: string | null;
}

export function isIgnored(rel: string): boolean {
  const parts = rel.split("/");
  const last = parts[parts.length - 1] ?? "";
  return IGNORED_FILES.has(last) || parts.slice(0, -1).some((p) => IGNORED_DIRS.has(p)) || IGNORED_DIRS.has(last);
}

export function infoOf(abs: string, withHash: boolean): FileInfo | null {
  try {
    const st = statSync(abs, { bigint: true });
    if (!st.isFile()) return null;
    const size = Number(st.size);
    const hash = withHash && size <= HASH_LIMIT ? createHash("sha256").update(readFileSync(abs)).digest("hex").slice(0, 16) : null;
    return { identity: filesystemIdentity(st), size, mtimeMs: Number(st.mtimeMs), hash };
  } catch {
    return null;
  }
}

/** 遍历 Vault，返回相对路径 → 文件信息（忽略 .git/.huhu 等）。 */
export function takeSnapshot(root: string, withHash = true): Map<string, FileInfo> {
  const out = new Map<string, FileInfo>();
  const walk = (dir: string, rel: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (!IGNORED_DIRS.has(ent.name)) walk(path.join(dir, ent.name), childRel);
      } else if (ent.isFile() && !IGNORED_FILES.has(ent.name)) {
        const info = infoOf(path.join(dir, ent.name), withHash);
        if (info) out.set(childRel, info);
      }
    }
  };
  walk(root, "");
  return out;
}
