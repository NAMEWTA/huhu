import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, statSync, type BigIntStats, type Dirent } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
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
  providers?: HistoryEntry["provider"][];
}

export interface ScanResult {
  entries: HistoryEntry[];
  skipped: number;
  limitedProviders: HistoryEntry["provider"][];
}

/** 每个文件最多读取的头部字节与行数：标题与 cwd 都在会话开头附近。 */
const HEAD_BYTES = 512 * 1024;
const HEAD_LINES = 400;
const PROJECTION_MAX_AGE_MS = 3000;
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

function headLines(fd: number, size: number): string[] {
  const buf = Buffer.alloc(Math.min(size, HEAD_BYTES));
  const n = readSync(fd, buf, 0, buf.length, 0);
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

function parseClaude(lines: string[]): Parsed {
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of lines) {
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

function parseCodex(lines: string[]): Parsed {
  let id: string | null = null;
  let cwd: string | null = null;
  let title: string | null = null;
  for (const line of lines) {
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

function parsePi(lines: string[]): Parsed {
  const [first = "", ...entries] = lines;
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
  return { physical, revision, updatedAt: stat.mtime.toISOString(), size: Number(stat.size) };
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
        const parsed = parsers[provider](headLines(fd, stamp.size));
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

function uuidStores(provider: UuidHistoryProvider, profile: string) {
  return provider === "claude"
    ? [{ dir: path.join(profile, "projects"), depth: 1, optional: false }]
    : [
        { dir: path.join(profile, "sessions"), depth: 3, optional: false },
        { dir: path.join(profile, "archived_sessions"), depth: 0, optional: true },
      ];
}

function recordUuidCandidate(provider: UuidHistoryProvider, depth: number, entry: Dirent, location: string, candidates: Map<string, string | null>): void {
  const { name } = entry;
  if (!name.toLowerCase().endsWith(".jsonl")) return;
  const id = provider === "claude" && depth === 0 ? name.slice(0, -".jsonl".length) : provider === "codex" && name.startsWith("rollout-") ? CODEX_FILE_ID.exec(name)?.[1] : undefined;
  if (!id || !isUuidHistoryId(id)) return;
  const key = id.toLowerCase();
  candidates.set(key, !candidates.has(key) && entry.isFile() ? location : null);
}

/** UUID lookups also account for candidates outside the selected Space, including archived files. */
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
      recordUuidCandidate(provider, depth, entry, location, candidates);
    }
  };
  try {
    if (realpathSync(profile) !== profile) return undefined;
    for (const { dir, depth, optional } of uuidStores(provider, profile)) visit(dir, depth, optional);
    return candidates;
  } catch {
    return undefined;
  }
}

function absent(error: unknown): undefined {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  return undefined;
}

/** The browse projection refreshes the same candidate set without a synchronous directory walk. */
async function projectedUuidCandidates(provider: UuidHistoryProvider, profile: string, signal?: AbortSignal): Promise<ReadonlyMap<string, string | null> | undefined> {
  const candidates = new Map<string, string | null>();
  const visit = async (dir: string, depth: number, optional = false): Promise<void> => {
    signal?.throwIfAborted();
    const canonical = await realpath(dir).catch(absent);
    if (!canonical && optional && !(await lstat(dir).catch(absent))) return;
    if (canonical !== dir) throw new Error("Noncanonical history directory");
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const location = path.join(dir, entry.name);
      if (depth > 0 && entry.isDirectory()) {
        await visit(location, depth - 1);
        continue;
      }
      if (depth > 0 && entry.isSymbolicLink() && (await stat(location).catch(absent))?.isDirectory()) throw new Error("Aliased history directory");
      recordUuidCandidate(provider, depth, entry, location, candidates);
    }
  };
  try {
    if ((await realpath(profile)) !== profile) return undefined;
    for (const { dir, depth, optional } of uuidStores(provider, profile)) await visit(dir, depth, optional);
    return candidates;
  } catch {
    signal?.throwIfAborted();
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
      const parsed = parsers[provider](headLines(fd, stamp.size));
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

type Provider = HistoryEntry["provider"];
type SourceStamp = ReturnType<typeof sourceStamp>;

function parseSource(provider: Provider, file: string) {
  return useHistorySource(file, (fd, stamp) => {
    const parsed = parsers[provider](headLines(fd, stamp.size));
    const id = parsed.id ?? (provider === "claude" ? path.basename(file, ".jsonl") : null);
    return { parsed, id, stamp };
  });
}

function historyEntry(provider: Provider, file: string, id: string, rawCwd: string, cwd: string, title: string | null, stamp: SourceStamp): HistoryEntry {
  return {
    provider,
    historyId: historyIdentity(provider, id, file, rawCwd, cwd, stamp.physical),
    legacyHistoryId: createHash("sha256")
      .update(JSON.stringify([provider, id, file, cwd]))
      .digest("hex"),
    revision: stamp.revision,
    nativeSessionId: id,
    cwd,
    title: title ?? "（无标题）",
    updatedAt: stamp.updatedAt,
    file,
  };
}

/** Opens a specific file and checks its current physical identity and recorded working directory. */
export function readHistoryEntry(provider: Provider, file: string): HistoryEntry | undefined {
  try {
    const { parsed, id, stamp } = parseSource(provider, file);
    if (id && isValidNativeId(id) && parsed.cwd) {
      return historyEntry(provider, file, id, parsed.cwd, realpathSync(parsed.cwd), parsed.title, stamp);
    }
  } catch {
    // A history file or its original directory may have been removed.
  }
  return undefined;
}

async function* walkHistory(dir: string, accepts: (name: string) => boolean, depth: number): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (depth > 0 && entry.isDirectory()) yield* walkHistory(file, accepts, depth - 1);
    else if (entry.isFile() && entry.name.endsWith(".jsonl") && accepts(entry.name)) yield file;
  }
}

const stores = {
  claude: { root: claudeRoot, depth: 1, accepts: () => true },
  codex: { root: codexRoot, depth: 5, accepts: (name: string) => name.startsWith("rollout-") },
  pi: { root: piRoot, depth: 1, accepts: () => true },
};
type CachedSource = ReturnType<typeof parseSource>;
type Snapshot = {
  at: number;
  skipped: number;
  sources: Map<string, CachedSource>;
  byCwd: Map<string, HistoryEntry[]>;
  byNativeId: Map<string, HistoryEntry[]>;
  candidates: ReadonlyMap<string, string | null> | undefined;
};
type HistoryReference = { provider: Provider; nativeSessionId: string; historyId?: string | undefined };

/** Rebuildable provider/profile metadata shared by all Space queries within one Engine. */
export class HistoryProjection {
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly pending = new Map<string, Promise<Snapshot>>();

  constructor(
    private readonly signal?: AbortSignal,
    private readonly now = Date.now,
  ) {}

  async scan(o: ScanOptions, { fresh = false } = {}): Promise<ScanResult & { candidates: Map<Provider, Snapshot["candidates"]> }> {
    const env = o.env ?? process.env;
    const home = o.home ?? os.homedir();
    const roots = o.roots.map(real);
    const providers = o.providers ?? (Object.keys(stores) as Provider[]);
    const snapshots = await Promise.all(providers.map((provider) => this.snapshot(provider, env, home, fresh)));
    const entries = snapshots.flatMap(({ byCwd }) => [...byCwd].flatMap(([cwd, rows]) => (roots.some((root) => within(root, cwd)) ? rows : [])));
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.historyId.localeCompare(b.historyId));
    return {
      entries,
      skipped: snapshots.reduce((count, item) => count + item.skipped, 0),
      limitedProviders: [],
      candidates: new Map<Provider, Snapshot["candidates"]>(providers.map((provider, index) => [provider, snapshots[index]?.candidates])),
    };
  }

  async resolve(o: ScanOptions, reference: HistoryReference, fresh = false) {
    const { provider, nativeSessionId, historyId } = reference;
    const roots = o.roots.map(real);
    const select = async (refresh: boolean) => {
      const snapshot = await this.snapshot(provider, o.env ?? process.env, o.home ?? os.homedir(), refresh);
      const matches = (snapshot.byNativeId.get(nativeSessionId) ?? []).filter(({ cwd }) => roots.some((root) => within(root, cwd)));
      const hit = historyId ? matches.find((entry) => entry.historyId === historyId) : matches.length === 1 ? matches[0] : undefined;
      // A projection locates candidates. Selection always opens the source again.
      const current = hit && readHistoryEntry(provider, hit.file);
      const selected = current && current.historyId === hit?.historyId && roots.some((root) => within(root, current.cwd)) ? current : undefined;
      return { selected, matches: matches.length };
    };
    const refreshFirst = fresh || !historyId;
    const located = await select(refreshFirst);
    return located.selected || refreshFirst ? located : select(true);
  }

  private snapshot(provider: Provider, env: NodeJS.ProcessEnv, home: string, fresh: boolean): Promise<Snapshot> {
    this.signal?.throwIfAborted();
    const store = stores[provider];
    const root = real(store.root(env, home));
    const key = JSON.stringify([provider, root]);
    const existing = this.snapshots.get(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const now = this.now();
    if (!fresh && existing && now - existing.at < PROJECTION_MAX_AGE_MS) return Promise.resolve(existing);
    for (const [other, snapshot] of this.snapshots) {
      if (other !== key && now - snapshot.at >= 60_000) this.snapshots.delete(other);
    }
    const refresh = this.refresh(provider, root, store, existing, env, home)
      .then((next) => {
        this.snapshots.set(key, next);
        return next;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, refresh);
    return refresh;
  }

  private async refresh(provider: Provider, root: string, store: (typeof stores)[Provider], prior: Snapshot | undefined, env: NodeJS.ProcessEnv, home: string): Promise<Snapshot> {
    const sources = new Map<string, CachedSource>();
    const byCwd = new Map<string, HistoryEntry[]>();
    const byNativeId = new Map<string, HistoryEntry[]>();
    const canonical = new Map<string, Promise<string | undefined>>();
    let skipped = 0;
    for await (const file of walkHistory(root, store.accepts, store.depth)) {
      this.signal?.throwIfAborted();
      let source: CachedSource;
      try {
        const revision = sourceStamp(await lstat(file, { bigint: true })).revision;
        const cached = prior?.sources.get(file);
        source = cached?.stamp.revision === revision ? cached : parseSource(provider, file);
        sources.set(file, source);
      } catch {
        skipped++;
        continue;
      }
      const {
        parsed: { cwd: rawCwd, title },
        id,
        stamp,
      } = source;
      if (!rawCwd || !id || !isValidNativeId(id)) {
        skipped++;
        continue;
      }
      let resolved = canonical.get(rawCwd);
      if (!resolved) {
        resolved = realpath(rawCwd).catch(() => undefined);
        canonical.set(rawCwd, resolved);
      }
      const cwd = await resolved;
      if (!cwd) continue;
      const entry = historyEntry(provider, file, id, rawCwd, cwd, title, stamp);
      for (const [index, key] of [
        [byCwd, cwd],
        [byNativeId, id],
      ] as const) {
        const rows = index.get(key);
        if (rows) rows.push(entry);
        else index.set(key, [entry]);
      }
    }
    this.signal?.throwIfAborted();
    const profile = provider === "pi" ? undefined : nativeHistoryProfile(provider, env, home);
    const candidates = provider !== "pi" && profile ? await projectedUuidCandidates(provider, profile, this.signal) : undefined;
    this.signal?.throwIfAborted();
    return { sources, byCwd, byNativeId, skipped, candidates, at: this.now() };
  }
}
