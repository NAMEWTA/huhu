import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, statSync, type BigIntStats } from "node:fs";
import { filesystemIdentity } from "@huhu/vault";
import os from "node:os";
import path from "node:path";

/** 各 Agent CLI 原生保存的历史会话（只读扫描；路径与格式见 Orca 的 ai-vault 扫描器）。 */
export interface HistoryEntry {
  provider: "claude" | "codex" | "pi";
  historyId: string;
  /** Legacy bookmark key. It describes a location, not a physical file. */
  legacyHistoryId: string;
  revision: string;
  /** provider 自己的会话 id，恢复时原样交给 CLI。 */
  nativeSessionId: string;
  cwd: string;
  title: string;
  updatedAt: string;
  /** 原生记录文件（仅引擎内部使用，不经能力返回）。 */
  file: string;
}

export interface ScanOptions {
  /** 只返回 cwd 在这些目录之内（含自身）的会话。 */
  roots: string[];
  home?: string;
  env?: NodeJS.ProcessEnv;
  limit?: number;
}

export interface ScanResult {
  entries: HistoryEntry[];
  skipped: number;
  limitedProviders: HistoryEntry["provider"][];
}

/** 每个文件最多读取的头部字节与行数：标题与 cwd 都在会话开头附近。 */
const HEAD_BYTES = 512 * 1024;
const HEAD_LINES = 400;
const MAX_FILES = 2000;
const TITLE_CHARS = 120;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CODEX_FILE_ID = /-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.jsonl$/i;

export type UuidHistoryProvider = "claude" | "codex";
export type SelectedHistorySource = Pick<HistoryEntry, "provider" | "nativeSessionId" | "file" | "historyId" | "cwd"> & { revision?: string | undefined };

export function isUuidHistoryId(id: string): boolean {
  return UUID_RE.test(id);
}

export function historyProfileKey(provider: UuidHistoryProvider): "CLAUDE_CONFIG_DIR" | "CODEX_HOME" {
  return provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
}

export function nativeHistoryProfile(provider: UuidHistoryProvider, env: NodeJS.ProcessEnv, home = os.homedir()): string | undefined {
  const dir = env[historyProfileKey(provider)] || path.join(home, provider === "claude" ? ".claude" : ".codex");
  if (!path.isAbsolute(dir)) return undefined;
  try {
    return statSync(dir).isDirectory() ? realpathSync(dir) : undefined;
  } catch {
    return undefined;
  }
}

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

