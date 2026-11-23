import { z } from "zod";
import { DateOnly, IsoTime, dateLike } from "./common.js";
import { normalizeTags } from "../tags.js";

/** schema 2：human / agent 两类、三种状态。不兼容 schema 1（项目约束：0→1，不读取旧格式）。 */
export const TASK_SCHEMA_VERSION = 2;

export const TaskTypeSchema = z.enum(["human", "agent"]);
export const TaskStatusSchema = z.enum(["not_started", "in_progress", "completed"]);
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskAvailableAtSchema = z.iso.datetime({ offset: true });

export function isTaskAvailable(availableAt: string | null | undefined, now: Date): boolean {
  return availableAt == null || Date.parse(availableAt) <= now.getTime();
}

export const TaskHistorySelectionSchema = z.strictObject({
  historyId: z.string().regex(/^[a-f0-9]{64}$/),
  historyRevision: z.string().regex(/^[a-f0-9]{64}$/),
  machineId: z.string().trim().min(1).max(256),
  spaceId: z.string().trim().min(1).max(256),
  spaceRevision: z.number().int().positive(),
});
export type TaskHistorySelection = z.infer<typeof TaskHistorySelectionSchema>;

/** agent 任务的执行配置；没有 `kind`，类型只看任务的 `type`。 */
export const TaskExecutionSchema = z.object({
  spaceId: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  effort: z.string().nullable().default(null),
  fast: z.boolean().default(false),
  /** 旧文件缺省为 new。其他目标显式保存各自的会话标识，派遣时核验资格。 */
  target: z
    .discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("new") }),
      z.strictObject({ mode: z.literal("existing"), sessionId: z.string().trim().min(1) }),
      z.strictObject({ mode: z.literal("resume"), nativeSessionId: z.string().trim().min(1).max(256), history: TaskHistorySelectionSchema.optional() }),
    ])
    .optional(),
});
export type TaskExecution = z.infer<typeof TaskExecutionSchema>;

/** 创建来源：种类由网关根据受信的 caller 推导，明细 ID 取自内置插件调用时的 onBehalfOf，创建后不可修改。 */
export const TaskOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("desktop") }),
  z.object({ kind: z.literal("inbox"), captureId: z.string().optional() }),
  z.object({ kind: z.literal("automation"), ruleId: z.string().optional(), activationId: z.string().optional() }),
  z.object({ kind: z.literal("session"), sessionId: z.string().optional() }),
  z.object({ kind: z.literal("plugin"), id: z.string() }),
  z.object({ kind: z.literal("external"), caller: z.string() }),
]);
export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

export const TaskReminderSchema = z.object({
  id: z.string(),
  channel: z.literal("in_app"),
  at: dateLike(IsoTime),
  enabled: z.boolean(),
  deliveredAt: dateLike(IsoTime).nullable().default(null),
});

const TaskHeaderSchema = z.object({
  kind: z.literal("task"),
  id: z.string().min(1),
  schema: z.literal(TASK_SCHEMA_VERSION, { message: "旧版任务文件（schema 1）不再支持" }),
});

export const TaskFrontmatterSchema = z.object({
  huhu: TaskHeaderSchema,
  title: z.string().min(1).max(200),
  /** 没有默认值：缺失即文件错误。 */
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  completedAt: dateLike(IsoTime).nullable().default(null),
  tags: z.preprocess(normalizeTags, z.array(z.string())).default([]),
  due: dateLike(DateOnly).nullable().default(null),
  availableAt: dateLike(z.iso.datetime()).nullable().default(null),
  project: z.string().nullable().default(null),
  origin: TaskOriginSchema,
  execution: TaskExecutionSchema.nullable().default(null),
  reminders: z.array(TaskReminderSchema).default([]),
  inputRevision: z.number().int().min(1).default(1),
  createdAt: dateLike(IsoTime),
  updatedAt: dateLike(IsoTime),
});
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;
