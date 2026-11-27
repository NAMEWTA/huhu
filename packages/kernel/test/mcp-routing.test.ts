import {
  MCP_ENTRY_KINDS,
  MCP_MANAGEMENT_ACCESS,
  MCP_PROTOCOL,
  McpAuthenticationBindingSchema,
  McpExecutionApprovalSchema,
  McpImportConfirmationSchema,
  McpPublishPolicySchema,
  McpRouteSchema,
  McpSourceCatalogSchema,
  McpSourceSchema,
  type McpExternalRoute,
  type McpRoute,
  type McpSessionPrincipal,
} from "@huhu/contracts";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { CapabilityRegistry, Dispatcher, GatewayAudit, IdempotencyStore, defineCapability } from "../src/index.js";
import { createMcpRouting, mcpRouteError, type McpRouteRequest, type McpRoutingBackend, type McpRoutingSnapshot } from "../src/mcp-routing.js";

const repo = McpRouteSchema.parse({
  origin: "external", kind: "tool", publicKey: "repo__search", sourceId: "source:repo", upstreamIdentity: "search",
  configRevision: 1, authenticationRevision: 1, catalogRevision: 2,
}) as McpExternalRoute;
const builtin = McpRouteSchema.parse({ origin: "builtin", kind: "tool", publicKey: "vault_info", capability: "vault.info" });
const request: McpRouteRequest = { kind: "tool", publicKey: "repo__search", input: { query: "notes" } };
const native = CallToolResultSchema.parse({
  content: [{ type: "text", text: "Search results" }, { type: "resource_link", uri: "repo://notes", name: "Notes" }],
  structuredContent: { count: 1 },
  _meta: { correlation: "upstream" },
});

function fixture() {
  const lifetime = new AbortController();
  const principal: McpSessionPrincipal = {
    identity: { caller: "http", entry: "mcp-http", credentialId: "credential", clientSessionId: "session", vaultInstance: "vault-a", serviceGeneration: "service-2" },
    signal: lifetime.signal,
  };
  const catalog = McpSourceCatalogSchema.parse({
    sourceId: repo.sourceId, configRevision: 1, authenticationRevision: 1, catalogRevision: 2,
    state: "ready", complete: true, protocolVersion: MCP_PROTOCOL.primaryVersion, entries: [],
  });
  let snapshot: McpRoutingSnapshot = {
    vaultInstance: "vault-a", serviceGeneration: "service-2", available: true,
    routes: [builtin, repo], catalogRevision: 2,
    policy: McpPublishPolicySchema.parse({ revision: 1, catalogRevision: 2, selected: [entry(repo)] }),
    sources: new Map([[repo.sourceId, catalog]]),
  };
  const send = vi.fn(async (_input: unknown) => native);
  const prepare = vi.fn(async (_route: McpExternalRoute, _signal: AbortSignal) => send);
  const invokeBuiltin = vi.fn<McpRoutingBackend["invokeBuiltin"]>(async () => ({ ok: true as const, data: { name: "Vault A" }, opId: "receipt" }));
  const authorize = vi.fn((_route: McpRoute, owner: McpSessionPrincipal) => owner.identity.credentialId === "credential");
  const routing = createMcpRouting({ readSnapshot: () => snapshot, authorize, prepareExternal: prepare, invokeBuiltin });
  const update = (values: Partial<McpRoutingSnapshot>) => { snapshot = { ...snapshot, ...values }; };
  const revoke = () => update({ policy: { revision: 2, catalogRevision: 2, selected: [] } });
  return { lifetime, principal, catalog, routing, send, prepare, invokeBuiltin, authorize, update, revoke };
}

function entry({ sourceId, kind, upstreamIdentity }: McpExternalRoute) {
  return { sourceId, kind, upstreamIdentity };
}

test("stdio and remote configurations accept references and reject mixed or exposed authentication fields", () => {
  const stdio = { sourceId: "source:repo", displayName: "Repo", namespace: "repo", enabled: false, revision: 1 };
  const configuration = { transport: "stdio", command: "fixture", args: ["serve"], environment: { TOKEN: "REPO_TOKEN" } };
  expect(McpSourceSchema.parse({ ...stdio, configuration })).toEqual({ ...stdio, configuration });
  expect(McpSourceSchema.safeParse({ ...stdio, configuration: { ...configuration, url: "https://example.invalid" } }).success).toBe(false);
  expect(McpSourceSchema.safeParse({ ...stdio, configuration: { ...configuration, environment: { TOKEN: "raw-secret" } } }).success).toBe(false);
  const http = { transport: "streamable-http", url: "https://example.invalid/mcp", headers: {}, authentication: { kind: "credential", reference: "reference", header: "Authorization" } };
  expect(McpSourceSchema.safeParse({ ...stdio, configuration: http }).success).toBe(true);
  for (const invalid of [
    { ...http, url: "https://example.invalid/mcp?key=example" },
    { ...http, url: "git://example.invalid/mcp" },
    { ...http, url: "https://user@example.invalid/mcp" },
    { ...http, headers: { Authorization: "raw" } },
    { ...http, authentication: { ...http.authentication, secret: "raw" } },
    { ...http, transport: "sse", authentication: { kind: "oauth" } },
  ]) expect(McpSourceSchema.safeParse({ ...stdio, configuration: invalid }).success).toBe(false);
  expect(McpAuthenticationBindingSchema.safeParse({ sourceId: stdio.sourceId, accountId: "account", target: http.url, authentication: http.authentication, revision: 1 }).success).toBe(true);
  expect(McpExecutionApprovalSchema.safeParse({ sourceId: stdio.sourceId, vaultInstance: "vault-a", configurationFingerprint: "fingerprint", authenticationRevision: 1, operations: ["call"] }).success).toBe(false);
});

