import { z } from "zod";
import type { AgentId } from "./catalog.js";

/** 单个智能体的用户设置。 */
export const AgentSettingsEntry = z.object({
  enabled: z.boolean().optional(),
  /** 覆盖启动命令：单个可执行文件（绝对路径或 PATH 中的名字），不按空格拆分。空串视为未设置。 */
  command: z.string().max(1000).optional(),
  model: z.string().max(100).optional(),
  effort: z.string().max(40).optional(),
  fast: z.boolean().optional(),
  /** 缺省等于目录的 fullAccessArgs；显式空数组表示不加任何参数。 */
  args: z.array(z.string().max(1000)).max(100).optional(),
  env: z.record(z.string().max(200), z.string().max(10000)).optional(),
});
export type AgentSettingsEntry = z.infer<typeof AgentSettingsEntry>;

export const AgentSettingsFile = z.object({
  schema: z.literal(1),
  /** 条件写用的版本号。 */
  revision: z.number().int().min(0),
  defaultAgent: z.enum(["claude", "codex", "pi"]).nullable(),
  /** 独立会话里的程序上报“等人工”时，自动建一个 human 任务提醒（缺省开）。 */
  waitingTasks: z.boolean().optional(),
  agents: z.record(z.string(), AgentSettingsEntry),
});
export type AgentSettingsFile = z.infer<typeof AgentSettingsFile>;

export const emptyAgentSettings = (): AgentSettingsFile => ({ schema: 1, revision: 0, defaultAgent: null, agents: {} });

/** 设置里不合法的字段按缺省处理：无效条目丢弃，其余保留。 */
export function parseAgentSettings(raw: unknown): { settings: AgentSettingsFile; warning?: string } {
  const r = AgentSettingsFile.safeParse(raw);
  if (r.success) return { settings: r.data };
  return { settings: emptyAgentSettings(), warning: "智能体设置文件无法解析，已按默认值显示；下次保存时会整体重写" };
}

export const entryOf = (s: AgentSettingsFile, id: AgentId | string): AgentSettingsEntry => s.agents[id] ?? {};
export const isEnabled = (s: AgentSettingsFile, id: AgentId | string): boolean => entryOf(s, id).enabled !== false;
