import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { endpointRootBinding, findVaultRoot, machineId } from "@huhu/vault";
import desktopPackage from "../../desktop/package.json" with { type: "json" };

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

function readLive(root: string): { port: number; cliToken: string; mcpToken?: string; vaultId: string } | null {
  const f = descriptorFile(root);
  if (!existsSync(f)) return null;
  try {
    const d = JSON.parse(readFileSync(f, "utf8")) as { pid: number; port: number; cliToken: string; mcpToken?: string; vaultId: string; rootBinding?: string };
    if (d.rootBinding !== endpointRootBinding(root) || !Number.isSafeInteger(d.pid) || d.pid <= 0 || !Number.isSafeInteger(d.port) || d.port < 1 || d.port > 65_535) return null;
    process.kill(d.pid, 0);
    return d;
  } catch {
    return null;
  }
}

function tokenFor(role: "cli" | "mcp" | undefined, d: { cliToken: string; mcpToken?: string }): string {
  if (role !== "mcp") return d.cliToken;
  if (!d.mcpToken) throw new ConnectError("Engine 没有提供 MCP 令牌，请更新或重启 Engine"); // 不静默降级为 cli 身份
  return d.mcpToken;
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

/** 连接已运行的 Engine；没有则启动无界面 Engine（空闲 60 秒后自行退出）。 */
export async function connect(vaultOpt: string | undefined, opts: { engineEntry?: string; timeoutMs?: number; idleExitMs?: number; role?: "cli" | "mcp" } = {}): Promise<Connection> {
  const root = locateVault(vaultOpt);
  let d = readLive(root);
  if (!d) {
    const entry = opts.engineEntry ?? process.env["HUHU_ENGINE_ENTRY"];
    if (!entry) throw new ConnectError("无法启动 Engine：未配置引擎入口");
    const args = entry.endsWith(".ts") ? [createRequire(import.meta.url).resolve("tsx/cli"), entry] : [entry];
    const desktopUserData = process.env["HUHU_DESKTOP_USER_DATA"] || defaultDesktopUserData();
    const child = spawn(process.execPath, [...args, "--vault", root, "--idle-exit-ms", String(opts.idleExitMs ?? 60_000)], {
      detached: true,
      stdio: "ignore",
      ...(desktopUserData && { env: { ...process.env, HUHU_DESKTOP_USER_DATA: desktopUserData } }),
    });
    child.unref();
    const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
    while (!d && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      d = readLive(root);
    }
    if (!d) throw new ConnectError("等待 Engine 启动超时");
  }
  return { baseUrl: `http://127.0.0.1:${d.port}`, token: tokenFor(opts.role, d), vaultId: d.vaultId };
}
