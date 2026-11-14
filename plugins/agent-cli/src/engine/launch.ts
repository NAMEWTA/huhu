import { HuhuError, errors } from "@huhu/contracts";
import { AGENT_CATALOG, type AgentCatalogEntry, type ArgTemplate, type ConflictFlag, type OptionArgs } from "../shared/catalog.js";
import { entryOf, isEnabled, type AgentSettingsEntry, type AgentSettingsFile } from "../shared/settings.js";
import type { DetectInfo } from "./detect.js";

export interface ResolveInput {
  agentId: string;
  mode: "interactive" | "headless";
  model?: string | undefined;
  effort?: string | undefined;
  fast?: boolean | undefined;
  /** interactive：附加提示词；headless：任务提示词（走 stdin）。 */
  prompt?: string | undefined;
  /** headless 新会话：指定会话 id（条目有 newSession 时使用）。 */
  sessionId?: string | undefined;
  /** 恢复会话 id。 */
  resume?: string | undefined;
  /** 仅预览：用未保存的设置代替已存设置（必须与 preview 一起用）。 */
  draft?: AgentSettingsEntry | undefined;
  /** 仅预览：command 用可读命令名，env 值打码，不要求已检测到、不报停用。 */
  preview?: boolean | undefined;
}

export interface ResolvedLaunch {
  command: string;
  argv: string[];
  /** 只含覆盖层：条目自带 env + 用户 env；基础环境由启动方合并。 */
  env: Record<string, string>;
  stdin?: string;
  warnings: string[];
  /** 预览模式下，条目不支持所请求的模式。 */
  unsupported?: "headless";
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const fill = (t: ArgTemplate, vars: { v?: string; id?: string; uuid?: string }): string[] =>
  t.map((a) =>
    a
      .replace(/\{v\}/g, vars.v ?? "")
      .replace(/\{id\}/g, vars.id ?? "")
      .replace(/\{uuid\}/g, vars.uuid ?? ""),
  );

function conflicts(args: string[], flags: ConflictFlag[]): boolean {
  return flags.some((f) => {
    if (f.match === "flag") return args.includes(f.value);
    if (f.match === "flag=") return args.some((a) => a.startsWith(f.value));
    return args.some((a, i) => ((a === "-c" || a === "--config") && (args[i + 1] ?? "").startsWith(`${f.value}=`)) || a.startsWith(`--config=${f.value}=`));
  });
}

const mask = (env: Record<string, string>): Record<string, string> => Object.fromEntries(Object.keys(env).map((k) => [k, "…"]));

/**
 * 把“目录 + 智能体设置 + 检测结果 + 启动选项 + 模式”合成为一条启动命令的唯一函数（纯函数）。
 * 顺序参照 Orca tui-agent-launch-command.ts，并补上 HUHU 已有的 headless / 恢复会话：
 * 命令 → 前缀子命令 → 启动选项 → 用户参数 → 模式参数 → 会话参数 → 位置参数 → 末尾参数。
 */
export function resolveAgentLaunch(ctx: { settings: AgentSettingsFile; detected?: DetectInfo | undefined; /** 测试用：替换目录。 */ catalog?: readonly AgentCatalogEntry[] }, input: ResolveInput): ResolvedLaunch {
  const entry = (ctx.catalog ?? AGENT_CATALOG).find((e) => e.id === input.agentId);
  if (!entry) throw errors.invalidInput(`未知的智能体：${input.agentId}`);
  if (input.draft && !input.preview) throw errors.invalidInput("draft 只能与 preview 一起使用");
  for (const [k, v] of [
    ["model", input.model],
    ["effort", input.effort],
    ["resume", input.resume],
    ["sessionId", input.sessionId],
  ] as const) {
    // 以 - 开头的值会被 CLI 当作选项解析（例如 --dangerously-skip-permissions）
    if (v !== undefined && (v === "" || v.startsWith("-"))) throw errors.invalidInput(`${k} 不能为空或以 - 开头`);
  }
  if (input.mode === "interactive" && input.prompt !== undefined && input.prompt.startsWith("-")) throw errors.invalidInput("prompt 不能以 - 开头");
  for (const [k, v] of [
    ["resume", input.resume],
    ["sessionId", input.sessionId],
  ] as const) {
    if (v !== undefined && !SAFE_ID.test(v)) throw errors.invalidInput(`${k} 无效`);
  }
  const preview = input.preview === true;
  const user: AgentSettingsEntry = input.draft ?? entryOf(ctx.settings, entry.id);
  const enabled = input.draft ? input.draft.enabled !== false : isEnabled(ctx.settings, entry.id);
  const headless = entry.headless;
  if (input.mode === "headless" && !headless) {
    if (preview) return { command: user.command?.trim() || entry.launch.command, argv: [], env: {}, warnings: [], unsupported: "headless" };
    throw new HuhuError("HEADLESS_UNSUPPORTED", `${entry.displayName} 不支持无界面运行`);
  }
  if (!enabled && !preview) throw new HuhuError("AGENT_DISABLED", `${entry.displayName} 已停用`);
  const override = user.command?.trim();
  let command: string;
  if (preview) command = override || entry.launch.command;
  else if (override) command = override;
  else if (ctx.detected?.installed && ctx.detected.path) command = ctx.detected.path;
  else throw new HuhuError("AGENT_NOT_FOUND", `未检测到 ${entry.displayName}`);

  const warnings: string[] = [];
  const userArgs = user.args ?? entry.fullAccessArgs;
  const argv: string[] = [];
  const resumeId = input.resume;

  // 2. 前缀子命令
  if (input.mode === "headless" && headless) argv.push(...(resumeId && headless.resume.prefix ? headless.resume.prefix : headless.prefix));
  else if (resumeId && entry.interactive.resume?.position === "prefix") argv.push(...fill(entry.interactive.resume.argv, { id: resumeId }));

  // 3. 启动选项
  const model = input.model ?? (user.model || undefined);
  const effort = input.effort ?? (user.effort || undefined);
  const fast = input.fast ?? user.fast;
  const known = entry.options.models?.find((m) => m.id === model);
  const apply = (label: string, opt: OptionArgs | undefined, value: string | undefined, ok: boolean) => {
    if (!opt || value === undefined) return;
    if (!ok) return void warnings.push(`所选模型不支持 ${label}，已忽略`);
    if (conflicts(userArgs, opt.conflicts)) return void warnings.push(`参数中已指定 ${label}，已忽略启动选项`);
    argv.push(...fill(opt.argv, { v: value }));
  };
  apply("模型", entry.options.model, model, true);
  apply("Effort", entry.options.effort, effort, !known || known.efforts.includes(effort ?? ""));
  apply("速度", entry.options.fast, fast ? "fast" : undefined, !known || known.fast);

  // 4. 用户参数
  argv.push(...userArgs);
  // 5. 模式参数
  if (input.mode === "headless" && headless) argv.push(...headless.argv);
  // 6. 会话参数
  const tail: string[] = [];
  if (input.mode === "headless" && headless) {
    if (resumeId) {
      if (headless.resume.position === "option") argv.push(...fill(headless.resume.argv, { id: resumeId }));
      else tail.push(...fill(headless.resume.argv, { id: resumeId }));
    } else if (input.sessionId && headless.newSession) argv.push(...fill(headless.newSession, { uuid: input.sessionId }));
  } else if (resumeId && entry.interactive.resume?.position === "option") argv.push(...fill(entry.interactive.resume.argv, { id: resumeId }));
  // 7. 位置参数
  argv.push(...tail);
  if (input.mode === "interactive" && input.prompt && !resumeId && entry.interactive.prompt === "positional") argv.push(input.prompt);
  if (input.mode === "headless" && headless?.prompt === "stdin-dash") argv.push("-");
  // 8. 末尾可变参数选项
  if (input.mode === "headless" && headless?.trailing) argv.push(...headless.trailing);

  const env = { ...entry.env, ...user.env };
  return {
    command,
    argv,
    env: preview ? mask(env) : env,
    ...(input.mode === "headless" && input.prompt !== undefined ? { stdin: input.prompt } : {}),
    warnings,
  };
}

export type { AgentCatalogEntry };
