import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { normalizeRelPath, type VaultFiles } from "@huhu/vault";
import { GitRunner } from "./git.js";

export type HistorySource = "edit" | "restore" | "checkpoint" | "sync" | "external";

export interface HistoryEntry {
  id: string;
  at: string;
  source: HistorySource;
  title: string | null;
  path: string;
  /** 改名前的路径（该版本记录时文件所在路径）。 */
  size: number;
}

export const HISTORY_MAX_BYTES = 10 * 1024 * 1024;
const TEXT = /\.(md|txt|json|ya?ml|csv|ndjson)$/i;
const SKIP_PREFIX = [".huhu/"];
export const historyPathSupported = (rel: string) => TEXT.test(rel) && !SKIP_PREFIX.some((prefix) => rel.startsWith(prefix));

/** 文件历史：`.huhu/history/git` shadow 仓库，与用户自己的 Git 互不影响。 */
export class FileHistory {
  private git: GitRunner;
  private ready: Promise<void> | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly files: VaultFiles,
    private readonly now: () => Date = () => new Date(),
  ) {
    const dir = path.join(files.root, ".huhu", "history", "git");
    this.git = new GitRunner({ gitDir: dir, workTree: files.root, env: { GIT_AUTHOR_NAME: "HUHU", GIT_AUTHOR_EMAIL: "huhu@localhost", GIT_COMMITTER_NAME: "HUHU", GIT_COMMITTER_EMAIL: "huhu@localhost", GIT_CONFIG_NOSYSTEM: "1" } });
  }

  private dir(): string {
    return path.join(this.files.root, ".huhu", "history", "git");
  }

  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(run);
    this.tail = pending.catch(() => undefined);
    return pending;
  }

  private init(): Promise<void> {
    this.ready ??= (async () => {
      if (!existsSync(path.join(this.dir(), "HEAD"))) {
        mkdirSync(this.dir(), { recursive: true });
        await this.git.run(["init", "--quiet"]);
        await this.git.run(["config", "core.autocrlf", "false"]);
        await this.git.run(["config", "commit.gpgsign", "false"]);
      }
    })().catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  recordable(rel: string): boolean {
    if (!historyPathSupported(rel)) return false;
    try {
      const file = statSync(this.files.abs(rel));
      return file.isFile() && file.size <= HISTORY_MAX_BYTES;
    } catch {
      return false;
    }
  }

  /** 记录文件当前内容为一个版本；内容与上一版相同则不产生新版本。 */
  record(rel: string, source: HistorySource, title: string | null = null, expectedVersion?: string, check?: () => void): Promise<HistoryEntry | null> {
    return this.exclusive(() => this.recordLocked(rel, source, title, expectedVersion, check));
  }

  async idle(): Promise<void> {
    await this.tail;
  }

  recordRevision(rel: string, bytes: Buffer, executable: boolean, source: "edit" | "external", intent: string, recovering: boolean): Promise<HistoryEntry | null> {
    this.files.assertWritable();
    const p = normalizeRelPath(rel);
    return this.exclusive(() => this.recordSnapshot(p, bytes, source, null, undefined, executable ? "100755" : "100644", { id: intent, recovering }));
  }

  private async recordLocked(rel: string, source: HistorySource, title: string | null = null, expectedVersion?: string, check?: () => void): Promise<HistoryEntry | null> {
    this.files.assertWritable();
    const p = normalizeRelPath(rel);
    check?.();
    if (expectedVersion !== undefined) {
      const current = this.files.read(p);
      if (!current) throw errors.notFound(p);
      if (current.version !== expectedVersion) throw errors.versionConflict(current.version);
      if (!this.recordable(p)) return null;
      return this.recordSnapshot(p, current.bytes, source, title, check);
    }
    if (!this.recordable(p)) return null;
    await this.init();
    await this.git.run(["add", "--force", "--", p]);
    const diff = await this.git.run(["diff", "--cached", "--quiet", "--", p]).then(
      () => false,
      () => true,
    );
    if (!diff && !title) return null;
    const subject = `${source}|${title ?? ""}|${p}`;
    await this.git.run(["commit", "--quiet", "--allow-empty", "-m", subject, "--date", this.now().toISOString(), "--only", "--", p], { env: { GIT_COMMITTER_DATE: this.now().toISOString() } }); // 命名版本允许内容未变
    const head = (await this.git.run(["rev-parse", "HEAD"])).stdout.trim();
    return { id: head, at: this.now().toISOString(), source, title, path: p, size: statSync(this.files.abs(p)).size };
  }

  /** Publish the checked bytes, even if the editor saves a new version during the Git calls. */
  private async recordSnapshot(p: string, bytes: Buffer, source: HistorySource, title: string | null, check?: () => void, mode?: "100644" | "100755", intent?: { id: string; recovering: boolean }): Promise<HistoryEntry | null> {
    await this.init();
    const head = (await this.git.run(["rev-parse", "--verify", "--quiet", "HEAD"], { okCodes: [1] })).stdout.trim();
    const marker = intent && `Huhu-History-Intent: ${intent.id}`;
    if (head && intent?.recovering) {
      const recorded = await this.git.run(["log", "-1", "--fixed-strings", `--grep=${marker}`, "--format=%H", head]);
      if (recorded.stdout.trim()) return null;
    }
    const dir = mkdtempSync(path.join(os.tmpdir(), "huhu-history-"));
    const at = this.now().toISOString();
    const env = { GIT_INDEX_FILE: path.join(dir, "index"), GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at };
    try {
      if (head) await this.git.run(["read-tree", head], { env });
      const oid = (await this.git.run(["hash-object", "-w", "--stdin"], { input: bytes })).stdout.trim();
      const permissions = mode ?? (statSync(this.files.abs(p)).mode & 0o100 ? "100755" : "100644");
      await this.git.run(["update-index", "--add", "--cacheinfo", `${permissions},${oid},${p}`], { env });
      const tree = (await this.git.run(["write-tree"], { env })).stdout.trim();
      if (head && !title && (await this.git.run(["rev-parse", `${head}^{tree}`])).stdout.trim() === tree) return null;
      const id = (await this.git.run(["commit-tree", tree, ...(head ? ["-p", head] : []), "-m", `${source}|${title ?? ""}|${p}`, ...(marker ? ["-m", marker] : [])], { env })).stdout.trim();
      check?.();
      await this.git.run(["update-ref", "HEAD", id, head || "0".repeat(id.length)]);
      return { id, at, source, title, path: p, size: bytes.length };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** 记录改名/移动：同一个提交里同时包含旧路径删除与新路径新增，使 --follow 能追到改名前的版本。 */
  recordMove(from: string, to: string): Promise<void> {
    return this.exclusive(() => this.recordMoveLocked(from, to));
  }

  private async recordMoveLocked(from: string, to: string): Promise<void> {
    this.files.assertWritable();
    const f = normalizeRelPath(from);
    const t = normalizeRelPath(to);
    if (!this.recordable(t)) return;
    await this.init();
    const head = (await this.git.run(["rev-parse", "--verify", "--quiet", "HEAD"], { okCodes: [1] })).stdout.trim();
    if (head) await this.git.run(["read-tree", head]);
    await this.git.run(["add", "--force", "-A", "--", f, t]);
    const dirty = await this.git.run(["diff", "--cached", "--quiet"]).then(
      () => false,
      () => true,
    );
    if (dirty) await this.git.run(["commit", "--quiet", "-m", "edit|", "--date", this.now().toISOString()]);
  }

  /** 时间线（含改名前的版本：--follow）。最新在前。 */
  async timeline(rel: string): Promise<HistoryEntry[]> {
    const p = normalizeRelPath(rel);
    if (!existsSync(path.join(this.dir(), "HEAD"))) return [];
    const head = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(
      () => true,
      () => false,
    );
    if (!head) return [];
    // 内容变化的版本：按 --follow 追踪（含改名前）；内容未变的命名版本是空提交，按主题里的路径找回
    const follow = (await this.git.run(["log", "--follow", "--name-only", "--format=%x1e%H%x1f%cI%x1f%s", "--", p])).stdout;
    const named = (await this.git.run(["log", "--fixed-strings", `--grep=|${p}`, "--format=%x1e%H%x1f%cI%x1f%s"])).stdout;
    const byId = new Map<string, HistoryEntry>();
    for (const block of [...follow.split("\u001e"), ...named.split("\u001e").filter((value) => value.split("\n")[0]?.endsWith(`|${p}`))].filter((b) => b.trim())) {
      const [header = "", ...names] = block.split("\n");
      const [id = "", at = "", subject = ""] = header.split("\u001f");
      if (!id || byId.has(id)) continue;
      const [source = "edit", title = ""] = subject.split("|");
      byId.set(id, { id, at, source: source as HistorySource, title: title || null, path: names.find((n) => n.trim())?.trim() ?? p, size: 0 });
    }
    const order = new Map(
      (await this.git.run(["rev-list", "HEAD"])).stdout
        .split("\n")
        .filter(Boolean)
        .map((id, i) => [id, i]),
    );
    const entries = [...byId.values()].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0)); // 最新在前（按提交顺序，而不是可能相同的时间戳）
    return entries;
  }

  async read(entry: { id: string; path: string }): Promise<string> {
    // id 必须是完整提交哈希：以 -- 开头的值会被 git 当成选项（可写任意文件）
    if (!/^[0-9a-f]{40,64}$/.test(entry.id)) throw errors.invalidInput("版本 id 无效");
    if (!existsSync(path.join(this.dir(), "HEAD"))) throw errors.notFound("该版本不存在");
    try {
      return (await this.git.run(["show", `${entry.id}:${entry.path}`])).stdout;
    } catch {
      throw errors.notFound("该版本不存在");
    }
  }

  /**
   * 恢复：校验当前版本 → 先把当前内容存为"恢复前"版本 → 写入所选内容 → 作为新的当前版本记录。
   * 调用方（插件）负责语义文件的字段保护（规则文件恢复后暂停等）。
   */
  restore(
    rel: string,
    entryId: string,
    expectedCurrentVersion: string,
    hooks: { transform?: (restored: string, current: string, entry: HistoryEntry) => string; afterWrite?: (text: string) => void | Promise<void>; beforeWrite?: () => void } = {},
  ): Promise<{ checkpoint: HistoryEntry | null; restored: HistoryEntry | null }> {
    return this.exclusive(() => this.restoreLocked(rel, entryId, expectedCurrentVersion, hooks));
  }

  private async restoreLocked(
    rel: string,
    entryId: string,
    expectedCurrentVersion: string,
    hooks: { transform?: (restored: string, current: string, entry: HistoryEntry) => string; afterWrite?: (text: string) => void | Promise<void>; beforeWrite?: () => void },
  ): Promise<{ checkpoint: HistoryEntry | null; restored: HistoryEntry | null }> {
    this.files.assertWritable();
    const p = normalizeRelPath(rel);
    const cur = this.files.read(p);
    if (!cur) throw errors.notFound(`文件不存在：${p}`);
    if (cur.version !== expectedCurrentVersion) throw errors.versionConflict(cur.version);
    const entries = await this.timeline(p);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) throw errors.notFound("该版本不存在");
    const content = (hooks.transform ?? ((t: string) => t))(await this.read(entry), cur.bytes.toString("utf8"), entry);
    const checkpoint = await this.recordLocked(p, "restore", "恢复前", cur.version, hooks.beforeWrite);
    await this.files.write(p, Buffer.from(content), { expectedVersion: cur.version, ...(hooks.beforeWrite && { beforeCommit: hooks.beforeWrite }) });
    await hooks.afterWrite?.(content);
    const restored = await this.recordLocked(p, "restore");
    return { checkpoint, restored };
  }
}
