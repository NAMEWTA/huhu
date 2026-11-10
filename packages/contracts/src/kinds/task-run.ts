import { z } from "zod";
import { HuhuHeaderSchema, IsoTime, RunState, dateLike } from "./common.js";

export const TaskRunFrontmatterSchema = z.object({
  huhu: HuhuHeaderSchema("task-run"),
  taskId: z.string(),
  ruleId: z.string(),
  processingKey: z.string(),
  attempt: z.number().int().min(1),
  state: RunState,
  provider: z.string(),
  model: z.string().nullable().default(null),
  spaceId: z.string(),
  cwd: z.string(),
  machineId: z.string(),
  nativeSessionId: z.string().nullable().default(null),
  startedAt: dateLike(IsoTime).nullable().default(null),
  finishedAt: dateLike(IsoTime).nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
  questions: z
    .array(z.object({ id: z.string(), text: z.string(), options: z.array(z.string()).default([]), answer: z.string().nullable().default(null), answeredAt: dateLike(IsoTime).nullable().default(null) }))
    .default([]),
});
export type TaskRunFrontmatter = z.infer<typeof TaskRunFrontmatterSchema>;
