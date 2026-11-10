import { z } from "zod";
import { DateOnly, HuhuHeaderSchema, IsoTime, dateLike } from "./common.js";

export const TASK_SCHEMA_VERSION = 1;

export const TaskExecutionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }),
  z.object({
    kind: z.literal("agent"),
    spaceId: z.string().nullable().default(null),
    provider: z.string().nullable().default(null),
    model: z.string().nullable().default(null),
    effort: z.string().nullable().default(null),
    fast: z.boolean().default(false),
  }),
]);

export const TaskResourceSchema = z.object({
  kind: z.enum(["file", "folder", "root"]),
  path: z.string(),
  id: z.string().nullable().default(null),
});

export const TaskReminderSchema = z.object({
  id: z.string(),
  channel: z.literal("in_app"),
  at: dateLike(IsoTime),
  enabled: z.boolean(),
  deliveredAt: dateLike(IsoTime).nullable().default(null),
});

export const TaskFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("task"),
  title: z.string().min(1).max(200),
  completed: z.boolean(),
  completedAt: dateLike(IsoTime).nullable().default(null),
  due: dateLike(DateOnly).nullable().default(null),
  project: z.string().nullable().default(null),
  execution: TaskExecutionSchema.default({ kind: "manual" }),
  resources: z.array(TaskResourceSchema).default([]),
  reminders: z.array(TaskReminderSchema).default([]),
  inputRevision: z.number().int().min(1).default(1),
  createdAt: dateLike(IsoTime),
  updatedAt: dateLike(IsoTime),
});
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;
