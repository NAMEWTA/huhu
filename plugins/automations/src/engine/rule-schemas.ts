import { AutomationActionSchema } from "@huhu/contracts";
import { z } from "zod";

export const Trigger = z.object({ preset: z.string(), cron: z.string(), zone: z.string() });
export const RuleVersion = z.string().min(1).max(128);
export const MissedRunGraceMinutes = z.number().int().min(0).max(1440);
export const Rule = z.object({
  id: z.string(),
  path: z.string(),
  version: z.string(),
  body: z.string(),
  data: z.object({ title: z.string(), enabled: z.boolean(), trigger: Trigger, missedRunGraceMinutes: z.number(), action: AutomationActionSchema, legacyEnvironment: z.boolean().optional() }).passthrough(),
});
