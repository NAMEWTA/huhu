import { z } from "zod";
import { HuhuErrorSchema } from "./errors.js";

export const CALLER_KINDS = ["desktop", "cli", "mcp", "http"] as const;
export type WorkbenchCaller = "desktop" | `web:${string}`;
/** 调用者身份由已认证的宿主或连接确定。 */
export type Caller = (typeof CALLER_KINDS)[number] | `plugin:${string}` | WorkbenchCaller;

/** Supplied by the authenticated Engine transport. Never decoded from capability input. */
export interface McpSessionIdentity {
  readonly caller: "mcp" | "http";
  readonly entry: "mcp-http" | "mcp-stdio";
  readonly credentialId: string;
  readonly clientSessionId: string;
  readonly vaultInstance: string;
  readonly serviceGeneration: string;
}

export interface McpSessionPrincipal {
  readonly identity: McpSessionIdentity;
  readonly signal: AbortSignal;
  /** A resumed transport can read existing state and replay receipts, without admitting writes. */
  readonly recovered?: true;
}

/** Owner keys survive transport changes within the same logical session. */
export function mcpSessionSubject(session: McpSessionIdentity): string {
  return JSON.stringify([session.entry, session.vaultInstance, session.credentialId, session.clientSessionId]);
}

export function isWorkbenchCaller(caller: string): caller is WorkbenchCaller {
  return caller === "desktop" || caller.startsWith("web:");
}
export const CAPABILITY_SCOPES = ["read", "write", "execute", "admin"] as const;
export type CapabilityScope = (typeof CAPABILITY_SCOPES)[number];
export const CAPABILITY_RISKS = ["normal", "high"] as const;
export type CapabilityRisk = (typeof CAPABILITY_RISKS)[number];
export const CAPABILITY_AVAILABILITIES = ["active", "plugin-disabled", "plugin-failed", "handler-missing"] as const;
export type CapabilityAvailability = (typeof CAPABILITY_AVAILABILITIES)[number];

const ToolAccessChoicesSchema = z.record(z.string().min(1), z.boolean());
const ToolAccessRevisionSchema = z.int().nonnegative();
export const ToolAccessResourcesSchema = z.strictObject({
  "ssh.hosts": z
    .array(z.string().min(1).max(128))
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
});
export type ToolAccessResources = z.infer<typeof ToolAccessResourcesSchema>;
export const ToolAccessFileSchema = z.strictObject({
  formatVersion: z.literal(1),
  revision: ToolAccessRevisionSchema,
  choices: ToolAccessChoicesSchema,
  resources: ToolAccessResourcesSchema.optional(),
});
export const ToolAccessSnapshotSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("ready"), revision: ToolAccessRevisionSchema, choices: ToolAccessChoicesSchema, resources: ToolAccessResourcesSchema.optional() }),
  z.object({ state: z.literal("error"), reason: z.enum(["missing", "unreadable", "invalid-format"]), message: z.string() }),
]);
export type ToolAccessSnapshot = z.infer<typeof ToolAccessSnapshotSchema>;

/** 管理目录条目。尚未迁移静态描述的停用项只保留清单身份。 */
export const CapabilityCatalogEntrySchema = z.object({
  name: z.string(),
  plugin: z.string(),
  scope: z.enum(CAPABILITY_SCOPES).nullable(),
  title: z.string().optional(),
  description: z.string().optional(),
  risk: z.enum(CAPABILITY_RISKS).optional(),
  individualExposure: z.literal(true).optional(),
  input: z.unknown(),
  output: z.unknown(),
  exposable: z.boolean(),
  /** null 表示尚无选择，或策略不可读。配置状态见 gateway.get。 */
  selected: z.boolean().nullable(),
  exposed: z.boolean(),
  availability: z.enum(CAPABILITY_AVAILABILITIES),
});
export type CapabilityCatalogEntry = z.infer<typeof CapabilityCatalogEntrySchema>;

export const CapabilityDiscoveryEntrySchema = CapabilityCatalogEntrySchema.pick({ name: true, plugin: true, input: true, output: true }).extend({
  scope: z.enum(CAPABILITY_SCOPES),
  durableIntent: z.literal(true).optional(),
  intentRequired: z.literal(true).optional(),
});
export type CapabilityDiscoveryEntry = z.infer<typeof CapabilityDiscoveryEntrySchema>;

export const CapabilityIntentKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);
export const CapabilityOperationLookupSchema = z.union([z.strictObject({ operationId: z.uuidv4() }), z.strictObject({ capability: z.string().min(1).max(128), intentKey: CapabilityIntentKeySchema })]);
export type CapabilityOperationLookup = z.infer<typeof CapabilityOperationLookupSchema>;

export const CapabilityRequestSchema = z.object({
  capability: z.string().min(1),
  input: z.unknown(),
  idempotencyKey: z.string().min(8).optional(),
  intentKey: CapabilityIntentKeySchema.optional(),
  requestId: z.string().min(1),
});
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>;

export type CapabilityResult<T> = { ok: true; data: T; opId?: string | undefined } | { ok: false; error: z.infer<typeof HuhuErrorSchema> };

export const CapabilityResultSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: z.unknown(), opId: z.string().optional() }), z.object({ ok: z.literal(false), error: HuhuErrorSchema })]);

/** 把 zod 模式导出为 JSON Schema，供 capabilities.list 与 MCP 使用。 */
export function toJsonSchema(schema: z.ZodType, io: "input" | "output" = "input"): unknown {
  // 入参按“调用方要传什么”导出（带默认值的字段可省略，transform 取其输入形态）；出参按返回值导出
  return z.toJSONSchema(schema, { io, unrepresentable: "any" });
}
