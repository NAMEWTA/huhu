import type { CapabilityScope } from "@huhu/contracts";

/**
 * 权限 → 能力名映射（interfaces.md §4）。execute/admin 类不可授予外部插件。
 * 值是能力名精确匹配或 `prefix.*`。
 */
export const PERMISSION_TABLE: Readonly<Record<string, readonly string[]>> = {
  "notes.read": ["notes.list", "notes.read", "notes.backlinks"],
  "notes.write": ["notes.create", "notes.save", "notes.rename", "notes.move", "notes.duplicate"],
  "tasks.read": ["tasks.list", "tasks.read", "tasks.runs"],
  "tasks.write": ["tasks.create", "tasks.update", "tasks.duplicate", "tasks.delete", "tasks.setCompleted"],
  "archives.read": ["archives.list", "archives.read"],
  "archives.write": ["archives.create", "archives.update", "archives.delete", "archives.changeType", "archives.setRelations", "archives.linkNote", "archives.unlinkNote"],
  "inbox.write": ["inbox.capture"],
  "vault.read": ["vault.info", "vault.tree", "vault.search", "vault.readFile"],
  "automations.read": ["automations.list", "automations.read", "automations.activations", "automations.runs.read"],
  "history.read": ["history.timeline", "history.read"],
};

export function isGrantable(scope: CapabilityScope): boolean {
  return scope === "read" || scope === "write";
}

/** 已授予权限集合是否覆盖该能力。 */
export function permissionsAllow(granted: readonly string[], capability: string, scope: CapabilityScope): boolean {
  if (!isGrantable(scope)) return false;
  return granted.some((p) => PERMISSION_TABLE[p]?.includes(capability));
}
