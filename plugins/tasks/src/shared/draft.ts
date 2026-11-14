import type { TaskDto, TaskStatus, TaskType } from "@huhu/contracts";
import { normalizeTags } from "@huhu/contracts";

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
  /** `<task>` 区段的内容（Markdown，含 `[[双链]]`）。 */
  body: string;
  type: TaskType;
  tags: string[];
  due: string | null;
  project: string;
  spaceId: string | null;
  provider: string | null;
  model: string | null;
  effort: string | null;
  fast: boolean;
  reminders: DraftReminder[];
}

export const emptyDraft = (over: Partial<TaskDraft> = {}): TaskDraft => ({
  title: "",
  body: "",
  type: "human",
  tags: [],
  due: null,
  project: "",
  spaceId: null,
  provider: null,
  model: null,
  effort: null,
  fast: false,
  reminders: [],
  ...over,
});

export function draftFromTask(t: TaskDto): TaskDraft {
  return {
    title: t.title,
    body: t.body,
    type: t.type,
    tags: t.tags,
    due: t.due,
    project: t.project ?? "",
    spaceId: t.execution?.spaceId ?? null,
    provider: t.execution?.provider ?? null,
    model: t.execution?.model ?? null,
    effort: t.execution?.effort ?? null,
    fast: t.execution?.fast ?? false,
    reminders: t.reminders.map((r) => ({ id: r.id, at: r.at, enabled: r.enabled, deliveredAt: r.deliveredAt })),
  };
}

export type DraftProblem = "title" | "space" | "provider" | "reminder";

/** 保存前校验；返回有问题的字段（空数组 = 可以保存）。 */
export function validateDraft(d: TaskDraft): DraftProblem[] {
  const p: DraftProblem[] = [];
  if (!d.title.trim()) p.push("title");
  if (d.type === "agent") {
    if (!d.spaceId) p.push("space");
    if (!d.provider) p.push("provider");
  }
  if (d.reminders.some((r) => !r.at)) p.push("reminder");
  return p;
}

/** 表单 → tasks.create / tasks.update 的可写字段。调用前先 validateDraft。type=human 时保留执行配置，方便切回 agent。 */
export function draftToWritable(d: TaskDraft) {
  const hasExecution = d.type === "agent" || d.spaceId !== null || d.provider !== null;
  return {
    title: d.title.trim(),
    type: d.type,
    body: d.body,
    tags: normalizeTags(d.tags),
    due: d.due,
    project: d.project.trim() || null,
    execution: hasExecution ? { spaceId: d.spaceId, provider: d.provider, model: d.model, effort: d.effort, fast: d.fast } : null,
    reminders: d.reminders.filter((r): r is DraftReminder & { at: string } => r.at !== null).map((r) => ({ id: r.id, channel: "in_app" as const, at: r.at, enabled: r.enabled, deliveredAt: r.deliveredAt })),
  };
}

/** 三种状态的显示顺序（看板三列）。 */
export const STATUS_ORDER: readonly TaskStatus[] = ["not_started", "in_progress", "completed"];
