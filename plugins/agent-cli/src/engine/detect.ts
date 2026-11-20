import { execFile } from "node:child_process";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { AGENT_CATALOG, type AgentCatalogEntry, type AgentId } from "../shared/catalog.js";
import { entryOf, isEnabled, type AgentSettingsFile } from "../shared/settings.js";

export interface DetectInfo {
  id: AgentId;
  displayName: string;
  installed: boolean;
  /** 已停用：没有探测。 */
  skipped?: true;
  path?: string;
  version?: string;
  via?: "path" | "installDir" | "override";
  headless: boolean;
  detectedAt: string;
}

const exts = (env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] => (platform === "win32" ? (env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase()) : [""]);

function runnable(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    if (platform !== "win32") accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** 在一组目录里查找可执行文件（Windows 考虑 PATHEXT）。 */
export function findInDirs(cmd: string, dirs: string[], env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const extensions = exts(env, platform);
  const suffixes = extensions.includes(path.extname(cmd).toLowerCase()) ? [""] : extensions;
  for (const dir of dirs) {
    for (const ext of suffixes) {
      const candidate = path.resolve(dir, cmd + ext);
      if (runnable(candidate, platform)) return candidate;
    }
  }
  return null;
}

/** 在 PATH 里查找可执行文件。 */
export function findOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const dirs = (env["PATH"] ?? env["Path"] ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  return findInDirs(cmd, dirs, env, platform);
}

/**
 * PATH 找不到时再查的安装目录（GUI 启动的应用常常没有用户 shell 的 PATH）。
 * 所有智能体共用一份表；顺序：版本管理器 → 用户级目录 → 系统目录。
 * 来源：Orca src/shared/node-cli-command-resolution.ts（MIT, Copyright 2026 Lovecast Inc.）。
 */
export function installDirs(home: string = homedir(), platform: NodeJS.Platform = process.platform): string[] {
  const dirs: string[] = [];
  try {
    const nvm = path.join(home, ".nvm", "versions", "node");
    for (const v of readdirSync(nvm).sort().reverse()) dirs.push(path.join(nvm, v, "bin"));
  } catch {
    /* 没装 nvm */
  }
  dirs.push(path.join(home, ".volta", "bin"), path.join(home, ".asdf", "shims"), path.join(home, ".local", "share", "mise", "shims"), path.join(home, ".local", "bin"));
  if (platform === "win32") {
    dirs.push(path.join(home, "AppData", "Roaming", "npm"), path.join(home, "AppData", "Local", "pnpm"), path.join(home, "AppData", "Local", "Yarn", "bin"));
  } else {
    dirs.push(platform === "darwin" ? path.join(home, "Library", "pnpm") : path.join(home, ".local", "share", "pnpm"), path.join(home, ".yarn", "bin"));
  }
  dirs.push(path.join(home, ".bun", "bin"));
  if (platform === "darwin") dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  else if (platform !== "win32") dirs.push("/usr/local/bin", "/usr/bin", "/snap/bin");
  return dirs;
}

/** 运行 `<exe> <args>`，5 秒超时；返回首行文本或 null。 */
export function probeVersion(exe: string, args: string[] = ["--version"], timeoutMs = 5000, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const batch = process.platform === "win32" && /\.(cmd|bat)$/i.test(exe);
  let command = exe;
  let argv = args;
  let childEnv = env;
  if (batch) {
    const values = [exe, ...args];
    // cmd 要显式引用批处理路径。展开带引号的环境变量，避免把路径或参数拼进命令文本。
    if (values.some((value) => /["\r\n\0]/.test(value))) return Promise.resolve(null);
    const vars = Object.fromEntries(values.map((value, i) => [`HUHU_PROBE_ARG_${i}`, value]));
    const line = Object.keys(vars)
      .map((key) => `"%${key}%"`)
      .join(" ");
    command = env["ComSpec"] ?? "cmd.exe";
    argv = ["/d", "/s", "/v:off", "/c", `"${line}"`];
    childEnv = { ...env, ...vars };
  }
  return new Promise((resolve) => {
    execFile(command, argv, { timeout: timeoutMs, env: childEnv, windowsHide: true, windowsVerbatimArguments: batch }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(
        String(stdout)
          .split(/\r?\n/)
          .find((l) => l.trim())
          ?.trim() ?? null,
      );
    });
  });
}

const TTL_MS = 10 * 60_000;

export interface DetectorDeps {
  settings(): AgentSettingsFile;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  /** 测试用：替换目录。 */
  catalog?: readonly AgentCatalogEntry[];
}

/** 检测缓存 10 分钟；`refresh` 强制重测；设置里的 command / enabled 变化时由调用方 invalidate。HUHU 不读取智能体的凭据文件。 */
export class AgentDetector {
  private cache: { at: number; results: DetectInfo[] } | null = null;
  constructor(private readonly d: DetectorDeps) {}

  invalidate(): void {
    this.cache = null;
  }

  /** 查找实际启动的程序，不执行版本命令。启动与会话预览使用同一位置解析。 */
  locate(agentId: string, settings = this.d.settings()): { path: string; via: NonNullable<DetectInfo["via"]> } | null {
    const entry = (this.d.catalog ?? AGENT_CATALOG).find((item) => item.id === agentId);
    return entry ? this.locateEntry(entry, settings) : null;
  }

  private locateEntry(entry: AgentCatalogEntry, settings: AgentSettingsFile): { path: string; via: NonNullable<DetectInfo["via"]> } | null {
    if (!isEnabled(settings, entry.id)) return null;
    const env = this.d.env ?? process.env;
    const platform = this.d.platform ?? process.platform;
    const override = entryOf(settings, entry.id).command?.trim();
    if (override) {
      const found = path.isAbsolute(override) ? (runnable(override, platform) ? override : null) : findOnPath(override, env, platform);
      return found ? { path: found, via: "override" } : null;
    }
    const onPath = findOnPath(entry.detect.command, env, platform);
    if (onPath) return { path: onPath, via: "path" };
    const inDir = findInDirs(entry.detect.command, installDirs(this.d.home, platform), env, platform);
    return inDir ? { path: inDir, via: "installDir" } : null;
  }

  async detect(refresh = false): Promise<DetectInfo[]> {
    const now = this.d.now ?? Date.now;
    if (!refresh && this.cache && now() - this.cache.at < TTL_MS) return this.cache.results;
    const env = this.d.env ?? process.env;
    const settings = this.d.settings();
    const results = await Promise.all(
      (this.d.catalog ?? AGENT_CATALOG).map(async (e): Promise<DetectInfo> => {
        const base = { id: e.id, displayName: e.displayName, headless: e.headless !== undefined, detectedAt: new Date(now()).toISOString() };
        if (!isEnabled(settings, e.id)) return { ...base, installed: false, skipped: true };
        const found = this.locateEntry(e, settings);
        if (!found) return { ...base, installed: false };
        const version = await probeVersion(found.path, e.detect.versionArgs, 5000, env);
        return { ...base, installed: true, path: found.path, via: found.via, ...(version ? { version } : {}) };
      }),
    );
    this.cache = { at: now(), results };
    return results;
  }
}
