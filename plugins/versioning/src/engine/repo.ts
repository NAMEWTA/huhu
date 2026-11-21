import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { CREATION_STAGE_PREFIX, directoryInstance, normalizeRelPath, protectedKindOf, resolveInVault } from "@huhu/vault";
import { GitRunner } from "./git.js";

export interface GitFileStatus {
  path: string;
  /** 暂存区状态 / 工作区状态（git status --porcelain 的 XY）。 */
  index: string;
  worktree: string;
  from?: string;
}

export interface GitCommit {
  id: string;
  short: string;
  author: string;
  at: string;
  subject: string;
}

export interface RepositoryBaseline {
  id: string;
  head: string | null;
  index: string | null;
}

export function allowToolPath(rel: string): boolean {
  return !protectedKindOf(rel) && !rel.split("/").some((part) => part.startsWith(CREATION_STAGE_PREFIX));
}

export function assertToolPath(root: string, value: string, allowGuide = false): string {
  const rel = normalizeRelPath(value);
  const guideRoot = ".agents/skills/huhu/";
  if (!allowToolPath(rel) && !(allowGuide && rel.startsWith(guideRoot) && allowToolPath(rel.slice(guideRoot.length)))) throw errors.permissionDenied(rel);
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).join("/");
    const info = lstatSync(resolveInVault(root, prefix), { throwIfNoEntry: false });
    if (info?.isSymbolicLink() || (info && (i === parts.length ? !info.isFile() : !info.isDirectory()))) throw errors.permissionDenied(rel);
  }
  return rel;
}

export const DEFAULT_GITIGNORE = [".huhu/runtime/", ".huhu/cache/", ".huhu/ui/", ".huhu/history/", ".huhu/diagnostics/", ""].join("\n");
const toolReadOptions = { env: { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: undefined, GIT_CONFIG_PARAMETERS: undefined } };

/** Vault 根目录下用户自己的 Git 仓库（与文件历史的 shadow 仓库无关）。 */
export class VaultGit {
  private git: GitRunner;

  constructor(
    private readonly root: string,
    private readonly identity: { name: string; email: string } = { name: "HUHU", email: "huhu@localhost" },
  ) {
    this.git = new GitRunner({ workTree: root });
  }

  isRepo(): boolean {
    return existsSync(path.join(this.root, ".git"));
  }

  async toolIdentity(): Promise<string> {
    const dir = path.join(this.root, ".git");
    const info = lstatSync(dir, { throwIfNoEntry: false });
    const instance = info?.isDirectory() && directoryInstance(dir);
    if (!instance || existsSync(path.join(dir, "commondir"))) throw errors.permissionDenied("需要当前 Vault 的独立 Git 仓库");
    for (const entry of ["config", "index", "HEAD", "objects", "refs", "objects/info/alternates", "info/grafts"]) {
      if (lstatSync(path.join(dir, entry), { throwIfNoEntry: false })?.isSymbolicLink()) throw errors.permissionDenied("Git 元数据指向其他位置");
    }
    // Tool calls may not execute commands supplied by repository-local configuration.
    const config = await this.git.run(["config", "--local", "--no-includes", "--name-only", "--null", "--list"]);
    if (config.stdout.split("\0").some((key) => /^(include(?:if)?\.|filter\.|merge\..*\.driver$|core\.(?:worktree|hookspath|sshcommand)$|remote\..*\.(?:uploadpack|receivepack|promisor)$)/i.test(key))) {
      throw errors.permissionDenied("此仓库含仅供工作台使用的 Git 配置");
    }
    if (existsSync(path.join(dir, "objects/info/alternates"))) throw errors.permissionDenied("Git 对象来自其他仓库");
    const hooks = path.join(dir, "hooks");
    if (existsSync(hooks) && readdirSync(hooks).some((name) => !name.endsWith(".sample"))) throw errors.permissionDenied("此仓库的 Git hooks 仅供工作台使用");
    return JSON.stringify(instance);
  }