test("SDK, revision-bound import choices and high-risk management publication are explicit", () => {
  expect(MCP_PROTOCOL).toMatchObject({ sdk: "1.32.2", primaryVersion: "2025-11-25", downstream: { transport: "streamable-http", path: "/mcp" } });
  expect(McpImportConfirmationSchema.safeParse({ previewId: "preview", sourcesRevision: 1, selections: [{ entryId: "entry", action: "update", sourceId: repo.sourceId }] }).success).toBe(false);
  expect(McpImportConfirmationSchema.safeParse({ previewId: "preview", sourcesRevision: 1, selections: [{ entryId: "entry", action: "update", sourceId: repo.sourceId, sourceRevision: 1 }] }).success).toBe(true);
  expect(Object.values(MCP_MANAGEMENT_ACCESS).every(([, , exposed]) => exposed === false)).toBe(true);
  expect(MCP_MANAGEMENT_ACCESS["mcp.sources.check"]).toEqual(["execute", "high", false]);
});

test("one directory routes vault_info to the Dispatcher boundary and repo__search to the exact upstream identity", async () => {
  const { principal, routing, prepare, invokeBuiltin, send } = fixture();
  const registry = new CapabilityRegistry();
  registry.register(defineCapability({
    name: "vault.info", plugin: "kernel", scope: "read", exposable: true, defaultExposed: false,
    input: z.strictObject({}), output: z.object({ name: z.string() }), handler: () => ({ name: "Vault A" }),
  }));
  let builtinExposed = true;
  const dispatcher = new Dispatcher({
    registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(),
    isPluginEnabled: () => true, toolAccess: () => ({ state: "ready", revision: 1, choices: { "vault.info": builtinExposed } }),
    grantedPermissions: () => [], pluginOrigin: () => "builtin",
  });
  invokeBuiltin.mockImplementation((route, input, owner) =>
    dispatcher.call(owner.identity.caller, { capability: route.capability, input, requestId: "request" }, owner.signal, owner));
  expect(routing.list(principal, "tool")).toEqual([builtin, repo]);
  const info = { kind: "tool" as const, publicKey: "vault_info", input: {} };
  expect(await routing.call(principal, info)).toEqual({ origin: "builtin", result: { ok: true, data: { name: "Vault A" } } });
  expect(invokeBuiltin).toHaveBeenCalledWith(builtin, info.input, principal);
  builtinExposed = false;
  expect(await routing.call(principal, info)).toMatchObject({ origin: "builtin", result: { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } } });
  expect(await routing.call(principal, request)).toEqual({ origin: "external", result: native });
  expect(prepare).toHaveBeenCalledExactlyOnceWith(repo, principal.signal);
  expect(send).toHaveBeenCalledExactlyOnceWith(request.input);
});

test("revocation hides the tool, prevents cached calls, and rechecks waits before sending", async () => {
  const { principal, routing, send, prepare, revoke } = fixture();
  const pending = routing.call(principal, request);
  revoke();
  await expect(pending).rejects.toMatchObject({ code: "CAPABILITY_NOT_EXPOSED", details: { reason: "not-exposed" } });
  expect(routing.list(principal, "tool")).toEqual([builtin]);
  await expect(routing.call(principal, request)).rejects.toMatchObject({ details: { reason: "not-exposed" } });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
});

test("authentication generations and route replacements invalidate in-progress preparation", async () => {
  const { principal, catalog, routing, send, update } = fixture();
  const pending = routing.call(principal, request);
  const updated = { ...repo, authenticationRevision: 2 };
  update({ routes: [builtin, updated], sources: new Map([[repo.sourceId, { ...catalog, authenticationRevision: 2 }]]) });
  await expect(pending).rejects.toMatchObject({ details: { reason: "stale-route" } });
  expect(send).not.toHaveBeenCalled();
  expect(routing.list(principal, "tool")).toEqual([builtin, updated]);
});

