import { closeSync, existsSync, openSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** 各 Agent CLI 原生保存的历史会话（只读扫描；路径与格式见 Orca 的 ai-vault 扫描器）。 */
export interface HistoryEntry {
  provider: "claude" | "codex";
  /** provider 自己的会话 id，恢复时原样交给 CLI。 */
  nativeSessionId: string;
  cwd: string;
  title: string;
  updatedAt: string;
}

export interface ScanOptions {
  /** 只返回 cwd 在这些目录之内（含自身）的会话。 */
  roots: string[];
  home?: string;
  env?: NodeJS.ProcessEnv;
  limit?: number;
}

export interface ScanResult { entries: HistoryEntry[]; skipped: number }

/** 每个文件最多读取的头部字节与行数：标题与 cwd 都在会话开头附近。 */
const HEAD_BYTES = 512 * 1024;
const HEAD_LINES = 400;
const MAX_FILES = 2000;
const TITLE_CHARS = 120;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** 路径是否在 root 之内（含自身）；名字以 .. 开头的目录不算越界。 */
export function isWithin(root: string, target: string): boolean {
  return within(root, target);
}

export function isValidNativeId(id: string): boolean {
  return ID_RE.test(id);
}

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function within(root: string, cwd: string): boolean {
  const rel = path.relative(root, cwd);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function headLines(file: string): string[] {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    const lines = buf.subarray(0, n).toString("utf8").split("\n");
    if (n === HEAD_BYTES) lines.pop(); // 最后一行可能被截断
    return lines.slice(0, HEAD_LINES);
  } finally {
    closeSync(fd);
  }
}

function parse(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const v = JSON.parse(line) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function cleanTitle(s: string): string | null {
  const t = s.replace(/\s+/g, " ").trim();
  // 命令/系统包装、环境注入不是用户的提问
  if (!t || t.startsWith("<") || t.startsWith("# AGENTS.md") || t.startsWith("Caveat:")) return null;
  return t.length > TITLE_CHARS ? `${t.slice(0, TITLE_CHARS)}…` : t;
}

function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const b of content) {
      const r = obj(b);
      const t = r && (r["type"] === "text" || r["type"] === "input_text") ? str(r["text"]) : null;
      if (t) return t;
    }
  }
  return null;
}

interface Parsed { id: string | null; cwd: string | null; title: string | null }

function parseClaude(file: string): Parsed {
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of headLines(file)) {
    const r = parse(line);
    if (!r) continue;
    cwd ??= str(r["cwd"]);
    if (!title && r["type"] === "user" && r["isMeta"] !== true && r["isSidechain"] !== true) {
      const m = obj(r["message"]);
      const t = m ? textOf(m["content"]) : null;
      title = t ? cleanTitle(t) : null;
    }
    if (cwd && title) break;
  }
  return { id: null, cwd, title }; // claude 的会话 id 以文件名为准：恢复出来的会话文件里会带着旧会话的 sessionId
}

function parseCodex(file: string): Parsed {
  let id: string | null = null;
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of headLines(file)) {
    const r = parse(line);
    if (!r) continue;
    const p = obj(r["payload"]);
    if (!p) continue;
    if (r["type"] === "session_meta") {
      id ??= str(p["id"]) ?? str(p["session_id"]);
      cwd ??= str(p["cwd"]);
    } else if (!title && r["type"] === "event_msg" && p["type"] === "user_message") {
      title = cleanTitle(str(p["message"]) ?? "") ?? null;
    } else if (!title && r["type"] === "response_item" && p["type"] === "message" && p["role"] === "user") {
      const t = textOf(p["content"]);
      title = t ? cleanTitle(t) : null;
    }
    if (id && cwd && title) break;
  }
  return { id, cwd, title };
}

function claudeRoot(env: NodeJS.ProcessEnv, home: string): string {
  return path.join(env["CLAUDE_CONFIG_DIR"] || path.join(home, ".claude"), "projects");
}

function codexRoot(env: NodeJS.ProcessEnv, home: string): string {
  return path.join(env["CODEX_HOME"] || path.join(home, ".codex"), "sessions");
}

/** claude 按 cwd 把非字母数字字符替换为 - 作为 projects 下的目录名。 */
function encodeClaudeBucket(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/** 目录读取失败（权限、不是目录）不中断扫描。 */
function readdirSafe(dir: string): import("node:fs").Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function* walkCodex(dir: string, depth = 0): Generator<string> {
  if (depth > 5 || !existsSync(dir)) return;
  for (const e of readdirSafe(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkCodex(p, depth + 1);
    else if (e.isFile() && e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) yield p;
  }
}

/** 扫描 claude 与 codex 的历史会话；解析失败的文件计入 skipped，不中断。 */
export function scanHistory(o: ScanOptions): ScanResult {
  const env = o.env ?? process.env;
  const home = o.home ?? os.homedir();
  const roots = o.roots.map(real);
  const entries: HistoryEntry[] = [];
  let skipped = 0;
  const accept = (provider: HistoryEntry["provider"], p: Parsed, fallbackId: string | null, mtime: Date) => {
    const id = p.id ?? fallbackId;
    if (!id || !p.cwd || !isValidNativeId(id)) { skipped++; return; }
    const cwd = real(p.cwd);
    if (!roots.some((r) => within(r, cwd))) return;
    if (!existsSync(cwd)) return; // 目录已被删除：无法在原处恢复，不列出
    entries.push({ provider, nativeSessionId: id, cwd, title: p.title ?? "（无标题）", updatedAt: mtime.toISOString() });
  };

  // claude：只看目录名以某个 root（含未解析的原始路径，Claude 可能经符号链接启动）的编码开头的 bucket；按修改时间取最近的若干文件
  const cRoot = claudeRoot(env, home);
  if (existsSync(cRoot)) {
    const prefixes = [...new Set([...o.roots, ...roots].map(encodeClaudeBucket))];
    const cFiles: { file: string; id: string; mtime: Date }[] = [];
    for (const b of readdirSafe(cRoot)) {
      if (!b.isDirectory()) continue;
      // 超长路径的 bucket 名被截断并附带哈希，无法按前缀过滤时逐个解析
      if (b.name.length < 200 && !prefixes.some((p) => b.name.startsWith(p))) continue;
      const dir = path.join(cRoot, b.name);
      for (const f of readdirSafe(dir)) {
        if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
        const file = path.join(dir, f.name);
        try { cFiles.push({ file, id: f.name.slice(0, -".jsonl".length), mtime: statSync(file).mtime }); } catch { skipped++; }
      }
    }
    cFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    for (const { file, id, mtime } of cFiles.slice(0, MAX_FILES)) {
      try {
        accept("claude", parseClaude(file), id, mtime);
      } catch {
        skipped++;
      }
    }
  }

  // codex：按修改时间取最近的若干文件
  const xRoot = codexRoot(env, home);
  const files: { file: string; mtime: Date }[] = [];
  for (const file of walkCodex(xRoot)) {
    try { files.push({ file, mtime: statSync(file).mtime }); } catch { skipped++; }
  }
  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  for (const { file, mtime } of files.slice(0, MAX_FILES)) {
    try {
      accept("codex", parseCodex(file), null, mtime);
    } catch {
      skipped++;
    }
  }

  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { entries: o.limit ? entries.slice(0, o.limit) : entries, skipped };
}
