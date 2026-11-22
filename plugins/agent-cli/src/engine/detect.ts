import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { runnable } from "@huhu/herdr-client";
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
  /** Pi flags confirmed by the last explicit probe. */
  history?: { resume: boolean; fork: boolean };
}

const exts = (env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] => (platform === "win32" ? (env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase()) : [""]);

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
export async function probeVersion(exe: string, args: string[] = ["--version"], timeoutMs = 5000, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const stdout = await probeText(exe, args, timeoutMs, env);
  return (
    stdout
      ?.split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ?? null
  );
}

export async function supportsPiHistory(exe: string, mode: "resume" | "fork" | "new", env: NodeJS.ProcessEnv): Promise<boolean> {
  return (await probePiHistory(exe, env))[mode];
}

async function probePiHistory(exe: string, env: NodeJS.ProcessEnv) {
  const help = (await probeText(exe, ["--help"], 5000, env)) ?? "";
  const sessionId = /^\s+--session-id\s/m.test(help);
  return { resume: /^\s+--session\s/m.test(help), fork: sessionId && /^\s+--fork\s/m.test(help), new: sessionId };
}

function probeText(exe: string, args: string[], timeoutMs: number, env: NodeJS.ProcessEnv): Promise<string | null> {
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
      resolve(err ? null : String(stdout));
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

/** 读取保留上一次快照。主动探测可复用十分钟内的结果，或由工作台强制更新。 */
export class AgentDetector {
  private cache: { at: number; probed: boolean; results: DetectInfo[] } | null = null;
  private pending: Promise<DetectInfo[]> | undefined;
  constructor(private readonly d: DetectorDeps) {}

  invalidate(): void {
    this.cache = null;
    this.pending = undefined;
  }

  /** Read the latest published data without resolving paths or running provider commands. */
  cached(): DetectInfo[] {
    return this.cache?.results ?? [];
  }

  /** Seed the workbench from executable availability without starting a provider. */
  snapshot(): DetectInfo[] {
    if (!this.cache) this.cache = { at: (this.d.now ?? Date.now)(), probed: false, results: this.scanLocations() };
    return this.cache.results;
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

  private scanLocations(): DetectInfo[] {
    const settings = this.d.settings();
    const detectedAt = new Date((this.d.now ?? Date.now)()).toISOString();
    return (this.d.catalog ?? AGENT_CATALOG).map((entry) => {
      const base = { id: entry.id, displayName: entry.displayName, headless: entry.headless !== undefined, detectedAt };
      if (!isEnabled(settings, entry.id)) return { ...base, installed: false, skipped: true };
      const found = this.locateEntry(entry, settings);
      return { ...base, ...found, installed: found !== null };
    });
  }

  async detect(refresh = false): Promise<DetectInfo[]> {
    const now = this.d.now ?? Date.now;
    if (!refresh && this.cache?.probed && now() - this.cache.at < TTL_MS) return this.cache.results;
    if (this.pending) return this.pending;
    const env = this.d.env ?? process.env;
    const catalog = this.d.catalog ?? AGENT_CATALOG;
    const checks = this.scanLocations().map(async (result, index) => {
      if (!result.path) return result;
      const [version, history] = await Promise.all([probeVersion(result.path, catalog[index]?.detect.versionArgs, 5000, env), result.id === "pi" ? probePiHistory(result.path, env) : undefined]);
      return { ...result, ...(version && { version }), ...(history && { history: { resume: history.resume, fork: history.fork } }) };
    });
    const pending = Promise.all(checks)
      .then((results) => {
        if (this.pending !== pending) return this.cached();
        this.cache = { at: now(), probed: true, results };
        return results;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
    return pending;
  }
}
