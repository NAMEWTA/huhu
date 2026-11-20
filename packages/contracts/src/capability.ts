import { z } from "zod";
import { HuhuErrorSchema } from "./errors.js";

export const CALLER_KINDS = ["desktop", "cli", "mcp", "http"] as const;
/** 调用者身份：desktop/cli/mcp/http 或 plugin:<id>，只来自所用令牌。 */
export type Caller = (typeof CALLER_KINDS)[number] | `plugin:${string}`;
export const CAPABILITY_SCOPES = ["read", "write", "execute", "admin"] as const;
export type CapabilityScope = (typeof CAPABILITY_SCOPES)[number];
export const CAPABILITY_RISKS = ["normal", "high"] as const;
export type CapabilityRisk = (typeof CAPABILITY_RISKS)[number];
export const CAPABILITY_AVAILABILITIES = ["active", "plugin-disabled", "plugin-failed", "handler-missing"] as const;
export type CapabilityAvailability = (typeof CAPABILITY_AVAILABILITIES)[number];

/** 管理目录条目。尚未迁移静态描述的停用项只保留清单身份。 */
export const CapabilityCatalogEntrySchema = z.object({
  name: z.string(),
  plugin: z.string(),
  scope: z.enum(CAPABILITY_SCOPES).nullable(),
  title: z.string().optional(),
  description: z.string().optional(),
  risk: z.enum(CAPABILITY_RISKS).optional(),
  input: z.unknown(),
  output: z.unknown(),
  exposable: z.boolean(),
  exposed: z.boolean(),
  availability: z.enum(CAPABILITY_AVAILABILITIES),
});
export type CapabilityCatalogEntry = z.infer<typeof CapabilityCatalogEntrySchema>;

export const CapabilityRequestSchema = z.object({
  capability: z.string().min(1),
  input: z.unknown(),
  idempotencyKey: z.string().min(8).optional(),
  requestId: z.string().min(1),
});
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>;

export type CapabilityResult<T> = { ok: true; data: T; opId?: string } | { ok: false; error: z.infer<typeof HuhuErrorSchema> };

export const CapabilityResultSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: z.unknown(), opId: z.string().optional() }), z.object({ ok: z.literal(false), error: HuhuErrorSchema })]);

/** 把 zod 模式导出为 JSON Schema，供 capabilities.list 与 MCP 使用。 */
export function toJsonSchema(schema: z.ZodType, io: "input" | "output" = "input"): unknown {
  // 入参按“调用方要传什么”导出（带默认值的字段可省略，transform 取其输入形态）；出参按返回值导出
  return z.toJSONSchema(schema, { io, unrepresentable: "any" });
}
