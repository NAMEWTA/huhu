import { z } from "zod";
import { HuhuErrorSchema } from "./errors.js";

export const CALLER_KINDS = ["desktop", "cli", "mcp", "http"] as const;
/** 调用者身份：desktop/cli/mcp/http 或 plugin:<id>，只来自所用令牌。 */
export type Caller = (typeof CALLER_KINDS)[number] | `plugin:${string}`;
export const CAPABILITY_SCOPES = ["read", "write", "execute", "admin"] as const;
export type CapabilityScope = (typeof CAPABILITY_SCOPES)[number];

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
export function toJsonSchema(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema);
}
