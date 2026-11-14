/**
 * 智能体目录：纯数据，界面与引擎共用。新增智能体只需在 AGENT_CATALOG 里加一项。
 * 数值来源：Orca（MIT, Copyright 2026 Lovecast Inc.）src/shared/agent-launch 与 agent-session，
 * 与本机 CLI（claude 2.1.323、codex 0.167.2）的 --help 核对过；不一致处以本机为准。
 */

/** 参数模板：{v} 选项值，{id} 会话 id，{uuid} 新会话 id。 */
export type ArgTemplate = string[];

export interface ModelOption {
  id: string;
  label: string;
  /** 空数组表示该模型不支持 effort。 */
  efforts: string[];
  /** 该模型是否支持 fast。 */
  fast: boolean;
}

/** 用户参数里出现这些写法，就视为与对应的启动选项冲突（以用户参数为准）。 */
export interface ConflictFlag {
  /** flag：整项相等；flag=：前缀（如 "--model="）；config：`-c`/`--config` 后一项以 key= 开头（也匹配 `--config=key=…`）。 */
  match: "flag" | "flag=" | "config";
  value: string;
}
export interface OptionArgs {
  argv: ArgTemplate;
  conflicts: ConflictFlag[];
}

export type AgentId = "claude" | "codex" | "pi";

export interface AgentCatalogEntry {
  id: AgentId;
  displayName: string;
  /** 设置页的“文档”链接。 */
  homepage: string;
  detect: { command: string; versionArgs: string[] };
  launch: { command: string };
  /** 默认参数，即“完全访问”。 */
  fullAccessArgs: string[];
  options: { models?: ModelOption[]; model?: OptionArgs; effort?: OptionArgs; fast?: OptionArgs };
  interactive: {
    prompt: "positional" | "none";
    resume?: { position: "prefix" | "option"; argv: ArgTemplate };
  };
  /** 省略表示不支持 headless。 */
  headless?: {
    prefix: string[];
    argv: string[];
    newSession?: ArgTemplate;
    resume: { prefix?: string[]; position: "option" | "positional"; argv: ArgTemplate };
    prompt: "stdin" | "stdin-dash";
    /** 必须放在最后的可变参数选项。 */
    trailing?: string[];
  };
  /** 条目自带环境。 */
  env?: Record<string, string>;
}

const EFFORTS_STD = ["low", "medium", "high", "xhigh", "max"];
const CODEX_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const codexEfforts = (ceiling: string): string[] => CODEX_EFFORTS.slice(0, CODEX_EFFORTS.indexOf(ceiling) + 1);

export const AGENT_CATALOG: readonly AgentCatalogEntry[] = [
  {
    id: "claude",
    displayName: "Claude Code",
    homepage: "https://docs.claude.com/en/docs/claude-code/overview",
    detect: { command: "claude", versionArgs: ["--version"] },
    launch: { command: "claude" },
    fullAccessArgs: ["--dangerously-skip-permissions"],
    options: {
      models: [
        { id: "fable", label: "Fable", efforts: EFFORTS_STD, fast: false },
        { id: "opus", label: "Opus", efforts: EFFORTS_STD, fast: true },
        { id: "sonnet", label: "Sonnet", efforts: EFFORTS_STD, fast: false },
        { id: "haiku", label: "Haiku", efforts: [], fast: false },
      ],
      model: {
        argv: ["--model", "{v}"],
        conflicts: [
          { match: "flag", value: "--model" },
          { match: "flag=", value: "--model=" },
        ],
      },
      effort: {
        argv: ["--effort", "{v}"],
        conflicts: [
          { match: "flag", value: "--effort" },
          { match: "flag=", value: "--effort=" },
        ],
      },
      fast: {
        argv: ["--settings", '{"fastMode":true}'],
        conflicts: [
          { match: "flag", value: "--settings" },
          { match: "flag=", value: "--settings=" },
        ],
      },
    },
    interactive: { prompt: "positional", resume: { position: "option", argv: ["--resume", "{id}"] } },
    headless: {
      prefix: [],
      argv: ["-p", "--output-format", "stream-json", "--verbose"],
      newSession: ["--session-id", "{uuid}"],
      resume: { position: "option", argv: ["--resume", "{id}"] },
      prompt: "stdin",
      // worktree 工具会移走 transcript 导致 --resume 失效（参照 agent-autoloop）
      trailing: ["--disallowedTools", "EnterWorktree,ExitWorktree"],
    },
  },
  {
    id: "codex",
    displayName: "Codex",
    homepage: "https://developers.openai.com/codex",
    detect: { command: "codex", versionArgs: ["--version"] },
    launch: { command: "codex" },
    fullAccessArgs: ["--dangerously-bypass-approvals-and-sandbox"],
    options: {
      models: [
        { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", efforts: codexEfforts("ultra"), fast: true },
        { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", efforts: codexEfforts("ultra"), fast: true },
        { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", efforts: codexEfforts("max"), fast: true },
        { id: "gpt-5.5", label: "GPT-5.5", efforts: codexEfforts("xhigh"), fast: true },
        { id: "gpt-5.2-codex", label: "GPT-5.2 Codex", efforts: codexEfforts("xhigh"), fast: true },
      ],
      model: {
        argv: ["-m", "{v}"],
        conflicts: [
          { match: "flag", value: "-m" },
          { match: "flag", value: "--model" },
          { match: "flag=", value: "--model=" },
          { match: "config", value: "model" },
        ],
      },
      effort: {
        argv: ["-c", "model_reasoning_effort={v}"],
        conflicts: [
          { match: "config", value: "model_reasoning_effort" },
          { match: "flag", value: "--reasoning-effort" },
        ],
      },
      fast: { argv: ["-c", "service_tier=priority"], conflicts: [{ match: "config", value: "service_tier" }] },
    },
    interactive: { prompt: "positional", resume: { position: "prefix", argv: ["resume", "{id}"] } },
    headless: {
      prefix: ["exec"],
      argv: ["--json"],
      resume: { prefix: ["exec", "resume"], position: "positional", argv: ["{id}"] },
      prompt: "stdin-dash",
    },
  },
  {
    id: "pi",
    displayName: "Pi",
    homepage: "https://github.com/badlogic/pi-mono",
    detect: { command: "pi", versionArgs: ["--version"] },
    launch: { command: "pi" },
    fullAccessArgs: [],
    options: {},
    interactive: { prompt: "positional" },
  },
];

export const agentById = (id: string): AgentCatalogEntry | undefined => AGENT_CATALOG.find((e) => e.id === id);