function headLines(fd: number): string[] {
  const buf = Buffer.alloc(HEAD_BYTES);
  const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
  const lines = buf.subarray(0, n).toString("utf8").split("\n");
  if (n === HEAD_BYTES) lines.pop(); // 最后一行可能被截断
  return lines.slice(0, HEAD_LINES);
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

interface Parsed {
  id: string | null;
  cwd: string | null;
  title: string | null;
}

function parseClaude(fd: number): Parsed {
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of headLines(fd)) {
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

function parseCodex(fd: number): Parsed {
  let id: string | null = null;
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of headLines(fd)) {
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

function parsePi(fd: number): Parsed {
  const [first = "", ...entries] = headLines(fd);
  const header = parse(first);
  const cwd = header?.["type"] === "session" ? str(header["cwd"]) : null;
  const id = cwd && path.isAbsolute(cwd) ? str(header?.["id"]) : null;
  let title: string | null = null;
  if (id) {
    for (const line of entries) {
      const event = parse(line);
      const message = event?.["type"] === "message" ? obj(event["message"]) : null;
      if (message?.["role"] !== "user") continue;
      title = cleanTitle(textOf(message["content"]) ?? "");
      if (title) break;
    }
  }
  return { id, cwd, title };
}

const parsers = { claude: parseClaude, codex: parseCodex, pi: parsePi };

function sourceStamp(stat: BigIntStats) {
  const fileId = stat.isFile() && filesystemIdentity(stat);
  if (!fileId) throw new Error("Native history file identity is unavailable");
  const physical = `${fileId}:${stat.birthtimeNs}`;
  const revision = createHash("sha256").update([physical, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":")).digest("hex");
  return { physical, revision, updatedAt: stat.mtime.toISOString() };
}

function useHistorySource<T>(file: string, inspect: (fd: number, stamp: ReturnType<typeof sourceStamp>) => T, expectedRevision?: string): T {
  if (realpathSync(file) !== file) throw new Error("Native history path is no longer canonical");
  const before = sourceStamp(lstatSync(file, { bigint: true }));
  const fd = openSync(file, "r");
  try {
    const opened = sourceStamp(fstatSync(fd, { bigint: true }));
    if (opened.physical !== before.physical || (expectedRevision && opened.revision !== expectedRevision)) throw new Error("Native history source changed");
    const result = inspect(fd, opened);
    const after = sourceStamp(lstatSync(file, { bigint: true }));
    if (opened.physical !== after.physical || (expectedRevision && after.revision !== expectedRevision)) throw new Error("Native history source changed");
    return result;
  } finally {
    closeSync(fd);
  }
}

function historyIdentity(provider: HistoryEntry["provider"], id: string, file: string, rawCwd: string, cwd: string, physical: string) {
  return createHash("sha256")
    .update(JSON.stringify([provider, id, file, rawCwd, cwd, physical]))
    .digest("hex");
}

export function readSelectedHistory<T>(provider: HistoryEntry["provider"], file: string, nativeId: string, historyId: string, project: (fd: number) => T, expectedRevision?: string, expectedCwd?: string): T | undefined {
  try {
    return useHistorySource(
      file,
      (fd, stamp) => {
        const parsed = parsers[provider](fd);
        const id = parsed.id ?? (provider === "claude" ? path.basename(file, ".jsonl") : null);
        if (!parsed.cwd || id !== nativeId) return undefined;
        const cwd = expectedCwd ? realpathSync(parsed.cwd) : real(parsed.cwd);
        if (expectedCwd && (!path.isAbsolute(parsed.cwd) || path.relative(cwd, expectedCwd) !== "")) return undefined;
        if (historyIdentity(provider, id, file, parsed.cwd, cwd, stamp.physical) !== historyId) return undefined;
        return project(fd);
      },
      expectedRevision,
    );
  } catch {
    return undefined;
  }
}

export function isPiHistoryFile(file: string, nativeId: string, historyId: string, expectedRevision?: string): boolean {
  return readSelectedHistory("pi", file, nativeId, historyId, () => true, expectedRevision) === true;
}

/** Browse is capped by Space and age. UUID lookups must also account for candidates the CLI can see outside that list. */
export function nativeHistoryCandidates(provider: UuidHistoryProvider, profile: string): ReadonlyMap<string, string | null> | undefined {
  if (!path.isAbsolute(profile)) return undefined;
  const candidates = new Map<string, string | null>();
  const visit = (dir: string, depth: number, optional = false) => {
    let entries;
    try {
      if (realpathSync(dir) !== dir) throw new Error("Noncanonical history directory");
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (optional && (error as NodeJS.ErrnoException).code === "ENOENT" && !lstatSync(dir, { throwIfNoEntry: false })) return;
      throw error;
    }
    for (const entry of entries) {
      const location = path.join(dir, entry.name);
      if (depth > 0 && entry.isDirectory()) {
        visit(location, depth - 1);
        continue;
      }
      if (depth > 0 && entry.isSymbolicLink() && statSync(location, { throwIfNoEntry: false })?.isDirectory()) throw new Error("Aliased history directory");
      const name = provider === "claude" && depth === 0 ? entry.name.replace(/\.jsonl$/i, "") : provider === "codex" && entry.name.startsWith("rollout-") ? CODEX_FILE_ID.exec(entry.name)?.[1] : undefined;
      if (name && entry.name.toLowerCase().endsWith(".jsonl") && isUuidHistoryId(name)) {
        const id = name.toLowerCase();
        candidates.set(id, !candidates.has(id) && entry.isFile() ? location : null);
      }
    }
  };
  try {
    if (realpathSync(profile) !== profile) return undefined;
    if (provider === "claude") visit(path.join(profile, "projects"), 1);
    else {
      visit(path.join(profile, "sessions"), 3);
      visit(path.join(profile, "archived_sessions"), 0, true);
    }
    return candidates;
  } catch {
    return undefined;
  }
}

export function nativeHistorySourceMatches(source: SelectedHistorySource, profile?: string, lookup = source.provider === "pi" || !profile ? undefined : nativeHistoryCandidates(source.provider, profile)): boolean {
  if (source.provider !== "pi" && (!isUuidHistoryId(source.nativeSessionId) || lookup?.get(source.nativeSessionId.toLowerCase()) !== source.file)) return false;
  return readSelectedHistory(source.provider, source.file, source.nativeSessionId, source.historyId, () => true, source.revision, source.provider === "pi" ? undefined : source.cwd) === true;
}

/** The UUID is reserved in the launch request. Claude may write the transcript only after the first user input. */
export function claudeHistoryChild(profile: string, id: string, cwd: string): string | undefined {
  const file = nativeHistoryCandidates("claude", profile)?.get(id.toLowerCase());
  return file ? historyChild("claude", file, id, cwd) : undefined;
}

export function codexHistoryChild(file: string, id: string, cwd: string): string | undefined {
  return historyChild("codex", file, id, cwd);
}

function historyChild(provider: UuidHistoryProvider, file: string, id: string, cwd: string): string | undefined {
  try {
    return useHistorySource(file, (fd, stamp) => {
      const parsed = parsers[provider](fd);
      if (!parsed.cwd || path.relative(realpathSync(parsed.cwd), cwd) !== "" || (provider === "codex" && parsed.id !== id)) return undefined;
      return historyIdentity(provider, id, file, parsed.cwd, real(parsed.cwd), stamp.physical);
    });
  } catch {
    return undefined;
  }
}

function claudeRoot(env: NodeJS.ProcessEnv, home: string): string {
  return path.join(env["CLAUDE_CONFIG_DIR"] || path.join(home, ".claude"), "projects");
}

function codexRoot(env: NodeJS.ProcessEnv, home: string): string {
  return path.join(env["CODEX_HOME"] || path.join(home, ".codex"), "sessions");
}

function piRoot(env: NodeJS.ProcessEnv, home: string): string {
  return env["PI_CODING_AGENT_SESSION_DIR"] || path.join(env["PI_CODING_AGENT_DIR"] || path.join(home, ".pi", "agent"), "sessions");
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

function* walkHistory(dir: string, accepts: (name: string) => boolean, depth: number): Generator<string> {
  if (depth < 0 || !existsSync(dir)) return;
  for (const e of readdirSafe(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkHistory(p, accepts, depth - 1);
    else if (e.isFile() && e.name.endsWith(".jsonl") && accepts(e.name)) yield p;
  }
}

/** 扫描原生历史会话；解析失败的文件计入 skipped。 */
export function scanHistory(o: ScanOptions): ScanResult {
  const env = o.env ?? process.env;
  const home = o.home ?? os.homedir();
  const roots = o.roots.map(real);
  const entries: HistoryEntry[] = [];
  const limitedProviders: HistoryEntry["provider"][] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const accept = (provider: HistoryEntry["provider"], fallbackId: string | null, file: string, store: string) => {
    const location = real(file);
    if (!within(store, location)) return;
    const [p, stamp] = useHistorySource(location, (fd, source) => [parsers[provider](fd), source] as const);
    const id = p.id ?? fallbackId;
    if (!id || !p.cwd || !isValidNativeId(id)) {
      skipped++;
      return;
    }
    const cwd = real(p.cwd);
    if (!roots.some((r) => within(r, cwd))) return;
    if (!existsSync(cwd)) return; // 目录已被删除：无法在原处恢复，不列出
    const historyId = historyIdentity(provider, id, location, p.cwd, cwd, stamp.physical);
    if (seen.has(historyId)) return;
    seen.add(historyId);
    const legacyHistoryId = createHash("sha256")
      .update(JSON.stringify([provider, id, location, cwd]))
      .digest("hex");
    entries.push({ provider, historyId, legacyHistoryId, revision: stamp.revision, nativeSessionId: id, cwd, title: p.title ?? "（无标题）", updatedAt: stamp.updatedAt, file: location });
  };

  // claude：只看目录名以某个 root（含未解析的原始路径，Claude 可能经符号链接启动）的编码开头的 bucket；按修改时间取最近的若干文件
  const cRoot = claudeRoot(env, home);
  if (existsSync(cRoot)) {
    const store = real(cRoot);
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
        try {
          cFiles.push({ file, id: f.name.slice(0, -".jsonl".length), mtime: statSync(file).mtime });
        } catch {
          skipped++;
        }
      }
    }
    cFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime() || a.file.localeCompare(b.file));
    if (cFiles.length > MAX_FILES) limitedProviders.push("claude");
    for (const { file, id } of cFiles.slice(0, MAX_FILES)) {
      try {
        accept("claude", id, file, store);
      } catch {
        skipped++;
      }
    }
  }

  const nativeStores = [
    { provider: "codex" as const, root: real(codexRoot(env, home)), accepts: (name: string) => name.startsWith("rollout-"), depth: 5 },
    { provider: "pi" as const, root: real(piRoot(env, home)), accepts: () => true, depth: 1 },
  ];
  for (const store of nativeStores) {
    const files: { file: string; mtime: Date }[] = [];
    for (const file of walkHistory(store.root, store.accepts, store.depth)) {
      try {
        files.push({ file, mtime: statSync(file).mtime });
      } catch {
        skipped++;
      }
    }
    files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime() || a.file.localeCompare(b.file));
    if (files.length > MAX_FILES) limitedProviders.push(store.provider);
    for (const { file } of files.slice(0, MAX_FILES)) {
      try {
        accept(store.provider, null, file, store.root);
      } catch {
        skipped++;
      }
    }
  }

  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.historyId.localeCompare(b.historyId));
  return { entries: o.limit ? entries.slice(0, o.limit) : entries, skipped, limitedProviders };
}
