import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

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
