import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";

const version = "2025-11-25";

export function mcpRequest(url: string, token: string | null, body?: unknown, handle?: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (handle) headers.set("mcp-session-id", handle);
  headers.set("mcp-protocol-version", version);
  headers.set("accept", "application/json, text/event-stream");
  headers.set("content-type", "application/json");
  return fetch(url, { method: "POST", ...init, headers, ...(body !== undefined && { body: JSON.stringify(body) }) });
}

export const initializeMcp = {
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "huhu-test-fixture", version: "1" } },
};

export async function openMcpSession(url: string, token: string): Promise<string> {
  const init = await mcpRequest(url, token, initializeMcp);
  assert.equal(init.status, 200);
  const handle = init.headers.get("mcp-session-id");
  assert.ok(handle);
  const body = (await init.json()) as { id?: number; result?: { protocolVersion?: string } };
  assert.equal(body.id, 0);
  assert.equal(body.result?.protocolVersion, version);
  const ready = await mcpRequest(url, token, { jsonrpc: "2.0", method: "notifications/initialized" }, handle);
  assert.equal(ready.status, 202);
  return handle;
}

export function mcpRpc(method: string, params: unknown = {}) {
  return { jsonrpc: "2.0", id: randomUUID(), method, params };
}

export const recoveryMeta = "huhu.dev/session-recovery";

export async function openRecoverableMcpSession(url: string, token: string, previous?: string): Promise<{ handle: string; recovery: string }> {
  const init = await mcpRequest(url, token, recoveryInitialize(previous));
  assert.equal(init.status, 200);
  const handle = init.headers.get("mcp-session-id");
  const body = (await init.json()) as { result?: { _meta?: Record<string, unknown> } };
  const recovery = body.result?._meta?.[recoveryMeta];
  assert.ok(handle);
  assert.ok(typeof recovery === "string");
  const ready = await mcpRequest(url, token, { jsonrpc: "2.0", method: "notifications/initialized" }, handle);
  assert.equal(ready.status, 202);
  return { handle, recovery };
}

export function recoveryInitialize(previous?: string) {
  return previous === undefined ? initializeMcp : { ...initializeMcp, params: { ...initializeMcp.params, _meta: { [recoveryMeta]: previous } } };
}

type RunningMcpEngine = { port: number; rendererToken: string };

export async function issueMcpCredential(engine: RunningMcpEngine): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      capability: "gateway.tokens.create",
      input: { name: "MCP test fixture" },
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
    }),
  });
  assert.equal(response.status, 200);
  const result = CapabilityResultSchema.parse(await response.json());
  assert.ok(result.ok && typeof result.data === "object" && result.data !== null && "token" in result.data && typeof result.data.token === "string");
  return result.data.token;
}

export async function openFixtureMcp(engine: RunningMcpEngine) {
  const endpoint = `http://127.0.0.1:${engine.port}/mcp`;
  const token = await issueMcpCredential(engine);
  const session = await openMcpSession(endpoint, token);
  const rpc = (method: string, params: unknown = {}) => mcpRequest(endpoint, token, mcpRpc(method, params), session);
  return {
    endpoint,
    token,
    session,
    rpc,
    async call(capability: string, input: object = {}, intentKey?: string): Promise<CapabilityResult<unknown>> {
      const response = await rpc("tools/call", {
        name: capability.replaceAll(".", "_"),
        arguments: input,
        ...(intentKey && { _meta: { "huhu.dev/intent-key": intentKey } }),
      });
      assert.equal(response.status, 200);
      const { result } = (await response.json()) as { result: { isError?: boolean; content: { text: string }[]; structuredContent?: object } };
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0]!.text) } : { ok: true, ...result.structuredContent });
    },
  };
}
