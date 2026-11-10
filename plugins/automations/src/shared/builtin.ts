import type { AutomationRuleFrontmatter } from "@huhu/contracts";

/** 内置默认规则（ACC-AU-01）：每 5 分钟扫描未完成的 Agent 任务，已启用，不可删除。 */
export function builtinScanRule(zone: string, now: string): Omit<AutomationRuleFrontmatter, "huhu"> {
  return {
    title: "定时检查 Agent 任务",
    enabled: true,
    builtin: true,
    trigger: { preset: "every5", cron: "*/5 * * * *", zone },
    missedRunGraceMinutes: 30,
    action: { kind: "scan_agent_tasks", maxConcurrent: 1 },
    createdAt: now,
    updatedAt: now,
  };
}
