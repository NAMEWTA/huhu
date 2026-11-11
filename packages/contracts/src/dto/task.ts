import { z } from "zod";
import { TaskExecutionSchema, TaskReminderSchema, TaskResourceSchema } from "../kinds/task.js";

export const TaskCategorySchema = z.enum(["all", "today", "tomorrow", "week", "ended"]);

export const TaskDtoSchema = z.object({
  id: z.string(),
  path: z.string(),
  version: z.string(),
  title: z.string(),
  body: z.string(),
  completed: z.boolean(),
  completedAt: z.string().nullable(),
  due: z.string().nullable(),
  project: z.string().nullable(),
  execution: TaskExecutionSchema,
  resources: z.array(TaskResourceSchema),
  reminders: z.array(TaskReminderSchema),
  inputRevision: z.number().int(),
  inputHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  readOnly: z.boolean(),
});
export type TaskDto = z.infer<typeof TaskDtoSchema>;

/** 创建/编辑可写字段；完成状态只经 tasks.setCompleted 修改。 */
export const TaskWritableSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().default(""),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  project: z.string().nullable().default(null),
  execution: TaskExecutionSchema.default({ kind: "manual" }),
  resources: z.array(TaskResourceSchema).default([]),
  reminders: z.array(TaskReminderSchema.omit({ deliveredAt: true }).extend({ deliveredAt: z.string().nullable().default(null) })).default([]),
});
export type TaskWritable = z.infer<typeof TaskWritableSchema>;
