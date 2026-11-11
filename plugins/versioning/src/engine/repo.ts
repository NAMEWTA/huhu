import { existsSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { normalizeRelPath } from "@huhu/vault";
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

export const DEFAULT_GITIGNORE = [".huhu/runtime/", ".huhu/cache/", ".huhu/ui/", ".huhu/history/", ""].join("\n");

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

  private assertRepo(): void {
    if (!this.isRepo()) throw errors.invalidInput("此 Vault 不是 Git 仓库");
  }

  /** 初始化仓库；写入默认 .gitignore（已存在则不覆盖）。返回将创建的 .gitignore 内容供界面确认。 */
  async init(): Promise<{ created: boolean; gitignore: string }> {
    if (this.isRepo()) return { created: false, gitignore: "" };
    await this.git.run(["init", "--quiet"]);
    const ignore = path.join(this.root, ".gitignore");
    const { writeFileSync } = await import("node:fs");
    if (!existsSync(ignore)) writeFileSync(ignore, DEFAULT_GITIGNORE);
    return { created: true, gitignore: DEFAULT_GITIGNORE };
  }

  async status(): Promise<{ branch: string | null; files: GitFileStatus[] }> {
    this.assertRepo();
    const out = (await this.git.run(["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"])).stdout;
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

  async log(limit = 50): Promise<GitCommit[]> {
    this.assertRepo();
    const has = await this.git.run(["rev-parse", "--verify", "HEAD"]).then(
      () => true,
      () => false,
    );
    if (!has) return [];
    const out = (await this.git.run(["log", `-n${Math.min(limit, 500)}`, "--format=%H%x1f%an%x1f%cI%x1f%s%x1e"])).stdout;
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
  async diff(opts: { path?: string; staged?: boolean; commit?: string }): Promise<string> {
    this.assertRepo();
    if (opts.commit !== undefined && !/^[0-9a-f]{40,64}$/.test(opts.commit)) throw errors.invalidInput("提交 id 无效");
    const p = opts.path !== undefined ? normalizeRelPath(opts.path) : undefined;
    const args = opts.commit ? ["show", "--format=", "--no-color", opts.commit] : ["diff", "--no-color", ...(opts.staged ? ["--cached"] : [])];
    return (await this.git.run([...args, ...(p ? ["--", p] : [])])).stdout;
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
}
