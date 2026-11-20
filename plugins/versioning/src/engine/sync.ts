import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError, errors } from "@huhu/contracts";
import { z } from "zod";
import { canSendAuthentication } from "../shared/git-auth.js";
import { openAskpass, scrubEnvironment } from "./askpass.js";
import { SyncConflicts, type ConflictHooks, type Resolution } from "./conflicts/conflicts.js";
import { loadSession } from "./conflicts/session.js";
import { GitRunner, gitCancelled } from "./git.js";
import {
  authenticationFailed,
  hasUrlCredentials,
  httpTarget,
  isPlainSyncRemote,
  isSyncAuthError,
  SyncAuthFailure,
  type ConfigureGitAuth,
  type GitAuthSummary,
  type GitLogin,
  type GitRemoteCredentials,
  type VersioningAuth,
} from "./remote-auth.js";

export const SyncConfigSchema = z.object({
  remote: z.string(),
  branch: z.string(),
  mode: z.enum(["off", "follow", "full"]),
  pullIntervalSec: z.number().int(),
  pushIntervalSec: z.number().int(),
  exclude: z.array(z.string()),
});
export const SyncConfigPatch = SyncConfigSchema.extend({ remote: z.string().refine(isPlainSyncRemote, "远端地址无效或包含认证材料") })
  .partial()
  .strict();
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
type StoredSyncConfig = { config: SyncConfig; authReconfigurationRequired: boolean };

/**
 * 只回答针对配置主机（HUHU_GIT_HOST，含端口）的提示：被重定向到别的主机（含名字相似的主机）时不交出令牌。
 * git 的提示形如 `Username for 'https://host:port': ` / `Password for 'https://user@host:port': `。
 */
export const POSIX_ASKPASS = `#!/bin/sh
q="'"
url="\${1#*$q}"
url="\${url%%$q*}"
rest="\${url#*://}"
rest="\${rest%%/*}"
host="\${rest##*@}"
want="$(printf %s "$HUHU_GIT_HOST" | tr 'A-Z' 'a-z')"
got="$(printf %s "$host" | tr 'A-Z' 'a-z')"
[ -n "$got" ] && [ "$got" = "$want" ] || exit 1
case "$1" in
  Username*) printf %s "$HUHU_GIT_USER" ;;
  *) printf %s "$HUHU_GIT_TOKEN" ;;
esac
`;

export const DEFAULT_SYNC: SyncConfig = { remote: "", branch: "main", mode: "off", pullIntervalSec: 30, pushIntervalSec: 60, exclude: [] };

/** `.huhu/` 下默认纳入同步的路径（其余一律跳过：runtime/cache/ui/history/drafts/operations/claims 等）。 */
const HUHU_INCLUDE = ["vault.json", "settings.json", "plugins.json", "notes/", "home/", "agent-cli/spaces/", "ssh/hosts/", "ssh/known_hosts", "automations/scripts.json", "safe/"]; // sync/config.json 含本机的远端与分支设置，不随同步传播（与规格偏离：两台设备各自配置，否则首次拉取会与本地未跟踪的同名文件冲突）

function globToRegex(pattern: string): RegExp {
  let p = pattern.trim();
  const anchored = p.startsWith("/");
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const body = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<DS>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<DS>>/g, ".*")
    .replace(/\?/g, "[^/]");
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

export type SyncStatusName = "idle" | "conflict" | "offline" | "auth-failed" | "not-configured" | "read-only" | "unknown";
type NetworkAuth = { scope: VersioningAuth; summary: GitAuthSummary };

function withMigrationStatus(summary: GitAuthSummary, needsReplacement: boolean): GitAuthSummary {
  return needsReplacement && (summary.revision === null || summary.state === "unconfigured") ? { ...summary, state: "needs-reconfiguration" } : summary;
}

/** 远端同步：纳入范围只含指定文件；冲突时回退合并并报告，不留下半合并状态。 */
export class VaultSync {
  private git: GitRunner;
  private _status: { name: SyncStatusName; detail: string } = { name: "idle", detail: "" };
  private readonly cf: SyncConflicts;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();

