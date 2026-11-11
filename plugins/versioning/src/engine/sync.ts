import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError, errors } from "@huhu/contracts";
import { SyncConflicts, type ConflictHooks, type Resolution } from "./conflicts/conflicts.js";
import { loadSession } from "./conflicts/session.js";
import { GitRunner } from "./git.js";

export interface SyncConfig {
  remote: string;
  branch: string;
  mode: "off" | "follow" | "full";
  /** 自动同步的拉取/推送间隔（秒，30–3600）。 */
  pullIntervalSec: number;
  pushIntervalSec: number;
  /** 用户追加的排除规则（gitignore 子集：`*`、`**`、前缀目录 `dir/`、前导 `/`）。 */
  exclude: string[];
}

export const DEFAULT_SYNC: SyncConfig = { remote: "", branch: "main", mode: "off", pullIntervalSec: 30, pushIntervalSec: 60, exclude: [] };

/** `.huhu/` 下默认纳入同步的路径（其余一律跳过：runtime/cache/ui/history/drafts/operations/claims 等）。 */
const HUHU_INCLUDE = ["vault.json", "settings.json", "plugins.json", "notes/", "home/", "agent-cli/spaces/", "ssh/hosts/", "ssh/known_hosts", "automations/scripts.json", "safe/"]; // sync/config.json 含本机的远端与分支设置，不随同步传播（与规格偏离：两台设备各自配置，否则首次拉取会与本地未跟踪的同名文件冲突）

function globToRegex(pattern: string): RegExp {
  let p = pattern.trim();
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const body = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "<<DS>>").replace(/\*/g, "[^/]*").replace(/<<DS>>/g, ".*").replace(/\?/g, "[^/]");
  return new RegExp(`${anchored || p.includes("/") ? "^" : "(^|/)"}${body}${dirOnly ? "/" : "(/|$)"}`);
}

export type Verdict = { include: true } | { include: false; reason: string };

/** 判断一个 Vault 相对路径是否纳入同步。 */
export function classify(rel: string, exclude: readonly string[]): Verdict {
  if (rel.startsWith(".huhu/")) {
    const inner = rel.slice(".huhu/".length);
    if (!HUHU_INCLUDE.some((i) => (i.endsWith("/") ? inner.startsWith(i) : inner === i))) return { include: false, reason: `.huhu/${inner.split("/")[0]}/ 不在同步范围` };
  } else if (rel === ".git" || rel.startsWith(".git/")) return { include: false, reason: "Git 内部文件" };
  for (const e of exclude) if (e.trim() && !e.startsWith("#") && globToRegex(e).test(rel)) return { include: false, reason: `匹配排除规则 ${e}` };
  return { include: true };
}

export interface SyncPreview {
  push: string[];
  skipped: { path: string; reason: string }[];
  pull: string[];
  ahead: number;
  behind: number;
}

export type SyncStatusName = "idle" | "conflict" | "offline" | "auth-failed" | "not-configured" | "unknown";