  async baseline(): Promise<RepositoryBaseline> {
    const id = await this.toolIdentity();
    const head = (await this.git.run(["rev-parse", "--verify", "--quiet", "HEAD"], { okCodes: [1] })).stdout.trim() || null;
    const indexFile = path.join(this.root, ".git", "index");
    const index = existsSync(indexFile) ? createHash("sha256").update(readFileSync(indexFile)).digest("hex") : null;
    return { id, head, index };
  }

  async assertBaseline(expected: RepositoryBaseline): Promise<void> {
    const actual = await this.baseline();
    if (actual.id !== expected.id || actual.head !== expected.head || actual.index !== expected.index) throw errors.versionConflict(JSON.stringify(actual));
  }

  private assertRepo(): void {
    if (!this.isRepo()) throw errors.invalidInput("此 Vault 不是 Git 仓库");
  }

  /** 初始化仓库；写入默认 .gitignore（已存在则不覆盖）。返回将创建的 .gitignore 内容供界面确认。 */
  async init(tool = false): Promise<{ created: boolean; gitignore: string }> {
    if (tool && lstatSync(path.join(this.root, ".git"), { throwIfNoEntry: false })) await this.toolIdentity();
    if (this.isRepo()) return { created: false, gitignore: "" };
    await this.git.run(["init", "--quiet", ...(tool ? ["--template="] : [])]);
    const ignore = path.join(this.root, ".gitignore");
    if (!lstatSync(ignore, { throwIfNoEntry: false })) writeFileSync(ignore, DEFAULT_GITIGNORE, { flag: "wx" });
    return { created: true, gitignore: DEFAULT_GITIGNORE };
  }

