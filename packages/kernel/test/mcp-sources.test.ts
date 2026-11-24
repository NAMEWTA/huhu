import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Vault } from "@huhu/vault";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import {
  CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, MCP_SOURCES_SERVICE, PluginManager, TokenTable,
  createHuhuContext, createMcpSourcePlugin, defineCapability, mcpSourceDescriptors, startEngineServer,
  type ExternalMcpTools,
} from "../src/index.js";
import { mcpRequest, mcpRpc, openMcpSession } from "./fixtures/mcp-http.js";

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
    call, invoke, endpoint, token, close, plugins,
    setPublishing(enabled: boolean) { service?.abort(); service = enabled ? new AbortController() : undefined; },
    async client() {
      const handle = await openMcpSession(endpoint, token);
      return async (method: string, params: unknown = {}) => {
        const response = await mcpRequest(endpoint, token, mcpRpc(method, params), handle);
        expect(response.status).toBe(200);
        return response.json();
      };
    },
  };
}

type Source = { sourceId: string; revision: number; enabled: boolean; namespace: string };
type Catalog = { catalogRevision: number; policyRevision: number; entries: { publicKey: string; upstreamIdentity: string; sourceId: string; selected: boolean }[] };

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
  expect((await rpc("tools/list")).result.tools.map(({ name }: { name: string }) => name)).toEqual(["vault_info", "repo__echo"]);
  expect((await rpc("tools/call", { name: "vault_info", arguments: {} })).result.structuredContent).toEqual({ data: { name: "fixture" } });
  expect((await rpc("tools/call", { name: "repo__echo", arguments: { value: "hi" }, _meta: { "huhu-private": "ignored" } })).result).toMatchObject({
    structuredContent: { value: "hi" }, content: [{ type: "text", text: "hi" }, { type: "resource_link", uri: "fixture://note/1" }],
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
  expect((await restarted("tools/list")).result.tools.map(({ name }: { name: string }) => name)).toContain("repo__echo");
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
  expect((await rpc("tools/list")).result.tools.map(({ name }: { name: string }) => name)).toContain("repo__echo");
  await exposure(f, source, "echo", false);
  expect((await rpc("tools/list")).result.tools.map(({ name }: { name: string }) => name)).toEqual(["vault_info"]);
  expect((await rpc("tools/call", { name: "repo__echo", arguments: { value: "blocked" } })).error.data).toMatchObject({ code: "CAPABILITY_NOT_EXPOSED" });
  expect(writes(journal).filter(({ type }) => type === "call")).toHaveLength(0);
});
