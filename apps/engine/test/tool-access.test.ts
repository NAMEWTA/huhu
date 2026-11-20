import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityCatalogEntrySchema, CapabilityDiscoveryEntrySchema, CapabilityResultSchema, HuhuError, ToolAccessFileSchema, ToolAccessSnapshotSchema } from "@huhu/contracts";
import { defineCapability, TOOL_ACCESS_FILE } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { boot, type RunningEngine } from "../src/boot.js";

const url = (engine: RunningEngine, route: string) => "http://127.0.0.1:" + engine.port + route;
const headers = (token: string) => ({ authorization: "Bearer " + token, "content-type": "application/json" });

async function call(engine: RunningEngine, capability: string, input: unknown = {}, token = engine.rendererToken, idempotencyKey?: string) {
  const result = await fetch(url(engine, "/api/v1/call"), {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey }),
  });
  expect(result.status).toBe(200);
  return CapabilityResultSchema.parse(await result.json());
}

async function data(result: ReturnType<typeof call>) {
  const reply = await result;
  if (!reply.ok) throw new Error(reply.error.message);
  return reply.data;
}
const access = async (engine: RunningEngine) => z.object({ toolAccess: ToolAccessSnapshotSchema }).parse(await data(call(engine, "gateway.get"))).toolAccess;
const directory = async (engine: RunningEngine) => z.array(CapabilityCatalogEntrySchema).parse(await data(call(engine, "capabilities.list", { includeInactive: true })));
const names = async (engine: RunningEngine, token: string) => {
  const response = await fetch(url(engine, "/api/v1/capabilities"), { headers: headers(token) });
  expect(response.status).toBe(200);
  return z
    .array(CapabilityDiscoveryEntrySchema)
    .parse(await response.json())
    .map((entry) => entry.name);
};

