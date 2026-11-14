import { z } from "zod";
import { HuhuHeaderSchema, IsoTime, RunState, dateLike } from "./common.js";

/** 自动化只有三类动作：agent（输入来自任务或一条提示词）、terminal（运行命令）、reminder（提醒或建任务）。 */
export const AgentInputSchema = z.discriminatedUnion("source", [
  /** 扫描 type=agent、status=not_started 的任务；`tags` 是全部匹配的标签筛选（空表示不限）。 */
  z.object({ source: z.literal("tasks"), tags: z.array(z.string()).default([]), maxConcurrent: z.number().int().min(1).max(4).default(1) }),
  /** 一条固定提示词（规则正文就是提示词），不涉及任务与 claim。 */
  z.object({
    source: z.literal("prompt"),
    spaceId: z.string(),
    provider: z.string(),
    model: z.string().nullable().default(null),
    effort: z.string().nullable().default(null),
    fast: z.boolean().default(false),
  }),
]);
export const AutomationActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), input: AgentInputSchema }),
  z.object({
    kind: z.literal("terminal"),
    /** 要执行的命令（交给 shell 解释）。 */
    command: z.string().min(1).max(4000),
    shell: z.enum(["default", "bash", "zsh", "sh", "powershell", "cmd"]).default("default"),
    /** 运行目录：Space；缺省为 Vault 根。 */
    spaceId: z.string().nullable().default(null),
    /** 环境变量名 → 保险箱引用（运行时解析，不写进文件、不回显）。 */
    envRefs: z.record(z.string(), z.string()).default({}),
  }),
  z.object({
    kind: z.literal("reminder"),
    mode: z.enum(["notification", "task", "both"]),
    text: z.string().min(1).max(1000),
    /** 关联的任务（可选）：通知点击后定位到它，也作为新建任务的引用。 */
    taskId: z.string().nullable().default(null),
  }),
]);

export const AutomationRuleFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("automation-rule"),
  title: z.string().min(1),
  enabled: z.boolean().default(false),
  trigger: z.object({ preset: z.string(), cron: z.string(), zone: z.string() }),
  missedRunGraceMinutes: z.number().int().min(0).default(30),
  action: AutomationActionSchema,
  createdAt: dateLike(IsoTime),
  updatedAt: dateLike(IsoTime),
});
export type AutomationRuleFrontmatter = z.infer<typeof AutomationRuleFrontmatterSchema>;

export const AutomationRunFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("automation-run"),
  ruleId: z.string(),
  actionKind: z.enum(["agent", "terminal", "reminder"]),
  trigger: z.enum(["schedule", "manual"]),
  scheduledFor: dateLike(IsoTime).nullable().default(null),
  state: RunState,
  startedAt: dateLike(IsoTime).nullable().default(null),
  finishedAt: dateLike(IsoTime).nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
  nativeSessionId: z.string().nullable().default(null),
  /** terminal 动作：对应的 Herdr 终端会话（agent-cli 的会话 id），界面据此“查看 / 接管终端”。 */
  sessionId: z.string().nullable().default(null),
});
export type AutomationRunFrontmatter = z.infer<typeof AutomationRunFrontmatterSchema>;
