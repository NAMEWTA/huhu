import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError, errors } from "@huhu/contracts";
import { CREATION_STAGE_PREFIX, directoryInstance, resolveInVault, versionOf } from "@huhu/vault";
import { z } from "zod";
import { canSendAuthentication } from "../shared/git-auth.js";
import { askpassCommand, openAskpass, scrubEnvironment } from "./askpass.js";
import type { AutoSyncConfig } from "./auto-sync.js";
import { SyncConflicts, type ConflictHooks, type Resolution } from "./conflicts/conflicts.js";
import { loadSession } from "./conflicts/session.js";
import { GitRunner, gitCancelled } from "./git.js";
import { allowToolPath, assertToolPath, VaultGit } from "./repo.js";
import { differentSafePaths, gitTree, isSafePath, SafeGit, safeTree, type SafeGitSnapshots } from "./safe-git.js";
import {
  authenticationFailed,
  hasUrlCredentials,
  httpTarget,
  isPlainSyncRemote,
  isSyncAuthError,
  toolRemote,
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
type SyncTarget = { repositoryId: string; head: string | null; remote: string; branch: string; authRevision: string | null };
type ConflictTarget = { sessionId: string; localHead: string; remoteHead: string };

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
const HUHU_INCLUDE = ["vault.json", "settings.json", "plugins.json", "notes/", "home/", "agent-cli/spaces/", "ssh/hosts/", "ssh/known_hosts", "automations/scripts.json"]; // sync/config.json 含本机的远端与分支设置，不随同步传播（两台设备各自配置）

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

function matchingExclude(rel: string, exclude: readonly string[]): string | undefined {
  return exclude.find((e) => e.trim() && !e.startsWith("#") && globToRegex(e).test(rel));
}

/** 判断一个 Vault 相对路径是否纳入同步。 */
export function classify(rel: string, exclude: readonly string[]): Verdict {
  if (isSafePath(rel)) return { include: false, reason: "仅同步保险箱当前整代资料" };
  if (path.posix.basename(rel).startsWith(CREATION_STAGE_PREFIX)) return { include: false, reason: "Vault 写入暂存条目" };
  if (rel.toLowerCase() === ".huhu" || rel.toLowerCase().startsWith(".huhu/")) {
    const inner = rel.slice(".huhu/".length);
    if (!HUHU_INCLUDE.some((i) => (i.endsWith("/") ? inner.startsWith(i) : inner === i))) return { include: false, reason: `.huhu/${inner.split("/")[0]}/ 不在同步范围` };
  } else if (rel === ".git" || rel.startsWith(".git/")) return { include: false, reason: "Git 内部文件" };
  const rule = matchingExclude(rel, exclude);
  if (rule) return { include: false, reason: `匹配排除规则 ${rule}` };
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
  private readonly safeGit: SafeGit;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();

  constructor(
    private readonly root: string,
    private readonly identity = { name: "HUHU", email: "huhu@localhost" },
    hooks: ConflictHooks = {},
    private readonly credentials?: GitRemoteCredentials,
    private readonly readOnly = false,
    snapshots?: SafeGitSnapshots,
    private readonly planConfig?: () => AutoSyncConfig,
  ) {
    // 文件名里的 * ? [ 不是通配符：否则排除的 xsecret.md 会被纳入文件 `x*` 的 pathspec 一并加入
    this.git = new GitRunner({ workTree: root, env: { GIT_LITERAL_PATHSPECS: "1", GIT_NO_REPLACE_OBJECTS: "1" } });
    this.safeGit = new SafeGit(this.git, snapshots);
    this.cf = new SyncConflicts(root, this.git, identity, {
      ...hooks,
      validateTree: async (tree, localParent, remoteParent) => {
        const ours = safeTree(await gitTree(this.git, localParent));
        const theirs = safeTree(await gitTree(this.git, remoteParent));
        const expected = await this.safeGit.mergeGeneration(localParent, remoteParent, ours, theirs);
        if (!expected) throw errors.invalidInput("保险箱整代发生分歧，已保留本地和远端版本");
        if (differentSafePaths(ours, theirs).length) await this.safeGit.validate(expected);
        await this.verifyMergedSafe(tree, expected, ours);
      },
    });
  }

  dispose(): void {
    this.lifetime.abort();
  }

  async idle(): Promise<void> {
    await this.tail;
  }

  private signal(signal?: AbortSignal): AbortSignal {
    return signal ? AbortSignal.any([this.lifetime.signal, signal]) : this.lifetime.signal;
  }

  /** 进程内互斥：preview/run/resolve/cancel 不会交错执行（规格：同一时刻只有一个同步类 Git 操作）。 */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
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
    return resolveInVault(this.root, ".huhu/sync/config.json");
  }

  private readConfig(legacy = false): StoredSyncConfig {
    try {
      const raw = JSON.parse(readFileSync(this.cfgFile(), "utf8")) as Partial<SyncConfig> & { credential?: unknown; authReconfigurationRequired?: unknown };
      const c = { ...DEFAULT_SYNC, ...raw };
      // 手改文件写出的非法间隔回退默认值，避免调度器拿到 NaN
      for (const k of ["pullIntervalSec", "pushIntervalSec"] as const) if (!Number.isInteger(c[k]) || c[k] < 30 || c[k] > 3600) c[k] = DEFAULT_SYNC[k];
      const config = SyncConfigSchema.parse({ ...c, ...(!legacy && this.planConfig?.()) });
      // 旧字段只用来判断是否需要补配，任何值都不进入能力输出或网络路径。
      const authReconfigurationRequired = c.authReconfigurationRequired === true || (typeof c.credential === "string" && c.credential.trim().length > 0);
      return { config, authReconfigurationRequired };
    } catch {
      return { config: { ...DEFAULT_SYNC, ...(!legacy && this.planConfig?.()) }, authReconfigurationRequired: false };
    }
  }

  legacyPlanConfig(): AutoSyncConfig | null {
    try {
      const data: unknown = JSON.parse(readFileSync(this.cfgFile(), "utf8"));
      if (!data || typeof data !== "object" || !("mode" in data || "pullIntervalSec" in data || "pushIntervalSec" in data)) return null;
      const { mode, pullIntervalSec, pushIntervalSec } = this.readConfig(true).config;
      return { mode, pullIntervalSec, pushIntervalSec };
    } catch {
      return null;
    }
  }

  config(): SyncConfig {
    return this.readConfig().config;
  }

  toolConfig() {
    const stored = this.readConfig();
    const config = stored.config;
    let remote = "";
    try {
      remote = toolRemote(config.remote);
    } catch {
      // Legacy settings may contain inline secrets or unsupported transports.
    }
    const vault = directoryInstance(this.root) ?? this.root;
    return { ...config, remote, revision: versionOf(Buffer.from(JSON.stringify([vault, stored]))) };
  }

  update(patch: z.input<typeof SyncConfigPatch>): SyncConfig {
    const { config, stored } = this.prepareConfig(patch);
    this.saveConfig(stored);
    return config;
  }

  private prepareConfig(patch: z.input<typeof SyncConfigPatch>) {
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
    const domain = this.planConfig ? { remote: config.remote, branch: config.branch, exclude: config.exclude } : config;
    const stored = authReconfigurationRequired && sameTarget && httpTarget(config.remote) ? { ...domain, authReconfigurationRequired: true } : domain;
    return { config, stored };
  }

  private saveConfig(stored: object): void {
    const configFile = this.cfgFile();
    mkdirSync(path.dirname(configFile), { recursive: true });
    const temporary = `${configFile}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(stored, null, 2), { flag: "wx" });
      renameSync(temporary, configFile);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  updateConfig(patch: z.input<typeof SyncConfigPatch>, signal?: AbortSignal, expectedRevision?: string, check?: () => void,
    updatePlans?: (next: SyncConfig) => Promise<void>, restricted = expectedRevision !== undefined,
  ): Promise<SyncConfig & { revision?: string }> {
    return this.exclusive(async () => {
      if (this.signal(signal).aborted) throw gitCancelled();
      if (expectedRevision !== undefined) {
        const { revision } = this.toolConfig();
        if (revision !== expectedRevision) throw errors.versionConflict(revision);
        if (restricted) {
          const previous = this.config();
          const remote = toolRemote(patch.remote ?? previous.remote);
          if ((patch.mode ?? previous.mode) !== "off") {
            if (!remote) throw errors.invalidInput("自动同步需要已配置的 Git 远端");
            await new VaultGit(this.root).toolIdentity();
            if (this.toolConfig().revision !== expectedRevision) throw errors.versionConflict(this.toolConfig().revision);
          }
        }
      }
      check?.();
      const { config, stored } = this.prepareConfig(patch);
      await updatePlans?.(config);
      this.saveConfig(stored);
      return restricted ? this.toolConfig() : this.config();
    });
  }

  private async authSummary(target: string | null, authReconfigurationRequired: boolean): Promise<GitAuthSummary> {
    const summary = (await this.credentials?.status(target)) ?? { revision: null, state: "temporarily-unavailable" };
    return withMigrationStatus(summary, target !== null && authReconfigurationRequired);
  }

  authStatus(expectedRemote?: string) {
    const { config, authReconfigurationRequired } = this.readConfig();
    const target = isPlainSyncRemote(config.remote) ? httpTarget(config.remote) : null;
    if (expectedRemote !== undefined && (!target || httpTarget(expectedRemote) !== target)) throw errors.invalidInput("认证状态属于当前同步目标");
    return this.authSummary(target, authReconfigurationRequired);
  }

  configureAuth(input: ConfigureGitAuth, signal?: AbortSignal, onSaved?: (target: string, summary: GitAuthSummary) => void, check?: () => void) {
    return this.exclusive(async () => {
      const operation = this.signal(signal);
      if (operation.aborted) throw gitCancelled();
      this.requireWritable();
      const { config, authReconfigurationRequired } = this.readConfig();
      const target = httpTarget(input.remote);
      if (!target || target !== httpTarget(config.remote) || !canSendAuthentication(target)) throw errors.invalidInput("请先保存要配置的 HTTPS 远端");
      if (!this.credentials) throw authenticationFailed("local-protection-unavailable");
      check?.();
      const summary = withMigrationStatus(await this.credentials.configure(target, input, operation, check), authReconfigurationRequired);
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

  private async assertToolTarget(stored: StoredSyncConfig, expected: SyncTarget, signal: AbortSignal) {
    const { config } = stored;
    const remote = toolRemote(config.remote);
    if (!remote || toolRemote(expected.remote) !== remote || expected.branch !== config.branch) throw errors.versionConflict(this.toolConfig().revision);
    if ((await new VaultGit(this.root).toolIdentity()) !== expected.repositoryId || (await this.head()) !== expected.head) throw errors.versionConflict("Git HEAD");
    const auth = await this.networkAuth(stored);
    if ((auth?.scope.revision ?? null) !== expected.authRevision) throw errors.versionConflict(auth?.scope.revision ?? "");
    signal.throwIfAborted();
    return auth;
  }

  private async assertEffectiveRemote(config: SyncConfig, signal: AbortSignal, push = false): Promise<void> {
    const expected = toolRemote(config.remote);
    const urls = await this.git.run(["remote", "get-url", "--all", ...(push ? ["--push"] : []), "origin"], { signal, privateNetwork: true });
    const targets = urls.stdout.trim().split(/\r?\n/);
    if (targets.length !== 1 || toolRemote(targets[0]!) !== expected) throw errors.invalidInput("Git origin 的实际地址与同步配置不符");
  }

  private async assertConflict(expected: ConflictTarget): Promise<void> {
    const session = this.cf.session();
    if (!session || session.id !== expected.sessionId || session.localHead !== expected.localHead || session.remoteHead !== expected.remoteHead) throw errors.versionConflict(session?.id ?? "");
    if (!/^refs\/remotes\/origin\/[\w./-]+$/.test(session.remoteRef)) throw errors.versionConflict(session.id);
    await new VaultGit(this.root).toolIdentity();
    if ((await this.head()) !== expected.localHead || (await this.head(session.remoteRef)) !== expected.remoteHead) throw errors.versionConflict(session.id);
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
   * Windows 通过命名管道取值，POSIX 通过该次 Git 子进程的环境取值，结束后删除启动器目录。
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
      const command = askpassCommand(target, script);
      return await this.git.run([...command.args, ...args], { env: { ...command.env, HUHU_GIT_USER: login.username, HUHU_GIT_TOKEN: login.token, HUHU_GIT_HOST: new URL(target).host }, signal, privateNetwork: true });
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

  private async network(config: SyncConfig, auth: NetworkAuth | null, signal: AbortSignal, source?: string, tool = false): Promise<void> {
    const args = (remote: string) =>
      source ? ["push", "--quiet", "--no-follow-tags", "--recurse-submodules=no", remote, `${source}:refs/heads/${config.branch}`] : ["fetch", "--quiet", "--prune", remote, "+refs/heads/*:refs/remotes/origin/*"];
    if (!auth) {
      if (tool) {
        await this.git.run(args(toolRemote(config.remote)), { env: { ...scrubEnvironment(), GIT_ALLOW_PROTOCOL: "ssh" }, signal, privateNetwork: true });
      } else {
        await this.git.run(args("origin"), { signal });
      }
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
      ...args(target),
    ];
    try {
      const urls = await this.git.run(["remote", "get-url", "--all", ...(source ? ["--push"] : []), "origin"], { signal, privateNetwork: true });
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

  preview(signal?: AbortSignal, expected?: SyncTarget, check?: () => void): Promise<SyncPreview> {
    return this.exclusive(() => this.previewLocked(this.signal(signal), expected, check));
  }

  private async previewLocked(signal: AbortSignal, expected?: SyncTarget, check?: () => void): Promise<SyncPreview> {
    if (signal.aborted) throw gitCancelled();
    const stored = this.readConfig();
    const c = stored.config;
    const auth = expected ? await this.assertToolTarget(stored, expected, signal) : undefined;
    check?.();
    await this.ready(c);
    if (expected) await this.assertEffectiveRemote(c, signal);
    try {
      await this.network(c, auth === undefined ? await this.networkAuth(stored) : auth, signal, undefined, Boolean(expected));
    } catch (e) {
      this.track(e);
    }
    const { push, skipped } = await this.safeGit.withLock(async () => this.planIncluded(await this.head(), c.exclude));
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
    if (expected && (await this.head()) !== expected.head) throw errors.versionConflict("Git HEAD");
    return { push, skipped, pull, ahead, behind };
  }

  private async head(ref = "HEAD"): Promise<string | null> {
    const result = await this.git.run(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { okCodes: [1] });
    return result.stdout.trim() || null;
  }

  private async planIncluded(head: string | null, exclude: readonly string[]) {
    const snapshot = this.safeGit.capture();
    const tree = await gitTree(this.git, head);
    const previousSafe = safeTree(tree);
    const safeRule = [...snapshot.keys()].map((file) => matchingExclude(file, exclude)).find((rule) => rule !== undefined);
    const keepSafe = safeRule === undefined;
    const blocked = previousSafe.size > 0 && !snapshot.size ? "已跟踪保险箱缺少当前整代快照，已保留本地资料" : previousSafe.size > 0 && !keepSafe ? `排除规则 ${safeRule} 会破坏已跟踪保险箱整代同步` : undefined;
    const safeChanged = keepSafe && !blocked && !(await this.safeGit.matches(previousSafe, snapshot));
    const files: string[] = [];
    const skipped = new Map<string, string>();
    for (const file of await this.changedPaths()) {
      if (snapshot.has(file)) continue;
      const verdict = classify(file, exclude);
      if (verdict.include) files.push(file);
      else skipped.set(file, verdict.reason);
    }
    if (!keepSafe || blocked) {
      for (const file of new Set([...snapshot.keys(), ...previousSafe.keys()])) skipped.set(file, blocked ?? `排除规则 ${safeRule} 命中保险箱成员，跳过整个保险箱`);
    }
    for (const file of previousSafe.keys()) {
      if (safeChanged && !snapshot.has(file)) skipped.set(file, "已脱离保险箱当前代，将移出同步树并保留本地文件");
    }
    const pruned = [...tree.keys()].filter((file) => !isSafePath(file) && !classify(file, []).include);
    for (const file of pruned) skipped.set(file, "不在同步范围，将移出同步树并保留本地文件");
    return {
      files,
      push: [...files, ...(safeChanged ? snapshot.keys() : [])],
      skipped: [...skipped].map(([path, reason]) => ({ path, reason })),
      previousSafe,
      selectedSafe: keepSafe ? snapshot : new Map<string, Buffer>(),
      safeChanged,
      pruned,
      blocked,
    };
  }

  /** 从固定 HEAD 构造候选，只把没有手工暂存的路径与新 HEAD 对齐。 */
  private async commitIncluded(message: string, exclude: readonly string[]): Promise<{ head: string | null; committed: boolean }> {
    const oldHead = await this.head();
    const { files, previousSafe, selectedSafe, safeChanged, pruned, blocked } = await this.planIncluded(oldHead, exclude);
    if (blocked) throw errors.invalidInput(blocked);
    if (!files.length && !safeChanged && !pruned.length) return { head: oldHead, committed: false };
    if (await this.head("MERGE_HEAD")) throw errors.invalidInput("请先完成当前 Git 合并，再运行同步");
    const stagedBefore = new Set((await this.git.run(["diff", "--cached", "--no-renames", "--name-only", "-z"])).stdout.split("\0"));
    const dir = mkdtempSync(path.join(os.tmpdir(), "huhu-idx-"));
    const env = { GIT_INDEX_FILE: path.join(dir, "index"), GIT_AUTHOR_NAME: this.identity.name, GIT_AUTHOR_EMAIL: this.identity.email, GIT_COMMITTER_NAME: this.identity.name, GIT_COMMITTER_EMAIL: this.identity.email };
    try {
      if (oldHead) await this.git.run(["read-tree", oldHead], { env });
      if (files.length) await this.git.run(["add", "-A", "--", ...files], { env });
      if (pruned.length) await this.git.run(["update-index", "--force-remove", "-z", "--stdin"], { env, input: `${pruned.join("\0")}\0` });
      if (safeChanged) await this.safeGit.stage(previousSafe, selectedSafe, env);
      const tree = (await this.git.run(["write-tree"], { env })).stdout.trim();
      if (oldHead && tree === (await this.git.run(["rev-parse", `${oldHead}^{tree}`])).stdout.trim()) return { head: oldHead, committed: false };
      const candidate = await gitTree(this.git, tree);
      this.verifyAllowed(candidate);
      if (!(await this.safeGit.matches(safeTree(candidate), selectedSafe))) throw errors.invalidInput("Git 候选中的保险箱路径或字节与当前整代快照不一致");
      await this.safeGit.validate(safeTree(candidate));
      const parent = oldHead ? ["-p", oldHead] : [];
      const commit = (await this.git.run(["commit-tree", tree, ...parent, "-m", message], { env })).stdout.trim();
      // 带旧值校验：同步期间用户自己做了提交时不会被覆盖
      await this.git.run(["update-ref", "-m", "huhu sync", "HEAD", commit, oldHead ?? "0".repeat(commit.length)]);
      // 用户自己的 index 与新的 HEAD 对齐：只重置用户没有手动暂存过的路径，用户暂存的内容保留
      const safePaths = safeChanged ? [...previousSafe.keys(), ...selectedSafe.keys()] : [];
      const toReset = [...new Set([...files, ...safePaths, ...pruned])].filter((f) => !stagedBefore.has(f));
      if (toReset.length) await this.git.run(["reset", "--quiet", commit, "--", ...toReset]).catch(() => undefined);
      return { head: commit, committed: true };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  private verifyAllowed(tree: Awaited<ReturnType<typeof gitTree>>): void {
    const forbidden = [...tree.keys()].find((file) => !isSafePath(file) && !classify(file, []).include);
    if (forbidden) throw errors.invalidInput("待推送的 Git 树含同步白名单外的资料，请检查本地提交和暂存区");
  }

  private async verifyOutbound(head: string, upstream: string | null, exclude: readonly string[], signal: AbortSignal): Promise<void> {
    const { stdout } = await this.git.run(["rev-list", head, ...(upstream ? [`^${upstream}`] : [])], { signal });
    for (const oid of new Set([head, ...stdout.trim().split("\n").filter(Boolean)])) {
      if (signal.aborted) throw gitCancelled();
      const tree = await gitTree(this.git, oid);
      this.verifyAllowed(tree);
      const safe = safeTree(tree);
      if ([...safe.keys()].some((file) => matchingExclude(file, exclude))) throw errors.invalidInput("待推送的 Git 提交含已排除的保险箱成员，无法推送整代资料");
      await this.safeGit.validate(safe);
    }
  }

  private async verifyMergedSafe(tree: string, expected: ReturnType<typeof safeTree>, ours: ReturnType<typeof safeTree>): Promise<void> {
    if (differentSafePaths(expected, safeTree(await gitTree(this.git, tree))).length) throw errors.invalidInput("合并结果改变了保险箱整代，已保留两侧资料");
    if (differentSafePaths(ours, expected).length) {
      if (!expected.size || !(await this.safeGit.matches(ours, this.safeGit.capture()))) throw errors.invalidInput("拉取会覆盖或移除本地保险箱资料，请先处理本地改动");
      await this.safeGit.verifyCheckout(tree, [...expected.keys()]);
    }
  }

  private async mergeRemote(remoteRef: string, remoteHead: string): Promise<boolean> {
    const localHead = await this.head();
    if (localHead && (await this.git.run(["merge-base", "--is-ancestor", remoteHead, localHead], { okCodes: [1] })).code === 0) return false;
    const ours = safeTree(await gitTree(this.git, localHead));
    const theirs = safeTree(await gitTree(this.git, remoteHead));
    const changed = differentSafePaths(ours, theirs);
    const safeFastForward = changed.length > 0 && (!localHead || (await this.git.run(["merge-base", "--is-ancestor", localHead, remoteHead], { okCodes: [1] })).code === 0);
    let verifiedTree: string | undefined;
    if (safeFastForward) {
      await this.safeGit.validate(theirs);
      await this.verifyMergedSafe(remoteHead, theirs, ours);
    } else if (localHead) {
      const expected = await this.safeGit.mergeGeneration(localHead, remoteHead, ours, theirs);
      if (!expected) {
        const sess = await this.cf.record(
          localHead,
          remoteHead,
          remoteRef,
          changed.map((file) => ({ path: file, base: null, ours: ours.get(file) ?? null, theirs: theirs.get(file) ?? null })),
          true,
        );
        throw new HuhuError("GIT_CONFLICT", "保险箱整代发生分歧，已保留本地和远端版本", { details: { files: changed, sessionId: sess.id } });
      }
      if (changed.length) await this.safeGit.validate(expected);
      const merge = await this.cf.detect(localHead, remoteHead, remoteRef);
      if (merge && "conflict" in merge) {
        const sess = merge.conflict;
        const files = sess.files.map((f) => f.path);
        throw new HuhuError("GIT_CONFLICT", `同步冲突：${files.join("、")}`, { details: { files, sessionId: sess.id } });
      }
      if (merge) {
        await this.verifyMergedSafe(merge.tree, expected, ours);
        if (changed.length) verifiedTree = merge.tree;
      } else if (ours.size || theirs.size) throw errors.invalidInput("无法核对含保险箱资料的 Git 合并结果");
    }
    if ((await this.head()) !== localHead || (await this.head("MERGE_HEAD"))) throw errors.invalidInput("本地 Git 状态已变化，请处理当前操作后重试");
    if (localHead && verifiedTree) {
      await this.cf.mergeVerifiedTree(localHead, remoteHead, verifiedTree);
      return true;
    }
    try {
      await this.git.run(["-c", `user.name=${this.identity.name}`, "-c", `user.email=${this.identity.email}`, "merge", "--no-edit", "--no-overwrite-ignore", ...(safeFastForward ? ["--ff-only"] : []), remoteHead]);
      return true;
    } catch {
      const files = (await this.git.run(["diff", "--name-only", "--diff-filter=U", "-z"]).catch(() => ({ stdout: "" }))).stdout.split("\0").filter(Boolean);
      await this.git.run(["merge", "--abort"]).catch(() => undefined);
      if (!files.length) throw new HuhuError("INTERNAL", "无法合并远端变更：本地有未提交且会被覆盖的文件，请先处理这些文件", { retryable: false });
      throw new HuhuError("GIT_CONFLICT", `同步冲突：${files.join("、")}`, { details: { files } });
    }
  }

  /** 同步一次：follow = 只拉取；full = 拉取后推送。冲突 → 回退合并、状态 conflict，抛 GIT_CONFLICT（附冲突文件）。 */
  run(mode: "pull" | "push" | "sync", signal?: AbortSignal, expected?: SyncTarget, check?: () => void): Promise<{ pulled: boolean; pushed: boolean; committed: boolean }> {
    return this.exclusive(() => this.runLocked(mode, this.signal(signal), undefined, undefined, expected, check));
  }

  runAutomatic(mode: "pull" | "sync", isCurrent: () => boolean, repair?: VersioningAuth, planSignal?: AbortSignal): Promise<boolean> {
    // 与配置保存共用队列，拿到执行权后再次确认当前修订。
    return this.exclusive(async () => {
      const stored = this.readConfig();
      const c = stored.config;
      const signal = this.signal(planSignal);
      if (!isCurrent() || signal.aborted || this.readOnly || loadSession(this.root) || c.mode === "off" || (mode === "sync" && c.mode !== "full")) return false;
      if (!repair) {
        await this.runLocked(mode, signal, stored, undefined, undefined, () => { if (!isCurrent()) throw gitCancelled(); });
      } else {
        const auth = await this.networkAuth(stored);
        if (!isCurrent() || signal.aborted || auth?.scope.target !== repair.target || auth.scope.revision !== repair.revision || auth.summary.state !== "configured") return false;
        await this.runLocked(mode, signal, stored, auth, undefined, () => { if (!isCurrent()) throw gitCancelled(); });
      }
      return true;
    });
  }

  private async runLocked(
    mode: "pull" | "push" | "sync",
    signal: AbortSignal,
    stored = this.readConfig(),
    preparedAuth?: NetworkAuth,
    expected?: SyncTarget,
    check?: () => void,
  ): Promise<{ pulled: boolean; pushed: boolean; committed: boolean }> {
    if (signal.aborted) throw gitCancelled();
    const c = stored.config;
    const fixedAuth = expected ? await this.assertToolTarget(stored, expected, signal) : undefined;
    check?.();
    await this.ready(c);
    try {
      if (expected) {
        await this.assertEffectiveRemote(c, signal);
        if (mode !== "pull") await this.assertEffectiveRemote(c, signal, true);
      }
      const auth = fixedAuth === undefined ? (preparedAuth ?? (await this.networkAuth(stored))) : fixedAuth;
      const candidate = mode === "pull" ? null : await this.safeGit.withLock(() => this.commitIncluded("HUHU 同步", c.exclude));
      await this.network(c, auth, signal, undefined, Boolean(expected));
      const remoteRef = `refs/remotes/origin/${c.branch}`;
      const upstream = await this.head(remoteRef);
      if (signal.aborted) throw gitCancelled();
      if (candidate && (await this.head()) !== candidate.head) throw errors.invalidInput("本地 Git 提交已变化，请重新同步");
      if (!candidate && expected && (await this.head()) !== expected.head) throw errors.versionConflict("Git HEAD");
      const pulled = mode !== "push" && upstream !== null && (await this.safeGit.withLock(() => this.mergeRemote(remoteRef, upstream)));
      let pushed = false;
      if (candidate) {
        const source = pulled ? await this.head() : candidate.head;
        if (!source) throw errors.invalidInput("没有可推送的 Git 提交");
        // Only subtract history known to be at the destination of the push.
        const fetchUrl = (await this.git.run(["remote", "get-url", "origin"])).stdout;
        const pushUrl = (await this.git.run(["remote", "get-url", "--push", "--all", "origin"])).stdout;
        await this.verifyOutbound(source, fetchUrl === pushUrl ? upstream : null, c.exclude, signal);
        await this.network(c, auth, signal, source, Boolean(expected));
        pushed = true;
      }
      this._status = { name: "idle", detail: "" };
      return { pulled, pushed, committed: candidate?.committed ?? false };
    } catch (e) {
      return this.track(e);
    }
  }

  // ---- 冲突解决 ----

  conflicts() {
    return this.cf.list();
  }

  conflictSummary() {
    const session = this.cf.session();
    if (!session) return null;
    const { id, createdAt, localHead, remoteHead, files } = session;
    return { id, createdAt, localHead, remoteHead, files: files.filter((file) => allowToolPath(file.path)).map((file) => ({ path: file.path, ...(file.summary ?? { kind: "unknown" as const, blocks: 0 }) })) };
  }

  conflictFile(p: string, expected?: ConflictTarget) {
    return this.exclusive(async () => {
      if (expected) {
        await this.assertConflict(expected);
        p = assertToolPath(this.root, p);
      }
      return this.cf.read(p);
    });
  }

  /** 放弃当前冲突会话（不改动任何文件；下次同步会重新检测）。 */
  cancelConflicts(expected?: ConflictTarget, check?: () => void): Promise<{ cancelled: boolean }> {
    return this.exclusive(async () => {
      this.requireWritable();
      if (expected) await this.assertConflict(expected);
      check?.();
      const cancelled = this.cf.cancel();
      this._status = { name: "idle", detail: "" };
      return { cancelled };
    });
  }

  /** 应用逐块选择，生成合并提交；之后 full 模式继续同步（推送失败不回退合并提交，只报告原因）。 */
  resolveConflicts(sessionId: string, resolutions: Resolution[], onSyncFailure?: (error: unknown) => void, expected?: ConflictTarget, check?: () => void): Promise<{ commit: string; pushed: boolean; syncError?: string }> {
    return this.exclusive(async () => {
      this.requireWritable();
      let target: SyncTarget | undefined;
      if (expected) {
        await this.assertConflict(expected);
        if (expected.sessionId !== sessionId) throw errors.versionConflict(expected.sessionId);
        resolutions = resolutions.map((r) => ({ ...r, path: assertToolPath(this.root, r.path) }));
        const stored = this.readConfig();
        if (stored.config.mode === "full") {
          const remote = toolRemote(stored.config.remote);
          if (!remote || this.cf.session()?.remoteRef !== `refs/remotes/origin/${stored.config.branch}`) throw errors.versionConflict(expected.remoteHead);
          const auth = await this.networkAuth(stored);
          target = { repositoryId: await new VaultGit(this.root).toolIdentity(), head: null, remote, branch: stored.config.branch, authRevision: auth?.scope.revision ?? null };
        }
      }
      check?.();
      const commit = await this.safeGit.withLock(() => this.cf.resolve(sessionId, resolutions));
      this._status = { name: "idle", detail: "" };
      if (this.config().mode !== "full") return { commit, pushed: false };
      try {
        const r = await this.runLocked("sync", this.signal(), undefined, undefined, target && { ...target, head: commit }, check);
        return { commit, pushed: r.pushed };
      } catch (e) {
        onSyncFailure?.(e);
        return { commit, pushed: false, syncError: e instanceof HuhuError ? e.code : "INTERNAL" };
      }
    });
  }
}