  async status(tool = false): Promise<{ branch: string | null; files: GitFileStatus[] }> {
    this.assertRepo();
    const out = (await this.git.run(["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all", ...(tool ? ["--ignore-submodules=all"] : [])], tool ? toolReadOptions : {})).stdout;
    const parts = out.split("\0").filter(Boolean);
    const head = parts.shift() ?? "";
    const branch = head.startsWith("## ")
      ? (head
          .slice(3)
          .split("...")[0]
          ?.replace(/^No commits yet on /, "") ?? null)
      : null;
    const files: GitFileStatus[] = [];
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i] as string;
      const x = e[0] as string;
      const y = e[1] as string;
      const p = e.slice(3);
      if (x === "R" || x === "C") files.push({ path: p, index: x, worktree: y, from: parts[++i] as string });
      else files.push({ path: p, index: x, worktree: y });
    }
    return { branch, files };
  }

  async log(limit = 50, ref = "HEAD", tool = false): Promise<GitCommit[]> {
    this.assertRepo();
    const options = tool ? toolReadOptions : {};
    const has = await this.git.run(["rev-parse", "--verify", ref], options).then(
      () => true,
      () => false,
    );
    if (!has) return [];
    const out = (await this.git.run(["log", `-n${Math.min(limit, 500)}`, "--format=%H%x1f%an%x1f%cI%x1f%s%x1e", ref], options)).stdout;
    return out
      .split("\u001e")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [id = "", author = "", at = "", subject = ""] = r.split("\u001f");
        return { id, short: id.slice(0, 7), author, at, subject };
      });
  }

  /** 差异：`staged` 比较暂存区与 HEAD，否则工作区与暂存区；`commit` 给出某次提交的变更。 */
  async diff(opts: { path?: string; staged?: boolean; commit?: string; tool?: boolean }): Promise<string> {
    this.assertRepo();
    if (opts.commit !== undefined && !/^[0-9a-f]{40,64}$/.test(opts.commit)) throw errors.invalidInput("提交 id 无效");
    const p = opts.path !== undefined ? normalizeRelPath(opts.path) : undefined;
    const flags = ["--no-color", ...(opts.tool ? ["--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--no-renames"] : [])];
    const args = opts.commit ? ["show", "--format=", ...flags, opts.commit] : ["diff", ...flags, ...(opts.staged ? ["--cached"] : [])];
    return (await this.git.run([...args, ...(p ? ["--", p] : [])], opts.tool ? toolReadOptions : {})).stdout;
  }

  async stage(paths: string[]): Promise<void> {
    this.assertRepo();
    if (paths.length === 0) return;
    await this.git.run(["add", "-A", "--", ...paths.map(normalizeRelPath)]);
  }

  async unstage(paths: string[]): Promise<void> {
    this.assertRepo();
    if (paths.length === 0) return;
    const hasHead = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(
      () => true,
      () => false,
    );
    const ps = paths.map(normalizeRelPath);
    await this.git.run(hasHead ? ["reset", "--quiet", "HEAD", "--", ...ps] : ["rm", "--cached", "--quiet", "-r", "--", ...ps]);
  }

  async commit(message: string): Promise<GitCommit> {
    this.assertRepo();
    if (!message.trim()) throw errors.invalidInput("提交说明不能为空");
    const staged = await this.git.run(["diff", "--cached", "--quiet"]).then(
      () => false,
      () => true,
    );
    if (!staged) throw errors.invalidInput("暂存区没有变更");
    // 用 -F - 从 stdin 读说明：说明以 - 开头也不会被当成选项
    await this.git.run(["-c", `user.name=${this.identity.name}`, "-c", `user.email=${this.identity.email}`, "commit", "--quiet", "-F", "-"], { input: message });
    return (await this.log(1))[0] as GitCommit;
  }

  async commitExpected(message: string, expected: RepositoryBaseline, check: () => void): Promise<Omit<GitCommit, "subject">> {
    if (!message.trim()) throw errors.invalidInput("提交说明不能为空");
    await this.assertBaseline(expected);
    if (!expected.index) throw errors.invalidInput("暂存区没有变更");
    if (existsSync(path.join(this.root, ".git", "MERGE_HEAD"))) throw errors.invalidInput("请在工作台完成当前 Git 合并");

    const index = readFileSync(path.join(this.root, ".git", "index"));
    if (createHash("sha256").update(index).digest("hex") !== expected.index) throw errors.versionConflict("Git index");
    const dir = mkdtempSync(path.join(os.tmpdir(), "huhu-commit-"));
    const env = { GIT_INDEX_FILE: path.join(dir, "index"), GIT_AUTHOR_NAME: this.identity.name, GIT_AUTHOR_EMAIL: this.identity.email, GIT_COMMITTER_NAME: this.identity.name, GIT_COMMITTER_EMAIL: this.identity.email };
    try {
      writeFileSync(env.GIT_INDEX_FILE, index, { mode: 0o600 });
      const out = (await this.git.run(["diff", "--cached", "--no-renames", "--raw", "-z", ...(expected.head ? [expected.head] : [])], { env })).stdout;
      if (!out) throw errors.invalidInput("暂存区没有变更");
      const changes = out.split("\0");
      for (let i = 0; i + 1 < changes.length; i += 2) {
        const rel = assertToolPath(this.root, changes[i + 1]!);
        const mode = changes[i]!.split(" ")[1];
        if (mode !== "100644" && mode !== "100755" && mode !== "000000") throw errors.permissionDenied(rel);
      }
      const tree = (await this.git.run(["write-tree"], { env })).stdout.trim();
      const id = (await this.git.run(["-c", "commit.gpgSign=false", "commit-tree", tree, ...(expected.head ? ["-p", expected.head] : []), "-F", "-"], { input: message, env })).stdout.trim();
      await this.assertBaseline(expected);
      check();
      await this.git.run(["update-ref", "-m", "huhu git commit", "HEAD", id, expected.head ?? "0".repeat(id.length)]);
      const { subject: _, ...commit } = (await this.log(1, id))[0]!;
      return commit;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
