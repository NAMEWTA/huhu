import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export function fixtureCoreCli(bin: string, env: NodeJS.ProcessEnv, cwd?: string) {
  return (...args: string[]) => {
    // Core's POSIX CLI starts a daemon to answer "server status". Check its
    // private socket first so absence and cleanup assertions cannot start it.
    if (process.platform !== "win32" && args[0] === "server" && args[1] === "status" && !existsSync(env.HC_SOCKET!)) {
      return { status: 5, stdout: "", stderr: "" };
    }
    return spawnSync(bin, args, { env, cwd, windowsHide: true, encoding: "utf8", timeout: 15_000 });
  };
}

export function fixtureProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    // Some Linux test runners do not reap orphaned children.
    if (process.platform === "linux") return !/^State:\s+Z\b/m.test(readFileSync(`/proc/${pid}/status`, "utf8"));
    return true;
  } catch (error) {
    if (["ESRCH", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}
