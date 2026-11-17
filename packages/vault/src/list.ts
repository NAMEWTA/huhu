import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { errors, type ProtectedKind, type VaultListEntry, type VaultListOutput, VAULT_LIST_DEFAULT_LIMIT } from "@huhu/contracts";
import { resolveInVault } from "./paths.js";

const PROTECTED_BY_NAME: Record<string, ProtectedKind> = { ".huhu": "internal", ".git": "git", node_modules: "dependency", ".agents": "agents" };
const NOISE_FILES = new Set([".DS_Store", "Thumbs.db"]);

/** 路径任一段命中受保护目录名即为受保护。 */
export function protectedKindOf(rel: string): ProtectedKind | undefined {
  for (const seg of rel.split("/")) {
    const k = PROTECTED_BY_NAME[seg];
    if (k) return k;
  }
  return undefined;
}

export interface ListDirOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  includeProtected?: boolean | undefined;
}

const rank = (e: VaultListEntry) => (e.kind === "dir" ? 0 : 1);
const sortKey = (e: VaultListEntry) => `${rank(e)}:${e.name}`;

/**
 * 列举一个目录的直接子项（读真实文件系统：点目录、未知扩展名、空目录照常返回；
 * 与监听忽略表（snapshot IGNORED_DIRS）、内容索引范围互相独立）。
 * 路径守卫 + 符号链接 realpath：越界 / 失效 / 循环的链接返回 `kind:'symlink'` 且 `linkTarget.inside=false`，不跟随。
 * 排序：目录在前，其后按名称码点序；游标 = 上一页最后一项的排序键，目录变化时仍稳定。
 */
export function listDir(vaultRoot: string, dir: string, opts: ListDirOptions = {}): VaultListOutput {
  const limit = opts.limit ?? VAULT_LIST_DEFAULT_LIMIT;
  const includeProtected = opts.includeProtected ?? false;
  const rel = dir
    .split("/")
    .filter((p) => p !== "" && p !== ".")
    .join("/");
  const root = realpathSync(vaultRoot);
  const abs = rel === "" ? root : resolveInVault(vaultRoot, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    throw errors.notFound(`目录不存在：${rel || "/"}`);
  }
  if (!st.isDirectory()) throw errors.invalidInput(`不是目录：${rel}`);
  const rootSep = root.endsWith(path.sep) ? root : root + path.sep;
  const dirProtected = rel === "" ? undefined : protectedKindOf(rel);
  if (dirProtected && !includeProtected) throw errors.invalidInput(`受保护目录：${rel}`);

  const all: VaultListEntry[] = [];
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    if (NOISE_FILES.has(ent.name)) continue;
    const childRel = rel === "" ? ent.name : `${rel}/${ent.name}`;
    const prot = dirProtected ?? protectedKindOf(childRel);
    if (prot && !includeProtected) continue;
    const p = path.join(abs, ent.name);
    let entry: VaultListEntry;
    try {
      const l = lstatSync(p);
      if (l.isSymbolicLink()) {
        let inside = false;
        let kind: "file" | "dir" | null = null;
        let size: number | undefined;
        let mtimeMs: number | undefined;
        try {
          const real = realpathSync(p);
          inside = real === root || real.startsWith(rootSep);
          if (inside) {
            const s = statSync(real);
            kind = s.isDirectory() ? "dir" : s.isFile() ? "file" : null;
            if (kind === "file") {
              size = s.size;
              mtimeMs = s.mtimeMs;
            }
          }
        } catch {
          inside = false; // 失效或循环
        }
        // 目标在 Vault 内：按目标类型展示（仍带 linkTarget 标明是链接）；否则保持 symlink，不跟随
        entry = { name: ent.name, path: childRel, kind: inside && kind ? kind : "symlink", linkTarget: { inside }, ...(size !== undefined ? { size } : {}), ...(mtimeMs !== undefined ? { mtimeMs } : {}) };
      } else if (l.isDirectory()) {
        entry = { name: ent.name, path: childRel, kind: "dir", mtimeMs: l.mtimeMs };
      } else if (l.isFile()) {
        entry = { name: ent.name, path: childRel, kind: "file", size: l.size, mtimeMs: l.mtimeMs };
      } else continue; // 套接字等：不列
    } catch {
      continue; // 刚被删除
    }
    if (prot) entry = { ...entry, protected: prot };
    all.push(entry);
  }
  all.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  let start = 0;
  if (opts.cursor !== undefined) {
    const after = opts.cursor;
    start = all.findIndex((e) => sortKey(e) > after);
    if (start < 0) start = all.length;
  }
  const page = all.slice(start, start + limit);
  const last = page[page.length - 1];
  const done = start + page.length >= all.length;
  const out: VaultListOutput = { entries: page };
  if (!done && last) out.nextCursor = sortKey(last);
  if (done) {
    out.total = all.length;
    out.counts = { files: all.filter((e) => e.kind !== "dir").length, dirs: all.filter((e) => e.kind === "dir").length };
  }
  return out;
}
