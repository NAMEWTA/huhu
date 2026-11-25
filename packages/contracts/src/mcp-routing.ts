import { z } from "zod";
import type { CapabilityRisk, CapabilityScope } from "./capability.js";
import type { ErrorCode } from "./errors.js";

const identity = z.string().min(1);
const revision = z.int().nonnegative();
const environmentName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const headerName = z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/);
const nonSecretHeader = headerName.refine((header) => !/authorization|cookie|token|secret|api[-_]?key/i.test(header), "敏感 header 只能使用认证引用");

// The URL is the stable target. Sensitive query material belongs to the credential owner.
const targetUrl = z.url().refine((value) => {
  const url = URL.parse(value);
  return url !== null && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
}, "目标必须是没有用户信息、query 或 fragment 的 HTTP(S) URL");

const noAuthentication = z.strictObject({ kind: z.literal("none") });
const staticAuthentication = [
  z.strictObject({ kind: z.literal("environment"), name: environmentName, header: headerName }),
  z.strictObject({ kind: z.literal("credential"), reference: identity, header: headerName }),
  z.strictObject({ kind: z.literal("credential-needed"), header: headerName }),
] as const;
const oauth = z.strictObject({ kind: z.literal("oauth"), reference: identity.optional() });
export const McpAuthenticationSchema = z.discriminatedUnion("kind", [noAuthentication, ...staticAuthentication, oauth]);

const remoteConfig = {
  url: targetUrl,
  headers: z.record(nonSecretHeader, z.string().regex(/^[^\r\n]*$/)),
};
export const McpSourceConfigSchema = z.discriminatedUnion("transport", [
  z.strictObject({ transport: z.literal("stdio"), command: identity, args: z.array(z.string()), cwd: identity.optional(), environment: z.record(environmentName, environmentName) }),
  z.strictObject({ transport: z.literal("streamable-http"), ...remoteConfig, authentication: McpAuthenticationSchema }),
  z.strictObject({ transport: z.literal("sse"), ...remoteConfig, authentication: z.discriminatedUnion("kind", [noAuthentication, ...staticAuthentication]) }),
]);

export const McpSourceSchema = z.strictObject({
  sourceId: identity,
  displayName: identity,
  namespace: z.string().regex(/^[a-z][a-z0-9_-]*$/).max(32),
  configuration: McpSourceConfigSchema,
  enabled: z.boolean(),
  revision,
});
export type McpSource = z.infer<typeof McpSourceSchema>;

export const McpAuthenticationBindingSchema = z.strictObject({
  sourceId: identity,
  accountId: identity,
  target: identity,
  authentication: z.discriminatedUnion("kind", [...staticAuthentication, oauth]),
  revision,
});
export type McpAuthenticationBinding = z.infer<typeof McpAuthenticationBindingSchema>;

export const McpImportConfirmationSchema = z.strictObject({
  previewId: identity,
  sourcesRevision: revision,
  selections: z.array(z.discriminatedUnion("action", [
    z.strictObject({ entryId: identity, action: z.literal("create") }),
    z.strictObject({ entryId: identity, action: z.literal("skip") }),
    z.strictObject({ entryId: identity, action: z.literal("update"), sourceId: identity, sourceRevision: revision }),
  ])),
});
export type McpImportConfirmation = z.infer<typeof McpImportConfirmationSchema>;

export const MCP_ENTRY_KINDS = ["tool", "resource", "resource-template", "prompt"] as const;
export type McpEntryKind = (typeof MCP_ENTRY_KINDS)[number];
const entryKind = z.enum(MCP_ENTRY_KINDS);
export const McpCatalogViewSchema = z.strictObject({
  catalogRevision: revision,
  policyRevision: revision,
  entries: z.array(z.strictObject({
    sourceId: identity,
    kind: entryKind,
    upstreamIdentity: identity,
    publicKey: identity,
    selected: z.boolean(),
    description: z.string(),
  })),
});
export type McpCatalogView = z.infer<typeof McpCatalogViewSchema>;
const entryIdentity = z.strictObject({ sourceId: identity, kind: entryKind, upstreamIdentity: identity });
export type McpExternalEntryIdentity = z.infer<typeof entryIdentity>;

export const McpPublishPolicySchema = z.strictObject({
  revision,
  catalogRevision: revision,
  selected: z.array(entryIdentity),
});
export type McpPublishPolicy = z.infer<typeof McpPublishPolicySchema>;

