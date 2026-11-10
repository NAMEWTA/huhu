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
  else if (e.type === "vault.fileChanged") prefixes.push("vault.", "notes.");
  else if (e.type === "plugin.stateChanged") prefixes.push("plugins.", "capabilities.");
  if (prefixes.length === 0) return Promise.resolve();
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === vaultId && typeof q.queryKey[1] === "string" && prefixes.some((pre) => (q.queryKey[1] as string).startsWith(pre)) });
}