async function mcp(engine: RunningEngine, token: string, method: string, params: unknown = {}) {
  const response = await fetch(url(engine, "/mcp"), {
    method: "POST",
    headers: { ...headers(token), accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  expect(response.status).toBe(200);
  return response.json();
}

test("两个 Vault 分开保存工具选择，重启保持版本，未配置的新工具关闭，损坏时失败关闭", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-tool-access-"));
  const dirA = path.join(root, "a");
  const dirB = path.join(root, "b");
  const policyFile = path.join(dirA, TOOL_ACCESS_FILE);
  let a: RunningEngine | undefined;
  let b: RunningEngine | undefined;
  try {
    const legacy = '{"capabilityExposure":{"notes.read":true}}\n';
    const legacyFile = path.join(dirA, ".huhu", "plugins.json");
    mkdirSync(path.dirname(legacyFile), { recursive: true });
    mkdirSync(dirB);
    writeFileSync(legacyFile, legacy);
    writeFileSync(path.join(dirA, "fixture.md"), "# isolated\n");
    a = await boot({ vaultPath: dirA, create: true });
    b = await boot({ vaultPath: dirB, create: true });

    const http = z.object({ token: z.string() }).parse(await data(call(a, "gateway.tokens.create", { name: "fixture" }))).token;
    const input = { path: "fixture.md" };
    const deny = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const initial = await access(a);
    expect(initial).toMatchObject({ state: "ready", revision: 0, choices: { "notes.read": false } });
    if (initial.state !== "ready") throw new Error(initial.message);
    expect(Object.keys(initial.choices)).toHaveLength(a.registry.knownNames().length);
    expect(Object.values(initial.choices).every((selected) => selected === false)).toBe(true);
    expect(readFileSync(legacyFile, "utf8")).toBe(legacy);
    expect((await fetch(url(a, "/api/v1/capabilities"))).status).toBe(401);
    for (const token of [a.cliToken, a.mcpToken, http]) {
      expect(await names(a, token)).toEqual([]);
      expect(await call(a, "notes.read", input, token)).toMatchObject(deny);
      expect(await call(a, "capabilities.list", { includeInactive: true }, token)).toMatchObject(deny);
      expect(await call(a, "gateway.get", {}, token)).toMatchObject(deny);
    }

    expect(await data(call(a, "gateway.mcp.update", { enabled: true, transport: "http" }))).toMatchObject({ enabled: true });
    expect(await mcp(a, a.mcpToken, "tools/list")).toMatchObject({ result: { tools: [] } });
    expect(await mcp(a, a.mcpToken, "resources/list")).toMatchObject({ result: { resources: [] } });
    expect(await call(a, "gateway.update", { capability: "capabilities.list", exposed: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await data(call(a, "gateway.update", { capability: "notes.read", exposed: true }))).toEqual({ exposed: true, revision: 1 });
    for (const token of [a.cliToken, a.mcpToken, http]) {
      expect(await names(a, token)).toEqual(["notes.read"]);
      expect(await call(a, "notes.read", input, token)).toMatchObject({ ok: true, data: { text: "# isolated\n" } });
      expect(await call(a, "notes.list", {}, token)).toMatchObject(deny);
    }
    expect(await mcp(a, a.mcpToken, "tools/list")).toMatchObject({ result: { tools: [{ name: "notes_read" }] } });
    expect(await mcp(a, a.mcpToken, "tools/call", { name: "notes_read", arguments: input })).toMatchObject({
      result: { content: [{ text: expect.stringContaining("isolated") }] },
    });
    expect(await mcp(a, a.mcpToken, "resources/templates/list")).toMatchObject({ result: { resourceTemplates: [] } });

    await a.shutdown();
    a = await boot({ vaultPath: dirA });
    expect(await access(a)).toMatchObject({ state: "ready", revision: 1, choices: { "notes.read": true } });
    expect(await names(a, http)).toEqual(["notes.read"]);
    expect(await call(a, "notes.read", input, a.cliToken)).toMatchObject({ ok: true });
    expect(await access(b)).toMatchObject({ state: "ready", revision: 0, choices: { "notes.read": false } });
    expect(await names(b, b.cliToken)).toEqual([]);

    a.registry.register(
      defineCapability({
        name: "fixture.new",
        plugin: "kernel",
        scope: "read",
        exposable: true,
        defaultExposed: true,
        input: z.object({}),
        output: z.string(),
        handler: () => "fixture",
      }),
    );
    expect((await directory(a)).find((entry) => entry.name === "fixture.new")).toMatchObject({ selected: null, exposed: false });
    expect(await call(a, "fixture.new", {}, a.cliToken)).toMatchObject(deny);
    expect(await data(call(a, "gateway.update", { capability: "fixture.new", exposed: false }))).toEqual({ exposed: false, revision: 2 });
    expect((await directory(a)).find((entry) => entry.name === "fixture.new")).toMatchObject({ selected: false, exposed: false });
    expect(await data(call(a, "gateway.update", { capability: "notes.read", exposed: false }))).toEqual({ exposed: false, revision: 3 });
    expect(await data(call(a, "gateway.update", { capability: "notes.read", exposed: false }))).toEqual({ exposed: false, revision: 3 });
    expect(await names(a, a.cliToken)).toEqual([]);
    expect(await mcp(a, a.mcpToken, "tools/call", { name: "notes_read", arguments: input })).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining("CAPABILITY_NOT_EXPOSED") }] } });
    expect(ToolAccessFileSchema.parse(JSON.parse(readFileSync(policyFile, "utf8")))).toMatchObject({ revision: 3, choices: { "notes.read": false, "fixture.new": false } });

    const invalid = '{"formatVersion":1,"revision":4,"choices":{"notes.read":true,"notes.list":"invalid"}}\n';
    writeFileSync(policyFile, invalid);
    expect(await access(a)).toMatchObject({ state: "error", reason: "invalid-format" });
    expect(await names(a, a.cliToken)).toEqual([]);
    await a.shutdown();
    a = await boot({ vaultPath: dirA });
    expect(await access(a)).toMatchObject({ state: "error", reason: "invalid-format" });
    expect((await directory(a)).find((entry) => entry.name === "notes.read")).toMatchObject({ selected: null, exposed: false });
    expect(await call(a, "notes.read", input)).toMatchObject({ ok: true });
    expect(await call(a, "notes.read", input, http)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED", details: { reason: "invalid-format" } } });
    expect(await mcp(a, a.mcpToken, "tools/list")).toMatchObject({ result: { tools: [] } });
    expect(await call(a, "gateway.update", { capability: "notes.read", exposed: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(readFileSync(policyFile, "utf8")).toBe(invalid);
    expect(await names(b, b.cliToken)).toEqual([]);
  } finally {
    try {
      await Promise.all([a?.shutdown(), b?.shutdown()]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 60_000);

test("两份工具预览只有同一版本的首个提交能整批生效，发现、撤销和落盘共用策略", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-tool-batch-"));
  const engine = await boot({ vaultPath: root, create: true });
  const policyFile = path.join(root, TOOL_ACCESS_FILE);
  const changes = [
    { capability: "notes.list", exposed: true },
    { capability: "notes.read", exposed: true },
  ];
  const otherChanges = [{ capability: "vault.info", exposed: true }];
  const preview = async (target: typeof changes) => z.object({ revision: z.number(), catalogRevision: z.string(), targets: z.array(z.unknown()) }).parse(await data(call(engine, "gateway.policy.preview", { changes: target })));
  const update = (view: Awaited<ReturnType<typeof preview>>, target: typeof changes, key = randomUUID()) =>
    call(engine, "gateway.policy.update", { changes: target, expectedRevision: view.revision, catalogRevision: view.catalogRevision }, engine.rendererToken, key);
  const publishes: unknown[] = [];
  const unsubscribe = engine.events.subscribe((event) => {
    if (event.type === "entity.changed" && (event.payload as { kind?: string }).kind === "tool-access") publishes.push(event.payload);
  });
  try {
    const [first, second] = await Promise.all([preview(changes), preview(otherChanges)]);
    expect(first).toMatchObject({
      revision: 0,
      targets: [expect.objectContaining({ capability: "notes.list", exposed: true, selected: false, availability: "active" }), expect.objectContaining({ capability: "notes.read", exposed: true, selected: false })],
    });
    expect(await names(engine, engine.cliToken)).toEqual([]);
    const key = randomUUID();
    const committed = await update(first, changes, key);
    expect(committed).toMatchObject({ ok: true, data: { revision: 1, changed: true } });
    expect(await update(first, changes, key)).toEqual(committed);
    expect(await update(second, otherChanges)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT", details: { currentVersion: "1" } } });
    expect(publishes).toEqual([{ kind: "tool-access", id: "policy", op: "updated" }]);
    expect((await names(engine, engine.cliToken)).sort()).toEqual(["notes.list", "notes.read"]);
    expect((await names(engine, engine.mcpToken)).sort()).toEqual(["notes.list", "notes.read"]);
    expect(await call(engine, "gateway.policy.preview", { changes }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });

    const before = readFileSync(policyFile, "utf8");
    const current = await preview(otherChanges);
    const invalid = [...otherChanges, { capability: "agent.runs.dispatch", exposed: true }];
    const conflicting = [...otherChanges, { capability: "vault.info", exposed: false }];
    for (const target of [invalid, conflicting]) expect(await update(current, target)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const write = vi.spyOn(engine.vault.files, "write").mockRejectedValueOnce(new HuhuError("WRITE_PARTIAL", "合成落盘失败"));
    try {
      expect(await update(current, otherChanges)).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL" } });
    } finally {
      write.mockRestore();
    }
    expect(readFileSync(policyFile, "utf8")).toBe(before);
    expect(await access(engine)).toMatchObject({ state: "ready", revision: 1, choices: { "vault.info": false } });
    expect(publishes).toHaveLength(1);

    const unlink = engine.registry.register(defineCapability({ name: "fixture.discovered", plugin: "kernel", scope: "read", exposable: true, defaultExposed: false, input: z.object({}), output: z.string(), handler: () => "fixture" }));
    try {
      expect(await update(current, otherChanges)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(readFileSync(policyFile, "utf8")).toBe(before);
    } finally {
      unlink();
    }
    const close = changes.map(({ capability }) => ({ capability, exposed: false }));
    expect(await update(await preview(close), close)).toMatchObject({ ok: true, data: { revision: 2 } });
    expect(await names(engine, engine.mcpToken)).toEqual([]);
    expect(await names(engine, engine.cliToken)).toEqual([]);
    expect(publishes).toHaveLength(2);
  } finally {
    unsubscribe();
    await engine.shutdown();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 30_000);