const entryGenerations = { configRevision: revision, authenticationRevision: revision, catalogRevision: revision };
export const McpRouteSchema = z.discriminatedUnion("origin", [
  z.strictObject({ origin: z.literal("builtin"), kind: entryKind, publicKey: identity, capability: identity }),
  entryIdentity.extend({ origin: z.literal("external"), publicKey: identity, ...entryGenerations }),
]);
export type McpRoute = z.infer<typeof McpRouteSchema>;
export type McpExternalRoute = Extract<McpRoute, { origin: "external" }>;

export const McpSourceCatalogSchema = z.strictObject({
  sourceId: identity,
  ...entryGenerations,
  state: z.enum(["ready", "disabled", "offline", "stale", "auth-required", "approval-required", "incompatible"]),
  complete: z.boolean(),
  protocolVersion: identity.optional(),
  entries: z.array(z.strictObject({
    kind: entryKind,
    upstreamIdentity: identity,
    descriptor: z.record(z.string(), z.unknown()),
  })),
});
export type McpSourceCatalog = z.infer<typeof McpSourceCatalogSchema>;

export const McpExecutionApprovalSchema = z.strictObject({
  sourceId: identity,
  hostId: identity,
  vaultInstance: identity,
  configurationFingerprint: identity,
  authenticationRevision: revision,
  operations: z.array(z.enum(["initialize", "discover", "call"])),
});
export type McpExecutionApproval = z.infer<typeof McpExecutionApprovalSchema>;

export const MCP_PROTOCOL = {
  sdk: "1.32.2",
  primaryVersion: "2025-11-25",
  downstream: { transport: "streamable-http", path: "/mcp" },
  upstream: ["stdio", "streamable-http", "sse"],
  methods: ["tools/list", "tools/call", "resources/list", "resources/templates/list", "resources/read", "prompts/list", "prompts/get"],
  unsupported: ["resources/subscribe", "roots", "sampling", "elicitation", "tasks", "mcp-apps", "code-mode", "tool-search", "2026-only"],
} as const;

type ManagementAccess = readonly [scope: CapabilityScope, risk: CapabilityRisk, defaultExposed: false];
export const MCP_MANAGEMENT_ACCESS = {
  "mcp.sources.list": ["read", "normal", false],
  "mcp.sources.get": ["read", "normal", false],
  "mcp.catalog.list": ["read", "normal", false],
  "mcp.diagnostics.get": ["read", "normal", false],
  "mcp.sources.create": ["write", "high", false],
  "mcp.sources.update": ["write", "high", false],
  "mcp.sources.delete": ["write", "high", false],
  "mcp.sources.setEnabled": ["execute", "high", false],
  "mcp.sources.importPreview": ["read", "normal", false],
  "mcp.sources.importCommit": ["write", "high", false],
  "mcp.sources.export": ["read", "normal", false],
  "mcp.sources.check": ["execute", "high", false],
  "mcp.sources.reconnect": ["execute", "high", false],
  "mcp.sources.refresh": ["execute", "high", false],
  "mcp.policy.preview": ["read", "normal", false],
  "mcp.policy.update": ["admin", "high", false],
  "mcp.credentials.put": ["write", "high", false],
  "mcp.credentials.remove": ["write", "high", false],
  "mcp.oauth.begin": ["execute", "high", false],
  "mcp.oauth.status": ["read", "normal", false],
  "mcp.oauth.cancel": ["write", "high", false],
  "mcp.oauth.logout": ["write", "high", false],
  "mcp.executionApproval.preview": ["admin", "high", false],
  "mcp.executionApproval.confirm": ["admin", "high", false],
  "mcp.executionApproval.revoke": ["admin", "high", false],
} as const satisfies Record<string, ManagementAccess>;

export const MCP_ROUTING_ERRORS = {
  "unknown-entry": "CAPABILITY_NOT_FOUND",
  "ambiguous-entry": "NAME_CONFLICT",
  "invalid-arguments": "INVALID_INPUT",
  "not-exposed": "CAPABILITY_NOT_EXPOSED",
  "service-unavailable": "CAPABILITY_NOT_EXPOSED",
  "source-disabled": "CAPABILITY_NOT_EXPOSED",
  "source-offline": "CAPABILITY_NOT_EXPOSED",
  "protocol-incompatible": "INVALID_INPUT",
  "authentication-required": "PROVIDER_UNAUTHENTICATED",
  "approval-required": "PERMISSION_DENIED",
  "permission-denied": "PERMISSION_DENIED",
  "recovered-session": "PERMISSION_DENIED",
  "stale-session": "PERMISSION_DENIED",
  "stale-route": "VERSION_CONFLICT",
  "cancelled-before-send": "ENGINE_CLOSING",
  "upstream-result-unknown": "RUN_UNKNOWN",
} as const satisfies Record<string, ErrorCode>;
export type McpRoutingReason = keyof typeof MCP_ROUTING_ERRORS;
