import type { QueryClient } from "@tanstack/react-query";
import type { HuhuEvent } from "@huhu/contracts";

/** 查询键 `[vaultId, capability, input]`。 */
export const queryKey = (vaultId: string, capability: string, input: unknown = {}): readonly unknown[] => [vaultId, capability, input];

const ENTITY_CAPS: Record<string, string[]> = {
  task: ["tasks."],
  note: ["notes.", "vault."],
  archive: ["archives."],
  "archive-type": ["archives."],
  capture: ["inbox."],
};

/** 事件到达时让相关查询失效。 */
export function invalidateForEvent(qc: QueryClient, vaultId: string, e: Pick<HuhuEvent, "type" | "payload">): Promise<void> {
  const prefixes: string[] = [];
  const p = e.payload as Record<string, unknown>;
  if (e.type === "entity.changed") prefixes.push(...(ENTITY_CAPS[String(p["kind"])] ?? []));
  else if (e.type === "task.completedChanged" || e.type === "task.inputChanged") prefixes.push("tasks.");
  else if (e.type === "vault.fileChanged") prefixes.push("vault.", "notes.", "tasks.", "automations."); // 外部直接改 Tasks/ 或 Automations/ 下的文件也要刷新界面
  else if (e.type === "plugin.stateChanged") prefixes.push("plugins.", "capabilities.");
  else if (e.type === "sync.statusChanged") prefixes.push("sync.", "conflicts.");
  else if (e.type === "notification.created") prefixes.push("notifications.");
  else if (e.type === "automation.activated" || e.type === "run.stateChanged") prefixes.push("automations.", "tasks.");
  if (prefixes.length === 0) return Promise.resolve();
  // 首页卡片与健康检查汇总了各模块的数据，任何实体/文件变化都可能影响它们
  // 插件启停同样会改变首页卡片（停用插件的卡片隐藏）和健康检查
  prefixes.push("home.", "health.");
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === vaultId && typeof q.queryKey[1] === "string" && prefixes.some((pre) => (q.queryKey[1] as string).startsWith(pre)) });
}
