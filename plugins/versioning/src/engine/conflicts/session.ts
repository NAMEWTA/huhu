import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface Stage {
  mode: string;
  oid: string;
}
export interface ConflictFile {
  path: string;
  base: Stage | null;
  ours: Stage | null;
  theirs: Stage | null;
}

/**
 * 冲突会话：只记录提交与 blob 的 OID（不存笔记内容，避免在 .huhu/sync/ 多留一份明文）。
 * 内容在读取冲突时由 git 对象库现算。
 */
export interface ConflictSession {
  id: string;
  createdAt: string;
  localHead: string;
  remoteHead: string;
  remoteRef: string;
  files: ConflictFile[];
}

const file = (root: string) => path.join(root, ".huhu", "sync", "conflict.json");

export function loadSession(root: string): ConflictSession | null {
  try {
    const s = JSON.parse(readFileSync(file(root), "utf8")) as ConflictSession;
    return s && typeof s.id === "string" && Array.isArray(s.files) ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(root: string, s: ConflictSession): void {
  const f = file(root);
  mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, f);
}

export function clearSession(root: string): boolean {
  const had = existsSync(file(root));
  rmSync(file(root), { force: true });
  return had;
}

/** 解析 `merge-tree --write-tree -z` 的输出：首项为树 OID；随后是 `mode oid stage\tpath` 条目，空项结束。 */
export function parseMergeTree(stdout: string): { tree: string; files: ConflictFile[] } {
  const parts = stdout.split("\0");
  const tree = parts[0] ?? "";
  const byPath = new Map<string, ConflictFile>();
  for (let i = 1; i < parts.length && parts[i] !== ""; i++) {
    const m = /^(\d+) ([0-9a-f]+) ([123])\t([\s\S]*)$/.exec(parts[i] as string);
    if (!m) continue;
    const [, mode, oid, stage, p] = m as unknown as [string, string, string, string, string];
    const f = byPath.get(p) ?? { path: p, base: null, ours: null, theirs: null };
    f[stage === "1" ? "base" : stage === "2" ? "ours" : "theirs"] = { mode, oid };
    byPath.set(p, f);
  }
  return { tree, files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}

/** `merge-tree --name-only -z` 的冲突文件名集合。 */
export function parseConflictNames(stdout: string): string[] {
  const parts = stdout.split("\0");
  const names: string[] = [];
  for (let i = 1; i < parts.length && parts[i] !== ""; i++) names.push(parts[i] as string);
  return names.sort((a, b) => a.localeCompare(b));
}
