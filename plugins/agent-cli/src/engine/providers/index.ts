import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

export type ProviderId = "claude" | "claude-agent-teams" | "codex" | "pi";

export interface ModelOption {
  id: string;
  label: string;
  efforts: string[];
  fast: boolean;
}

export interface AgentProvider {
  id: ProviderId;
  displayName: string;
  /** 在 PATH 中查找的命令名（来自 Orca tui-agent-config 的 detectCmd）。 */
  detectCommands: string[];
  /** 额外必须存在的命令（Agent Teams 需要 claude）。 */
  requires?: string[];
  models(): ModelOption[];
  interactiveArgv(o: { exe: string; model?: string | undefined; effort?: string | undefined; fast?: boolean | undefined; prompt?: string | undefined; resumeSessionId?: string | undefined }): string[];
  env?: Record<string, string>;
  /** 是否支持无界面（打印）模式，供自动化使用。 */
  headless: boolean;
}

const claudeModels: ModelOption[] = [
  { id: "sonnet", label: "Sonnet", efforts: [], fast: false },
  { id: "opus", label: "Opus", efforts: [], fast: false },
  { id: "haiku", label: "Haiku", efforts: [], fast: false },
];

function claudeArgv(o: Parameters<AgentProvider["interactiveArgv"]>[0]): string[] {
  const a = [o.exe];
  if (o.resumeSessionId) a.push("--resume", o.resumeSessionId);
  if (o.model) a.push("--model", o.model);
  if (o.prompt) a.push(o.prompt);
  return a;
}

export const PROVIDERS: readonly AgentProvider[] = [
  { id: "claude", displayName: "Claude Code", detectCommands: ["claude"], models: () => claudeModels, interactiveArgv: claudeArgv, headless: true },
  // Orca 的 Agent Teams 依赖其私有 CLI 包装；HUHU 以同一 claude 二进制 + 实验开关实现这一预设
  { id: "claude-agent-teams", displayName: "Claude Agent Teams", detectCommands: ["claude"], requires: ["claude"], models: () => claudeModels, interactiveArgv: claudeArgv, env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" }, headless: false },
  {
    id: "codex", displayName: "Codex", detectCommands: ["codex"], headless: true,
    models: () => [{ id: "gpt-5.5", label: "GPT-5.5", efforts: ["low", "medium", "high"], fast: false }],
    interactiveArgv: (o) => {
      const a = o.resumeSessionId ? [o.exe, "resume", o.resumeSessionId] : [o.exe];
      if (o.model) a.push("-m", o.model);
      if (o.effort) a.push("-c", `model_reasoning_effort="${o.effort}"`);
      if (o.prompt && !o.resumeSessionId) a.push(o.prompt);
      return a;
    },
  },
  { id: "pi", displayName: "Pi", detectCommands: ["pi"], headless: false, models: () => [], interactiveArgv: (o) => [o.exe, ...(o.prompt ? [o.prompt] : [])] },
];

export type DetectStatus = "found" | "not-installed" | "version-unsupported" | "probe-failed";

export interface DetectResult {
  provider: ProviderId;
  displayName: string;
  status: DetectStatus;
  exe: string | null;
  version: string | null;
  checkedAt: string;
  models: ModelOption[];
  headless: boolean;
}

/** 在 PATH 里查找可执行文件（Windows 考虑 PATHEXT）。 */
export function findOnPath(cmd: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const dirs = (env["PATH"] ?? env["Path"] ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
  const exts = platform === "win32" ? (env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase()) : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        if (!statSync(candidate).isFile()) continue;
        if (platform !== "win32") accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // 不存在或不可执行：继续找下一个
      }
    }
  }
  return null;
}

/** 运行 `--version`，5 秒超时；返回首行文本或 null。 */
export function probeVersion(exe: string, timeoutMs = 5000, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(exe, ["--version"], { timeout: timeoutMs, env, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const line = String(stdout).split(/\r?\n/).find((l) => l.trim());
      resolve(line?.trim() ?? null);
    });
  });
}

const TTL_MS = 10 * 60_000;

/** 检测缓存 10 分钟；`refresh` 强制重测。HUHU 不读取 provider 的凭据文件。 */
export class ProviderDetector {
  private cache: { at: number; results: DetectResult[] } | null = null;
  constructor(private readonly now: () => number = Date.now, private readonly env: NodeJS.ProcessEnv = process.env, private readonly platform: NodeJS.Platform = process.platform) {}

  async detect(refresh = false): Promise<DetectResult[]> {
    if (!refresh && this.cache && this.now() - this.cache.at < TTL_MS) return this.cache.results;
    const results = await Promise.all(
      PROVIDERS.map(async (p): Promise<DetectResult> => {
        const base = { provider: p.id, displayName: p.displayName, checkedAt: new Date(this.now()).toISOString(), models: p.models(), headless: p.headless };
        const missing = (p.requires ?? []).some((c) => !findOnPath(c, this.env, this.platform));
        const exe = p.detectCommands.map((c) => findOnPath(c, this.env, this.platform)).find(Boolean) ?? null;
        if (!exe || missing) return { ...base, status: "not-installed", exe: null, version: null };
        const version = await probeVersion(exe, 5000, this.env);
        return { ...base, status: version ? "found" : "probe-failed", exe, version };
      }),
    );
    this.cache = { at: this.now(), results };
    return results;
  }
}
