import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("在现有端口启用 MCP 后，CLI 重新发现同一端点，独立客户端使用原 URL 与授权重连", async () => {
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

  await expect(capability(baseUrl, engine.rendererToken, "gateway.mcp.update", { enabled: true })).resolves.toEqual({
    enabled: true,
    url: endpoint,
    activePort: port,
    configuredPort: port,
    restartRequired: false,
  });
  expect((await mcpRequest(endpoint, "unknown", initializeMcp)).status).toBe(401);
  expect((await mcpRequest(endpoint, engine.rendererToken, initializeMcp)).status).toBe(403);
  expect((await mcpRequest(endpoint, firstCli.token, initializeMcp)).status).toBe(403);
  expect((await mcpRequest(`${baseUrl}/api/v1/mcp`, token, initializeMcp)).status).toBe(404);
  const verifyHttpClient = async () => {
    const session = await openMcpSession(endpoint, token);
    const list = await mcpRequest(endpoint, token, mcpRpc("tools/list"), session);
    expect(await list.json()).toMatchObject({ result: { tools: expect.arrayContaining([expect.objectContaining({ name: "vault_info" })]) } });
    const call = await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: "vault_info", arguments: {} }), session);
    expect(await call.json()).toMatchObject({ result: { structuredContent: { data: { id: vaultId } } } });
    return session;
  };
  await verifyHttpClient();

  const descriptor = engine.descriptorPath;
  await stop(engine);
  expect(existsSync(descriptor)).toBe(false);
  await expect(connect(root, { engineEntry: "" })).rejects.toThrow("未配置引擎入口");
  engine = await start(root);
  expect(readLiveEndpoint(engine.vault)).toMatchObject({ vaultId, port });
  const currentCli = await connect(root, { engineEntry: "" });
  expect(currentCli).toMatchObject({ baseUrl, vaultId });
  expect(currentCli.token).not.toBe(firstCli.token);
  expect((await mcpRequest(endpoint, firstCli.token, initializeMcp)).status).toBe(401);
  await verifyHttpClient();

  await capability(baseUrl, engine.rendererToken, "gateway.mcp.update", { enabled: false });
  expect((await mcpRequest(endpoint, token, initializeMcp)).status).toBe(404);
  expect(await capability(currentCli.baseUrl, currentCli.token, "vault.info")).toMatchObject({ id: vaultId });
  await capability(baseUrl, engine.rendererToken, "gateway.mcp.update", { enabled: true });
  const liveSession = await verifyHttpClient();
  await capability(baseUrl, engine.rendererToken, "gateway.tokens.revoke", { id });
  expect((await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: "vault_info", arguments: {} }), liveSession)).status).toBe(401);
  expect((await mcpRequest(endpoint, token, initializeMcp)).status).toBe(401);
});

test("占用固定端口时保留冲突，复制的描述文件也不能把另一 Vault 的 CLI 连过去", async () => {
  const root = newVault();
  const other = await start(newVault(), { create: true });
  const otherRoot = other.vault.root;
  const otherDescriptor = other.descriptorPath;
  await stop(other);
  const engine = await start(root, { create: true });
  await expect(
    startEngineServer({
      dispatcher: engine.dispatcher,
      registry: engine.registry,
      tokens: new TokenTable(),
      events: engine.events,
      port: engine.port,
    }),
  ).rejects.toMatchObject({ code: "EADDRINUSE" });
  expect(readLiveEndpoint(engine.vault)).toMatchObject({ vaultId: engine.vault.id, port: engine.port });

  await capability(`http://127.0.0.1:${engine.port}`, engine.rendererToken, "gateway.mcp.update", { enabled: true });
  copyFileSync(path.join(engine.vault.runtimeDir, "mcp-listener.json"), path.join(other.vault.runtimeDir, "mcp-listener.json"));
  copyFileSync(engine.descriptorPath, otherDescriptor);
  expect(readLiveEndpoint(other.vault)).toBeNull();
  await expect(connect(otherRoot, { engineEntry: "" })).rejects.toThrow("发现记录不属于所选 Vault");
  expect(await connect(root, { engineEntry: "" })).toMatchObject({ vaultId: engine.vault.id });
  const reopened = await start(otherRoot);
  expect(reopened.port).not.toBe(engine.port);
  expect(await capability(`http://127.0.0.1:${reopened.port}`, reopened.rendererToken, "gateway.get")).toMatchObject({
    mcp: { enabled: false, configuredPort: null },
  });
});

test("修改端口标记待重启，端口占用时启动明确失败，原令牌无法访问另一 Vault", async () => {
  const root = newVault();
  const occupied = await start(newVault(), { create: true });
  const fixed = occupied.port;
  const occupiedUrl = `http://127.0.0.1:${fixed}`;
  const first = await start(root, { create: true });
  const base = `http://127.0.0.1:${first.port}`;
  const { token } = await capability<{ token: string }>(base, first.rendererToken, "gateway.tokens.create", { name: "第一 Vault" });
  await capability(occupiedUrl, occupied.rendererToken, "gateway.mcp.update", { enabled: true });
  expect((await mcpRequest(`${occupiedUrl}/mcp`, token, initializeMcp)).status).toBe(401);
  await expect(capability(base, first.rendererToken, "gateway.mcp.update", { enabled: true, port: 6000 })).rejects.toThrow("INVALID_INPUT");
  await expect(capability(base, first.rendererToken, "gateway.mcp.update", { enabled: true, port: fixed })).resolves.toEqual({
    enabled: true,
    url: `${base}/mcp`,
    activePort: first.port,
    configuredPort: fixed,
    restartRequired: true,
  });
  await openMcpSession(`${base}/mcp`, token);
  await stop(first);
  await expect(start(root)).rejects.toMatchObject({ code: "EADDRINUSE", message: expect.stringContaining(String(fixed)) });
  expect(existsSync(first.descriptorPath)).toBe(false);
  const engineEntry = path.resolve(import.meta.dirname, "../src/main.ts");
  await expect(connect(root, { engineEntry })).rejects.toThrow("本机监听端口已被占用");
  await stop(occupied);
  const reopened = await start(root);
  expect(reopened.port).toBe(fixed);
  await openMcpSession(`${occupiedUrl}/mcp`, token);
  expect(readLiveEndpoint(reopened.vault)).toMatchObject({ port: fixed, vaultId: first.vault.id });
});

test("旧 stdio 启用标记保留关闭状态，明确开启 HTTP 后才接受持久令牌", async () => {
  const root = newVault();
  const first = await start(root, { create: true });
  const file = path.join(first.vault.stateDir, "gateways.json");
  const { token } = await capability<{ token: string }>(`http://127.0.0.1:${first.port}`, first.rendererToken, "gateway.tokens.create", { name: "保留授权" });
  await stop(first);
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), mcp: { enabled: true, transport: "stdio" } }));
  const reopened = await start(root);
  const base = `http://127.0.0.1:${reopened.port}`;
  expect((await mcpRequest(`${base}/mcp`, token, initializeMcp)).status).toBe(404);
  await capability(base, reopened.rendererToken, "gateway.mcp.update", { enabled: true });
  await openMcpSession(`${base}/mcp`, token);
  expect(JSON.parse(readFileSync(file, "utf8")).mcp).toEqual({ enabled: true, generation: expect.any(String) });
});
