import { execFile } from "node:child_process";
import { HuhuError } from "@huhu/contracts";

export interface GitResult { stdout: string; stderr: string }

/** 串行的 Git 执行器：同一时刻只有一个命令；超时 120 秒；不经 shell。 */
export class GitRunner {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly o: { gitDir?: string; workTree: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; bin?: string }) {}

  run(args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): Promise<GitResult> {
    const job = this.tail.then(() => this.exec(args, opts));
    this.tail = job.catch(() => undefined);
    return job;
  }

  private exec(args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv }): Promise<GitResult> {
    // core.quotepath=false：非 ASCII 路径（中文文件名）原样输出，不转义成八进制
    const base = ["-c", "core.quotepath=false", ...(this.o.gitDir ? ["--git-dir", this.o.gitDir, "--work-tree", this.o.workTree] : ["-C", this.o.workTree])];
    return new Promise((resolve, reject) => {
      const p = execFile(this.o.bin ?? "git", [...base, ...args], {
        timeout: this.o.timeoutMs ?? 120_000, maxBuffer: 64 * 1024 * 1024, encoding: "utf8", windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...this.o.env, ...opts.env },
      }, (err, stdout, stderr) => {
        if (!err) return resolve({ stdout, stderr });
        const msg = `${stderr}`.trim() || err.message;
        if (/index\.lock/.test(msg)) return reject(new HuhuError("INTERNAL", "另一个 Git 操作正在进行", { retryable: true }));
        if (/not a git repository/i.test(msg)) return reject(new HuhuError("GIT_NOT_REPOSITORY", "此 Vault 不是 Git 仓库"));
        if (/Authentication failed|could not read Username|Permission denied \(publickey\)/i.test(msg)) return reject(new HuhuError("GIT_AUTH_FAILED", `认证失败：${msg.split("\n")[0]}`));
        if (/Could not resolve host|unable to access|Connection (refused|timed out)/i.test(msg)) return reject(new HuhuError("GIT_OFFLINE", `无法连接远端：${msg.split("\n")[0]}`));
        if (/CONFLICT|Merge conflict/i.test(`${stdout}\n${msg}`)) return reject(new HuhuError("GIT_CONFLICT", "存在冲突"));
        reject(new HuhuError("INTERNAL", `git ${args[0]} 失败：${msg.split("\n")[0]}`, { retryable: false }));
      });
      if (opts.input !== undefined) p.stdin?.end(opts.input);
    });
  }
}
