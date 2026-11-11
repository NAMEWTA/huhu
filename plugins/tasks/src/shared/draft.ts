import type { TaskDto } from "@huhu/contracts";

export interface DraftResource {
  kind: "file" | "folder" | "root";
  path: string;
  id: string | null;
}
export interface DraftReminder {
  id: string;
  /** ISO 时间；null = 还没选。 */
  at: string | null;
  enabled: boolean;
  deliveredAt: string | null;
}
/** 编辑对话框里的表单状态（字符串/可空字段，和界面控件一一对应）。 */
export interface TaskDraft {
  title: string;
  body: string;
  due: string | null;
  project: string;
  kind: "manual" | "agent";
  spaceId: string | null;
  provider: string | null;
  model: string | null;
  effort: string | null;
  resources: DraftResource[];
  reminders: DraftReminder[];
}

export const emptyDraft = (over: Partial<TaskDraft> = {}): TaskDraft => ({ title: "", body: "", due: null, project: "", kind: "manual", spaceId: null, provider: null, model: null, effort: null, resources: [], reminders: [], ...over });

export function draftFromTask(t: TaskDto): TaskDraft {
  const a = t.execution.kind === "agent" ? t.execution : null;
  return {
    title: t.title,
    body: t.body,
    due: t.due,
    project: t.project ?? "",
    kind: t.execution.kind,
    spaceId: a?.spaceId ?? null,
    provider: a?.provider ?? null,
    model: a?.model ?? null,
    effort: a?.effort ?? null,
    resources: t.resources.map((r) => ({ kind: r.kind, path: r.path, id: r.id })),
    reminders: t.reminders.map((r) => ({ id: r.id, at: r.at, enabled: r.enabled, deliveredAt: r.deliveredAt })),
  };
}

export type DraftProblem = "title" | "space" | "provider" | "reminder";

/** 保存前校验；返回有问题的字段（空数组 = 可以保存）。 */
export function validateDraft(d: TaskDraft): DraftProblem[] {
  const p: DraftProblem[] = [];
  if (!d.title.trim()) p.push("title");
  if (d.kind === "agent") {
    if (!d.spaceId) p.push("space");
    if (!d.provider) p.push("provider");
  }
  if (d.reminders.some((r) => !r.at)) p.push("reminder");
  return p;
}

/** 表单 → tasks.create / tasks.update 的可写字段。调用前先 validateDraft。 */
export function draftToWritable(d: TaskDraft) {
  return {
    title: d.title.trim(),
    body: d.body,
    due: d.due,
    project: d.project.trim() || null,
    execution: d.kind === "agent" ? { kind: "agent" as const, spaceId: d.spaceId, provider: d.provider, model: d.model, effort: d.effort, fast: false } : { kind: "manual" as const },
    resources: d.resources.map((r) => ({ kind: r.kind, path: r.path, id: r.id })),
    reminders: d.reminders.filter((r): r is DraftReminder & { at: string } => r.at !== null).map((r) => ({ id: r.id, channel: "in_app" as const, at: r.at, enabled: r.enabled, deliveredAt: r.deliveredAt })),
  };
}
