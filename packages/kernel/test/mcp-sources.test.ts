import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors, type McpSource, type McpSourceDeletePreview } from "@huhu/contracts";
import { Vault, exportPackage } from "@huhu/vault";
import { unzipSync } from "fflate";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import {
  CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, MCP_SOURCES_SERVICE, PluginManager, TokenTable,
  createHuhuContext, createMcpSourcePlugin, defineCapability, mcpSourceDescriptors, startEngineServer,
  type ExternalMcpTools, type LocalCredentialProtection,
} from "../src/index.js";
import { initializeMcp, mcpRequest, mcpRpc, openMcpSession, openRecoverableMcpSession } from "./fixtures/mcp-http.js";
import { localUpstream } from "./fixtures/mcp-upstream.js";
import { loopbackOAuth } from "./fixtures/mcp-oauth.js";
const mcpReply = z.object({
  result: z.looseObject({
    tools: z.array(z.looseObject({ name: z.string() })).optional(),
    structuredContent: z.unknown().optional(),
  }).optional(),
  error: z.object({ data: z.object({ code: z.string() }).optional() }).optional(),
});


const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const done of cleanup.reverse()) await done();
  cleanup.length = 0;
});

function root() {
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-mcp-sources-test-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function fixture(directory: string, readOnly = false, options: { localRoot: string; protection: LocalCredentialProtection } | undefined = undefined) {
  const vault = await Vault.open(directory, { create: !readOnly, readOnly });
  const identity = directory;
  const registry = new CapabilityRegistry();
  const events = new EventBus(() => vault.id);
  const tokens = new TokenTable();
  const token = tokens.issue("http");
  let service: AbortController | undefined;
  let closed = false;
  const audit = new GatewayAudit();
  const lifecycle = createHuhuContext({
    registry, events, vault: { files: vault.files, vaultId: vault.id, stateDir: vault.stateDir, index: {} as never, trash: {} as never, repo: {} as never },
    call: async () => { throw new Error("unexpected plugin call"); },
  });
  registry.declareDescriptors("mcp", mcpSourceDescriptors);
  registry.register(defineCapability({
    name: "vault.info", plugin: "kernel", scope: "read", exposable: true, defaultExposed: true,
    input: z.strictObject({}), output: z.object({ name: z.string() }), handler: () => ({ name: "fixture" }),
  }));
  const plugins = new PluginManager(lifecycle.root, lifecycle.facade, events);
  plugins.register(createMcpSourcePlugin({
    vaultInstance: identity, hostId: "fixture-host", approvalPath: ".huhu/runtime/test/mcp-approvals.json",
    ...(options && { credentialHost: { ...options, vault, localVaultInstanceId: "fixture-vault" } }),
    publishSignal: () => plugins.isEnabled("mcp") ? service?.signal : undefined,
    endpoint: () => endpoint,
    isBuiltinName: (name) => name === "vault_info",
    audit: (row) => audit.add(row),
  }));
  await plugins.enableAll();
  const dispatcher = new Dispatcher({
    registry, audit, idempotency: new IdempotencyStore(), isPluginEnabled: (id) => plugins.isEnabled(id),
    toolAccess: () => ({ state: "ready", revision: 0, choices: { "vault.info": true } }),
    grantedPermissions: () => [], pluginOrigin: () => "builtin",
  });
  const server = await startEngineServer({
    registry, dispatcher, tokens, events, vaultInstance: identity,
    mcpHttp: { enabled: () => !!service && plugins.isEnabled("mcp") },
    externalMcpTools: () => lifecycle.getService<ExternalMcpTools>(MCP_SOURCES_SERVICE),
    mcpSignal: () => service?.signal ?? AbortSignal.abort(),
    mcpRecovery: { directory, generation: () => "fixture-generation" },
  }).catch(async (error: unknown) => {
    await plugins.disposeAll();
    await vault.close();
    throw error;
  });
  const close = async () => {
    if (closed) return;
    closed = true;
    service?.abort();
    await server.close();
    await plugins.disposeAll();
    await vault.close();
  };
  cleanup.push(close);
  const invoke = (capability: string, input: unknown = {}) => dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
  async function call<T>(capability: string, input?: unknown): Promise<T> {
    const result = await invoke(capability, input);
    if (!result.ok) throw Error(JSON.stringify(result.error));
    return result.data as T;
  }
  const endpoint = `http://127.0.0.1:${server.port}/mcp`;
  return {
    call, invoke, endpoint, token, tokens, close, plugins, vault, audit,
    setPublishing(enabled: boolean) { service?.abort(); service = enabled ? new AbortController() : undefined; },
    async client() {
      const handle = await openMcpSession(endpoint, token);
      return async (method: string, params: unknown = {}) => {
        const response = await mcpRequest(endpoint, token, mcpRpc(method, params), handle);
        expect(response.status).toBe(200);
        return mcpReply.parse(await response.json());
      };
    },
  };
}

type Source = { sourceId: string; revision: number; enabled: boolean; namespace: string };
type Catalog = { catalogRevision: number; policyRevision: number; entries: { kind?: string; publicKey: string; upstreamIdentity: string; sourceId: string; selected: boolean }[] };

async function addStdio(f: Awaited<ReturnType<typeof fixture>>, directory: string, namespace = "repo", definition?: string) {
  const journal = path.join(directory, namespace + "-events.ndjson");
  const source = await f.call<Source>("mcp.sources.create", {
    displayName: namespace, namespace,
    configuration: { transport: "stdio", command: process.execPath, args: [path.resolve("tests/fixtures/mcp-stdio.cjs"), journal, ...(definition ? [definition] : [])], environment: {} },
  });
  return { source, journal };
}

const sourceRef = (source: Source) => ({ sourceId: source.sourceId, expectedRevision: source.revision });
async function approve(f: Awaited<ReturnType<typeof fixture>>, source: Source) {
  const input = sourceRef(source);
  const { configurationFingerprint } = await f.call<{ configurationFingerprint: string }>("mcp.executionApproval.preview", input);
  await f.call("mcp.executionApproval.confirm", { ...input, configurationFingerprint });
}

async function exposure(f: Awaited<ReturnType<typeof fixture>>, source: Source, name: string, selected: boolean) {
  const { catalogRevision, policyRevision } = await f.call<Catalog>("mcp.catalog.list", { sourceId: source.sourceId });
  return f.call("mcp.policy.update", {
    expectedCatalogRevision: catalogRevision, expectedPolicyRevision: policyRevision,
    choices: [{ sourceId: source.sourceId, upstreamIdentity: name, selected }],
  });
}

function writes(journal: string): { type: string; pid?: number; helperPid?: number; args?: object; name?: string; keys?: string[] }[] {
  return readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

async function readySource(f: Awaited<ReturnType<typeof fixture>>, directory: string, namespace: string, definition?: string) {
  const { source, journal } = await addStdio(f, directory, namespace, definition);
  await approve(f, source);
  await f.call("mcp.sources.check", sourceRef(source));
  await exposure(f, source, "echo", true);
  const enabled = await f.call<Source>("mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
  return { source: enabled, journal };
}

function running(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

test("ten sessions share stdio; a source exit reports unknown and recovery only rediscovers", async () => {
  const directory = root();
  const f = await fixture(directory);
  const healthy = await readySource(f, directory, "healthy");
  const broken = await readySource(f, directory, "broken");
  f.setPublishing(true);
  const clients = await Promise.all(Array.from({ length: 10 }, () => f.client()));
  const snapshots = await Promise.all(clients.map((rpc) => rpc("tools/list")));
  for (const snapshot of snapshots) expect(snapshot.result?.tools?.map(({ name }) => name)).toEqual(["vault_info", "healthy__echo", "broken__echo"]);
  for (const source of [healthy, broken]) expect(writes(source.journal).filter(({ type }) => type === "start")).toHaveLength(2);

  const rpc = clients[0]!;
  const result = await rpc("tools/call", { name: "broken__echo", arguments: { value: "fixture-disconnect" } });
  expect(result.error?.data?.code).toBe("RUN_UNKNOWN");
  expect((await rpc("tools/call", { name: "healthy__echo", arguments: { value: "ok" } })).result?.structuredContent).toEqual({ value: "ok" });
  expect((await rpc("tools/call", { name: "vault_info" })).result?.structuredContent).toEqual({ data: { name: "fixture" } });
  await expect.poll(async () => (await f.call<{ state: string }>("mcp.sources.get", { sourceId: broken.source.sourceId })).state).toBe("ready");
  expect(writes(broken.journal).filter(({ type }) => type === "start")).toHaveLength(3);
  expect(writes(broken.journal).filter(({ type }) => type === "call")).toHaveLength(1);
  expect(f.audit.list()).toContainEqual(expect.objectContaining({
    mcp: expect.objectContaining({
      requestId: expect.any(String), session: expect.any(String), sourceName: "broken", upstreamEntry: "echo", publicEntry: "broken__echo",
      result: "upstream-result-unknown",
    }),
  }));
  expect(JSON.stringify(f.audit.list())).not.toContain("fixture-disconnect");
});

test("a hanging stdio source leaves other entries reachable and publication stop reclaims checks and descendants", async () => {
  const directory = root();
  const f = await fixture(directory);
  const definition = path.join(directory, "hanging.json");
  writeFileSync(definition, JSON.stringify({ helper: process.platform !== "win32" }));
  const slow = await readySource(f, directory, "slow", definition);
  const healthy = await readySource(f, directory, "quick");
  writeFileSync(definition, JSON.stringify({ helper: process.platform !== "win32", hanging: true }));
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools?.map(({ name }) => name)).toEqual(["vault_info", "quick__echo"]);
  const check = f.invoke("mcp.sources.check", sourceRef(slow.source));
  await expect.poll(() => writes(slow.journal).filter(({ type }) => type === "start").length).toBe(3);
  const pending = writes(slow.journal).filter(({ type }) => type === "start").slice(1).flatMap(({ pid, helperPid }) => [pid!, ...(helperPid ? [helperPid] : [])]);
  f.setPublishing(false);
  expect(await check).toMatchObject({ ok: false });
  const quickPid = writes(healthy.journal).at(-1)!.pid!;
  await expect.poll(() => [...pending, quickPid].filter(running)).toEqual([]);
  writeFileSync(definition, JSON.stringify({ helper: process.platform !== "win32" }));
  expect(await f.call("mcp.sources.check", sourceRef(slow.source))).toMatchObject({ state: "ready" });
  expect(running(writes(slow.journal).at(-1)!.pid!)).toBe(false);
  expect((await mcpRequest(f.endpoint, f.token, mcpRpc("tools/list"))).ok).toBe(false);
});

test("a recovered session refuses even read-only upstream tools, and revocation stays credential scoped", async () => {
  const directory = root();
  const f = await fixture(directory);
  const { journal } = await readySource(f, directory, "repo");
  f.setPublishing(true);
  const first = await openRecoverableMcpSession(f.endpoint, f.token);
  f.setPublishing(false);
  f.setPublishing(true);
  const recovered = await openRecoverableMcpSession(f.endpoint, f.token, first.recovery);
  const body = mcpRpc("tools/call", { name: "repo__echo", arguments: { value: "ok" } });
  const denied = await mcpRequest(f.endpoint, f.token, body, recovered.handle);
  expect(mcpReply.parse(await denied.json()).error).toBeDefined();
  expect(writes(journal).filter(({ type }) => type === "call")).toHaveLength(0);
  const clean = await f.client();
  expect((await clean("tools/call", body.params)).result?.structuredContent).toEqual({ value: "ok" });
  const otherToken = f.tokens.issue("http");
  const peer = await openMcpSession(f.endpoint, otherToken);
  f.tokens.removeHash(TokenTable.hashHex(f.token));
  expect((await mcpRequest(f.endpoint, f.token, body, recovered.handle)).ok).toBe(false);
  const accepted = await mcpRequest(f.endpoint, otherToken, body, peer);
  expect(mcpReply.parse(await accepted.json()).result?.structuredContent).toEqual({ value: "ok" });
  expect(writes(journal).filter(({ type }) => type === "call")).toHaveLength(2);
});

test("deletion, plugin restart and a different Vault reclaim old upstreams without replay", async () => {
  const directory = root();
  const f = await fixture(directory);
  const removed = await readySource(f, directory, "removed");
  const kept = await readySource(f, directory, "kept");
  const calls = (journal: string) => writes(journal).filter(({ type }) => type === "call");
  const starts = (journal: string) => writes(journal).filter(({ type }) => type === "start");
  const echo = (name: string, value: string) => mcpRpc("tools/call", { name: name + "__echo", arguments: { value } });
  const names = (reply: z.infer<typeof mcpReply>) => reply.result?.tools?.map(({ name }) => name);

  f.setPublishing(true);
  const first = await f.client();
  const peerToken = f.tokens.issue("http");
  const peer = await openMcpSession(f.endpoint, peerToken);
  const peerCall = async (body: unknown) => mcpReply.parse(await (await mcpRequest(f.endpoint, peerToken, body, peer)).json());
  expect(names(await first("tools/list"))).toEqual(["vault_info", "removed__echo", "kept__echo"]);
  expect((await first("tools/call", echo("removed", "fixture-disconnect").params)).error?.data?.code).toBe("RUN_UNKNOWN");
  await f.call("mcp.sources.delete", sourceRef(removed.source));
  await expect.poll(() => starts(removed.journal).some(({ pid }) => running(pid!))).toBe(false);
  expect(names(await peerCall(mcpRpc("tools/list")))).toEqual(["vault_info", "kept__echo"]);
  expect((await peerCall(echo("kept", "peer"))).result?.structuredContent).toEqual({ value: "peer" });
  expect((await first("tools/call", echo("removed", "stale").params)).error?.data?.code).toBe("CAPABILITY_NOT_FOUND");

  await f.plugins.disable("mcp");
  expect(starts(kept.journal).some(({ pid }) => running(pid!))).toBe(false);
  expect((await mcpRequest(f.endpoint, peerToken, echo("kept", "disabled"), peer)).ok).toBe(false);
  f.setPublishing(false);
  await f.plugins.enable("mcp");
  const shortChecks = starts(kept.journal).length;
  expect(await f.call("mcp.sources.check", sourceRef(kept.source))).toMatchObject({ state: "ready" });
  expect(starts(kept.journal)).toHaveLength(shortChecks + 1);
  expect(starts(kept.journal).some(({ pid }) => running(pid!))).toBe(false);
  f.setPublishing(true);
  expect(names(await (await f.client())("tools/list"))).toEqual(["vault_info", "kept__echo"]);

  await f.close();
  expect(starts(kept.journal).some(({ pid }) => running(pid!))).toBe(false);
  const other = await fixture(root());
  other.setPublishing(true);
  expect((await mcpRequest(other.endpoint, f.token, echo("kept", "wrong vault"), peer)).ok).toBe(false);
  expect(names(await (await other.client())("tools/list"))).toEqual(["vault_info"]);
  await other.close();

  const reopened = await fixture(directory);
  reopened.setPublishing(true);
  const fresh = await reopened.client();
  expect(names(await fresh("tools/list"))).toEqual(["vault_info", "kept__echo"]);
  expect((await fresh("tools/call", echo("kept", "new session").params)).result?.structuredContent).toEqual({ value: "new session" });
  expect(calls(removed.journal).map(({ args }) => args)).toEqual([{ value: "fixture-disconnect" }]);
  expect(calls(kept.journal).map(({ args }) => args)).toEqual([{ value: "peer" }, { value: "new session" }]);
}, 20_000);

test("automatic discovery stops after three reconnect attempts, and an explicit reconnect resets it", async () => {
  const directory = root();
  const f = await fixture(directory);
  const definition = path.join(directory, "recovery.json");
  writeFileSync(definition, "{}");
  const { source, journal } = await readySource(f, directory, "recoverable", definition);
  writeFileSync(definition, JSON.stringify({ failInitialize: true }));
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools).toEqual([expect.objectContaining({ name: "vault_info" })]);
  await expect.poll(() => writes(journal).length, { timeout: 7_000 }).toBe(5);
  await expect.poll(async () => (await f.call<{ state: string }>("mcp.sources.get", { sourceId: source.sourceId })).state).toBe("offline");
  writeFileSync(definition, "{}");
  expect((await rpc("tools/list")).result?.tools).toEqual([expect.objectContaining({ name: "vault_info" })]);
  expect(writes(journal)).toHaveLength(5);
  expect(await f.call("mcp.sources.reconnect", sourceRef(source))).toMatchObject({ state: "ready", toolCount: 1 });
  expect((await rpc("tools/list")).result?.tools).toContainEqual(expect.objectContaining({ name: "recoverable__echo" }));
  expect(writes(journal)).toHaveLength(6);
}, 10_000);

test("an explicit check detects the Engine endpoint through a loopback alias", async () => {
  const f = await fixture(root());
  const url = new URL(f.endpoint);
  url.hostname = "localhost";
  const source = await f.call<Source>("mcp.sources.create", {
    displayName: "self", namespace: "self",
    configuration: { transport: "streamable-http", url: url.href, headers: {}, authentication: { kind: "none" } },
  });
  expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({
    state: "offline", diagnostic: "MCP 来源不能指回当前 Engine 入口", toolCount: 0,
  });
});

test("stdio approval, temporary check, native MCP result and stable publication after reopening", async () => {
  const directory = root();
  const f = await fixture(directory);
  const { source, journal } = await addStdio(f, directory);
  expect(source.enabled).toBe(false);
  expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({ state: "approval-required" });
  expect(() => writes(journal)).toThrow();
  await approve(f, source);
  expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({ state: "ready", toolCount: 1 });
  expect(writes(journal).map(({ type }) => type)).toEqual(["start"]);
  const checkPid = writes(journal)[0]!.pid!;
  expect(() => process.kill(checkPid, 0)).toThrow();
  await exposure(f, source, "echo", true);
  const enabled = await f.call<Source>("mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools?.map(({ name }: { name: string }) => name)).toEqual(["vault_info", "repo__echo"]);
  expect((await rpc("tools/call", { name: "vault_info", arguments: {} })).result?.structuredContent).toEqual({ data: { name: "fixture" } });
  expect((await rpc("tools/call", { name: "repo__echo", arguments: { value: "hi" }, _meta: { "huhu-private": "ignored" } })).result).toMatchObject({
    structuredContent: { value: "hi" }, content: [{ type: "text", text: "hi" }, { type: "resource_link", uri: "mcp-source://repo/fixture://note/1" }],
  });
  expect(writes(journal).at(-1)).toMatchObject({ type: "call", name: "echo", args: { value: "hi" }, keys: ["arguments", "name"] });
  const longPid = writes(journal).findLast(({ type }) => type === "start")!.pid!;
  f.setPublishing(false);
  await expect.poll(() => { try { process.kill(longPid, 0); return true; } catch { return false; } }).toBe(false);
  expect(await f.call("mcp.sources.check", sourceRef(enabled))).toMatchObject({ state: "ready" });
  await f.close();
  const reopened = await fixture(directory);
  expect(await reopened.call("mcp.sources.get", { sourceId: source.sourceId })).toMatchObject({ source: { enabled: true, namespace: "repo" }, approved: true });
  reopened.setPublishing(true);
  const restarted = await reopened.client();
  expect((await restarted("tools/list")).result?.tools?.map(({ name }: { name: string }) => name)).toContain("repo__echo");
  await reopened.close();
  const readonly = await fixture(directory, true);
  expect(await readonly.call("mcp.sources.get", { sourceId: source.sourceId })).toMatchObject({ source: { enabled: true }, approved: false });
  expect(await readonly.invoke("mcp.sources.check", sourceRef(enabled))).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
});

test("cached stdio routes are immediately denied after revocation", async () => {
  const directory = root();
  const f = await fixture(directory);
  const { source, journal } = await addStdio(f, directory);
  await approve(f, source);
  await f.call("mcp.sources.check", sourceRef(source));
  await exposure(f, source, "echo", true);
  await f.call("mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools?.map(({ name }: { name: string }) => name)).toContain("repo__echo");
  await exposure(f, source, "echo", false);
  expect((await rpc("tools/list")).result?.tools?.map(({ name }: { name: string }) => name)).toEqual(["vault_info"]);
  expect((await rpc("tools/call", { name: "repo__echo", arguments: { value: "blocked" } })).error?.data).toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
  expect(writes(journal).filter(({ type }) => type === "call")).toHaveLength(0);
});

type ImportPreview = {
  previewId: string; sourcesRevision: number;
  entries: { entryId: string; namespace: string; state: string; sourceId?: string; sourceRevision?: number }[];
};

test("JSON import previews without execution, redacts secrets and retries an atomic commit", async () => {
  const directory = root();
  const f = await fixture(directory);
  const { source: existing, journal } = await addStdio(f, directory, "repo");
  const create = { command: process.execPath, args: [path.resolve("tests/fixtures/mcp-stdio.cjs"), journal], env: { EXAMPLE: "${TEST_EXTERNAL_ENV_REFERENCE}" } };
  const text = JSON.stringify({ mcpServers: {
    repo: create,
    new_source: { ...create, name: "Local addition" },
    remote: { type: "http", url: "https://fixture.invalid/mcp", headers: { Authorization: "${UPSTREAM_FIXTURE_AUTH}" } },
    secret_header: { url: "https://fixture.invalid/mcp", headers: { Authorization: "Bearer synthetic-hidden-secret" } },
    secret_env: { ...create, env: { KEY: "synthetic-hidden-secret" } },
    secret_url: { url: "https://fixture.invalid/mcp?key=synthetic-hidden-secret" },
    invalid: { command: "unused", args: 7 },
    conflicting: { ...create, url: "https://fixture.invalid/mcp" },
  } });
  expect(await f.invoke("mcp.sources.importPreview", { text: "bad JSON" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const preview = await f.call<ImportPreview>("mcp.sources.importPreview", { text });
  expect(preview.entries.map(({ state }) => state)).toEqual(["conflict", "ready", "ready", "blocked", "blocked", "blocked", "invalid", "invalid"]);
  expect(JSON.stringify(preview)).not.toContain("synthetic-hidden-secret");
  expect(existsSync(journal)).toBe(false);
  expect(await f.call("mcp.sources.list")).toMatchObject({ sources: [{ source: { sourceId: existing.sourceId } }] });
  const selection = {
    previewId: preview.previewId, sourcesRevision: preview.sourcesRevision,
    selections: [{ action: "create", entryId: preview.entries[1]!.entryId }, { action: "create", entryId: preview.entries[2]!.entryId }],
  };
  expect(await f.invoke("mcp.sources.importCommit", {
    ...selection, selections: [{ action: "create", entryId: preview.entries[3]!.entryId }],
  })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const write = vi.spyOn(f.vault.files, "write").mockRejectedValueOnce(errors.invalidInput("模拟保存失败"));
  expect(await f.invoke("mcp.sources.importCommit", selection)).toMatchObject({ ok: false, error: { message: "模拟保存失败" } });
  write.mockRestore();
  expect(await f.call("mcp.sources.list")).toMatchObject({ sources: [{ source: { sourceId: existing.sourceId } }] });
  expect(await f.call("mcp.sources.importCommit", selection)).toMatchObject({ sources: [{ namespace: "new_source", enabled: false }, { namespace: "remote", enabled: false }] });
  const exported = await f.call<{ mcpServers: Record<string, unknown> }>("mcp.sources.export");
  expect(exported.mcpServers["remote"]).toMatchObject({ authentication: { kind: "environment", name: "UPSTREAM_FIXTURE_AUTH" } });
  expect(JSON.stringify(exported)).not.toContain("synthetic-hidden-secret");
  const updated = await f.call<ImportPreview>("mcp.sources.importPreview", { text: JSON.stringify(exported) });
  expect(updated.entries.every(({ state }) => state === "conflict")).toBe(true);
  expect(existsSync(journal)).toBe(false);
  const stale = await f.call<ImportPreview>("mcp.sources.importPreview", { text: JSON.stringify({ mcpServers: { next_source: create } }) });
  await f.call("mcp.sources.delete", sourceRef(existing));
  expect(await f.invoke("mcp.sources.importCommit", {
    previewId: stale.previewId, sourcesRevision: stale.sourcesRevision, selections: [{ action: "create", entryId: stale.entries[0]!.entryId }],
  })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await f.call("mcp.sources.list")).toMatchObject({ sources: [{ source: { namespace: "new_source" } }, { source: { namespace: "remote" } }] });
  const anotherVault = await fixture(root());
  expect(await anotherVault.call("mcp.sources.list")).toMatchObject({ revision: 0, sources: [] });
});

test("one HTTP entry matches exact same-name tools across stdio, Streamable HTTP and legacy SSE", async () => {
  const directory = root();
  const streamable = await localUpstream("streamable-http", { authorization: "Bearer fixture-only" });
  cleanup.push(() => streamable.close());
  const sse = await localUpstream("sse");
  cleanup.push(() => sse.close());
  const resources = await localUpstream("streamable-http", { advertise: "resources" });
  cleanup.push(() => resources.close());
  const f = await fixture(directory);
  const { source: local } = await addStdio(f, directory);
  await approve(f, local);
  vi.stubEnv("HUHU_TEST_MCP_AUTH_HEADER", "Bearer fixture-only");
  cleanup.unshift(() => { vi.unstubAllEnvs(); });
  const remote = (namespace: string, transport: "streamable-http" | "sse", url: string, useEnv = false) => f.call<Source>("mcp.sources.create", {
    displayName: namespace, namespace, configuration: { transport, url, headers: {}, authentication: useEnv
      ? { kind: "environment", name: "HUHU_TEST_MCP_AUTH_HEADER", header: "Authorization" } : { kind: "none" } },
  });
  const wrong = await remote("bad_auth", "streamable-http", streamable.url);
  expect(await f.call("mcp.sources.check", sourceRef(wrong))).toMatchObject({ state: "auth-required" });
  const missing = await f.call<Source>("mcp.sources.create", {
    displayName: "Missing command", namespace: "missing",
    configuration: { transport: "stdio", command: path.join(directory, "missing-binary"), args: [], environment: {} },
  });
  await approve(f, missing);
  expect(await f.call("mcp.sources.check", sourceRef(missing))).toMatchObject({ state: "offline", toolCount: 0 });
  const onlyResources = await remote("resources_only", "streamable-http", resources.url);
  expect(await f.call("mcp.sources.check", sourceRef(onlyResources))).toMatchObject({ state: "ready", toolCount: 0 });
  expect(resources.listRequests).toBe(0);
  const remoteHttp = await remote("remote", "streamable-http", streamable.url, true);
  const legacySse = await remote("legacy", "sse", sse.url);
  for (const source of [local, remoteHttp, legacySse]) {
    expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({ state: "ready", toolCount: 1 });
    await exposure(f, source, "echo", true);
    await f.call("mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
  }
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools?.map(({ name }: { name: string }) => name)).toEqual(["vault_info", "repo__echo", "remote__echo", "legacy__echo"]);
  expect((await rpc("tools/call", { name: "repo__echo", arguments: { value: "local" } })).result?.structuredContent).toEqual({ value: "local" });
  expect((await rpc("tools/call", { name: "remote__echo", arguments: { value: "first" } })).result).toMatchObject({
    structuredContent: { transport: "streamable-http", value: "first" },
    content: [{ type: "text" }, { type: "image" }, { type: "audio" }, { type: "resource_link" }],
  });
  expect((await rpc("tools/call", { name: "legacy__echo", arguments: { value: "fail" } })).result).toMatchObject({
    structuredContent: { transport: "sse", value: "fail" }, isError: true,
  });
  await exposure(f, remoteHttp, "echo", false);
  expect((await rpc("tools/call", { name: "remote__echo", arguments: { value: "must not reach" } })).error?.data?.code).toBe("CAPABILITY_NOT_EXPOSED");
  expect(streamable.calls).toEqual([{ name: "echo", input: { value: "first" } }]);
  expect(sse.calls).toEqual([{ name: "echo", input: { value: "fail" } }]);
});

test("complete paging and definition changes preserve exact names and isolate cursor failure", async () => {
  const directory = root();
  const definition = path.join(directory, "source.json");
  const names = ["echo", "with__separator", "汉字", "a".repeat(160), "-echo", "汉 字"];
  writeFileSync(definition, JSON.stringify({ names, pageSize: 2 }));
  const f = await fixture(directory);
  const { source, journal } = await addStdio(f, directory, "repo", definition);
  await approve(f, source);
  expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({ toolCount: 6 });
  const catalog = await f.call<Catalog>("mcp.catalog.list", { sourceId: source.sourceId });
  const keys = Object.fromEntries(catalog.entries.map((entry) => [entry.upstreamIdentity, entry.publicKey]));
  expect(Object.values(keys).every((key) => key.length <= 128)).toBe(true);
  expect(new Set(Object.values(keys)).size).toBe(names.length);
  expect(keys["with__separator"]).toBe("repo__with__separator");
  await f.call("mcp.policy.update", {
    expectedCatalogRevision: catalog.catalogRevision, expectedPolicyRevision: catalog.policyRevision,
    choices: names.map((upstreamIdentity) => ({ sourceId: source.sourceId, upstreamIdentity, selected: true })),
  });
  let enabled = await f.call<Source>("mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools).toHaveLength(7);
  expect((await rpc("tools/call", { name: keys["汉字"], arguments: { value: "original identity" } })).result?.structuredContent).toEqual({ value: "original identity" });
  expect(writes(journal).at(-1)?.name).toBe("汉字");
  const liveStarts = writes(journal).filter(({ type }) => type === "start").length;
  const { source: saved } = await f.call<{ source: { configuration: unknown } }>("mcp.sources.get", { sourceId: source.sourceId });
  enabled = await f.call<Source>("mcp.sources.update", { ...sourceRef(enabled), displayName: "Renamed repo", configuration: saved.configuration });
  expect((await rpc("tools/list")).result?.tools).toHaveLength(7);
  expect(writes(journal).filter(({ type }) => type === "start")).toHaveLength(liveStarts);
  const liveCatalog = await f.call<Catalog>("mcp.catalog.list", {});
  const stream = new AbortController();
  const handle = await openMcpSession(f.endpoint, f.token);
  const events = await mcpRequest(f.endpoint, f.token, undefined, handle, { method: "GET", signal: AbortSignal.any([stream.signal, AbortSignal.timeout(2_000)]) });
  const reader = events.body!.getReader();
  writeFileSync(definition, JSON.stringify({ names: [...names].reverse(), pageSize: 2, minLength: 1, description: "Updated schema" }));
  try {
    await f.call("mcp.sources.refresh", sourceRef(enabled));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("notifications/tools/list_changed");
  } finally {
    stream.abort();
    await reader.cancel().catch(() => undefined);
  }
  const newCatalog = await f.call<Catalog>("mcp.catalog.list", {});
  expect(newCatalog.catalogRevision).toBeGreaterThan(liveCatalog.catalogRevision);
  expect(Object.fromEntries(newCatalog.entries.map((entry) => [entry.upstreamIdentity, entry.publicKey]))).toEqual(keys);
  expect((await rpc("tools/list")).result?.tools?.find(({ name }: { name: string }) => name === keys["echo"])).toMatchObject({
    description: "Updated schema", outputSchema: { properties: { value: { minLength: 1 } } },
  });
  writeFileSync(definition, JSON.stringify({ names, pageSize: 2, repeatCursor: true }));
  expect(await f.call("mcp.sources.refresh", sourceRef(enabled))).toMatchObject({ state: "offline", diagnostic: "上游目录返回重复游标", toolCount: 0 });
  expect((await rpc("tools/list")).result?.tools?.map(({ name }: { name: string }) => name)).toEqual(["vault_info"]);
});

test("four directories isolate equal upstream identifiers and authorize exact, templated, and embedded URIs", async () => {
  const directory = root();
  const f = await fixture(directory);
  const firstPath = path.join(directory, "one.json");
  const secondPath = path.join(directory, "two.json");
  writeFileSync(firstPath, JSON.stringify({ catalog: true, label: "one" }));
  writeFileSync(secondPath, JSON.stringify({ catalog: true, label: "two" }));
  const first = await addStdio(f, directory, "one", firstPath);
  const second = await addStdio(f, directory, "two", secondPath);
  for (const { source } of [first, second]) {
    await approve(f, source);
    await f.call("mcp.sources.check", sourceRef(source));
    await f.call("mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
  }
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("resources/list")).result).toMatchObject({ resources: [{ uri: "huhu://vault/summary" }] });
  expect((await rpc("prompts/list")).result).toMatchObject({ prompts: [{ name: "daily-review" }, { name: "knowledge-synthesis" }] });
  const base = await f.call<Catalog>("mcp.catalog.list", {});
  expect(base.entries).toHaveLength(14);
  await f.call("mcp.policy.update", {
    expectedCatalogRevision: base.catalogRevision, expectedPolicyRevision: base.policyRevision,
    choices: base.entries.map(({ sourceId, kind, upstreamIdentity }) => ({ sourceId, kind, upstreamIdentity, selected: true })),
  });
  const oneUri = "mcp-source://one/fixture://note/1";
  const twoUri = "mcp-source://two/fixture://note/1";
  expect((await rpc("resources/list")).result).toMatchObject({
    resources: [{ uri: oneUri }, { uri: twoUri }, { uri: "huhu://vault/summary" }],
  });
  expect((await rpc("resources/templates/list")).result?.["resourceTemplates"]).toEqual(expect.arrayContaining([
    expect.objectContaining({ uriTemplate: "mcp-source://one/fixture://group/{folder}/{name}{?q,format}" }),
  ]));
  expect((await rpc("resources/read", { uri: oneUri })).result).toMatchObject({ contents: [{ uri: oneUri, text: "one" }] });
  expect((await rpc("resources/read", { uri: twoUri })).result).toMatchObject({ contents: [{ uri: twoUri, text: "two" }] });
  const raw = "fixture://group/%E4%B8%AD/a%25b?format=text&q=%2b";
  const projected = "mcp-source://one/" + raw;
  expect((await rpc("resources/read", { uri: projected })).result).toMatchObject({ contents: [{ uri: projected, text: "one" }] });
  expect(writes(first.journal).at(-1)).toMatchObject({ type: "read", uri: raw });
  expect((await rpc("resources/read", { uri: "mcp-source://one/fixture://overlap/a" })).error?.data?.code).toBe("NAME_CONFLICT");
  expect((await rpc("prompts/get", { name: "two__review", arguments: { topic: "样例" } })).result).toMatchObject({
    messages: [{ role: "assistant", content: { text: "样例" } }, { role: "user", content: { type: "resource", resource: { uri: twoUri, text: "two" } } }],
  });
  expect((await rpc("tools/call", { name: "one__echo", arguments: { value: "source" } })).result).toMatchObject({
    content: [{ type: "text", text: "source" }, { type: "resource_link", uri: oneUri }],
  });
  const active = await f.call<Catalog>("mcp.catalog.list", {});
  await f.call("mcp.policy.update", {
    expectedCatalogRevision: active.catalogRevision, expectedPolicyRevision: active.policyRevision,
    choices: [
      { sourceId: first.source.sourceId, kind: "resource", upstreamIdentity: "fixture://note/1", selected: false },
      { sourceId: second.source.sourceId, kind: "prompt", upstreamIdentity: "review", selected: false },
    ],
  });
  const before = [writes(first.journal).length, writes(second.journal).length];
  expect((await rpc("resources/read", { uri: oneUri })).error?.data?.code).toBe("CAPABILITY_NOT_EXPOSED");
  expect((await rpc("prompts/get", { name: "two__review", arguments: { topic: "拒绝" } })).error?.data?.code).toBe("CAPABILITY_NOT_EXPOSED");
  expect([writes(first.journal).length, writes(second.journal).length]).toEqual(before);
}, 15_000);

function credentialHost() {
  const keyring = new Map<string, Buffer>();
  const localRoot = root();
  const protection: LocalCredentialProtection = {
    async read(id) { const key = keyring.get(id); return key ? Buffer.from(key) : null; },
    async create(id, key) { keyring.set(id, Buffer.from(key)); },
    async remove(id) { keyring.delete(id); },
  };
  return { localRoot, protection };
}

const remoteConfig = (url: string, kind: "none" | "oauth" = "none") => ({
  transport: "streamable-http", url, headers: {}, authentication: { kind },
});

test.each([
  ["resources", ["resources/list", "resources/templates/list"], [{ kind: "resource", publicKey: "mcp-source://resources/fixture://docs/readme" }]],
  ["prompts", ["prompts/list"], [{ kind: "prompt", publicKey: "prompts__review" }]],
  ["none", [], []],
] as const)("a %s-only probe succeeds with zero tools and requests only advertised directories", async (advertise, methods, entries) => {
  const upstream = await localUpstream("streamable-http", { advertise });
  cleanup.push(() => upstream.close());
  const f = await fixture(root());
  const source = await f.call<Source>("mcp.sources.create", {
    displayName: advertise, namespace: advertise, configuration: remoteConfig(upstream.url),
  });
  expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({ state: "ready", diagnostic: null, toolCount: 0 });
  expect(upstream.requests).toEqual(["initialize", "notifications/initialized", ...methods]);
  expect(await f.call("mcp.sources.get", { sourceId: source.sourceId })).toMatchObject({ source, diagnostic: null, checkedAt: expect.any(String) });
  const catalog = await f.call<Catalog>("mcp.catalog.list", { sourceId: source.sourceId });
  expect(catalog.entries.map(({ kind, publicKey }) => ({ kind, publicKey }))).toEqual(entries);
});

test("missing stdio executable and rejected static HTTP authentication keep their source and distinct diagnostics", async () => {
  const directory = root();
  const upstream = await localUpstream("streamable-http", { authorization: "Bearer expected" });
  cleanup.push(() => upstream.close());
  const f = await fixture(directory, false, credentialHost());
  const missing = await f.call<Source>("mcp.sources.create", {
    displayName: "Missing", namespace: "missing", configuration: { transport: "stdio", command: path.join(directory, "absent-executable"), args: ["local-test-arg"], environment: {} },
  });
  await approve(f, missing);
  expect(await f.call("mcp.sources.deletePreview", sourceRef(missing))).toMatchObject({ entries: [], hasExecutionApproval: true, clearsLocalCredential: false });
  const remote = await f.call<Source>("mcp.sources.create", {
    displayName: "Rejected", namespace: "rejected", configuration: remoteConfig(upstream.url),
  });
  const { source: bound } = await f.call<{ source: Source }>("mcp.credentials.put", {
    ...sourceRef(remote), account: "fixture", header: "Authorization", value: "Bearer wrong-fixture-token",
  });
  for (const [source, state, diagnostic] of [
    [missing, "offline", "找不到 MCP stdio 程序或工作目录"],
    [bound, "auth-required", "上游拒绝了认证"],
  ] as const) {
    expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({ state, diagnostic, toolCount: 0 });
    expect(await f.call("mcp.diagnostics.get", { sourceId: source.sourceId })).toMatchObject({ source, diagnostic, checkedAt: expect.any(String) });
    expect(await f.call("mcp.catalog.list", { sourceId: source.sourceId })).toMatchObject({ entries: [] });
  }
  expect(upstream.rejections).toEqual([{ method: "initialize", authorization: "Bearer wrong-fixture-token" }]);
  expect(upstream.requests).toEqual([]);
});

test.each([["roots", "listing roots"], ["elicitation", "form elicitation"]] as const)("P7 reports a peer that requires %s", async (requires, label) => {
  const upstream = await localUpstream("streamable-http", { requires });
  cleanup.push(() => upstream.close());
  const f = await fixture(root());
  const source = await f.call<Source>("mcp.sources.create", {
    displayName: requires, namespace: requires, configuration: remoteConfig(upstream.url),
  });
  expect(await f.call("mcp.sources.check", sourceRef(source))).toMatchObject({
    state: "incompatible", diagnostic: `上游需要 Huhu 未提供的 MCP 客户端能力（${label}）`, toolCount: 0,
  });
  expect(upstream.requests).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  expect(await f.call("mcp.catalog.list", { sourceId: source.sourceId })).toMatchObject({ entries: [] });
});

test("deletion preview uses saved public routes and clears only the target credential and policy", async () => {
  const directory = root();
  const credentials = credentialHost();
  const upstream = await localUpstream("streamable-http");
  cleanup.push(() => upstream.close());
  let f = await fixture(directory, false, credentials);
  async function add(namespace: string) {
    const source = await f.call<Source>("mcp.sources.create", { displayName: namespace, namespace, configuration: remoteConfig(upstream.url) });
    const { source: bound } = await f.call<{ source: McpSource }>("mcp.credentials.put", {
      ...sourceRef(source), account: namespace, header: "Authorization", value: `Bearer synthetic-${namespace}`,
    });
    await f.call("mcp.sources.check", sourceRef(bound));
    await exposure(f, bound, "echo", true);
    return f.call<McpSource>("mcp.sources.setEnabled", { ...sourceRef(bound), enabled: true });
  }
  const first = await add("first");
  const second = await add("second");
  const previous = await f.call<McpSourceDeletePreview>("mcp.sources.deletePreview", sourceRef(first));
  await exposure(f, second, "echo", false);
  expect(await f.invoke("mcp.sources.delete", { ...sourceRef(first), expectedPolicyRevision: previous.policyRevision })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  await f.call("mcp.sources.check", sourceRef(second));
  await exposure(f, second, "echo", true);
  await f.close();
  f = await fixture(directory, false, credentials);
  expect(await f.call("mcp.catalog.list", { sourceId: first.sourceId })).toMatchObject({ entries: [] });
  const preview = await f.call<McpSourceDeletePreview>("mcp.sources.deletePreview", sourceRef(first));
  expect(preview).toEqual({ policyRevision: previous.policyRevision + 2, entries: [{ kind: "tool", publicKey: "first__echo" }], hasExecutionApproval: false, clearsLocalCredential: true });
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "first__echo" }), expect.objectContaining({ name: "second__echo" })]));
  await f.call("mcp.sources.delete", { ...sourceRef(first), expectedPolicyRevision: preview.policyRevision });
  expect((await rpc("tools/list")).result?.tools?.map(({ name }) => name)).toEqual(["vault_info", "second__echo"]);
  expect((await rpc("tools/call", { name: "first__echo" })).error?.data?.code).toBe("CAPABILITY_NOT_FOUND");
  expect((await rpc("tools/call", { name: "second__echo" })).result).toBeDefined();
  expect(upstream.admissions.at(-1)?.authorization).toBe("Bearer synthetic-second");
  const definitions = path.join(directory, ".huhu/module-credentials");
  const saved = readdirSync(definitions).map((name) => readFileSync(path.join(definitions, name), "utf8")).join("\n");
  expect(saved).not.toContain(first.sourceId);
  expect(saved).toContain(second.sourceId);
}, 15_000);

test("two accounts on a single target remain isolated and changing target or removing credentials invalidates their sessions", async () => {
  const directory = root();
  const ends = await localUpstream("streamable-http", { authorize: (value) => /^Bearer synthetic-(a|b|next)$/.test(value ?? "") });
  cleanup.push(() => ends.close());
  const f = await fixture(directory, false, credentialHost());
  async function add(namespace: string, secret: string) {
    const source = await f.call<Source>("mcp.sources.create", { displayName: namespace, namespace, configuration: remoteConfig(ends.url) });
    const bound = await f.call<{ source: Source; credential: { state: string; account: string } }>("mcp.credentials.put", {
      ...sourceRef(source), account: namespace, header: "Authorization", value: "Bearer " + secret,
    });
    expect(bound.credential).toEqual({ state: "configured", account: namespace });
    expect(JSON.stringify(bound)).not.toContain(secret);
    await f.call("mcp.sources.check", sourceRef(bound.source));
    await exposure(f, bound.source, "echo", true);
    return f.call<Source>("mcp.sources.setEnabled", { ...sourceRef(bound.source), enabled: true });
  }
  const first = await add("first", "synthetic-a");
  const second = await add("second", "synthetic-b");
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools).toHaveLength(3);
  await rpc("tools/call", { name: "first__echo", arguments: { value: "first" } });
  expect(ends.admissions.at(-1)?.authorization).toBe("Bearer synthetic-a");
  await rpc("tools/call", { name: "second__echo", arguments: { value: "second" } });
  expect(ends.admissions.at(-1)?.authorization).toBe("Bearer synthetic-b");
  const updated = await f.call<{ source: Source }>("mcp.credentials.put", {
    ...sourceRef(first), account: "first", header: "Authorization", value: "Bearer synthetic-next",
  });
  await rpc("tools/call", { name: "first__echo", arguments: { value: "rotated" } });
  expect(ends.admissions.at(-1)?.authorization).toBe("Bearer synthetic-next");
  await f.call("mcp.credentials.remove", sourceRef(updated.source));
  const count = ends.calls.length;
  expect((await rpc("tools/call", { name: "first__echo", arguments: { value: "revoked" } })).error?.data?.code).toBe("PROVIDER_UNAUTHENTICATED");
  expect(ends.calls).toHaveLength(count);
  const saved = await f.call("mcp.sources.list");
  const exported = await f.call("mcp.sources.export");
  const definitions = path.join(directory, ".huhu/module-credentials");
  for (const secret of ["synthetic-a", "synthetic-b", "synthetic-next"]) {
    expect(JSON.stringify({ saved, exported })).not.toContain(secret);
    expect(JSON.stringify(f.audit.list())).not.toContain(secret);
    for (const item of readdirSync(definitions)) expect(readFileSync(path.join(definitions, item), "utf8")).not.toContain(secret);
  }
  expect(second.namespace).toBe("second");
}, 15_000);

test("P7 reports unsupported peer versions and required client sampling without publishing either source", async () => {
  const directory = root();
  const definition = path.join(directory, "version.json");
  writeFileSync(definition, JSON.stringify({ protocolVersion: "2026-07-28" }));
  const sampling = await localUpstream("streamable-http", { requires: "sampling" });
  cleanup.push(() => sampling.close());
  const f = await fixture(directory);
  const future = (await addStdio(f, directory, "future", definition)).source;
  const reverse = await f.call<Source>("mcp.sources.create", {
    displayName: "Requires client sampling", namespace: "reverse", configuration: remoteConfig(sampling.url),
  });
  await approve(f, future);
  expect(await f.call("mcp.sources.check", sourceRef(future))).toMatchObject({
    state: "incompatible", diagnostic: "上游 MCP 协议版本不兼容", toolCount: 0,
  });
  expect(await f.call("mcp.sources.check", sourceRef(reverse))).toMatchObject({
    state: "incompatible", diagnostic: "上游需要 Huhu 未提供的 MCP 客户端能力（sampling）", toolCount: 0,
  });
  expect(sampling.listRequests).toBe(1);
  expect(sampling.calls).toEqual([]);
  expect(await f.call("mcp.catalog.list", { sourceId: reverse.sourceId })).toMatchObject({ entries: [] });
  for (const source of [future, reverse]) await f.call("mcp.sources.setEnabled", { ...sourceRef(source), enabled: true });
  f.setPublishing(true);
  const init = await mcpRequest(f.endpoint, f.token, initializeMcp);
  expect(init.status).toBe(200);
  const initialized = z.object({ result: z.object({ capabilities: z.record(z.string(), z.unknown()) }) }).parse(await init.json());
  expect(Object.keys(initialized.result.capabilities)).toEqual(expect.arrayContaining(["tools", "resources", "prompts"]));
  for (const capability of ["tasks", "sampling", "elicitation", "roots"]) expect(initialized.result.capabilities).not.toHaveProperty(capability);
  expect(initialized.result.capabilities.resources).not.toHaveProperty("subscribe");
  const session = await openMcpSession(f.endpoint, f.token);
  const unsupported = await mcpRequest(f.endpoint, f.token, mcpRpc("resources/subscribe", { uri: "huhu://vault/summary" }), session);
  expect(await unsupported.json()).toMatchObject({ error: { code: -32601 } });
  const list = await mcpRequest(f.endpoint, f.token, mcpRpc("tools/list"), session);
  expect(mcpReply.parse(await list.json()).result?.tools?.map(({ name }) => name)).toEqual(["vault_info"]);
  for (const { sourceId } of [future, reverse]) {
    expect(await f.call("mcp.sources.get", { sourceId })).toMatchObject({ state: "incompatible" });
  }
});

test("secret import never inlines credentials and cleans staged bindings when source publication fails", async () => {
  const directory = root();
  const endpoint = await localUpstream("streamable-http", { authorize: (header, url) => header === "Bearer synthetic-secret-header" && url?.includes("credential=synthetic-secret-query") === true });
  cleanup.push(() => endpoint.close());
  const f = await fixture(directory, false, credentialHost());
  const text = JSON.stringify({ mcpServers: {
    remote: { url: endpoint.url + "?credential=synthetic-secret-query", headers: { Authorization: "Bearer synthetic-secret-header" } },
    local: { command: "no-launch", env: { FIXTURE: "synthetic-secret-env" } },
  } });
  const prepare = () => f.call<ImportPreview>("mcp.sources.importPreview", { text });
  const toSelection = (preview: ImportPreview) => ({
    previewId: preview.previewId, sourcesRevision: preview.sourcesRevision,
    selections: preview.entries.map(({ entryId }) => ({ entryId, action: "create" })),
  });
  const cancelled = await prepare();
  await f.call("mcp.sources.importCancel", { previewId: cancelled.previewId });
  expect(await f.invoke("mcp.sources.importCommit", toSelection(cancelled))).toMatchObject({ ok: false });
  const preview = await prepare();
  expect(preview.entries.map((row) => row.state)).toEqual(["ready", "ready"]);
  expect(JSON.stringify(preview)).not.toContain("synthetic-secret");
  const original = f.vault.files.write.bind(f.vault.files);
  const write = vi.spyOn(f.vault.files, "write").mockImplementation(async (file, bytes, opts) => {
    if (file === ".huhu/mcp/sources.json") throw errors.invalidInput("配置发布失败");
    return original(file, bytes, opts);
  });
  try {
    expect(await f.invoke("mcp.sources.importCommit", toSelection(preview))).toMatchObject({ ok: false, error: { message: "配置发布失败" } });
  } finally { write.mockRestore(); }
  expect(await f.call("mcp.sources.list")).toMatchObject({ sources: [] });
  const definitions = path.join(directory, ".huhu/module-credentials");
  for (const item of readdirSync(definitions)) expect(JSON.parse(readFileSync(path.join(definitions, item), "utf8"))).toMatchObject({ entries: [] });
  const { sources } = await f.call<{ sources: Source[] }>("mcp.sources.importCommit", toSelection(preview));
  expect(await f.call("mcp.sources.check", sourceRef(sources[0]!))).toMatchObject({ state: "ready", toolCount: 1 });
  expect(readFileSync(path.join(directory, ".huhu/mcp/sources.json"), "utf8")).not.toContain("synthetic-secret");
  const exported = JSON.stringify(await f.call("mcp.sources.export"));
  expect(exported).not.toContain("synthetic-secret");
  expect(exported).toContain("credential-needed");
  expect(exported).toContain("FIXTURE");
  const archive = path.join(root(), "backup.huhu");
  await exportPackage(directory, archive);
  const files = unzipSync(readFileSync(archive));
  expect(Object.keys(files)).toContain(".huhu/mcp/sources.json");
  expect(Object.keys(files).some((file) => file.startsWith(".huhu/runtime/"))).toBe(false);
  for (const contents of Object.values(files)) expect(new TextDecoder().decode(contents)).not.toContain("synthetic-secret");
}, 15_000);

test("SDK OAuth PKCE login, state rejection, cancellation, expiry, refresh coalescing and logout stay on loopback", async () => {
  const directory = root();
  const provider = await loopbackOAuth();
  cleanup.push(() => provider.stop());
  const f = await fixture(directory, false, credentialHost());
  const source = await f.call<Source>("mcp.sources.create", {
    displayName: "OAuth", namespace: "provider", configuration: remoteConfig(provider.url, "oauth"),
  });
  const begin = (entry?: Source) => f.call<{ attemptId: string; authorizationUrl: string; expiresAt: number }>("mcp.oauth.begin", { ...sourceRef(entry ?? source), account: "Work" });
  const cancelled = await begin();
  await f.call("mcp.oauth.cancel", { attemptId: cancelled.attemptId });
  expect(await f.call("mcp.oauth.status", { attemptId: cancelled.attemptId })).toMatchObject({ state: "cancelled" });
  const expired = await begin();
  const clock = vi.spyOn(Date, "now").mockReturnValue(expired.expiresAt + 1);
  try { expect(await f.call("mcp.oauth.status", { attemptId: expired.attemptId })).toMatchObject({ state: "expired" }); }
  finally { clock.mockRestore(); }
  const login = await begin();
  const callback = new URL((await fetch(login.authorizationUrl, { redirect: "manual" })).headers.get("location")!);
  const wrong = new URL(callback);
  wrong.searchParams.set("state", "wrong");
  expect((await fetch(wrong)).status).toBe(400);
  expect(provider.exchanges).toBe(0);
  expect((await fetch(callback)).status).toBe(200);
  expect(provider.exchanges).toBe(1);
  expect(await f.call("mcp.oauth.status", { attemptId: login.attemptId })).toMatchObject({ state: "complete" });
  const { source: bound } = await f.call<{ source: Source }>("mcp.sources.get", { sourceId: source.sourceId });
  expect(await f.call("mcp.sources.check", sourceRef(bound))).toMatchObject({ state: "ready" });
  await exposure(f, bound, "echo", true);
  const enabled = await f.call<Source>("mcp.sources.setEnabled", { ...sourceRef(bound), enabled: true });
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools).toHaveLength(2);
  const advanced = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
  try {
    const replies = await Promise.all([rpc("tools/call", { name: "provider__echo", arguments: {} }), rpc("tools/call", { name: "provider__echo", arguments: {} })]);
    expect(replies.every((reply) => reply.result)).toBe(true);
    expect(provider.refreshes).toBe(1);
  } finally { advanced.mockRestore(); }
  expect(await f.call("mcp.oauth.logout", sourceRef(enabled))).toMatchObject({ credential: { state: "unconfigured" } });
  expect((await rpc("tools/call", { name: "provider__echo", arguments: {} })).error?.data?.code).toBe("PROVIDER_UNAUTHENTICATED");
  const { source: loggedOut } = await f.call<{ source: Source }>("mcp.sources.get", { sourceId: source.sourceId });
  const late = await begin(loggedOut);
  const oldCallback = (await fetch(late.authorizationUrl, { redirect: "manual" })).headers.get("location")!;
  await f.call("mcp.sources.update", { ...sourceRef(loggedOut), displayName: "changed", configuration: remoteConfig(provider.url + "/other", "oauth") });
  expect(await f.call("mcp.oauth.status", { attemptId: late.attemptId })).toMatchObject({ state: "cancelled" });
  await expect(fetch(oldCallback)).rejects.toThrow();
  expect(provider.exchanges).toBe(1);
}, 20_000);

test("two OAuth identities at one issuer refresh independently and rotation rejects stale refresh and callback", async () => {
  function holdRefresh() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }
  let aliceRefresh = holdRefresh();
  const provider = await loopbackOAuth({ beforeRefresh: async (subject) => {
    if (subject === "alice") await aliceRefresh.promise;
  } });
  cleanup.push(() => provider.stop());
  const f = await fixture(root(), false, credentialHost());
  const readSource = async (source: Source) => (await f.call<{ source: Source }>("mcp.sources.get", { sourceId: source.sourceId })).source;
  async function begin(source: Source, subject: string) {
    const login = await f.call<{ attemptId: string; authorizationUrl: string }>("mcp.oauth.begin", { ...sourceRef(source), account: subject });
    const authorization = new URL(login.authorizationUrl);
    authorization.searchParams.set("fixture_subject", subject);
    const response = await fetch(authorization, { redirect: "manual" });
    expect(response.status).toBe(302);
    return { ...login, callback: response.headers.get("location")! };
  }
  async function add(namespace: string, subject: string) {
    const source = await f.call<Source>("mcp.sources.create", {
      displayName: namespace, namespace, configuration: remoteConfig(provider.url, "oauth"),
    });
    const login = await begin(source, subject);
    expect((await fetch(login.callback)).status).toBe(200);
    const bound = await readSource(source);
    await f.call("mcp.sources.check", sourceRef(bound));
    await exposure(f, bound, "echo", true);
    return f.call<Source>("mcp.sources.setEnabled", { ...sourceRef(bound), enabled: true });
  }
  const first = await add("first_oauth", "alice");
  const second = await add("second_oauth", "bob");
  f.setPublishing(true);
  const rpc = await f.client();
  expect((await rpc("tools/list")).result?.tools).toHaveLength(3);
  const invoke = (source: Source) => rpc("tools/call", { name: `${source.namespace}__echo`, arguments: {} });
  expect((await invoke(first)).result?.structuredContent).toEqual({ subject: "alice" });
  expect((await invoke(second)).result?.structuredContent).toEqual({ subject: "bob" });

  let now = Date.now();
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    now += 31_000;
    const firstCalls = Promise.all([invoke(first), invoke(first)]);
    await vi.waitFor(() => expect(provider.refreshSubjects).toEqual(["alice"]));
    const secondCalls = await Promise.all([invoke(second), invoke(second)]);
    expect(secondCalls.map(({ result }) => result?.structuredContent)).toEqual([{ subject: "bob" }, { subject: "bob" }]);
    expect(provider.refreshSubjects).toEqual(["alice", "bob"]);
    aliceRefresh.resolve();
    expect((await firstCalls).map(({ result }) => result?.structuredContent)).toEqual([{ subject: "alice" }, { subject: "alice" }]);
    expect(provider.refreshSubjects).toEqual(["alice", "bob"]);
    expect(new Set(provider.calls.filter(({ subject }) => subject === "alice").map(({ token }) => token)).size).toBe(2);

    aliceRefresh = holdRefresh();
    now += 31_000;
    const staleCall = invoke(first);
    await vi.waitFor(() => expect(provider.refreshSubjects).toEqual(["alice", "bob", "alice"]));
    const pending = await begin(first, "stale");
    const rotated = await begin(first, "carol");
    expect(await f.call("mcp.oauth.status", { attemptId: pending.attemptId })).toMatchObject({ state: "cancelled" });
    const abandoned = await fetch(pending.callback).catch(() => null);
    expect(abandoned?.ok ?? false).toBe(false);
    expect((await fetch(rotated.callback)).status).toBe(200);
    expect(provider.exchanges).toBe(3);
    aliceRefresh.resolve();
    expect((await staleCall).error?.data?.code).toBe("VERSION_CONFLICT");
    expect((await invoke(first)).result?.structuredContent).toEqual({ subject: "carol" });
    expect((await invoke(second)).result?.structuredContent).toEqual({ subject: "bob" });
    expect(provider.calls.map(({ subject }) => subject)).toEqual(["alice", "bob", "bob", "bob", "alice", "alice", "carol", "bob"]);
    expect(provider.refreshSubjects).toEqual(["alice", "bob", "alice", "bob"]);
    expect(await f.call("mcp.sources.get", { sourceId: first.sourceId })).toMatchObject({ credential: { account: "carol", state: "configured" } });
    expect(await f.call("mcp.sources.get", { sourceId: second.sourceId })).toMatchObject({ credential: { account: "bob", state: "configured" } });
  } finally {
    aliceRefresh.resolve();
    clock.mockRestore();
  }
}, 20_000);
