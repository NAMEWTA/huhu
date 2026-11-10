import { z } from "zod";
import { HuhuHeaderSchema, IsoTime, RunState, dateLike } from "./common.js";

export const AutomationActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scan_agent_tasks"), maxConcurrent: z.number().int().min(1).max(4).default(1) }),
  z.object({
    kind: z.literal("agent_prompt"),
    spaceId: z.string(),
    provider: z.string(),
    model: z.string().nullable().default(null),
    effort: z.string().nullable().default(null),
    fast: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("script"), scriptId: z.string(), args: z.array(z.string()).default([]) }),
  z.object({ kind: z.literal("notify"), channel: z.literal("in_app"), text: z.string() }),
]);

export const AutomationRuleFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("automation-rule"),
  title: z.string().min(1),
  enabled: z.boolean().default(false),
  builtin: z.boolean().default(false),
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
  actionKind: z.enum(["agent_prompt", "script", "notify", "scan_agent_tasks"]),
  trigger: z.enum(["schedule", "manual"]),
  scheduledFor: dateLike(IsoTime).nullable().default(null),
  state: RunState,
  startedAt: dateLike(IsoTime).nullable().default(null),
  finishedAt: dateLike(IsoTime).nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
  nativeSessionId: z.string().nullable().default(null),
});
export type AutomationRunFrontmatter = z.infer<typeof AutomationRunFrontmatterSchema>;
