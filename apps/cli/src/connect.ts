import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { ENGINE_PORT_CONFLICT_EXIT } from "@huhu/contracts";
import { findVaultRoot, probeEngine, readEngineEndpoint, type EngineEndpointRecord, type EngineMode, type EngineStatus } from "@huhu/vault";
import { setTimeout as delay } from "node:timers/promises";
import desktopPackage from "../../desktop/package.json" with { type: "json" };

export interface Connection {
  baseUrl: string;
  token: string;
  vaultId: string;
}

export class ConnectError extends Error {
  readonly exitCode = 3;
}

function readLive(root: string): EngineEndpointRecord | null {
  const result = readEngineEndpoint(root);
  if (result.state === "conflict") throw new ConnectError(result.message);
  return result.state === "running" ? result.endpoint : null;
}

export function locateVault(explicit: string | undefined): string {
  const root = explicit ? path.resolve(explicit) : findVaultRoot(process.cwd());
  if (!root || !existsSync(path.join(root, ".huhu", "vault.json"))) throw new ConnectError("找不到 Vault：请用 --vault 指定，或在 Vault 目录内运行");
  return root;
}

function defaultDesktopUserData(): string | undefined {
  let appData: string | undefined;
  switch (process.platform) {
    case "win32":
      appData = process.env["APPDATA"];
      break;
    case "darwin":
      appData = path.join(homedir(), "Library", "Application Support");
      break;
    case "linux": {
      const xdg = process.env["XDG_CONFIG_HOME"];
      appData = xdg && path.isAbsolute(xdg) ? xdg : path.join(homedir(), ".config");
      break;
    }
  }
  if (!appData || !path.isAbsolute(appData)) return undefined;
  // Electron's default userData uses the application name from the shipped manifest.
  const { name, productName }: { name: string; productName?: string } = desktopPackage;
  return path.join(appData, (productName ?? name).trim());
}

interface StartOptions { engineEntry?: string; timeoutMs?: number; idleExitMs?: number }

async function findOrStart(root: string, opts: StartOptions, expected?: EngineMode): Promise<EngineEndpointRecord> {
  const mode = expected ?? "temporary";
  let d = readLive(root);
  if (!d) {
    const entry = opts.engineEntry ?? process.env["HUHU_ENGINE_ENTRY"];
    if (!entry) throw new ConnectError("无法启动 Engine：未配置引擎入口");
    const args = entry.endsWith(".ts") ? [createRequire(import.meta.url).resolve("tsx/cli"), entry] : [entry];
    const desktopUserData = process.env["HUHU_DESKTOP_USER_DATA"] || defaultDesktopUserData();
    const child = spawn(process.execPath, [...args, "--vault", root, "--mode", mode, ...(mode === "temporary" ? ["--idle-exit-ms", String(opts.idleExitMs ?? 60_000)] : [])], {
      detached: true,
      stdio: "ignore",
      ...(desktopUserData && { env: { ...process.env, HUHU_DESKTOP_USER_DATA: desktopUserData } }),
    });
    let exit: number | null | undefined;
    let spawnFailure: Error | undefined;
    child.once("exit", (code) => { exit = code; });
    child.once("error", (error) => { spawnFailure = error; });
    child.unref();
    const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
    while (!d && Date.now() < deadline) {
      await delay(100);
      d = readLive(root);
      if (d) break;
      if (spawnFailure) throw new ConnectError(`无法启动 Engine：${spawnFailure.message}`);
      if (exit === ENGINE_PORT_CONFLICT_EXIT) throw new ConnectError("无法启动 Engine：本机监听端口已被占用");
      // A simultaneous launcher may already be opening the same Vault. Wait
      // for its record while the writer lock remains held.
      if (exit !== undefined && !existsSync(path.join(root, ".huhu", "writer.lock"))) throw new ConnectError("Engine 启动失败，请检查 Vault 写权限或从桌面打开查看错误");
    }
    if (!d) throw new ConnectError(existsSync(path.join(root, ".huhu", "writer.lock")) ? "Vault 已有写者，但未能确认可连接的 Engine" : "等待 Engine 启动超时");
  }
  if (expected && d.mode !== expected) throw new ConnectError(`当前 Engine 模式为 ${d.mode}。请先停止它，再以 ${expected} 模式启动`);
  return d;
}

async function control(endpoint: EngineEndpointRecord, action: "status" | "stop" = "status"): Promise<EngineStatus> {
  try {
    return (await probeEngine(endpoint, action)).status;
  } catch (error) {
    throw new ConnectError(error instanceof Error && !endpoint.instance ? error.message : "无法确认 Engine 管理入口与 Vault 的绑定，请从原宿主检查进程");
  }
}

/** 连接当前 Engine。没有运行实例时，按普通 CLI 的空闲退出语义启动。 */
export async function connect(vaultOpt: string | undefined, opts: StartOptions = {}): Promise<Connection> {
  const d = await findOrStart(locateVault(vaultOpt), opts);
  if (d.instance) await control(d);
  return { baseUrl: `http://127.0.0.1:${d.port}`, token: d.cliToken, vaultId: d.vaultId };
}

type LifecycleStatus = { state: "stopped" } | { state: "running"; mode: EngineMode; pid: number; port: number; vaultId: string; startedAt: string };

export async function engineLifecycle(action: "status" | "start" | "stop", vaultOpt: string | undefined, mode: EngineMode = "resident", opts: StartOptions = {}): Promise<LifecycleStatus> {
  const root = locateVault(vaultOpt);
  if (action === "start" && !process.getuid) throw new ConnectError("此平台不支持本机 Engine 管理入口");
  const current = action === "start" ? await findOrStart(root, opts, mode) : readLive(root);
  if (!current) return { state: "stopped" };
  const { pid, port, vaultId, startedAt } = await control(current, action === "stop" ? "stop" : "status");
  if (action !== "stop") return { state: "running", mode: current.mode, pid, port, vaultId, startedAt };
  const deadline = Date.now() + (opts.timeoutMs ?? 18_000);
  while (Date.now() < deadline) {
    await delay(100);
    const next = readLive(root);
    if (next && next.instance !== current.instance) throw new ConnectError("原 Engine 已退出，Vault 已由另一个 Engine 接管");
    if (!next && !existsSync(path.join(root, ".huhu", "writer.lock"))) return { state: "stopped" };
  }
  throw new ConnectError(`等待 Engine 停止超时（进程 ${pid}）`);
}
