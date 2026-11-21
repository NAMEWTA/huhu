import { randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { InitializeResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, OperationReceipts, TokenTable, defineCapability, durableExternal, startEngineServer, type RunningServer } from "../src/index.js";
import { mcpRequest, mcpRpc, openMcpSession, openRecoverableMcpSession, recoveryInitialize, recoveryMeta } from "./fixtures/mcp-http.js";

const ToolReply = z.object({
  structuredContent: z.object({ opId: z.uuidv4(), data: z.unknown() }).optional(),
  content: z.array(z.object({ text: z.string() })),
});
const ResourceReply = z.object({ contents: z.array(z.object({ text: z.string() })) });

async function rpcResult<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  expect(response.status).toBe(200);
  return z.object({ result: schema }).parse(await response.json()).result;
}

const roots = new Set<string>();
const servers = new Set<RunningServer>();
afterEach(async () => {
  await Promise.all([...servers].map((server) => server.close()));
  servers.clear();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mcp-recovery-"));
  roots.add(root);
  const token = randomBytes(32).toString("base64url");
  const otherToken = randomBytes(32).toString("base64url");
  const counter = path.join(root, "effects");
  const ledger = path.join(root, "operations.ndjson");
  const audit = path.join(root, "audit.ndjson");
  const capability = "fixture.write";
  const vaultInstance = "fixture-vault";
  const authId = "fixture-gateway";
  const generation = "fixture-service";
  let exposed = true;
  const effects = () => readFileSync(counter, "utf8").trim().split("\n").length;
  async function boot() {
    const registry = new CapabilityRegistry();
    const tokens = new TokenTable();
    tokens.addHash(TokenTable.hashHex(token), "http", authId);
    tokens.addHash(TokenTable.hashHex(otherToken), "http", "fixture-other-gateway");
    const bootstrapToken = tokens.issue("mcp");
    registry.register(
      defineCapability({
        name: capability,
        plugin: "kernel",
        scope: "write",
        exposable: true,
        defaultExposed: false,
        ...durableExternal,
        input: z.object({ value: z.string() }),
        output: z.object({ ok: z.literal(true) }),
        handler: () => {
          appendFileSync(counter, "effect\n", { flush: true });
          return { ok: true as const };
        },
      }),
    );
    const dispatcher = new Dispatcher({
      registry,
      operations: { ledger: new OperationReceipts(ledger), vaultInstance },
      audit: new GatewayAudit(audit),
      idempotency: new IdempotencyStore(),
      isPluginEnabled: () => true,
      toolAccess: () => ({ state: "ready", revision: exposed ? 1 : 2, choices: { [capability]: exposed } }),
      grantedPermissions: () => [],
      pluginOrigin: () => "builtin",
    });
    const server = await startEngineServer({ dispatcher, registry, tokens, events: new EventBus(() => vaultInstance), vaultInstance, mcpHttp: { enabled: () => true }, mcpRecovery: { directory: root, generation: () => generation } });
    servers.add(server);
    return {
      bootstrapToken,
      revoke: () => tokens.removeHash(TokenTable.hashHex(token)),
      url: (suffix = "/mcp") => `http://127.0.0.1:${server.port}${suffix}`,
      async stop() {
        await server.close();
        servers.delete(server);
      },
    };
  }
  const call = (url: string, handle: string, key: string, value = "fixture") =>
    mcpRequest(url, token, mcpRpc("tools/call", { name: "fixture_write", arguments: { value }, _meta: { "huhu.dev/intent-key": key } }), handle).then((response) => rpcResult(response, ToolReply));
  const operation = async (url: string, handle: string, id: string) => {
    const response = await mcpRequest(url, token, mcpRpc("resources/read", { uri: `huhu://operations/${id}` }), handle);
    const reply = await rpcResult(response, ResourceReply);
    return CapabilityResultSchema.parse(JSON.parse(reply.contents[0]!.text));
  };
  return { boot, token, otherToken, call, operation, effects, ledger, audit, root, hide: () => (exposed = false) };
}

test("HTTP MCP recovers a logical owner after the listener and Dispatcher restart", async () => {
  const f = fixture();
  const first = await f.boot();
  const original = await openRecoverableMcpSession(first.url(), f.token);
  const [a, b] = await Promise.all([f.call(first.url(), original.handle, "same-key"), f.call(first.url(), original.handle, "same-key")]);
  expect(a.structuredContent).toEqual(b.structuredContent);
  const operationId = a.structuredContent!.opId;
  expect(operationId).toEqual(expect.any(String));
  expect(f.effects()).toBe(1);
  await first.stop();

  const second = await f.boot();
  const endpoint = second.url("/api/v1/mcp");
  expect((await mcpRequest(second.url(), f.token, mcpRpc("tools/list"), original.handle)).status).toBe(404);
  const stranger = await openMcpSession(second.url(), f.token);
  expect(await f.operation(second.url(), stranger, operationId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  const recovered = await openRecoverableMcpSession(endpoint, f.token, original.recovery);
  expect(recovered.recovery).not.toBe(original.recovery);
  expect(recovered.handle).not.toBe(original.handle);
  expect(await f.operation(endpoint, recovered.handle, operationId)).toMatchObject({ ok: true, data: { state: "completed", operationId } });
  expect((await f.call(endpoint, recovered.handle, "same-key")).structuredContent).toEqual(a.structuredContent);
  expect(JSON.parse((await f.call(endpoint, recovered.handle, "same-key", "different")).content[0]!.text)).toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  expect(JSON.parse((await f.call(endpoint, recovered.handle, "missing-key")).content[0]!.text)).toMatchObject({ details: { outcome: "unknown" } });
  f.hide();
  expect(await f.operation(endpoint, recovered.handle, operationId)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(JSON.parse((await f.call(endpoint, recovered.handle, "same-key")).content[0]!.text)).toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
  expect(f.effects()).toBe(1);
  expect((await mcpRequest(second.url(), f.token, recoveryInitialize(original.recovery))).status).toBe(403);
  for (const file of [path.join(f.root, "mcp-recovery.json"), f.ledger, f.audit]) {
    const contents = readFileSync(file, "utf8");
    for (const value of [recovered.recovery, original.recovery, recovered.handle, original.handle, f.token]) expect(contents.includes(value)).toBe(false);
  }
});

test("HTTP MCP recovery is bound to the parent credential and rotates once", async () => {
  const f = fixture();
  const first = await f.boot();
  const original = await openRecoverableMcpSession(first.url(), f.token);
  expect((await mcpRequest(first.url(), f.token, recoveryInitialize(original.recovery))).status).toBe(403);
  await first.stop();
  const second = await f.boot();
  expect((await mcpRequest(second.url(), f.otherToken, recoveryInitialize(original.recovery))).status).toBe(403);
  const bootstrap = await mcpRequest(second.url(), second.bootstrapToken, recoveryInitialize());
  expect(bootstrap.status).toBe(200);
  expect((await rpcResult(bootstrap, InitializeResultSchema))._meta?.[recoveryMeta]).toBeUndefined();
  expect((await mcpRequest(second.url(), second.bootstrapToken, recoveryInitialize(original.recovery))).status).toBe(403);
  const attempts = await Promise.all([mcpRequest(second.url(), f.token, recoveryInitialize(original.recovery)), mcpRequest(second.url(), f.token, recoveryInitialize(original.recovery))]);
  expect(attempts.map((response) => response.status).sort()).toEqual([200, 403]);
  const winner = attempts.find((response) => response.ok)!;
  const handle = winner.headers.get("mcp-session-id")!;
  const replacement = z.string().parse((await rpcResult(winner, InitializeResultSchema))._meta?.[recoveryMeta]);
  expect((await mcpRequest(second.url(), f.token, undefined, handle, { method: "DELETE" })).status).toBe(200);
  expect((await mcpRequest(second.url(), f.token, recoveryInitialize(replacement))).status).toBe(403);
  const revoked = await openRecoverableMcpSession(second.url(), f.token);
  second.revoke();
  expect((await mcpRequest(second.url(), f.token, recoveryInitialize(revoked.recovery))).status).toBe(401);
});

test("HTTP MCP recovery expires and accepted-only receipts remain unknown", async () => {
  const f = fixture();
  const first = await f.boot();
  const original = await openRecoverableMcpSession(first.url(), f.token);
  const expired = await openRecoverableMcpSession(first.url(), f.token);
  const response = await f.call(first.url(), original.handle, "interrupted-key");
  const operationId = response.structuredContent!.opId;
  await first.stop();
  const accepted = readFileSync(f.ledger, "utf8")
    .split("\n")
    .find((line) => line.includes('"phase":"accepted"'))!;
  writeFileSync(f.ledger, accepted + "\n");
  const second = await f.boot();
  const recovered = await openRecoverableMcpSession(second.url(), f.token, original.recovery);
  expect(await f.operation(second.url(), recovered.handle, operationId)).toMatchObject({ ok: true, data: { state: "unknown", operationId } });
  const replay = await f.call(second.url(), recovered.handle, "interrupted-key");
  expect(JSON.parse(replay.content[0]!.text)).toMatchObject({ details: { outcome: "unknown", operationId } });
  expect(f.effects()).toBe(1);
  expect(readFileSync(f.ledger, "utf8").trim()).toBe(accepted);
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 60 * 60_000);
  try {
    expect((await mcpRequest(second.url(), f.token, recoveryInitialize(expired.recovery))).status).toBe(403);
  } finally {
    now.mockRestore();
  }
});
