import { execFile } from "node:child_process";
import { HuhuError } from "@huhu/contracts";

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}
export interface RunOpts {
  input?: string;
  env?: NodeJS.ProcessEnv;
  /** 这些非零退出码视为正常结果（如 merge-tree 有冲突时退出 1）。 */ okCodes?: number[];
}

/** 这台电脑上有没有可用的 git（`git --version` 能运行）；结果缓存，不会每次请求都起进程。 */
let installedCache: Promise<boolean> | null = null;
export function gitInstalled(bin = "git"): Promise<boolean> {
  installedCache ??= new Promise<boolean>((resolve) => {
    execFile(bin, ["--version"], { timeout: 10_000, windowsHide: true }, (err) => resolve(!err));
  });
  return installedCache;
}

/** 串行的 Git 执行器：同一时刻只有一个命令；超时 120 秒；不经 shell。 */
export class GitRunner {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly o: { gitDir?: string; workTree: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; bin?: string }) {}

  run(args: string[], opts: RunOpts = {}): Promise<GitResult> {
    const job = this.tail.then(() => this.exec(args, opts, "utf8")) as Promise<GitResult>;
    this.tail = job.catch(() => undefined);
    return job;
  }

  /** 读取原始字节（blob 内容可能不是合法 UTF-8）。 */
  runBuffer(args: string[], opts: RunOpts = {}): Promise<Buffer> {
    const job = this.tail.then(() => this.exec(args, opts, "buffer")) as Promise<Buffer>;
    this.tail = job.catch(() => undefined);
    return job;
  }

  private exec(args: string[], opts: RunOpts, enc: "utf8" | "buffer"): Promise<GitResult | Buffer> {
    // core.quotepath=false：非 ASCII 路径（中文文件名）原样输出，不转义成八进制；
    // core.autocrlf=false：Windows 的系统 / 用户配置常把它设为 true，合并 / 检出时会改写用户笔记的换行符，Vault 里的文件必须字节保真
    const base = ["-c", "core.quotepath=false", "-c", "core.autocrlf=false", ...(this.o.gitDir ? ["--git-dir", this.o.gitDir, "--work-tree", this.o.workTree] : ["-C", this.o.workTree])];
    return new Promise((resolve, reject) => {
      const p = execFile(
        this.o.bin ?? "git",
        [...base, ...args],
        {
          timeout: this.o.timeoutMs ?? 120_000,
          maxBuffer: 64 * 1024 * 1024,
          encoding: enc === "buffer" ? "buffer" : "utf8",
          windowsHide: true,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...this.o.env, ...opts.env },
        },
        (err, stdout, stderr) => {
          if (!err) return resolve(enc === "buffer" ? (stdout as unknown as Buffer) : { stdout: stdout as string, stderr: stderr as string, code: 0 });
          const code = (err as { code?: unknown }).code;
          if (code === "ENOENT") return reject(new HuhuError("INTERNAL", "没有找到 git：请先安装 Git，并确认它在 PATH 里", { retryable: false }));
          if (typeof code === "number" && opts.okCodes?.includes(code)) return resolve(enc === "buffer" ? (stdout as unknown as Buffer) : { stdout: stdout as string, stderr: stderr as string, code });
          const msg = `${stderr}`.trim() || err.message;
          if (/index\.lock/.test(msg)) return reject(new HuhuError("INTERNAL", "另一个 Git 操作正在进行", { retryable: true }));
          if (/not a git repository/i.test(msg)) return reject(new HuhuError("GIT_NOT_REPOSITORY", "此 Vault 不是 Git 仓库"));
          if (/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Permission denied \(publickey\)/i.test(msg)) return reject(new HuhuError("GIT_AUTH_FAILED", `认证失败：${msg.split("\n")[0]}`));
          if (/Could not resolve host|unable to access|Connection (refused|timed out)/i.test(msg)) return reject(new HuhuError("GIT_OFFLINE", `无法连接远端：${msg.split("\n")[0]}`));
          if (/CONFLICT|Merge conflict/i.test(`${String(stdout)}\n${msg}`)) return reject(new HuhuError("GIT_CONFLICT", "存在冲突"));
          reject(new HuhuError("INTERNAL", `git ${args[0]} 失败：${msg.split("\n")[0]}`, { retryable: false }));
        },
      );
      if (opts.input !== undefined) p.stdin?.end(opts.input);
    });
  }
}
