import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityCatalogEntrySchema, CapabilityResultSchema, HuhuErrorSchema } from "@huhu/contracts";
import { boot, type RunningEngine } from "@huhu/engine";
import { Vault } from "@huhu/vault";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { run } from "../src/main.js";

const dirs: string[] = [];
const engines: RunningEngine[] = [];
afterEach(async () => {
  for (const e of engines.splice(0)) await e.shutdown();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-c-"));
  dirs.push(d);
  return d;
};
function capture() {
  const out: string[] = [],
    err: string[] = [];
  return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
}
const ENGINE_ENTRY = path.resolve(import.meta.dirname, "../../engine/src/main.ts");
async function allowTools(e: RunningEngine, ...names: string[]) {
  for (const capability of names) {
    const response = await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "gateway.update", input: { capability, exposed: true }, requestId: `allow-${capability}` }),
    });
    expect(await response.json()).toMatchObject({ ok: true });
  }
}

async function setMcp(e: RunningEngine, enabled: boolean, transport: "stdio" | "http" = "stdio") {
  const response = await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability: "gateway.mcp.update", input: { enabled, transport }, requestId: randomUUID() }),
  });
  expect(await response.json()).toMatchObject({ ok: true, data: { enabled, transport } });
}

describe("CLI", () => {
  test("--version / --help 不需要 Vault", async () => {
    const c = capture();
    expect(await run(["--version"], c.io)).toBe(0);
    expect(c.out.join("")).toContain("0.0.1");
    const h = capture();
    expect(await run(["--help"], h.io)).toBe(0);
    expect(h.out.join("")).toContain("call");
  });
  test("找不到 Vault → 退出码 3", async () => {
    const c = capture();
    const cwd = process.cwd();
    process.chdir(tmp());
    try {
      expect(await run(["call", "vault.info"], c.io)).toBe(3);
    } finally {
      process.chdir(cwd);
    }
  });
  test("参数错误 → 2", async () => {
    expect(await run(["call", "vault.info", "--input-json", "{bad"], capture().io)).toBe(2);
    expect(await run(["nosuchcommand"], capture().io)).toBe(2);
  });
  test("复用已运行的 Engine：call vault.info --json", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    await allowTools(e, "vault.info");
    const c = capture();
    expect(await run(["call", "vault.info", "--vault", dir, "--json"], c.io)).toBe(0);
    const parsed = JSON.parse(c.out.join(""));
    expect(parsed).toMatchObject({ ok: true, data: { id: e.vault.id } });
  });
  test("业务错误 → 退出码 1", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const c = capture();
    expect(await run(["call", "no.such", "--vault", dir], c.io)).toBe(1);
    expect(c.out.join("")).toContain("CAPABILITY_NOT_FOUND");
  });
  test("同一 Engine 的扩展卸载与复装在目录、CLI 和两种 MCP 上一致", async () => {
    const vault = tmp();
    const e = await boot({ vaultPath: vault, create: true });
    engines.push(e);
    const id = "review-catalog-example";
    const capability = id + ".fixture.read";
    const name = id + "_fixture_read";
    const fixture = (owner: string, claimed: string) => {
      const source = tmp();
      writeFileSync(
        path.join(source, "huhu-plugin.json"),
        JSON.stringify({
          id: owner,
          title: owner,
          description: "",
          version: "1.0.0",
          origin: "external",
          main: "main.mjs",
          contributes: { capabilities: [claimed] },
        }),
      );
      writeFileSync(path.join(source, "main.mjs"), "export function activate() {}\n");
      return source;
    };
    const source = fixture(id, capability);
    const rpc = async (route: string, body: unknown, token = e.rendererToken) => {
      const response = await fetch("http://127.0.0.1:" + e.port + route, {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    const desktop = async (name: string, input: unknown = {}) => CapabilityResultSchema.parse(await rpc("/api/v1/call", { capability: name, input, requestId: randomUUID(), idempotencyKey: randomUUID() }));
    const http = (method: string, params: unknown = {}) => rpc("/mcp", { jsonrpc: "2.0", id: 1, method, params }, e.mcpToken);
    const install = (source: string) => desktop("plugins.install", { source, grants: [] });
    const stdio = new Client({ name: "lifecycle-test", version: "1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [createRequire(import.meta.url).resolve("tsx/cli"), path.resolve(import.meta.dirname, "../src/bin.ts"), "mcp", "--vault", vault],
    });
    const check = async (availability: string, error: object) => {
      const found = availability !== "not-found";
      const checkError = (actual: { details?: unknown }) => {
        expect.soft(actual).toMatchObject(error);
        if (!found) expect.soft(actual.details).toBeUndefined();
      };
      const checkToolError = (data: unknown) => {
        const reply = CallToolResultSchema.parse(data);
        expect(reply.isError).toBe(true);
        const content = reply.content[0];
        if (content?.type !== "text") throw new Error("MCP 未返回错误文本");
        checkError(HuhuErrorSchema.parse(JSON.parse(content.text)));
      };
      const directory = await desktop("capabilities.list", { includeInactive: true });
      if (!directory.ok) throw new Error(directory.error.message);
      const entry = CapabilityCatalogEntrySchema.array()
        .parse(directory.data)
        .find((entry) => entry.name === capability);
      if (found) expect(entry).toMatchObject({ plugin: id, availability, exposed: false });
      else expect(entry).toBeUndefined();
      expect(await desktop("gateway.check", { capability })).toMatchObject({
        ok: true,
        data: { found, availability, identities: ["cli", "mcp", "http"].map((identity) => ({ identity, allowed: false })) },
      });
      const cli = capture();
      expect(await run(["capabilities", "list", "--vault", vault, "--json"], cli.io)).toBe(0);
      expect(JSON.parse(cli.out.join(""))).toMatchObject({ ok: true, data: [] });
      const invocation = capture();
      expect(await run(["call", capability, "--vault", vault, "--json"], invocation.io)).toBe(1);
      const cliReply = CapabilityResultSchema.parse(JSON.parse(invocation.out.join("")));
      if (cliReply.ok) throw new Error("CLI 调用意外成功");
      checkError(cliReply.error);
      expect(await stdio.listTools()).toMatchObject({ tools: [] });
      checkToolError(await stdio.callTool({ name, arguments: {} }));
      expect(await http("tools/list")).toMatchObject({ result: { tools: [] } });
      const httpReply = (await http("tools/call", { name, arguments: {} })) as { result?: unknown };
      checkToolError(httpReply.result);
    };
    const missing = { code: "CAPABILITY_NOT_FOUND" };
    const unbound = { ...missing, details: { reason: "handler-missing", plugin: id } };
    try {
      expect(await desktop("gateway.mcp.update", { enabled: true, transport: "http" })).toMatchObject({ ok: true });
      await stdio.connect(transport);
      await check("not-found", missing);
      expect(await install(source)).toMatchObject({ ok: true });
      await check("handler-missing", unbound);
      expect(await desktop("plugins.setEnabled", { id, enabled: false })).toMatchObject({ ok: true });
      await check("plugin-disabled", { code: "PLUGIN_DISABLED", details: { plugin: id } });
      expect(await desktop("plugins.uninstall", { id })).toMatchObject({ ok: true });
      await check("not-found", missing);
      const conflict = { ok: false, error: { code: "NAME_CONFLICT" } };
      expect.soft(await install(fixture("review-other", capability))).toMatchObject(conflict);
      expect.soft(await install(fixture("review-alias", id + ".fixture_read"))).toMatchObject(conflict);
      await check("not-found", missing);
      expect(await install(source)).toMatchObject({ ok: true });
      await check("handler-missing", unbound);
    } finally {
      await stdio.close();
    }
  }, 60_000);
  test("无 Engine 时自动启动无界面 Engine，空闲后自行退出", async () => {
    const dir = tmp();
    await (await Vault.open(dir, { create: true })).close();
    process.env["HUHU_ENGINE_ENTRY"] = ENGINE_ENTRY;
    const c = capture();
    // 使用短空闲时间：通过环境变量不可行，这里直接调用 connect 的 idleExitMs
    const { connect } = await import("../src/connect.js");
    const conn = await connect(dir, { idleExitMs: 1500, timeoutMs: 20000 });
    const { discoverCapabilities } = await import("../src/commands/call.js");
    expect(await discoverCapabilities(conn)).toEqual({ ok: true, data: [] });
    void c;
    const v = await Vault.open(dir, { readOnly: true });
    const desc = path.join(v.runtimeDir, "engine.json");
    expect(existsSync(desc)).toBe(true);
    const deadline = Date.now() + 15000;
    while (existsSync(desc) && Date.now() < deadline) await new Promise((r2) => setTimeout(r2, 200));
    expect(existsSync(desc)).toBe(false);
  }, 60000);
  test("便捷命令：tasks create/status/list、plugins list、capabilities list、inbox capture", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const run1 = async (...args: string[]) => {
      const c = capture();
      const code = await run([...args, "--vault", dir, "--json"], c.io);
      return { code, out: JSON.parse(c.out.join("")) as { ok: boolean; data: unknown } };
    };
    const created = await run1("tasks", "create", "--title", "写周报");
    expect(created.code).toBe(1); // 默认不对外开放
    expect((created.out as unknown as { error: { code: string } }).error.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect(await run1("capabilities", "list")).toEqual({ code: 0, out: { ok: true, data: [] } });
    expect((await run1("call", "capabilities.list")).code).toBe(1);
    await allowTools(e, "tasks.create", "tasks.read", "tasks.setStatus", "tasks.list", "plugins.list", "guide.status", "inbox.capture", "notes.list");
    const created2 = await run1("tasks", "create", "--title", "写周报");
    expect(created2.code).toBe(0);
    const id = (created2.out.data as { id: string }).id;
    const done = await run1("tasks", "status", id, "completed");
    expect(done.code).toBe(0);
    expect((done.out.data as { status: string }).status).toBe("completed");
    // 不可开放的能力永远不能被网关开放
    const bad = await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "gateway.update", input: { capability: "safe.items.reveal", exposed: true }, requestId: "r", idempotencyKey: "key-gw-bad1" }),
    });
    expect(((await bad.json()) as { ok: boolean; error: { code: string } }).error.code).toBe("INVALID_INPUT");
    const plugins = await run1("plugins", "list");
    expect(plugins.code).toBe(0);
    expect((plugins.out.data as { id: string }[]).map((p) => p.id)).toEqual(expect.arrayContaining(["tasks", "notes", "inbox", "safe"]));
    const caps = await run1("capabilities", "list");
    expect((caps.out.data as { name: string }[]).map((c) => c.name)).not.toContain("safe.items.reveal");
    // Agent 指南：打开 Vault 时自动补写三份文件；`huhu guide status` 报告 current；`huhu --skill` 不需要 Vault
    await vi.waitFor(() => expect(existsSync(path.join(dir, ".agents/skills/huhu/references/mcp.md"))).toBe(true));
    const guide = await run1("guide", "status");
    expect((guide.out.data as { overall: string }).overall).toBe("current");
    const lines: string[] = [];
    expect(await run(["--skill"], { out: (l) => lines.push(l), err: () => undefined })).toBe(0);
    expect(lines.join("\n")).toContain("HUHU Vault 操作指南");
    const cap = await run1("inbox", "capture", "--title", "来自命令行");
    expect(cap.code).toBe(0);
    expect((cap.out.data as { source: string }).source).toBe("cli");
    expect((await run1("tasks", "list", "--status", "not_started,in_progress", "--tag", "周报")).code).toBe(0);
    expect((await run1("notes", "list")).code).toBe(0);
  });
  test("ACC-PL-01 stdio：停用 tasks 后，已缓存工具表的客户端调用 tasks_list 得到 PLUGIN_DISABLED，且工具表不再含 tasks_*", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    await allowTools(e, "tasks.list");
    await setMcp(e, true);
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createMcpServer } = await import("../src/mcp.js");
    const server = createMcpServer({ baseUrl: `http://127.0.0.1:${e.port}`, token: e.mcpToken, vaultId: e.vault.id }, "0.0.1", { watchToolsMs: 200 });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "1" });
    const { ToolListChangedNotificationSchema } = await import("@modelcontextprotocol/sdk/types.js");
    let changed = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => void changed++);
    await Promise.all([server.connect(a), client.connect(b)]);
    expect((await client.listTools()).tools.some((t) => t.name === "tasks_list")).toBe(true);
    const off = await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "plugins.setEnabled", input: { id: "tasks", enabled: false }, requestId: "r", idempotencyKey: "key-disable-tasks-1" }),
    });
    expect(off.ok).toBe(true);
    await vi.waitFor(() => expect(changed).toBeGreaterThan(0), { timeout: 10_000 }); // 开放的工具表变了：服务端主动通知（tools/list_changed）
    expect((await client.listTools()).tools.some((t) => t.name.startsWith("tasks_"))).toBe(false);
    const stale = await client.callTool({ name: "tasks_list", arguments: {} });
    expect(stale.isError).toBe(true);
    expect((stale.content as { text: string }[])[0]?.text).toContain("PLUGIN_DISABLED");
    await client.close();
  }, 30_000);
  test("ACC-PL-06 stdio 进程：stdout 只有 JSON-RPC 帧（日志不进 stdout），工具表只含对外开放的能力", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const { spawn } = await import("node:child_process");
    const { createRequire } = await import("node:module");
    const tsx = createRequire(import.meta.url).resolve("tsx/cli");
    const child = spawn(process.execPath, [tsx, path.resolve(import.meta.dirname, "../src/bin.ts"), "mcp", "--vault", dir], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (b) => (out += b.toString()));
    const send = (m: unknown) => child.stdin.write(JSON.stringify(m) + "\n");
    try {
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
      await vi.waitFor(() => expect(out).toContain('"id":1'), { timeout: 20_000 });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      await vi.waitFor(() => expect(out).toContain('"id":2'), { timeout: 20_000 });
      const replies = () =>
        out
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as { id?: number; result?: { tools?: { name: string }[]; isError?: boolean; content?: { text: string }[] } });
      expect(replies().find((m) => m.id === 2)?.result?.tools).toEqual([]);
      await allowTools(e, "vault.info");
      await setMcp(e, true);
      send({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
      await vi.waitFor(() => expect(out).toContain('"id":3'), { timeout: 20_000 });
      expect(
        replies()
          .find((m) => m.id === 3)
          ?.result?.tools?.map((tool) => tool.name),
      ).toEqual(["vault_info"]);
      await setMcp(e, false);
      send({ jsonrpc: "2.0", id: 6, method: "tools/list", params: {} });
      await vi.waitFor(() => expect(out).toContain('"id":6'), { timeout: 20_000 });
      expect(replies().find((m) => m.id === 6)?.result?.tools).toEqual([]);
      send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "vault_info", arguments: {} } });
      await vi.waitFor(() => expect(out).toContain('"id":7'), { timeout: 20_000 });
      expect(replies().find((m) => m.id === 7)?.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("PERMISSION_DENIED") }] });
      const cli = capture();
      expect(await run(["call", "vault.info", "--vault", dir, "--json"], cli.io)).toBe(0);
      await setMcp(e, true);
      writeFileSync(path.join(dir, ".huhu/gateway/tool-access.json"), "{invalid");
      send({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
      await vi.waitFor(() => expect(out).toContain('"id":4'), { timeout: 20_000 });
      expect(replies().find((m) => m.id === 4)?.result?.tools).toEqual([]);
      send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "vault_info", arguments: {} } });
      await vi.waitFor(() => expect(out).toContain('"id":5'), { timeout: 20_000 });
      expect(replies().find((m) => m.id === 5)?.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("invalid-format") }] });
    } finally {
      child.kill();
    }
  }, 60_000);
  test("ACC-PL-06 MCP：只列出对外开放的能力；调用经 Dispatcher 授权；safe 能力不出现；资源可读", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    await allowTools(e, "vault.info", "tasks.list", "inbox.capture", "vault.indexEntries", "notes.list", "notes.read");
    await setMcp(e, true);
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createMcpServer } = await import("../src/mcp.js");
    const server = createMcpServer({ baseUrl: `http://127.0.0.1:${e.port}`, token: e.mcpToken, vaultId: e.vault.id }, "0.0.1");
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["vault_info", "tasks_list", "inbox_capture"]));
    expect(tools).not.toContain("safe_items_reveal");
    expect(tools).not.toContain("tasks_create"); // 默认不对外
    const info = await client.callTool({ name: "vault_info", arguments: {} });
    expect(JSON.parse((info.content as { text: string }[])[0]?.text ?? "{}")).toMatchObject({ id: e.vault.id });
    const denied = await client.callTool({ name: "tasks_create", arguments: { title: "x" } });
    expect(denied.isError).toBe(true);
    const cap = await client.callTool({ name: "inbox_capture", arguments: { body: "来自 MCP", source: "quick" } });
    expect(JSON.parse((cap.content as { text: string }[])[0]?.text ?? "{}").source).toBe("mcp"); // 身份来自令牌，输入里的 source 被忽略
    const res = await client.readResource({ uri: "huhu://vault/summary" });
    expect(JSON.parse((res.contents[0] as { text: string }).text)).toMatchObject({ id: e.vault.id });
    // 最近笔记、笔记模板与提示词（ACC-PL-05：资源/模板/提示词都经同一授权）
    writeFileSync(path.join(dir, "最近.md"), "# 最近\n\n正文内容\n");
    await vi.waitFor(async () => {
      const recent = JSON.parse(((await client.readResource({ uri: "huhu://notes/recent" })).contents[0] as { text: string }).text) as { path: string }[];
      expect(recent.map((r) => r.path)).toContain("最近.md");
    });
    const tpl = await client.listResourceTemplates();
    expect(tpl.resourceTemplates.map((t) => t.uriTemplate)).toContain("huhu://notes/{id}");
    const byPath = await client.readResource({ uri: `huhu://notes/${encodeURIComponent("最近.md")}` });
    expect((byPath.contents[0] as { text: string }).text).toContain("正文内容");
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(expect.arrayContaining(["daily-review", "knowledge-synthesis"]));
    const prompt = await client.getPrompt({ name: "knowledge-synthesis", arguments: { topic: "发布" } });
    expect(JSON.stringify(prompt.messages)).toContain("发布");
    await expect(client.getPrompt({ name: "knowledge-synthesis", arguments: {} })).rejects.toThrow();
    await client.close();
  });
});
