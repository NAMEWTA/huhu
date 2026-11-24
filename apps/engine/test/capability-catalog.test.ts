import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityCatalogEntrySchema, CapabilityDiscoveryEntrySchema, CapabilityResultSchema } from "@huhu/contracts";
import sshManifest from "@huhu/plugin-ssh/manifest" with { type: "json" };
import { expect, test } from "vitest";
import { z } from "zod";
import { issueMcpCredential, mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { boot, type RunningEngine } from "../src/boot.js";

const capabilitiesPath = "/api/v1/capabilities";
const namesPath = `${capabilitiesPath}?view=names`;

async function call(engine: RunningEngine, capability: string, input: unknown = {}, token = engine.rendererToken, intentKey?: string) {
  const reply = await fetch("http://127.0.0.1:" + engine.port + "/api/v1/call", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID(), ...(intentKey && { intentKey }) }),
  });
  expect(reply.status).toBe(200);
  return CapabilityResultSchema.parse(await reply.json());
}

async function directory(engine: RunningEngine, includeInactive: boolean, token = engine.rendererToken) {
  const result = await call(engine, "capabilities.list", { includeInactive }, token);
  if (!result.ok) throw new Error(result.error.message);
  return z.array(CapabilityCatalogEntrySchema).parse(result.data);
}

async function discover(url: string, headers: NonNullable<ConstructorParameters<typeof Headers>[0]>) {
  const reply = await fetch(url, { headers });
  expect(reply.ok).toBe(true);
  expect(reply.headers.get("cache-control")).toBe("no-store");
  return (await reply.json()) as unknown;
}

async function discoveredNames(origin: string, headers: NonNullable<ConstructorParameters<typeof Headers>[0]>) {
  const names = z.array(z.strictObject({ name: z.string() })).safeParse(await discover(`${origin}${namesPath}`, headers));
  expect(names.success).toBe(true);
  return names.data!.map(({ name }) => name);
}

function desktopDiscovery(engine: RunningEngine) {
  return [`http://127.0.0.1:${engine.port}`, { authorization: `Bearer ${engine.rendererToken}` }] as const;
}

