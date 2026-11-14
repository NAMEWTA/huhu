import { z } from "zod";
import { TaskExecutionSchema, TaskOriginSchema, TaskReminderSchema, TaskStatusSchema, TaskTypeSchema } from "../kinds/task.js";
import { normalizeTags } from "../tags.js";

export const TaskCategorySchema = z.enum(["all", "today", "tomorrow", "week", "ended"]);

export const CommentSourceSchema = z.enum(["human", "agent", "system", "external"]);
export const TaskCommentSchema = z.object({
  id: z.string(),
  at: z.string(),
  source: CommentSourceSchema,
  author: z.string().optional(),
  run: z.string().optional(),
  ask: z.string().optional(),
  session: z.string().optional(),
  event: z.string().optional(),
  body: z.string(),
});
export type TaskComment = z.infer<typeof TaskCommentSchema>;

/** 从 `<task>` 与评论里解析出的 `[[路径]]` 引用（只读派生值）。 */
export const TaskReferenceSchema = z.object({
  /** 双链里写的路径，文件夹以 / 结尾。 */
  path: z.string(),
  kind: z.enum(["file", "folder"]),
  exists: z.boolean(),
  /** 出现位置：任务内容或评论 id。 */
  from: z.string(),
});
export type TaskReference = z.infer<typeof TaskReferenceSchema>;

export const TaskDtoSchema = z.object({
  id: z.string(),
  path: z.string(),
  version: z.string(),
  title: z.string(),
  /** `<task>` 区段的内容（不含标签本身）。 */
  body: z.string(),
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  completedAt: z.string().nullable(),
  tags: z.array(z.string()),
  due: z.string().nullable(),
  project: z.string().nullable(),
  origin: TaskOriginSchema,
  execution: TaskExecutionSchema.nullable(),
  reminders: z.array(TaskReminderSchema),
  inputRevision: z.number().int(),
  inputHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  readOnly: z.boolean(),
  comments: z.array(TaskCommentSchema),
  references: z.array(TaskReferenceSchema),
  /** 文件级问题（结构标签缺失 / 重复 / 未闭合等）：非空时任务不可派发。 */
  problems: z.array(z.string()),
  /** 任务自身原因导致的不可派发原因；环境类原因（Space、CLI）由 automations.preview 给出。 */
  dispatchBlockers: z.array(z.string()),
});
export type TaskDto = z.infer<typeof TaskDtoSchema>;

/** 创建/编辑可写字段（strict：未知字段报 INVALID_INPUT）。`status` 只能经 setStatus 或 markDispatched 修改，`origin` 由网关写入；`body` 是 `<task>` 区段的内容。 */
export const TaskWritableSchema = z
  .object({
    title: z.string().min(1).max(200),
    type: TaskTypeSchema.default("human"),
    body: z.string().default(""),
    tags: z
      .array(z.string())
      .default([])
      .transform((t) => normalizeTags(t)),
    due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    project: z.string().nullable().default(null),
    execution: TaskExecutionSchema.nullable().default(null),
    reminders: z.array(TaskReminderSchema.omit({ deliveredAt: true }).extend({ deliveredAt: z.string().nullable().default(null) })).default([]),
  })
  .strict();
export type TaskWritable = z.infer<typeof TaskWritableSchema>;
