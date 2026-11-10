import { existsSync, mkdirSync, statSync } from "node:fs";
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

const MAX_BYTES = 10 * 1024 * 1024;
const TEXT = /\.(md|txt|json|ya?ml|csv|ndjson)$/i;
const SKIP_PREFIX = [".huhu/"];

/** 文件历史：`.huhu/history/git` shadow 仓库，与用户自己的 Git 互不影响。 */
export class FileHistory {
  private git: GitRunner;
  private ready: Promise<void> | null = null;

  constructor(private readonly files: VaultFiles, private readonly now: () => Date = () => new Date()) {
    const dir = path.join(files.root, ".huhu", "history", "git");
    this.git = new GitRunner({ gitDir: dir, workTree: files.root, env: { GIT_AUTHOR_NAME: "HUHU", GIT_AUTHOR_EMAIL: "huhu@localhost", GIT_COMMITTER_NAME: "HUHU", GIT_COMMITTER_EMAIL: "huhu@localhost", GIT_CONFIG_NOSYSTEM: "1" } });
  }

  private dir(): string {
    return path.join(this.files.root, ".huhu", "history", "git");
  }

  private init(): Promise<void> {
    this.ready ??= (async () => {
      if (!existsSync(path.join(this.dir(), "HEAD"))) {
        mkdirSync(this.dir(), { recursive: true });
        await this.git.run(["init", "--quiet"]);
        await this.git.run(["config", "core.autocrlf", "false"]);
        await this.git.run(["config", "commit.gpgsign", "false"]);
      }
    })();
    return this.ready;
  }

  recordable(rel: string): boolean {
    if (!TEXT.test(rel) || SKIP_PREFIX.some((p) => rel.startsWith(p))) return false;
    try {
      return statSync(this.files.abs(rel)).size <= MAX_BYTES;
    } catch {
      return false;
    }
  }

  /** 记录文件当前内容为一个版本；内容与上一版相同则不产生新版本。 */
  async record(rel: string, source: HistorySource, title: string | null = null): Promise<HistoryEntry | null> {
    const p = normalizeRelPath(rel);
    if (!this.recordable(p)) return null;
    await this.init();
    await this.git.run(["add", "--force", "--", p]);
    const diff = await this.git.run(["diff", "--cached", "--quiet", "--", p]).then(() => false, () => true);
    if (!diff && !title) return null;
    const subject = `${source}|${title ?? ""}|${p}`;
    await this.git.run(["commit", "--quiet", "--allow-empty", "-m", subject, "--date", this.now().toISOString(), "--only", "--", p], { env: { GIT_COMMITTER_DATE: this.now().toISOString() } }); // 命名版本允许内容未变
    const head = (await this.git.run(["rev-parse", "HEAD"])).stdout.trim();
    return { id: head, at: this.now().toISOString(), source, title, path: p, size: statSync(this.files.abs(p)).size };
  }

  /** 记录改名/移动：同一个提交里同时包含旧路径删除与新路径新增，使 --follow 能追到改名前的版本。 */
  async recordMove(from: string, to: string): Promise<void> {
    const f = normalizeRelPath(from);
    const t = normalizeRelPath(to);
    if (!this.recordable(t)) return;
    await this.init();
    await this.git.run(["add", "--force", "-A", "--", f, t]);
    const dirty = await this.git.run(["diff", "--cached", "--quiet"]).then(() => false, () => true);
    if (dirty) await this.git.run(["commit", "--quiet", "-m", "edit|", "--date", this.now().toISOString()]);
  }

  /** 时间线（含改名前的版本：--follow）。最新在前。 */
  async timeline(rel: string): Promise<HistoryEntry[]> {
    const p = normalizeRelPath(rel);
    await this.init();
    const head = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(() => true, () => false);
    if (!head) return [];
    // 内容变化的版本：按 --follow 追踪（含改名前）；内容未变的命名版本是空提交，按主题里的路径找回
    const follow = (await this.git.run(["log", "--follow", "--name-only", "--format=%x1e%H%x1f%cI%x1f%s", "--", p])).stdout;
    const named = (await this.git.run(["log", "--fixed-strings", `--grep=|${p}`, "--format=%x1e%H%x1f%cI%x1f%s"])).stdout;
    const byId = new Map<string, HistoryEntry>();
    for (const block of [...follow.split("\u001e"), ...named.split("\u001e")].filter((b) => b.trim())) {
      const [header = "", ...names] = block.split("\n");
      const [id = "", at = "", subject = ""] = header.split("\u001f");
      if (!id || byId.has(id)) continue;
      const [source = "edit", title = ""] = subject.split("|");
      byId.set(id, { id, at, source: source as HistorySource, title: title || null, path: names.find((n) => n.trim())?.trim() ?? p, size: 0 });
    }
    const order = new Map((await this.git.run(["rev-list", "HEAD"])).stdout.split("\n").filter(Boolean).map((id, i) => [id, i]));
    const entries = [...byId.values()].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0)); // 最新在前（按提交顺序，而不是可能相同的时间戳）
    return entries;
  }

  async read(entry: { id: string; path: string }): Promise<string> {
    await this.init();
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
  async restore(rel: string, entryId: string, expectedCurrentVersion: string, hooks: { transform?: (text: string) => string; afterWrite?: (text: string) => void } = {}): Promise<{ checkpoint: HistoryEntry | null; restored: HistoryEntry | null }> {
    const p = normalizeRelPath(rel);
    const cur = this.files.read(p);
    if (!cur) throw errors.notFound(`文件不存在：${p}`);
    if (cur.version !== expectedCurrentVersion) throw errors.versionConflict(cur.version);
    const entries = await this.timeline(p);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) throw errors.notFound("该版本不存在");
    const content = (hooks.transform ?? ((t: string) => t))(await this.read(entry));
    const checkpoint = await this.record(p, "restore", "恢复前");
    await this.files.write(p, Buffer.from(content), { expectedVersion: cur.version });
    const restored = await this.record(p, "restore");
    hooks.afterWrite?.(content);
    return { checkpoint, restored };
  }
}