test("静态目录在 SSH 停用、重启和重新启用后保留描述，由同一 Engine 执行活动工具", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-catalog-"));
  const notePath = path.join(dir, "目录样例.md");
  const note = "# 目录样例\n";
  let engine: RunningEngine | undefined;
  try {
    writeFileSync(notePath, note, "utf8");
    engine = await boot({ vaultPath: dir, create: true });
    const active = await directory(engine, true);
    expect(active.find((entry) => entry.name === "notes.read")).toMatchObject({
      plugin: "notes",
      title: "读取笔记",
      scope: "read",
      risk: "normal",
      availability: "active",
      input: { properties: { path: { type: "string" } } },
      output: { properties: { text: { type: "string" }, version: { type: "string" } } },
    });
    const noteInput = { path: "目录样例.md" };
    const fromDesktop = await call(engine, "notes.read", noteInput);
    expect(fromDesktop).toMatchObject({ ok: true, data: { path: noteInput.path, text: note, version: expect.any(String) } });
    expect(await call(engine, "gateway.update", { capability: "notes.read", exposed: true })).toMatchObject({ ok: true });
    expect(await call(engine, "notes.read", noteInput, engine.cliToken)).toEqual(fromDesktop);
    expect(readFileSync(notePath, "utf8")).toBe(note);

    const published = active.filter((entry) => entry.plugin === "ssh");
    expect(published.map((entry) => entry.name).sort()).toEqual([...sshManifest.contributes.capabilities].sort());
    expect(new Set(published.map((entry) => entry.name)).size).toBe(published.length);
    expect(published.every((entry) => entry.title && entry.description && entry.risk && entry.input && entry.output && entry.availability === "active")).toBe(true);
    expect(published.find((entry) => entry.name === "ssh.hosts.remove")).toMatchObject({
      plugin: "ssh",
      title: "移除 SSH 主机配置",
      scope: "admin",
      risk: "high",
      input: { properties: { hostId: { type: "string" }, expectedRevision: { type: "string" }, routeRevision: { type: "string" }, intentKey: { type: "string" } }, required: ["hostId", "expectedRevision"] },
      output: { properties: { ok: { const: true } } },
    });
    expect(await call(engine, "ssh.hosts.list")).toEqual({ ok: true, data: [] });
    const [origin, headers] = desktopDiscovery(engine);
    const full = z.array(CapabilityDiscoveryEntrySchema).parse(await discover(`${origin}${capabilitiesPath}`, headers));
    const names = await discoveredNames(origin, headers);
    expect(names).toEqual(full.map(({ name }) => name));
    expect(names).toContain("ssh.hosts.list");
    expect(names).toContain("web.share.start");
    expect(await call(engine, "ssh.hosts.list", {}, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });

    expect(await call(engine, "plugins.setEnabled", { id: "ssh", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
    const inactive = published.map((entry) => ({ ...entry, availability: "plugin-disabled" }));
    expect((await directory(engine, true)).filter((entry) => entry.plugin === "ssh")).toEqual(inactive);
    expect((await directory(engine, false)).some((entry) => entry.plugin === "ssh")).toBe(false);
    expect(await discoveredNames(origin, headers)).not.toContain("ssh.hosts.list");
    expect(await call(engine, "capabilities.list", { includeInactive: true }, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await call(engine, "gateway.check", { capability: "ssh.hosts.list" })).toMatchObject({
      ok: true,
      data: { found: true, availability: "plugin-disabled", scope: "read", identities: expect.arrayContaining([expect.objectContaining({ identity: "cli", allowed: false })]) },
    });
    expect(await call(engine, "gateway.check", { capability: "uninstalled.probe" })).toMatchObject({
      ok: true,
      data: { found: false, availability: "not-found", scope: null },
    });
    expect(await call(engine, "ssh.hosts.list")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await call(engine, "uninstalled.probe")).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_FOUND" } });

    await engine.shutdown();
    engine = await boot({ vaultPath: dir });
    expect((await directory(engine, true)).filter((entry) => entry.plugin === "ssh")).toEqual(inactive);
    expect(await call(engine, "ssh.hosts.list")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await call(engine, "notes.read", noteInput)).toEqual(fromDesktop);

    const restarted = desktopDiscovery(engine);
    expect(await discoveredNames(...restarted)).not.toContain("ssh.hosts.list");
    expect(await call(engine, "plugins.setEnabled", { id: "ssh", enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
    expect(await discoveredNames(...restarted)).toContain("ssh.hosts.list");
    expect((await directory(engine, true)).filter((entry) => entry.plugin === "ssh")).toEqual(published);
    expect(await call(engine, "ssh.hosts.list")).toEqual({ ok: true, data: [] });
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}, 60_000);

test("任务插件停用时可预配置静态工具，重开与启用沿用相同 schema", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-task-catalog-"));
  let engine: RunningEngine | undefined;
  try {
    const input = { title: "静态目录测试任务" };
    const capability = "tasks.create";
    engine = await boot({ vaultPath: dir, create: true });
    const entry = (await directory(engine, true)).find((item) => item.name === capability)!;
    expect(entry).toMatchObject({ plugin: "tasks", scope: "write", availability: "active", exposed: false, input: { properties: { title: { type: "string" } } } });
    expect(await call(engine, capability, input, engine.cliToken)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await call(engine, "plugins.setEnabled", { id: "tasks", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
    expect(await call(engine, "gateway.update", { capability, exposed: true })).toMatchObject({ ok: true });
    await engine.shutdown();
    engine = await boot({ vaultPath: dir });
    expect((await directory(engine, true)).find((item) => item.name === capability)).toEqual({ ...entry, selected: true, exposed: false, availability: "plugin-disabled" });
    expect(await call(engine, capability, input, engine.cliToken)).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await call(engine, "plugins.setEnabled", { id: "tasks", enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
    expect((await directory(engine, true)).find((item) => item.name === capability)).toEqual({ ...entry, selected: true, exposed: true, availability: "active" });
    const created = await call(engine, capability, input, engine.cliToken, "static-catalog-create");
    expect(created, JSON.stringify(created)).toMatchObject({ ok: true, data: input });

    expect(await call(engine, "gateway.mcp.update", { enabled: true })).toMatchObject({ ok: true });
    const origin = `http://127.0.0.1:${engine.port}`;
    const externalToken = await issueMcpCredential(engine);
    const mcpHeaders = { authorization: `Bearer ${externalToken}` };
    const full = await discover(`${origin}${capabilitiesPath}`, mcpHeaders);
    expect(full).toEqual([expect.objectContaining({ name: capability, input: entry.input, output: entry.output, durableIntent: true })]);
    expect(await discover(`${origin}${namesPath}`, mcpHeaders)).toEqual(full);

    const mcpUrl = `${origin}/mcp`;
    const httpSession = await openMcpSession(mcpUrl, externalToken);
    const reply = await mcpRequest(mcpUrl, externalToken, mcpRpc("tools/list"), httpSession);
    expect(reply.status).toBe(200);
    expect(await reply.json()).toMatchObject({
      result: { tools: [{ name: "tasks_create", inputSchema: entry.input, outputSchema: { type: "object", properties: { data: expect.any(Object) } }, _meta: { "huhu.dev/intent-key": "optional" } }] },
    });
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}, 60_000);

test("Web 名称目录沿用会话权限，邀请撤销后拒绝原 cookie", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-web-catalog-"));
  const vaultPath = path.join(root, "vault");
  const webAssetsDir = path.join(root, "web");
  let engine: RunningEngine | undefined;
  try {
    mkdirSync(vaultPath);
    mkdirSync(webAssetsDir);
    writeFileSync(path.join(webAssetsDir, "index.html"), "<!doctype html><title>工作台</title>");
    engine = await boot({ vaultPath, webAssetsDir, create: true });
    const started = await call(engine, "web.share.start", { mode: "local" });
    if (!started.ok) throw new Error(started.error.message);
    const {
      addresses: [{ url: origin }],
    } = z.object({ addresses: z.tuple([z.object({ url: z.string() })], z.unknown()) }).parse(started.data);
    const invitation = await call(engine, "web.invitations.create");
    if (!invitation.ok) throw new Error(invitation.error.message);
    const {
      id,
      links: [link],
    } = z.object({ id: z.string(), links: z.tuple([z.string()], z.string()) }).parse(invitation.data);
    const secret = new URLSearchParams(new URL(link).hash.slice(1)).get("invite");
    const joined = await fetch(`${origin}/api/v1/session`, { method: "POST", headers: { origin, authorization: `Bearer ${secret}` } });
    expect(joined.status).toBe(204);
    const cookie = joined.headers.get("set-cookie")!.split(";")[0]!;
    const headers = { origin, cookie };

    expect((await fetch(`${origin}${namesPath}`)).status).toBe(401);
    const full = z.array(CapabilityDiscoveryEntrySchema).parse(await discover(`${origin}${capabilitiesPath}`, headers));
    const names = await discoveredNames(origin, headers);
    expect(names).toEqual(full.map(({ name }) => name));
    expect(names).toContain("tasks.create");
    expect(names).not.toContain("web.share.start");
    expect(await call(engine, "web.invitations.revoke", { id })).toMatchObject({ ok: true, data: { revoked: true } });
    expect((await fetch(`${origin}${namesPath}`, { headers })).status).toBe(401);
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}, 60_000);

test("MCP 来源管理按插件生命周期加载，显式停用关闭唯一 HTTP 出口", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-mcp-plugin-"));
  let engine: RunningEngine | undefined;
  try {
    engine = await boot({ vaultPath: dir, create: true });
    expect((await directory(engine, true)).find(({ name }) => name === "mcp.sources.create")).toMatchObject({
      plugin: "mcp", availability: "active", exposed: false, risk: "high",
    });
    expect(await call(engine, "mcp.sources.create", {
      displayName: "示例",
      namespace: "fixture",
      configuration: { transport: "stdio", command: "fixture-never-starts", args: [], environment: {} },
    })).toMatchObject({ ok: true, data: { enabled: false } });
    expect(await call(engine, "gateway.mcp.update", { enabled: true })).toMatchObject({ ok: true, data: { enabled: true } });
    const endpoint = `http://127.0.0.1:${engine.port}/mcp`;
    const token = await issueMcpCredential(engine);
    const handle = await openMcpSession(endpoint, token);
    expect(await call(engine, "plugins.setEnabled", { id: "mcp", enabled: false })).toMatchObject({ ok: true, data: { state: "disabled" } });
    expect((await mcpRequest(endpoint, token, mcpRpc("tools/list"), handle)).status).toBe(404);
    expect(await call(engine, "mcp.sources.list")).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect((await directory(engine, true)).find(({ name }) => name === "mcp.sources.create")).toMatchObject({ availability: "plugin-disabled", exposed: false });
    expect(await call(engine, "plugins.setEnabled", { id: "mcp", enabled: true })).toMatchObject({ ok: true, data: { state: "active" } });
    expect(await call(engine, "gateway.get")).toMatchObject({ ok: true, data: { mcp: { enabled: false } } });
    expect(await call(engine, "mcp.sources.list")).toMatchObject({ ok: true, data: { sources: [{ source: { namespace: "fixture", enabled: false } }] } });
  } finally {
    await engine?.shutdown();
    rmSync(dir, { recursive: true, force: true });
  }
});
