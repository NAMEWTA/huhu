import type { CapabilityScope } from "@huhu/contracts";

/**
 * 权限 → 能力名映射（interfaces.md §4）。execute/admin 类不可授予外部插件。
 * 值是能力名精确匹配或 `prefix.*`。
 */
export const PERMISSION_TABLE: Readonly<Record<string, readonly string[]>> = {
  "notes.read": ["notes.list", "notes.read", "notes.backlinks"],
  "notes.write": ["notes.create", "notes.save", "notes.rename", "notes.move", "notes.duplicate"],
  "tasks.read": ["tasks.list", "tasks.read", "tasks.runs"],
  "tasks.write": ["tasks.create", "tasks.update", "tasks.duplicate", "tasks.delete", "tasks.setStatus"],
  /** 外部调用方给 human 任务写评论（agent 任务的评论由 handler 拒绝）。 */
  "tasks.comment": ["tasks.comments.add"],
  // ---- 仅内置插件可用（外部插件的清单里声明这些权限会被拒绝；外部入口也不能调用）----
  /** 派发联动：把任务改为进行中（条件写）。 */
  "tasks.dispatch": ["tasks.markDispatched"],
  /** 以 agent / system 来源写评论（事件派生 id、运行事实）。 */
  "tasks.comment.system": ["tasks.comments.add"],
  /** 合成并启动 Agent CLI 的命令行。 */
  "agent.run": ["agent.launch.resolve"],
  /** 查询任务是否有活动运行。 */
  "automations.runs.internal": ["automations.runs.activeFor"],
  /** 终端命令：启动命令会话、读取输出、结束会话（automations 的 terminal 动作）。 */
  "agent.terminal": ["agent.sessions.launch", "agent.sessions.list", "agent.sessions.output", "agent.sessions.release", "agent.sessions.kill", "agent.spaces.list"],
  "archives.read": ["archives.list", "archives.read"],
  "archives.write": ["archives.create", "archives.update", "archives.move", "archives.delete"],
  "inbox.write": ["inbox.capture"],
  "vault.read": ["vault.info", "vault.tree", "vault.search", "vault.readFile"],
  "automations.read": ["automations.list", "automations.read", "automations.activations", "automations.runs.read"],
  "history.read": ["history.timeline", "history.read"],
};

/** 只有内置插件可以声明和使用的权限组。 */
export const BUILTIN_ONLY_PERMISSIONS: ReadonlySet<string> = new Set(["tasks.dispatch", "tasks.comment.system", "agent.run", "automations.runs.internal", "agent.terminal"]);

export function isGrantable(scope: CapabilityScope): boolean {
  return scope === "read" || scope === "write";
}

/**
 * 已授予权限集合是否覆盖该能力。
 * - 内置插件：只看权限组，不要求能力 exposable，也不限制 scope（execute / admin 的内部能力可以授予内置插件）；
 * - 外部（第三方）插件：能力必须 exposable（由调用方检查），且只能授予 read / write。
 */
export function permissionsAllow(granted: readonly string[], capability: string, scope: CapabilityScope, origin: "builtin" | "external" = "external"): boolean {
  if (origin === "external" && !isGrantable(scope)) return false;
  return granted.some((p) => PERMISSION_TABLE[p]?.includes(capability) && (origin === "builtin" || !BUILTIN_ONLY_PERMISSIONS.has(p)));
}
