import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { findVaultRoot, machineId } from "@huhu/vault";

export interface Connection {
  baseUrl: string;
  token: string;
  vaultId: string;
}

export class ConnectError extends Error {
  readonly exitCode = 3;
}

function descriptorFile(root: string): string {
  return path.join(root, ".huhu", "runtime", machineId(), "engine.json");
}

function readLive(root: string): { port: number; cliToken: string; vaultId: string } | null {
  const f = descriptorFile(root);
  if (!existsSync(f)) return null;
  try {
    const d = JSON.parse(readFileSync(f, "utf8")) as { pid: number; port: number; cliToken: string; vaultId: string };
    process.kill(d.pid, 0);
    return d;
  } catch {
    rmSync(f, { force: true }); // 进程已不存在：删除陈旧描述
    return null;
  }
}

export function locateVault(explicit: string | undefined): string {
  const root = explicit ? path.resolve(explicit) : findVaultRoot(process.cwd());
  if (!root || !existsSync(path.join(root, ".huhu", "vault.json"))) throw new ConnectError("找不到 Vault：请用 --vault 指定，或在 Vault 目录内运行");
  return root;
}

/** 连接已运行的 Engine；没有则启动无界面 Engine（空闲 60 秒后自行退出）。 */
export async function connect(vaultOpt: string | undefined, opts: { engineEntry?: string; timeoutMs?: number; idleExitMs?: number } = {}): Promise<Connection> {
  const root = locateVault(vaultOpt);
  let d = readLive(root);
  if (!d) {
    const entry = opts.engineEntry ?? process.env["HUHU_ENGINE_ENTRY"];
    if (!entry) throw new ConnectError("无法启动 Engine：未配置引擎入口");
    const args = entry.endsWith(".ts") ? [createRequire(import.meta.url).resolve("tsx/cli"), entry] : [entry];
    const child = spawn(process.execPath, [...args, "--vault", root, "--idle-exit-ms", String(opts.idleExitMs ?? 60_000)], { detached: true, stdio: "ignore" });
    child.unref();
    const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
    while (!d && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      d = readLive(root);
    }
    if (!d) throw new ConnectError("等待 Engine 启动超时");
  }
  return { baseUrl: `http://127.0.0.1:${d.port}`, token: d.cliToken, vaultId: d.vaultId };
}

