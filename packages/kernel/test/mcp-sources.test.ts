import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { Vault } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import {
  CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, MCP_SOURCES_SERVICE, PluginManager, TokenTable,
  createHuhuContext, createMcpSourcePlugin, defineCapability, mcpSourceDescriptors, startEngineServer,
  type ExternalMcpTools,
} from "../src/index.js";
import { mcpRequest, mcpRpc, openMcpSession } from "./fixtures/mcp-http.js";
import { localUpstream } from "./fixtures/mcp-upstream.js";
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

async function fixture(directory: string, readOnly = false) {
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
    publishSignal: () => plugins.isEnabled("mcp") ? service?.signal : undefined,
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
    call, invoke, endpoint, token, close, plugins, vault,
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

function writes(journal: string): { type: string; pid?: number; args?: object; name?: string; keys?: string[] }[] {
  return readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

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
  expect(await anotherVault.call("mcp.sources.list")).toEqual({ revision: 0, sources: [] });
});

test("one HTTP entry matches exact same-name tools across stdio, Streamable HTTP and legacy SSE", async () => {
  const directory = root();
  const streamable = await localUpstream("streamable-http", { authorization: "Bearer fixture-only" });
  cleanup.push(() => streamable.close());
  const sse = await localUpstream("sse");
  cleanup.push(() => sse.close());
  const resources = await localUpstream("streamable-http", { resourcesOnly: true });
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
