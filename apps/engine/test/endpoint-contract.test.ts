import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult } from "@huhu/contracts";
import { startEngineServer, TokenTable } from "@huhu/kernel";
import { afterEach, expect, test } from "vitest";
import { connect } from "../../cli/src/connect.js";
import { initializeMcp, mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { boot, readLiveEndpoint, type RunningEngine } from "../src/boot.js";

const vaults: string[] = [];
const running = new Set<RunningEngine>();
afterEach(async () => {
  for (const engine of running) await engine.shutdown();
  running.clear();
  for (const vault of vaults.splice(0)) rmSync(vault, { recursive: true, force: true });
});

function newVault() {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-endpoint-"));
  vaults.push(vault);
  return vault;
}

async function start(vaultPath: string, options: { create?: boolean; port?: number } = {}) {
  const engine = await boot({ vaultPath, ...options });
  running.add(engine);
  return engine;
}

async function stop(engine: RunningEngine) {
  await engine.shutdown();
  running.delete(engine);
}

async function capability<T>(baseUrl: string, token: string, name: string, input: unknown = {}): Promise<T> {
  const response = await fetch(`${baseUrl}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ capability: name, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  const result = (await response.json()) as CapabilityResult<T>;
  if (!result.ok) throw new Error(`${name}: ${result.error.code}`);
  return result.data;
}

test("配置固定端口时，普通 CLI 重读当前端点，外部客户端仅凭同一 URL 与授权可重连", async () => {
  const root = newVault();
  let engine = await start(root, { create: true });
  const port = engine.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const endpoint = new URL("/mcp", baseUrl).href;
  const vaultId = engine.vault.id;
  const { id, token } = await capability<{ id: string; token: string }>(baseUrl, engine.rendererToken, "gateway.tokens.create", { name: "独立 HTTP 客户端" });
  await capability(baseUrl, engine.rendererToken, "gateway.update", { capability: "vault.info", exposed: true });
  const firstCli = await connect(root, { engineEntry: "" });
  expect(firstCli).toMatchObject({ baseUrl, vaultId });
  expect(await capability(firstCli.baseUrl, firstCli.token, "vault.info")).toMatchObject({ id: vaultId });
  expect((await mcpRequest(endpoint, token, initializeMcp)).status).toBe(404);

  await capability(baseUrl, engine.rendererToken, "gateway.mcp.update", { enabled: true, transport: "http" });
  expect((await mcpRequest(endpoint, "unknown", initializeMcp)).status).toBe(401);
  expect((await mcpRequest(endpoint, engine.rendererToken, initializeMcp)).status).toBe(403);
  expect((await mcpRequest(endpoint, firstCli.token, initializeMcp)).status).toBe(403);
  const verifyHttpClient = async () => {
    const session = await openMcpSession(endpoint, token);
    const list = await mcpRequest(endpoint, token, mcpRpc("tools/list"), session);
    expect(await list.json()).toMatchObject({ result: { tools: expect.arrayContaining([expect.objectContaining({ name: "vault_info" })]) } });
    const call = await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: "vault_info", arguments: {} }), session);
    expect(await call.json()).toMatchObject({ result: { structuredContent: { data: { id: vaultId } } } });
  };
  await verifyHttpClient();

  const descriptor = engine.descriptorPath;
  await stop(engine);
  expect(existsSync(descriptor)).toBe(false);
  await expect(connect(root, { engineEntry: "" })).rejects.toThrow("未配置引擎入口");
  // Reapply the same choice via the existing boot contract. Persisted port setup belongs to U5.
  engine = await start(root, { port });
  expect(readLiveEndpoint(engine.vault)).toMatchObject({ vaultId, port });
  const currentCli = await connect(root, { engineEntry: "" });
  expect(currentCli).toMatchObject({ baseUrl, vaultId });
  expect(currentCli.token).not.toBe(firstCli.token);
  expect((await mcpRequest(endpoint, firstCli.token, initializeMcp)).status).toBe(401);
  await verifyHttpClient();

  await capability(baseUrl, engine.rendererToken, "gateway.mcp.update", { enabled: false, transport: "http" });
  expect((await mcpRequest(endpoint, token, initializeMcp)).status).toBe(404);
  expect(await capability(currentCli.baseUrl, currentCli.token, "vault.info")).toMatchObject({ id: vaultId });
  await capability(baseUrl, engine.rendererToken, "gateway.mcp.update", { enabled: true, transport: "http" });
  await capability(baseUrl, engine.rendererToken, "gateway.tokens.revoke", { id });
  expect((await mcpRequest(endpoint, token, initializeMcp)).status).toBe(401);
});

test("占用固定端口时保留冲突，复制的描述文件也不能把另一 Vault 的 CLI 连过去", async () => {
  const root = newVault();
  const other = await start(newVault(), { create: true });
  const otherRoot = other.vault.root;
  const otherDescriptor = other.descriptorPath;
  await stop(other);
  const engine = await start(root, { create: true });
  await expect(startEngineServer({
    dispatcher: engine.dispatcher,
    registry: engine.registry,
    tokens: new TokenTable(),
    events: engine.events,
    port: engine.port,
  })).rejects.toMatchObject({ code: "EADDRINUSE" });
  expect(readLiveEndpoint(engine.vault)).toMatchObject({ vaultId: engine.vault.id, port: engine.port });

  copyFileSync(engine.descriptorPath, otherDescriptor);
  expect(readLiveEndpoint(other.vault)).toBeNull();
  await expect(connect(otherRoot, { engineEntry: "" })).rejects.toThrow("未配置引擎入口");
  expect(await connect(root, { engineEntry: "" })).toMatchObject({ vaultId: engine.vault.id });
});