/** 远端同步：纳入范围只含指定文件；冲突时回退合并并报告，不留下半合并状态。 */
export class VaultSync {
  private git: GitRunner;
  private _status: { name: SyncStatusName; detail: string } = { name: "idle", detail: "" };
  private readonly cf: SyncConflicts;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly root: string, private readonly identity = { name: "HUHU", email: "huhu@localhost" }, hooks: ConflictHooks = {}) {
    // 文件名里的 * ? [ 不是通配符：否则排除的 xsecret.md 会被纳入文件 `x*` 的 pathspec 一并加入
    this.git = new GitRunner({ workTree: root, env: { GIT_LITERAL_PATHSPECS: "1" } });
    this.cf = new SyncConflicts(root, this.git, identity, hooks);
  }

  /** 进程内互斥：preview/run/resolve/cancel 不会交错执行（规格：同一时刻只有一个同步类 Git 操作）。 */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const job = this.tail.then(fn);
    this.tail = job.catch(() => undefined);
    return job;
  }

  /** 解析 `status --porcelain=v1 -z`：重命名/复制条目后面紧跟一个"旧路径"条目，需要跳过。 */
  private async changedPaths(): Promise<string[]> {
    const parts = (await this.git.run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout.split("\0").filter(Boolean);
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i] as string;
      out.push(e.slice(3));
      if (e[0] === "R" || e[0] === "C") {
        // 重命名的旧路径也要算作"变更"（它的删除要被提交，否则远端留下旧文件）；复制的来源没有改动
        if (e[0] === "R" && parts[i + 1]) out.push(parts[i + 1] as string);
        i++;
      }
    }
    return out;
  }

  private cfgFile(): string {
    return path.join(this.root, ".huhu", "sync", "config.json");
  }

  config(): SyncConfig {
    try {
      const c = { ...DEFAULT_SYNC, ...(JSON.parse(readFileSync(this.cfgFile(), "utf8")) as Partial<SyncConfig>) };
      // 手改文件写出的非法间隔回退默认值，避免调度器拿到 NaN
      for (const k of ["pullIntervalSec", "pushIntervalSec"] as const) if (!Number.isInteger(c[k]) || c[k] < 30 || c[k] > 3600) c[k] = DEFAULT_SYNC[k];
      return c;
    } catch {
      return { ...DEFAULT_SYNC };
    }
  }

  update(patch: Partial<SyncConfig>): SyncConfig {
    const next = { ...this.config(), ...patch };
    if (!["off", "follow", "full"].includes(next.mode)) throw errors.invalidInput("同步模式无效");
    if (next.remote && /^\s|\s$|[\0\n]/.test(next.remote)) throw errors.invalidInput("远端地址无效");
    if (next.remote.startsWith("-")) throw errors.invalidInput("远端地址不能以 - 开头");
    // 凭据不能写进远端地址（配置文件、日志、错误信息都会带出来）：https://user:token@host 之类一律拒绝
    // （http/https 的 userinfo 即便只有一段也多半是令牌，如 https://ghp_xxx@github.com/…；ssh://git@host 这类用户名是正常写法）
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/i.test(next.remote) || /^https?:\/\/[^/]*@/i.test(next.remote)) throw errors.invalidInput("远端地址不能包含用户名密码或令牌");
    for (const k of ["pullIntervalSec", "pushIntervalSec"] as const) {
      const v = next[k];
      if (!Number.isInteger(v) || v < 30 || v > 3600) throw errors.invalidInput("同步间隔需要在 30–3600 秒之间");
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(next.branch) || next.branch.startsWith("-")) throw errors.invalidInput("分支名无效");
    mkdirSync(path.dirname(this.cfgFile()), { recursive: true });
    writeFileSync(this.cfgFile(), JSON.stringify(next, null, 2));
    return next;
  }

  status(): { name: SyncStatusName; detail: string } {
    // 冲突状态以会话文件为准：重启后仍在
    const sess = loadSession(this.root);
    if (sess) return { name: "conflict", detail: sess.files.map((f) => f.path).join("、") };
    return this._status.name === "conflict" ? { name: "idle", detail: "" } : this._status;
  }

  private async ready(): Promise<SyncConfig> {
    if (!existsSync(path.join(this.root, ".git"))) throw errors.invalidInput("此 Vault 不是 Git 仓库，请先在 Git 页初始化");
    const c = this.config();
    if (!c.remote) {
      this._status = { name: "not-configured", detail: "尚未配置远端" };
      throw errors.invalidInput("尚未配置远端");
    }
    const has = await this.git.run(["remote", "get-url", "origin"]).then((r) => r.stdout.trim(), () => null);
    if (has === null) await this.git.run(["remote", "add", "origin", "--", c.remote]);
    else if (has !== c.remote) await this.git.run(["remote", "set-url", "origin", "--", c.remote]);
    return c;
  }

  private track(e: unknown): never {
    if (e instanceof HuhuError) {
      const map: Record<string, SyncStatusName> = { GIT_OFFLINE: "offline", GIT_AUTH_FAILED: "auth-failed", GIT_CONFLICT: "conflict" };
      this._status = { name: map[e.code] ?? "unknown", detail: e.message };
    }
    throw e;
  }

  preview(): Promise<SyncPreview> {
    return this.exclusive(() => this.previewLocked());
  }

  private async previewLocked(): Promise<SyncPreview> {
    const c = await this.ready();
    try {
      await this.git.run(["fetch", "--quiet", "origin"]);
    } catch (e) {
      this.track(e);
    }
    const push: string[] = [];
    const skipped: { path: string; reason: string }[] = [];
    for (const p of await this.changedPaths()) {
      const v = classify(p, c.exclude);
      if (v.include) push.push(p);
      else skipped.push({ path: p, reason: v.reason });
    }
    const remoteRef = `origin/${c.branch}`;
    const hasRemote = await this.git.run(["rev-parse", "--verify", remoteRef]).then(() => true, () => false);
    const hasHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(() => true, () => false);
    let pull: string[] = [];
    let ahead = 0;
    let behind = 0;
    if (hasRemote && hasHead) {
      pull = (await this.git.run(["diff", "--name-only", `HEAD...${remoteRef}`])).stdout.split("\n").filter(Boolean);
      const cnt = (await this.git.run(["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`])).stdout.trim().split(/\s+/).map(Number);
      ahead = cnt[0] ?? 0;
      behind = cnt[1] ?? 0;
    } else if (hasRemote) {
      pull = (await this.git.run(["ls-tree", "-r", "--name-only", remoteRef])).stdout.split("\n").filter(Boolean);
    }
    return { push, skipped, pull, ahead, behind };
  }

  /** 用临时 index 提交纳入范围的改动：不动用户自己的暂存区。没有可提交的改动返回 false。 */
  private async commitIncluded(message: string): Promise<boolean> {
    const c = this.config();
    const files = (await this.changedPaths()).filter((p) => classify(p, c.exclude).include);
    if (files.length === 0) return false;
    const stagedBefore = new Set((await this.git.run(["diff", "--cached", "--name-only"])).stdout.split("\n").filter(Boolean));
    const oldHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then((r) => r.stdout.trim(), () => null);
    const dir = mkdtempSync(path.join(os.tmpdir(), "huhu-idx-"));
    const env = { GIT_INDEX_FILE: path.join(dir, "index"), GIT_AUTHOR_NAME: this.identity.name, GIT_AUTHOR_EMAIL: this.identity.email, GIT_COMMITTER_NAME: this.identity.name, GIT_COMMITTER_EMAIL: this.identity.email };
    try {
      const hasHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(() => true, () => false);
      if (hasHead) await this.git.run(["read-tree", "HEAD"], { env });
      await this.git.run(["add", "-A", "--", ...files], { env });
      const tree = (await this.git.run(["write-tree"], { env })).stdout.trim();
      const parent = hasHead ? ["-p", "HEAD"] : [];
      const commit = (await this.git.run(["commit-tree", tree, ...parent, "-m", message], { env })).stdout.trim();
      // 带旧值校验：同步期间用户自己做了提交时不会被覆盖
      await this.git.run(["update-ref", "-m", "huhu sync", "HEAD", commit, ...(oldHead ? [oldHead] : [])]);
      // 用户自己的 index 与新的 HEAD 对齐：只重置用户没有手动暂存过的路径，用户暂存的内容保留
      const toReset = files.filter((f) => !stagedBefore.has(f));
      if (toReset.length) await this.git.run(["reset", "--quiet", "--", ...toReset]).catch(() => undefined);
      return true;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** 同步一次：follow = 只拉取；full = 拉取后推送。冲突 → 回退合并、状态 conflict，抛 GIT_CONFLICT（附冲突文件）。 */
  run(mode: "pull" | "push" | "sync"): Promise<{ pulled: boolean; pushed: boolean; committed: boolean }> {
    return this.exclusive(() => this.runLocked(mode));
  }

  private async runLocked(mode: "pull" | "push" | "sync"): Promise<{ pulled: boolean; pushed: boolean; committed: boolean }> {
    const c = await this.ready();
    let committed = false;
    try {
      if (mode !== "pull") committed = await this.commitIncluded("HUHU 同步");
      await this.git.run(["fetch", "--quiet", "origin"]);
      const remoteRef = `origin/${c.branch}`;
      const hasRemote = await this.git.run(["rev-parse", "--verify", remoteRef]).then(() => true, () => false);
      let pulled = false;
      if (mode !== "push" && hasRemote) {
        const hasHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(() => true, () => false);
        const behind = hasHead ? Number((await this.git.run(["rev-list", "--count", `HEAD..${remoteRef}`])).stdout.trim()) : 1;
        if (behind > 0) {
          if (hasHead) {
            // 先不碰工作区地预判：有冲突就记录会话并报告，工作区里永远不会出现冲突标记
            const headOid = (await this.git.run(["rev-parse", "--verify", "HEAD"])).stdout.trim();
            const sess = await this.cf.detect(headOid, remoteRef);
            if (sess) {
              const files = sess.files.map((f) => f.path);
              this._status = { name: "conflict", detail: files.join("、") };
              throw new HuhuError("GIT_CONFLICT", `同步冲突：${files.join("、")}`, { details: { files, sessionId: sess.id } });
            }
          }
          try {
            await this.git.run(["-c", `user.name=${this.identity.name}`, "-c", `user.email=${this.identity.email}`, "merge", "--no-edit", remoteRef]);
            pulled = true;
          } catch {
            const files = (await this.git.run(["diff", "--name-only", "--diff-filter=U"]).catch(() => ({ stdout: "" }))).stdout.split("\n").filter(Boolean);
            await this.git.run(["merge", "--abort"]).catch(() => undefined); // 不留下半合并状态
            if (files.length === 0) {
              // 没有冲突文件：合并因为别的原因被拒绝（例如未纳入的未跟踪文件会被覆盖），不能谎报成"冲突"
              this._status = { name: "unknown", detail: "合并被拒绝" };
              throw new HuhuError("INTERNAL", "无法合并远端变更：本地有未提交且会被覆盖的文件，请先处理这些文件", { retryable: false });
            }
            this._status = { name: "conflict", detail: files.join("、") };
            throw new HuhuError("GIT_CONFLICT", `同步冲突：${files.join("、")}`, { details: { files } });
          }
        }
      }
      let pushed = false;
      if (mode !== "pull") {
        await this.git.run(["push", "--quiet", "origin", `HEAD:refs/heads/${c.branch}`]);
        pushed = true;
      }
      this._status = { name: "idle", detail: "" };
      return { pulled, pushed, committed };
    } catch (e) {
      return this.track(e);
    }
  }

  // ---- 冲突解决 ----

  conflicts() {
    return this.cf.list();
  }

  conflictFile(p: string) {
    return this.cf.read(p);
  }

  /** 放弃当前冲突会话（不改动任何文件；下次同步会重新检测）。 */
  cancelConflicts(): Promise<{ cancelled: boolean }> {
    return this.exclusive(async () => {
      const cancelled = this.cf.cancel();
      this._status = { name: "idle", detail: "" };
      return { cancelled };
    });
  }

  /** 应用逐块选择，生成合并提交；之后 full 模式继续同步（推送失败不回退合并提交，只报告原因）。 */
  resolveConflicts(sessionId: string, resolutions: Resolution[]): Promise<{ commit: string; pushed: boolean; syncError?: string }> {
    return this.exclusive(async () => {
      const commit = await this.cf.resolve(sessionId, resolutions);
      this._status = { name: "idle", detail: "" };
      if (this.config().mode !== "full") return { commit, pushed: false };
      try {
        const r = await this.runLocked("sync");
        return { commit, pushed: r.pushed };
      } catch (e) {
        return { commit, pushed: false, syncError: e instanceof HuhuError ? e.code : "INTERNAL" };
      }
    });
  }
}
