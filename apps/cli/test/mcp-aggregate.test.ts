import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { boot, type RunningEngine } from "@huhu/engine";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "vitest";
import { localUpstream } from "../../../packages/kernel/test/fixtures/mcp-upstream.js";

type Source = { sourceId: string; revision: number };
type Catalogue = { catalogRevision: number; policyRevision: number };
type Credential = { id: string; token: string };

async function desktop<T>(engine: RunningEngine, capability: string, input: unknown): Promise<T> {
  const response = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  if (!response.ok) throw new Error(`${capability} returned ${response.error.code}`);
  return response.data as T;
}

async function publishFixture(engine: RunningEngine, url: string) {
  const { sourceId, revision } = await desktop<Source>(engine, "mcp.sources.create", {
    displayName: "P6 fixture", namespace: "p6_fixture",
    configuration: { transport: "streamable-http", url, headers: {}, authentication: { kind: "none" } },
  });
  const ref = { sourceId, expectedRevision: revision };
  expect(await desktop(engine, "mcp.sources.check", ref)).toMatchObject({ state: "ready", toolCount: 1 });
  const { catalogRevision, policyRevision } = await desktop<Catalogue>(engine, "mcp.catalog.list", { sourceId });
  await desktop(engine, "mcp.policy.update", {
    expectedCatalogRevision: catalogRevision, expectedPolicyRevision: policyRevision,
    choices: [{ sourceId, upstreamIdentity: "echo", selected: true }],
  });
  await desktop(engine, "mcp.sources.setEnabled", { ...ref, enabled: true });
  await desktop(engine, "gateway.update", { capability: "vault.info", exposed: true });
  return desktop<{ url: string }>(engine, "gateway.mcp.update", { enabled: true });
}