test("a task session rejects a published name rebound to another source or source revision", async () => {
  const { principal, catalog, routing, send, update } = fixture();
  const task = { ...principal, taskTools: [{ sourceId: repo.sourceId, upstreamIdentity: repo.upstreamIdentity, sourceRevision: repo.configRevision }] };
  expect(routing.list(task, "tool")).toEqual([repo]);
  await routing.call(task, request);
  const other = { ...repo, sourceId: "source:other" };
  update({ routes: [other], policy: { revision: 2, catalogRevision: 2, selected: [entry(other)] }, sources: new Map([[other.sourceId, { ...catalog, sourceId: other.sourceId }]]) });
  expect(routing.list(task, "tool")).toEqual([]);
  await expect(routing.call(task, request)).rejects.toMatchObject({ details: { reason: "permission-denied" } });
  const revised = { ...repo, configRevision: 2 };
  update({ routes: [revised], policy: { revision: 3, catalogRevision: 2, selected: [entry(repo)] }, sources: new Map([[repo.sourceId, { ...catalog, configRevision: 2 }]]) });
  await expect(routing.call(task, request)).rejects.toMatchObject({ details: { reason: "permission-denied" } });
  expect(send).toHaveBeenCalledTimes(1);
});

test("recovery, host permission, invalid session and cancellation stop before send", async () => {
  const { principal, lifetime, routing, prepare, send } = fixture();
  const recovered: McpSessionPrincipal = { ...principal, recovered: true };
  expect(await routing.call(recovered, { kind: "tool", publicKey: "vault_info", input: {} })).toMatchObject({ origin: "builtin" });
  await expect(routing.call(recovered, request)).rejects.toMatchObject({ details: { reason: "recovered-session" } });
  await expect(routing.call({ ...principal, identity: { ...principal.identity, vaultInstance: "other" } }, request)).rejects.toMatchObject({ details: { reason: "stale-session" } });
  await expect(routing.call({ ...principal, identity: { ...principal.identity, credentialId: "other" } }, request)).rejects.toMatchObject({ details: { reason: "permission-denied" } });
  expect(prepare).not.toHaveBeenCalled();
  const pending = routing.call(principal, request);
  lifetime.abort();
  await expect(pending).rejects.toMatchObject({ details: { reason: "cancelled-before-send" } });
  expect(send).not.toHaveBeenCalled();
});

test("isolates all four directories and fails closed on an ambiguous exact key", async () => {
  const { principal, catalog, routing, update, prepare } = fixture();
  const other = { ...repo, sourceId: "source:archive", publicKey: "archive__search" };
  const list = MCP_ENTRY_KINDS.map((kind) => ({ ...repo, kind, publicKey: `project__with__separator/${kind}`, upstreamIdentity: `raw__${kind}` }));
  const routes = [...list, other];
  update({ routes, policy: { revision: 1, catalogRevision: 2, selected: routes.map(entry) }, sources: new Map([[repo.sourceId, catalog], [other.sourceId, { ...catalog, sourceId: other.sourceId }]]) });
  for (const item of list) expect(routing.list(principal, item.kind)).toContainEqual(item);
  await routing.call(principal, { ...request, publicKey: other.publicKey });
  expect(prepare).toHaveBeenCalledExactlyOnceWith(other, principal.signal);
  update({ routes: [...routes, { ...other, publicKey: list[0]!.publicKey }] });
  await expect(routing.call(principal, { ...request, publicKey: list[0]!.publicKey })).rejects.toMatchObject({ code: "NAME_CONFLICT", details: { reason: "ambiguous-entry" } });
  expect(routing.list(principal, "tool")).toEqual([other]);
});

test.each([
  ["offline", "source-offline"], ["disabled", "source-disabled"], ["stale", "stale-route"],
  ["auth-required", "authentication-required"], ["approval-required", "approval-required"], ["incompatible", "protocol-incompatible"],
] as const)("distinguishes unusable sources (%s)", async (state, reason) => {
  const { principal, catalog, routing, update, prepare } = fixture();
  update({ sources: new Map([[repo.sourceId, { ...catalog, state }]]) });
  expect(routing.list(principal, "tool")).toEqual([builtin]);
  await expect(routing.call(principal, request)).rejects.toMatchObject({ details: { reason } });
  expect(prepare).not.toHaveBeenCalled();
});

test("native business errors and unknown sent outcomes are preserved without replay", async () => {
  const { principal, routing, send } = fixture();
  const upstreamError = { ...native, isError: true };
  send.mockResolvedValueOnce(upstreamError);
  expect(await routing.call(principal, request)).toEqual({ origin: "external", result: upstreamError });
  send.mockRejectedValueOnce(mcpRouteError("upstream-result-unknown", { sourceId: repo.sourceId, correlationId: "example" }));
  await expect(routing.call(principal, request)).rejects.toMatchObject({ code: "RUN_UNKNOWN", retryable: false, details: { sourceId: repo.sourceId, correlationId: "example" } });
  expect(send).toHaveBeenCalledTimes(2);
});
