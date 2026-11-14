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
  for (const dir of dirs) {
    for (const ext of exts(env, platform)) {
      const candidate = path.join(dir, cmd + ext);
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
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: timeoutMs, env, windowsHide: true, shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(exe) }, (err, stdout) => {
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

  async detect(refresh = false): Promise<DetectInfo[]> {
    const now = this.d.now ?? Date.now;
    if (!refresh && this.cache && now() - this.cache.at < TTL_MS) return this.cache.results;
    const env = this.d.env ?? process.env;
    const platform = this.d.platform ?? process.platform;
    const settings = this.d.settings();
    const results = await Promise.all(
      (this.d.catalog ?? AGENT_CATALOG).map(async (e): Promise<DetectInfo> => {
        const base = { id: e.id, displayName: e.displayName, headless: e.headless !== undefined, detectedAt: new Date(now()).toISOString() };
        if (!isEnabled(settings, e.id)) return { ...base, installed: false, skipped: true };
        const override = entryOf(settings, e.id).command?.trim();
        let found: { path: string; via: "path" | "installDir" | "override" } | null = null;
        if (override) {
          const p = path.isAbsolute(override) ? (runnable(override, platform) ? override : null) : findOnPath(override, env, platform);
          if (p) found = { path: p, via: "override" };
        } else {
          const onPath = findOnPath(e.detect.command, env, platform);
          if (onPath) found = { path: onPath, via: "path" };
          else {
            const inDir = findInDirs(e.detect.command, installDirs(this.d.home, platform), env, platform);
            if (inDir) found = { path: inDir, via: "installDir" };
          }
        }
        if (!found) return { ...base, installed: false };
        const version = await probeVersion(found.path, e.detect.versionArgs, 5000, env);
        return { ...base, installed: true, path: found.path, via: found.via, ...(version ? { version } : {}) };
      }),
    );
    this.cache = { at: now(), results };
    return results;
  }
}
