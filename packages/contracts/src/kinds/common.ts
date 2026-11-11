import { z } from "zod";

export const KIND_NAMES = ["task", "task-run", "automation-rule", "automation-run", "archive-type", "archive", "capture", "comment"] as const;
export type KindName = (typeof KIND_NAMES)[number];

export const HuhuHeaderSchema = <K extends KindName>(kind: K) => z.object({ kind: z.literal(kind), id: z.string().min(1), schema: z.number().int().min(1) });

/** 日期（YYYY-MM-DD）。 */
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** ISO 时间字符串（含时区或 Z）。 */
export const IsoTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
/** YAML 会把未加引号的日期/时间解析为 Date，这里统一转回字符串再校验。 */
export const dateLike = (inner: z.ZodString) => z.preprocess((v) => (v instanceof Date ? (inner === DateOnly ? v.toISOString().slice(0, 10) : v.toISOString()) : v), inner);

export const RunState = z.enum(["queued", "running", "waiting_input", "succeeded", "failed", "cancelled", "unknown"]);
