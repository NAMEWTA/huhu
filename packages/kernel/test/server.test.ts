import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";
import { CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, TokenTable, defineCapability, startEngineServer, type RunningServer, EventReplay } from "../src/index.js";

let running: RunningServer | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function boot() {
  const registry = new CapabilityRegistry();
  registry.register(defineCapability({ name: "vault.info", plugin: "kernel", scope: "read", input: z.object({}), output: z.object({ name: z.string() }), exposable: true, defaultExposed: true, handler: () => ({ name: "占位" }) }));
  const tokens = new TokenTable();
  const events = new EventBus(() => "vault-t");
  const dispatcher = new Dispatcher({ registry, audit: new GatewayAudit(), idempotency: new IdempotencyStore(), isPluginEnabled: () => true, exposureOverride: () => undefined, grantedPermissions: () => [] });
  running = await startEngineServer({ dispatcher, registry, tokens, events, visibleTo: () => true });
  const base = `http://127.0.0.1:${running.port}`;
  return { base, tokens, events, port: running.port };
}
const call = (base: string, token: string | null, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1/call`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const REQ = { capability: "vault.info", input: {}, requestId: "r1" };

describe("HTTP", () => {
  test("healthz 无需令牌", async () => {
    const { base } = await boot();
    expect(await (await fetch(`${base}/healthz`)).text()).toBe("ok");
  });
  test("401：无令牌/错误令牌", async () => {
    const { base, tokens } = await boot();
    tokens.issue("desktop");
    expect((await call(base, null, REQ)).status).toBe(401);
    expect((await call(base, "wrong", REQ)).status).toBe(401);
  });
  test("调用成功；身份来自令牌", async () => {
    const { base, tokens } = await boot();
    const t = tokens.issue("desktop");
    const r = await call(base, t, REQ);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, data: { name: "占位" } });
  });
  test("403：非法 Origin、转发头；Host 不符", async () => {
    const { base, tokens } = await boot();
    const t = tokens.issue("desktop");
    expect((await call(base, t, REQ, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(base, t, REQ, { "x-forwarded-for": "1.2.3.4" })).status).toBe(403);
    expect((await call(base, t, REQ, { origin: "huhu-app://workbench" })).status).toBe(200);
  });
  test("CORS：Renderer 源预检通过且响应带头；其他源预检不放行", async () => {
    const { base, tokens } = await boot();
    const t = tokens.issue("desktop");
    const pre = await fetch(`${base}/api/v1/call`, { method: "OPTIONS", headers: { origin: "huhu-app://workbench", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("huhu-app://workbench");
    expect(pre.headers.get("access-control-allow-headers")).toContain("authorization");
    const res = await call(base, t, REQ, { origin: "huhu-app://workbench" });
    expect(res.headers.get("access-control-allow-origin")).toBe("huhu-app://workbench");
    const evil = await fetch(`${base}/api/v1/call`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });
  test("413：请求体过大；400：非法 JSON", async () => {
    const { base, tokens } = await boot();
    const t = tokens.issue("desktop");
    expect((await call(base, t, "x".repeat(9 * 1024 * 1024))).status).toBe(413);
    expect((await call(base, t, "{bad")).status).toBe(400);
  });
  test("413：chunked 请求（无 Content-Length）超限即被拒", async () => {
    const { base, tokens } = await boot();
    const t = tokens.issue("desktop");
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream({
      pull(c) {
        if (sent >= 12) return c.close();
        sent++;
        c.enqueue(chunk);
      },
    });
    const r = await fetch(`${base}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    expect(r.status).toBe(413);
  });
  test("403：Host 不是回环地址", async () => {
    const { port } = await boot();
    const res = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/api/v1/capabilities", headers: { host: "evil.example", authorization: "Bearer x" } }, (r) => resolve(r.statusCode ?? 0));
      req.on("error", reject);
      req.end();
    });
    expect(res).toBe(403);
  });
  test("能力清单含 JSON Schema", async () => {
    const { base, tokens } = await boot();
    const t = tokens.issue("desktop");
    const list = (await (await fetch(`${base}/api/v1/capabilities`, { headers: { authorization: `Bearer ${t}` } })).json()) as { name: string; input: { type: string } }[];
    expect(list[0]).toMatchObject({ name: "vault.info", input: { type: "object" } });
  });
});

function openWs(port: number, token: string, query = ""): Promise<{ ws: WebSocket; msgs: { type?: string; seq?: number }[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/events${query}`, [`bearer.${token}`]);
    const msgs: { type?: string; seq?: number }[] = [];
    ws.on("message", (m) => msgs.push(JSON.parse(String(m))));
    ws.on("open", () => resolve({ ws, msgs }));
    ws.on("error", reject);
    ws.on("unexpected-response", (_r, res) => reject(new Error(`status ${res.statusCode}`)));
  });
}
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe("WS 事件", () => {
  test("无令牌被拒；有令牌收到事件且 seq 递增", async () => {
    const { tokens, events, port } = await boot();
    await expect(openWs(port, "bad")).rejects.toThrow(/401/);
    const t = tokens.issue("desktop");
    const { ws, msgs } = await openWs(port, t);
    events.publish("entity.changed", { kind: "task", id: "task-1", op: "created" });
    events.publish("entity.changed", { kind: "task", id: "task-1", op: "updated" });
    await tick();
    const ev = msgs.filter((m) => m.type === "entity.changed");
    expect(ev.map((m) => m.seq)).toEqual([1, 2]);
    ws.close();
  });
  test("外部扩展令牌不能订阅事件流（事件载荷不受权限表约束）", async () => {
    const { tokens, port } = await boot();
    await expect(openWs(port, tokens.issue("plugin:probe"))).rejects.toThrow(/403/);
  });
  test("断线重连按 lastSeq 补发；超出缓冲 resync", async () => {
    const { tokens, events, port } = await boot();
    const t = tokens.issue("desktop");
    for (let i = 0; i < 3; i++) events.publish("entity.changed", { kind: "task", id: `task-${i}`, op: "created" });
    const a = await openWs(port, t, "?lastSeq=1");
    await tick();
    expect(a.msgs.map((m) => m.seq)).toEqual([2, 3]);
    a.ws.close();
    const b = await openWs(port, t, "?lastSeq=999");
    await tick();
    expect(b.msgs[0]).toMatchObject({ type: "resync" });
    b.ws.close();
    const stale = await openWs(port, t, "?lastSeq=1&epoch=old-epoch");
    await tick();
    expect(stale.msgs[0]).toMatchObject({ type: "resync" });
    stale.ws.close();
    const c = await openWs(port, t, "?lastSeq=abc");
    await tick();
    expect(c.msgs[0]).toMatchObject({ type: "resync" });
    c.ws.close();
  });
  test("补发缓冲只保留 1000 条", () => {
    const r = new EventReplay();
    const ev = { id: "e", vaultId: "v", type: "engine.closing", at: "", payload: {} } as const;
    for (let i = 0; i < 1200; i++) r.push(ev);
    expect(r.since(5)).toEqual({ resync: true });
    const ok = r.since(1100);
    expect(ok.resync).toBe(false);
    expect(!ok.resync && ok.events.length).toBe(100);
  });
});
