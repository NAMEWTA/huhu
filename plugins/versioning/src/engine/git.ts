import { execFile, spawn, type ChildProcess } from "node:child_process";
import { HuhuError } from "@huhu/contracts";

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}
export interface RunOpts {
  input?: string | Buffer;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  privateNetwork?: boolean;
  /** 这些非零退出码视为正常结果（如 merge-tree 有冲突时退出 1）。 */ okCodes?: number[];
}

export function gitCancelled(): HuhuError {
  return new HuhuError("INTERNAL", "Git 操作已取消", { retryable: false, details: { reason: "cancelled" } });
}

/** 这台电脑上有没有可用的 git（`git --version` 能运行）；结果缓存，不会每次请求都起进程。 */
/** 本机有 git 的结果缓存（装好就不会消失）；没有时每次重新检查：用户装好 Git 后不必重启应用。 */
let installedCache: Promise<boolean> | null = null;
export function gitInstalled(bin = "git"): Promise<boolean> {
  if (installedCache) return installedCache;
  const probe = new Promise<boolean>((resolve) => {
    execFile(bin, ["--version"], { timeout: 10_000, windowsHide: true }, (err) => resolve(!err));
  });
  void probe.then((ok) => {
    if (ok) installedCache = probe;
  });
  return probe;
}

const maxBuffer = 64 * 1024 * 1024;

function stopGitGroup(child: ChildProcess) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill();
  }
}

/** Private POSIX network commands own a process group that includes Git's transport helpers. */
function spawnGitGroup(file: string, args: string[], env: NodeJS.ProcessEnv, complete: (error: Error | null, stdout: Buffer, stderr: Buffer) => void) {
  const child = spawn(file, args, { env, detached: true });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let error: Error | null = null;
  const collect = (chunks: Buffer[]) => {
    let bytes = 0;
    return (chunk: Buffer) => {
      if (error) return;
      bytes += chunk.length;
      if (bytes > maxBuffer) {
        error = new Error("Git output exceeded the buffer limit");
        stopGitGroup(child);
      } else {
        chunks.push(chunk);
      }
    };
  };
  child.stdout.on("data", collect(stdout));
  child.stderr.on("data", collect(stderr));
  child.once("error", (cause) => {
    error ??= cause;
  });
  child.once("close", (code) => complete(error ?? (code === 0 ? null : Object.assign(new Error("Git process did not succeed"), { code })), Buffer.concat(stdout), Buffer.concat(stderr)));
  return child;
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
      if (opts.signal?.aborted) return reject(gitCancelled());
      let timedOut = false;
      const file = this.o.bin ?? "git";
      const argv = [...base, ...args];
      const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...this.o.env, ...opts.env };
      const privatePosixGroup = opts.privateNetwork === true && process.platform !== "win32" && opts.signal !== undefined;
      const complete = (err: Error | null, stdout: Buffer, stderr: Buffer) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", stop);
        if (opts.signal?.aborted) return reject(gitCancelled());
        if (timedOut) return reject(new HuhuError("GIT_OFFLINE", "Git 命令超时"));
        const code = err ? (err as { code?: unknown }).code : 0;
        if (code === "ENOENT") return reject(new HuhuError("INTERNAL", "没有找到 git：请先安装 Git，并确认它在 PATH 里", { retryable: false }));
        if (typeof code === "number" && (!err || opts.okCodes?.includes(code))) return resolve(enc === "buffer" ? stdout : { stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), code });
        const msg = stderr.toString("utf8").trim() || err?.message || "Git 命令失败";
        if (/index\.lock/.test(msg)) return reject(new HuhuError("INTERNAL", "另一个 Git 操作正在进行", { retryable: true }));
        if (/not a git repository/i.test(msg)) return reject(new HuhuError("GIT_NOT_REPOSITORY", "此 Vault 不是 Git 仓库"));
        if (/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Permission denied \(publickey\)|returned error: (401|403)/i.test(msg))
          return reject(new HuhuError("GIT_AUTH_FAILED", opts.privateNetwork ? "Git 远端认证失败" : `认证失败：${msg.split("\n")[0]}`));
        if (/Could not resolve host|unable to access|Connection (refused|timed out)/i.test(msg)) return reject(new HuhuError("GIT_OFFLINE", opts.privateNetwork ? "无法连接 Git 远端" : `无法连接远端：${msg.split("\n")[0]}`));
        if (/CONFLICT|Merge conflict/i.test(`${String(stdout)}\n${msg}`)) return reject(new HuhuError("GIT_CONFLICT", "存在冲突"));
        reject(new HuhuError("INTERNAL", opts.privateNetwork ? "Git 远端操作失败" : `git ${args[0]} 失败：${msg.split("\n")[0]}`, { retryable: false }));
      };
      const p = privatePosixGroup ? spawnGitGroup(file, argv, env, complete) : execFile(file, argv, { ...(opts.signal ? {} : { timeout: this.o.timeoutMs ?? 120_000 }), maxBuffer, encoding: "buffer", windowsHide: true, env }, complete);
      const stop = () => {
        if (privatePosixGroup) stopGitGroup(p);
        else if (process.platform === "win32" && p.pid) {
          execFile("taskkill.exe", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }, (error) => {
            if (error && p.exitCode === null) p.kill();
          });
        } else p.kill();
      };
      const timer = opts.signal
        ? setTimeout(() => {
            timedOut = true;
            stop();
          }, this.o.timeoutMs ?? 120_000)
        : undefined;
      opts.signal?.addEventListener("abort", stop, { once: true });
      if (opts.input !== undefined) {
        // The child result reports Git failures even if it exits before consuming stdin.
        p.stdin?.on("error", () => undefined);
        p.stdin?.end(opts.input);
      }
    });
  }
}