  constructor(
    private readonly root: string,
    private readonly identity = { name: "HUHU", email: "huhu@localhost" },
    hooks: ConflictHooks = {},
    private readonly credentials?: GitRemoteCredentials,
    private readonly readOnly = false,
  ) {
    // 文件名里的 * ? [ 不是通配符：否则排除的 xsecret.md 会被纳入文件 `x*` 的 pathspec 一并加入
    this.git = new GitRunner({ workTree: root, env: { GIT_LITERAL_PATHSPECS: "1" } });
    this.cf = new SyncConflicts(root, this.git, identity, hooks);
  }

  dispose(): void {
    this.lifetime.abort();
  }

  private signal(signal?: AbortSignal): AbortSignal {
    return signal ? AbortSignal.any([this.lifetime.signal, signal]) : this.lifetime.signal;
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

  private readConfig(): StoredSyncConfig {
    try {
      const raw = JSON.parse(readFileSync(this.cfgFile(), "utf8")) as Partial<SyncConfig> & { credential?: unknown; authReconfigurationRequired?: unknown };
      const c = { ...DEFAULT_SYNC, ...raw };
      // 手改文件写出的非法间隔回退默认值，避免调度器拿到 NaN
      for (const k of ["pullIntervalSec", "pushIntervalSec"] as const) if (!Number.isInteger(c[k]) || c[k] < 30 || c[k] > 3600) c[k] = DEFAULT_SYNC[k];
      const config = SyncConfigSchema.parse(c);
      // 旧字段只用来判断是否需要补配，任何值都不进入能力输出或网络路径。
      const authReconfigurationRequired = c.authReconfigurationRequired === true || (typeof c.credential === "string" && c.credential.trim().length > 0);
      return { config, authReconfigurationRequired };
    } catch {
      return { config: { ...DEFAULT_SYNC }, authReconfigurationRequired: false };
    }
  }

  config(): SyncConfig {
    return this.readConfig().config;
  }

  update(patch: z.input<typeof SyncConfigPatch>): SyncConfig {
    this.requireWritable();
    const { config: previous, authReconfigurationRequired } = this.readConfig();
    const next = { ...previous, ...patch } as SyncConfig;
    if (!["off", "follow", "full"].includes(next.mode)) throw errors.invalidInput("同步模式无效");
    if (next.remote && /^\s|\s$|[\0\n]/.test(next.remote)) throw errors.invalidInput("远端地址无效");
    if (next.remote.startsWith("-")) throw errors.invalidInput("远端地址不能以 - 开头");
    // 凭据不能写进远端地址（配置文件、日志、错误信息都会带出来）：https://user:token@host 之类一律拒绝
    // （http/https 的 userinfo 即便只有一段也多半是令牌，如 https://ghp_xxx@github.com/…；ssh://git@host 这类用户名是正常写法）
    if (hasUrlCredentials(next.remote)) throw errors.invalidInput("远端地址不能包含用户名密码或令牌");
    next.remote = httpTarget(next.remote) ?? next.remote;
    for (const k of ["pullIntervalSec", "pushIntervalSec"] as const) {
      const v = next[k];
      if (!Number.isInteger(v) || v < 30 || v > 3600) throw errors.invalidInput("同步间隔需要在 30–3600 秒之间");
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(next.branch) || next.branch.startsWith("-")) throw errors.invalidInput("分支名无效");
    const config = SyncConfigSchema.parse(next);
    const sameTarget = config.remote === previous.remote || (isPlainSyncRemote(previous.remote) && config.remote === httpTarget(previous.remote));
    const stored = authReconfigurationRequired && sameTarget && httpTarget(config.remote) ? { ...config, authReconfigurationRequired: true } : config;
    mkdirSync(path.dirname(this.cfgFile()), { recursive: true });
    writeFileSync(this.cfgFile(), JSON.stringify(stored, null, 2));
    return config;
  }

  updateConfig(patch: z.input<typeof SyncConfigPatch>, signal?: AbortSignal): Promise<SyncConfig> {
    return this.exclusive(async () => {
      if (this.signal(signal).aborted) throw gitCancelled();
      return this.update(patch);
    });
  }

  private async authSummary(target: string | null, authReconfigurationRequired: boolean): Promise<GitAuthSummary> {
    const summary = (await this.credentials?.status(target)) ?? { revision: null, state: "temporarily-unavailable" };
    return withMigrationStatus(summary, target !== null && authReconfigurationRequired);
  }

  authStatus() {
    const { config, authReconfigurationRequired } = this.readConfig();
    return this.authSummary(httpTarget(config.remote), authReconfigurationRequired);
  }

  configureAuth(input: ConfigureGitAuth, signal?: AbortSignal, onSaved?: (target: string, summary: GitAuthSummary) => void) {
    return this.exclusive(async () => {
      const operation = this.signal(signal);
      if (operation.aborted) throw gitCancelled();
      this.requireWritable();
      const { config, authReconfigurationRequired } = this.readConfig();
      const target = httpTarget(input.remote);
      if (!target || target !== httpTarget(config.remote) || !canSendAuthentication(target)) throw errors.invalidInput("请先保存要配置的 HTTPS 远端");
      if (!this.credentials) throw authenticationFailed("local-protection-unavailable");
      const summary = withMigrationStatus(await this.credentials.configure(target, input, operation), authReconfigurationRequired);
      onSaved?.(target, summary);
      return summary;
    });
  }

  status(): { name: SyncStatusName; detail: string } {
    if (this.readOnly) return { name: "read-only", detail: errors.readOnlyVault().message };
    // 冲突状态以会话文件为准：重启后仍在
    const sess = loadSession(this.root);
    if (sess) return { name: "conflict", detail: sess.files.map((f) => f.path).join("、") };
    return this._status.name === "conflict" ? { name: "idle", detail: "" } : this._status;
  }

  /** Legacy references need an actionable status before the first network operation. */
  async visibleStatus(): Promise<ReturnType<VaultSync["status"]>> {
    const status = this.status();
    if (status.name === "conflict" || status.name === "read-only" || status.name === "auth-failed") return status;
    const { config, authReconfigurationRequired } = this.readConfig();
    if (!authReconfigurationRequired) return status;
    const target = httpTarget(config.remote);
    if (!target) return status;
    const { state } = await this.authSummary(target, authReconfigurationRequired);
    return state === "configured" ? status : { name: "auth-failed", detail: authenticationFailed(state).message };
  }

  private requireWritable(): void {
    if (this.readOnly) throw errors.readOnlyVault();
  }

  private async ready(c: SyncConfig): Promise<void> {
    this.requireWritable();
    if (!existsSync(path.join(this.root, ".git"))) throw errors.invalidInput("此 Vault 不是 Git 仓库，请先在 Git 页初始化");
    if (!c.remote) {
      this._status = { name: "not-configured", detail: "尚未配置远端" };
      throw errors.invalidInput("尚未配置远端");
    }
    const has = await this.git.run(["remote", "get-url", "origin"]).then(
      (r) => r.stdout.trim(),
      () => null,
    );
    if (has === null) await this.git.run(["remote", "add", "origin", "--", c.remote]);
    else if (has !== c.remote) await this.git.run(["remote", "set-url", "origin", "--", c.remote]);
  }

  /**
   * 需要联网的 Git 命令（fetch/push）的环境：使用当前远端的本机认证，通过一次性 GIT_ASKPASS 交给系统 Git，
   * 秘密只通过子进程环境变量传递（不在命令行、不在配置、不在 URL 里），命令结束后脚本目录立即删除。
   */
  private async authenticatedGit(target: string, args: string[], login: GitLogin, signal: AbortSignal) {
    if (process.platform === "win32") {
      const askpass = await openAskpass(target, login);
      try {
        return await this.git.run([...askpass.args, ...args], { env: askpass.env, signal, privateNetwork: true });
      } finally {
        askpass.close();
      }
    }
    const dir = mkdtempSync(path.join(os.tmpdir(), "huhu-askpass-")); // 0700
    try {
      const script = path.join(dir, "askpass.sh");
      writeFileSync(script, POSIX_ASKPASS, { mode: 0o700 });
      return await this.git.run(args, { env: { GIT_ASKPASS: script, HUHU_GIT_USER: login.username, HUHU_GIT_TOKEN: login.token, HUHU_GIT_HOST: new URL(target).host }, signal, privateNetwork: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  authTarget(): string | null {
    return httpTarget(this.config().remote);
  }

  private async networkAuth({ config, authReconfigurationRequired }: StoredSyncConfig): Promise<NetworkAuth | null> {
    const target = httpTarget(config.remote);
    if (!target) return null;
    const summary = await this.authSummary(target, authReconfigurationRequired);
    const scope: VersioningAuth = { source: "versioning", target, revision: summary.revision };
    if (authReconfigurationRequired && summary.state !== "configured") throw new SyncAuthFailure(authenticationFailed(summary.state), scope);
    return { scope, summary };
  }

  private async network(config: SyncConfig, auth: NetworkAuth | null, operation: "fetch" | "push", signal: AbortSignal): Promise<void> {
    const args = (remote: string, explicit: boolean) => (operation === "fetch" ? ["fetch", "--quiet", remote, ...(explicit ? ["+refs/heads/*:refs/remotes/origin/*"] : [])] : ["push", "--quiet", remote, `HEAD:refs/heads/${config.branch}`]);
    if (!auth) {
      await this.git.run(args("origin", false), { signal });
      return;
    }
    const { scope, summary } = auth;
    const target = scope.target;
    const settings = (key: string, value: string) => ["-c", `${key}=${value}`];
    const networkArgs = [
      ...settings("credential.helper", ""),
      ...settings("core.askPass", ""),
      ...settings("credential.useHttpPath", "true"),
      ...settings(`credential.${target}.useHttpPath`, "true"),
      ...settings(`http.${target}.followRedirects`, "false"),
      ...settings("http.followRedirects", "false"),
      ...settings(`http.${target}.sslVerify`, "true"),
      ...settings("http.extraHeader", ""),
      ...settings(`http.${target}.extraHeader`, ""),
      ...settings(`http.${target}.proxy`, ""),
      ...settings(`http.${target}.cookieFile`, ""),
      ...settings(`http.${target}.saveCookies`, "false"),
      ...args(target, true),
    ];
    try {
      const urls = await this.git.run(["remote", "get-url", "--all", ...(operation === "push" ? ["--push"] : []), "origin"], { signal, privateNetwork: true });
      const effective = urls.stdout.trim().split(/\r?\n/);
      if (effective.length !== 1 || httpTarget(effective[0]!) !== target) throw authenticationFailed("target-mismatch");
      if (summary.revision && summary.state !== "unconfigured") {
        if (!canSendAuthentication(target)) throw authenticationFailed("insecure-target");
        if (summary.state !== "configured") throw authenticationFailed(summary.state);
        await this.credentials!.use(target, (login) => this.authenticatedGit(target, networkArgs, login, signal));
      } else {
        await this.git.run(networkArgs, { env: { ...scrubEnvironment(), GIT_ASKPASS: "", GIT_ALLOW_PROTOCOL: new URL(target).protocol.slice(0, -1) }, signal, privateNetwork: true });
      }
    } catch (e) {
      if (e instanceof HuhuError && isSyncAuthError(e.code)) throw new SyncAuthFailure(e, scope);
      throw e;
    }
  }

  private track(e: unknown): never {
    if (e instanceof HuhuError) {
      const map: Record<string, SyncStatusName> = { GIT_OFFLINE: "offline", GIT_AUTH_FAILED: "auth-failed", GIT_CONFLICT: "conflict" };
      this._status = { name: map[e.code] ?? "unknown", detail: e.message };
    }
    throw e;
  }

  preview(signal?: AbortSignal): Promise<SyncPreview> {
    return this.exclusive(() => this.previewLocked(this.signal(signal)));
  }

  private async previewLocked(signal: AbortSignal): Promise<SyncPreview> {
    if (signal.aborted) throw gitCancelled();
    const stored = this.readConfig();
    const c = stored.config;
    await this.ready(c);
    try {
      await this.network(c, await this.networkAuth(stored), "fetch", signal);
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
    const hasRemote = await this.git.run(["rev-parse", "--verify", remoteRef]).then(
      () => true,
      () => false,
    );
    const hasHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(
      () => true,
      () => false,
    );
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
  private async commitIncluded(message: string, exclude: readonly string[]): Promise<boolean> {
    const files = (await this.changedPaths()).filter((p) => classify(p, exclude).include);
    if (files.length === 0) return false;
    const stagedBefore = new Set((await this.git.run(["diff", "--cached", "--name-only"])).stdout.split("\n").filter(Boolean));
    const oldHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(
      (r) => r.stdout.trim(),
      () => null,
    );
    const dir = mkdtempSync(path.join(os.tmpdir(), "huhu-idx-"));
    const env = { GIT_INDEX_FILE: path.join(dir, "index"), GIT_AUTHOR_NAME: this.identity.name, GIT_AUTHOR_EMAIL: this.identity.email, GIT_COMMITTER_NAME: this.identity.name, GIT_COMMITTER_EMAIL: this.identity.email };
    try {
      const hasHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(
        () => true,
        () => false,
      );
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
  run(mode: "pull" | "push" | "sync", signal?: AbortSignal): Promise<{ pulled: boolean; pushed: boolean; committed: boolean }> {
    return this.exclusive(() => this.runLocked(mode, this.signal(signal)));
  }

  runAutomatic(mode: "pull" | "sync", isCurrent: () => boolean, repair?: VersioningAuth): Promise<boolean> {
    // 与配置保存共用队列，拿到执行权后再次确认当前修订。
    return this.exclusive(async () => {
      const stored = this.readConfig();
      const c = stored.config;
      const signal = this.signal();
      if (!isCurrent() || signal.aborted || this.readOnly || loadSession(this.root) || c.mode === "off" || (mode === "sync" && c.mode !== "full")) return false;
      if (!repair) {
        await this.runLocked(mode, signal, stored);
      } else {
        const auth = await this.networkAuth(stored);
        if (!isCurrent() || signal.aborted || auth?.scope.target !== repair.target || auth.scope.revision !== repair.revision || auth.summary.state !== "configured") return false;
        await this.runLocked(mode, signal, stored, auth);
      }
      return true;
    });
  }

  private async runLocked(mode: "pull" | "push" | "sync", signal: AbortSignal, stored = this.readConfig(), preparedAuth?: NetworkAuth): Promise<{ pulled: boolean; pushed: boolean; committed: boolean }> {
    if (signal.aborted) throw gitCancelled();
    const c = stored.config;
    await this.ready(c);
    let committed = false;
    try {
      const auth = preparedAuth ?? (await this.networkAuth(stored));
      if (mode !== "pull") committed = await this.commitIncluded("HUHU 同步", c.exclude);
      await this.network(c, auth, "fetch", signal);
      const remoteRef = `origin/${c.branch}`;
      const hasRemote = await this.git.run(["rev-parse", "--verify", remoteRef]).then(
        () => true,
        () => false,
      );
      let pulled = false;
      if (signal.aborted) throw gitCancelled();
      if (mode !== "push" && hasRemote) {
        const hasHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(
          () => true,
          () => false,
        );
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
        await this.network(c, auth, "push", signal);
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
      this.requireWritable();
      const cancelled = this.cf.cancel();
      this._status = { name: "idle", detail: "" };
      return { cancelled };
    });
  }

  /** 应用逐块选择，生成合并提交；之后 full 模式继续同步（推送失败不回退合并提交，只报告原因）。 */
  resolveConflicts(sessionId: string, resolutions: Resolution[], onSyncFailure?: (error: unknown) => void): Promise<{ commit: string; pushed: boolean; syncError?: string }> {
    return this.exclusive(async () => {
      this.requireWritable();
      const commit = await this.cf.resolve(sessionId, resolutions);
      this._status = { name: "idle", detail: "" };
      if (this.config().mode !== "full") return { commit, pushed: false };
      try {
        const r = await this.runLocked("sync", this.signal());
        return { commit, pushed: r.pushed };
      } catch (e) {
        onSyncFailure?.(e);
        return { commit, pushed: false, syncError: e instanceof HuhuError ? e.code : "INTERNAL" };
      }
    });
  }
}