test("P6 a standard MCP client uses the same configured URL for both tool origins across Engine restart and token revocation", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-p6-sdk-"));
  let engine: RunningEngine | undefined;
  let upstream: Awaited<ReturnType<typeof localUpstream>> | undefined;
  const clients = new Set<Client>();
  try {
    upstream = await localUpstream("streamable-http");
    engine = await boot({ vaultPath: root, create: true });
    const vaultId = engine.vault.id;
    const { url } = await publishFixture(engine, upstream.url);
    const first = await desktop<Credential>(engine, "gateway.tokens.create", { name: "P6 client A" });
    const second = await desktop<Credential>(engine, "gateway.tokens.create", { name: "P6 client B" });
    expect(first.id).not.toBe(second.id);
    const makeClient = () => {
      const client = new Client({ name: "huhu-p6-standard-client", version: "1" });
      clients.add(client);
      return client;
    };
    const config = (token: string) => ({ huhu: { url, headers: { Authorization: `Bearer ${token}` } } });
    const a = config(first.token);
    const b = config(second.token);
    const connect = async (entry: typeof a) => {
      const client = makeClient();
      const { url, headers } = entry.huhu;
      const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
      await client.connect(transport);
      return client;
    };
    const close = async (client: Client) => {
      await client.close();
      clients.delete(client);
    };
    const verify = async (client: Client, label: string) => {
      expect((await client.listTools()).tools.map(({ name }) => name)).toEqual(["vault_info", "p6_fixture__echo"]);
      expect((await client.callTool({ name: "vault_info", arguments: {} })).structuredContent).toMatchObject({ data: { id: vaultId } });
      expect((await client.callTool({ name: "p6_fixture__echo", arguments: { value: label } })).structuredContent)
        .toEqual({ value: label, transport: "streamable-http" });
    };

    const initial = await connect(a);
    await verify(initial, "before");
    await close(initial);
    await engine.shutdown();
    engine = await boot({ vaultPath: root });
    expect(await desktop(engine, "gateway.get", {})).toMatchObject({ mcp: { enabled: true, url } });
    const revoked = await connect(a);
    const kept = await connect(b);
    await verify(revoked, "after");
    await desktop(engine, "gateway.tokens.revoke", { id: first.id });
    await expect(revoked.callTool({ name: "p6_fixture__echo", arguments: { value: "denied" } })).rejects.toMatchObject({ code: 401 });
    await expect(connect(a)).rejects.toMatchObject({ code: 401 });
    await verify(kept, "independent");
    expect(upstream.calls).toEqual(["before", "after", "independent"].map((value) => ({ name: "echo", input: { value } })));
    expect(upstream.admissions.every(({ authorization }) => authorization === undefined)).toBe(true);
  } finally {
    await Promise.allSettled([...clients].map((client) => client.close()));
    try {
      await engine?.shutdown();
    } finally {
      await upstream?.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 25_000);

const codex = process.env["HUHU_P6_CODEX_BIN"];
test.skipIf(!codex)("P6 pinned Codex App Server reads one native entry and calls both kinds of tool", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-p6-native-"));
  let engine: RunningEngine | undefined;
  let upstream: Awaited<ReturnType<typeof localUpstream>> | undefined;
  try {
    const profile = path.join(root, "profile");
    const workspace = path.join(root, "workspace");
    mkdirSync(profile, { mode: 0o700 });
    mkdirSync(workspace);
    writeFileSync(path.join(profile, "config.toml"), `check_for_update_on_startup = false
model = "gpt-5.4"
model_provider = "fixture"
[model_providers.fixture]
name = "Local protocol fixture"
base_url = "http://127.0.0.1:1/v1"
wire_api = "responses"
requires_openai_auth = false
`, { mode: 0o600 });
    upstream = await localUpstream("streamable-http");
    engine = await boot({ vaultPath: path.join(root, "vault"), create: true });
    const { url } = await publishFixture(engine, upstream.url);
    const { token } = await desktop<Credential>(engine, "gateway.tokens.create", { name: "P6 Codex" });
    const env = { ...process.env, CODEX_HOME: profile, HUHU_P6_TEST_BEARER: token };
    const native = (...args: string[]) => promisify(execFile)(codex!, args, { cwd: workspace, env, timeout: 5_000 });
    await native("mcp", "add", "huhu", "--url", url, "--bearer-token-env-var", "HUHU_P6_TEST_BEARER");
    expect(JSON.parse((await native("mcp", "list", "--json")).stdout)).toMatchObject([
      { name: "huhu", transport: { type: "streamable_http", url, bearer_token_env_var: "HUHU_P6_TEST_BEARER" } },
    ]);
    const child = spawn(codex!, ["app-server", "--listen", "stdio://"], { cwd: workspace, env, stdio: ["pipe", "pipe", "ignore"], timeout: 25_000 });
    const stopped = once(child, "close").catch(() => undefined);
    child.stdin.on("error", () => undefined);
    const lines = createInterface({ input: child.stdout });
    const messages = lines[Symbol.asyncIterator]();
    let latestId = 0;
    const rpc = async <T>(method: string, params: object) => {
      const id = ++latestId;
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
      for (;;) {
        const line = await messages.next();
        if (line.done) throw new Error(`Codex App Server closed during ${method}`);
        const message = JSON.parse(line.value) as { id?: number; error?: { code: number; message: string }; result?: T };
        if (message.id !== id) continue;
        if (message.error) throw new Error(`Codex App Server rejected ${method}: ${message.error.code} ${message.error.message}`);
        return message.result as T;
      }
    };
    try {
      await rpc("initialize", { clientInfo: { name: "huhu-p6-check", version: "1" }, capabilities: { experimentalApi: true } });
      child.stdin.write('{"method":"initialized"}\n');
      const { thread } = await rpc<{ thread: { id: string } }>("thread/start", { cwd: workspace, sandbox: "read-only", ephemeral: true });
      const inventory = await rpc("mcpServerStatus/list", { threadId: thread.id });
      expect(inventory).toMatchObject({ data: [{ name: "huhu", tools: { vault_info: expect.any(Object), p6_fixture__echo: expect.any(Object) } }] });
      const invoke = (tool: string, args: object) => rpc("mcpServer/tool/call", { threadId: thread.id, server: "huhu", tool, arguments: args });
      expect(await invoke("vault_info", {})).toMatchObject({ structuredContent: { data: { id: engine.vault.id } } });
      expect(await invoke("p6_fixture__echo", { value: "native-codex" })).toMatchObject({ structuredContent: { value: "native-codex" } });
      expect(upstream.calls).toEqual([{ name: "echo", input: { value: "native-codex" } }]);
    } finally {
      lines.close();
      child.kill();
      await stopped;
    }
    await native("mcp", "remove", "huhu");
    expect(JSON.parse((await native("mcp", "list", "--json")).stdout)).toEqual([]);
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      await upstream?.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 38_000);
