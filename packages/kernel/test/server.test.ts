import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import type { NetworkInterfaceInfo } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { z } from "zod";
import { CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, TokenTable, defineCapability, startEngineServer, type RunningServer, EventReplay } from "../src/index.js";
import { WebListener, type WebListenerConfig } from "../src/server/web-listener.js";
import { mcpRequest, mcpRpc, openMcpSession } from "./fixtures/mcp-http.js";
import { closeHttp, listenHttp } from "../src/server/listen-http.js";
import { EVENT_REPLAY_BYTES, EVENT_SOCKET_BYTES } from "../src/server/ws-events.js";

let running: RunningServer | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function boot(mcp?: { service: () => AbortSignal; enabled?: () => boolean; choices: Record<string, boolean> }) {
  const registry = new CapabilityRegistry();
  registry.register(defineCapability({ name: "vault.info", plugin: "kernel", scope: "read", input: z.object({}), output: z.object({ name: z.string() }), exposable: true, defaultExposed: true, handler: () => ({ name: "占位" }) }));
  const tokens = new TokenTable();
  const events = new EventBus(() => "vault-t");
  const dispatcher = new Dispatcher({
    registry,
    audit: new GatewayAudit(),
    idempotency: new IdempotencyStore(),
    isPluginEnabled: () => true,
    toolAccess: () => ({ state: "ready", revision: 0, choices: mcp?.choices ?? {} }),
    grantedPermissions: () => [],
    pluginOrigin: () => "external",
  });
  running = await startEngineServer({ dispatcher, registry, tokens, events, ...(mcp && { vaultInstance: "fixture-vault-instance", mcpHttp: { enabled: mcp.enabled ?? (() => true) }, mcpSignal: mcp.service }) });
  const base = `http://127.0.0.1:${running.port}`;
  return { base, tokens, events, registry, server: running, port: running.port };
}
const call = (base: string, token: string | null, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1/call`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const REQ = { capability: "vault.info", input: {}, requestId: "r1" };

test("MCP 运行时主体跟随会话撤销和过期，调用取消保留会话", async () => {
  let service = new AbortController();
  const { base, tokens, registry, server } = await boot({ service: () => service.signal, choices: { "fixture.session": true, "fixture.pending": true } });
  registry.register(
    defineCapability({
      name: "fixture.session",
      plugin: "kernel",
      scope: "read",
      input: z.object({}),
      output: z.unknown(),
      exposable: true,
      defaultExposed: false,
      handler: ({ caller, subject, session }) => ({ caller, subject, session, current: !!subject && caller === "http" && server.hasMcpPrincipal(caller, subject) }),
    }),
  );
  let arrived!: () => void;
  const arrival = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  registry.register(
    defineCapability({
      name: "fixture.pending",
      plugin: "kernel",
      scope: "read",
      input: z.object({}),
      output: z.null(),
      exposable: true,
      defaultExposed: false,
      handler: ({ signal }) => {
        arrived();
        return new Promise<null>((resolve) => signal.addEventListener("abort", () => resolve(null), { once: true }));
      },
    }),
  );
  const endpoint = base + "/mcp";
  const token = "persistent-fixture-token";
  tokens.addHash(TokenTable.hashHex(token), "http", "mcp-fixture");
  const first = await openMcpSession(endpoint, token);
  const second = await openMcpSession(endpoint, token);
  const identity = async (handle: string) => {
    const response = await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: "fixture_session" }), handle);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { structuredContent: { data: { caller: "http"; subject: string; current: boolean; session: unknown } } } };
    return body.result.structuredContent.data;
  };
  const a = await identity(first);
  const b = await identity(second);
  expect(a).toMatchObject({ current: true, session: { entry: "mcp-http", credentialId: expect.any(String), vaultInstance: "fixture-vault-instance" } });
  expect(a.subject).not.toBe(b.subject);
  expect(JSON.stringify(a)).not.toContain(first);
  expect(tokens.hasPrincipal(a.caller, a.subject)).toBe(false);

  const request = mcpRpc("tools/call", { name: "fixture_pending" });
  const pending = mcpRequest(endpoint, token, request, first);
  await arrival;
  expect((await mcpRequest(endpoint, token, request, first)).status).toBe(400);
  expect((await mcpRequest(endpoint, token, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: request.id } }, first)).status).toBe(202);
  expect((await pending).status).toBe(200);
  expect(await identity(first)).toEqual(a);

  const expires = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
  try {
    expect(server.hasMcpPrincipal(a.caller, a.subject)).toBe(false);
    expect((await mcpRequest(endpoint, token, mcpRpc("tools/list"), first)).status).toBe(404);
  } finally {
    expires.mockRestore();
  }
  const fresh = await openMcpSession(endpoint, token);
  const active = await identity(fresh);
  service.abort();
  service = new AbortController();
  expect(server.hasMcpPrincipal(b.caller, b.subject)).toBe(false);
  expect(server.hasMcpPrincipal(active.caller, active.subject)).toBe(false);
  expect((await mcpRequest(endpoint, token, mcpRpc("tools/list"), fresh)).status).toBe(404);
  const replacement = await openMcpSession(endpoint, token);
  const live = await identity(replacement);
  tokens.removeHash(TokenTable.hashHex(token));
  expect(server.hasMcpPrincipal(live.caller, live.subject)).toBe(false);
  expect((await mcpRequest(endpoint, token, mcpRpc("tools/list"), replacement)).status).toBe(401);
});

describe("独立 Web 监听器", () => {
  test("自动分配尝试跳过 Fetch 禁用的端口，指定禁用端口有明确结果", async () => {
    const server = createServer((_request, response) => response.end("listening"));
    const listen = vi.spyOn(server, "listen");
    vi.spyOn(server, "address").mockReturnValueOnce({ address: "127.0.0.1", family: "IPv4", port: 10080 });
    const web = new WebListener((_request, response) => response.end());
    try {
      const active = await listenHttp(server, "127.0.0.1", 0);
      expect(listen.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(active.port).not.toBe(10080);
      expect(await (await fetch(`http://127.0.0.1:${active.port}`)).text()).toBe("listening");
      expect(await web.start({ mode: "local", port: 10080 })).toEqual({ state: "error", config: { mode: "local", port: 10080 }, reason: "browser-blocked-port" });
    } finally {
      if (server.listening) await closeHttp(server);
      await web.stop();
    }
  });

  test("默认关闭，使用本机自动端口，停止后断开分享并保留 Engine 控制端", async () => {
    const { base, port, tokens } = await boot();
    let requestArrived!: () => void;
    const received = new Promise<void>((resolve) => {
      requestArrived = resolve;
    });
    const web = new WebListener((req, res) => {
      if (req.url === "/hold") {
        requestArrived();
        return;
      }
      res.end("desktop share");
    });
    try {
      expect(web.status()).toEqual({ state: "stopped" });
      await expect(web.start({ mode: "other", port: 0 } as unknown as WebListenerConfig)).rejects.toThrow("Web 监听范围无效");
      await expect(web.start({ mode: "local", port: -1 })).rejects.toThrow("Web 服务端口无效");
      expect(web.status()).toEqual({ state: "stopped" });
      const failed = await web.start({ mode: "local", port });
      expect(failed).toEqual({ state: "error", config: { mode: "local", port }, reason: "port-in-use" });

      const config = { mode: "local", port: 0 } as const;
      const first = await web.start(config);
      expect(first.state).toBe("running");
      if (first.state !== "running") throw new Error("Web listener did not start");
      expect(first.port).toBeGreaterThan(0);
      const url = `http://127.0.0.1:${first.port}`;
      expect(first.addresses).toEqual([{ url, interfaceName: null }]);
      expect(await web.start(config)).toEqual(first);
      expect(await (await fetch(url)).text()).toBe("desktop share");

      const held = fetch(`${url}/hold`).then(
        () => "completed",
        () => "disconnected",
      );
      await received;
      expect(await web.stop()).toEqual({ state: "stopped" });
      expect(await held).toBe("disconnected");
      await expect(fetch(url)).rejects.toThrow();
      expect((await call(base, tokens.issue("desktop"), REQ)).status).toBe(200);

      const rebound = await web.start({ mode: "local", port: first.port });
      expect(rebound).toMatchObject({ state: "running", port: first.port, addresses: first.addresses });
      expect(rebound).not.toMatchObject({ generation: first.generation });
    } finally {
      await web.stop();
    }
  });

  test("显式开启 LAN 后按实际协议列出地址和接口，网卡消失后移除地址", async () => {
    let entries: NetworkInterfaceInfo[] = [
      { address: "192.0.2.10", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: "192.0.2.10/24" },
      { address: "2001:db8::20", family: "IPv6", internal: false, netmask: "ffff:ffff:ffff:ffff::", mac: "00:00:00:00:00:00", cidr: "2001:db8::20/64", scopeid: 0 },
      { address: "fe80::30", family: "IPv6", internal: false, netmask: "ffff:ffff:ffff:ffff::", mac: "00:00:00:00:00:00", cidr: "fe80::30/64", scopeid: 1 },
    ];
    const web = new WebListener(
      (_req, res) => res.end("LAN share"),
      () => ({ Ethernet: entries }),
    );
    try {
      const local = await web.start({ mode: "local", port: 0 });
      expect(local).toMatchObject({ state: "running", addresses: [{ interfaceName: null }] });
      const lan = await web.start({ mode: "lan", port: 0 });
      expect(lan.state).toBe("running");
      if (lan.state !== "running") throw new Error("LAN listener did not start");
      const { port } = lan;
      expect(lan.addresses).toContainEqual({ url: `http://192.0.2.10:${port}`, interfaceName: "Ethernet" });
      expect(lan.addresses.some(({ url }) => url.includes("fe80::30"))).toBe(false);
      expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe("LAN share");
      if (lan.addresses.some(({ url }) => url.includes("[::1]"))) {
        expect(lan.addresses).toContainEqual({ url: `http://[2001:db8::20]:${port}`, interfaceName: "Ethernet" });
        expect(await (await fetch(`http://[::1]:${port}`)).text()).toBe("LAN share");
      } else {
        expect(lan.addresses.some(({ url }) => url.includes("2001:db8"))).toBe(false);
      }
      entries = [];
      expect(web.status()).toEqual({ ...lan, addresses: lan.addresses.filter(({ interfaceName }) => interfaceName === null) });
    } finally {
      await web.stop();
    }
  });
});

describe("HTTP", () => {
  test("healthz 无需令牌", async () => {
    const { base } = await boot();
    expect(await (await fetch(`${base}/healthz`)).text()).toBe("ok");
  });
  test("ACC-PL-08 401：无令牌/错误令牌", async () => {
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
  test("ACC-PL-08 403：非法 Origin（https://evil.example）、转发头；Host 不符", async () => {
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
    ws.on("unexpected-response", (_r, res) => {
      res.resume();
      reject(new Error(`status ${res.statusCode}`));
    });
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
  test("工作台事件身份矩阵在工具开放、关闭和重连时一致", async () => {
    const choices = { "vault.info": true };
    const mcp = new AbortController();
    let enabled = true;
    const { tokens, port, base } = await boot({ service: () => mcp.signal, enabled: () => enabled, choices });
    const credentials = (["cli", "mcp", "http", "plugin:fixture", "web:fixture"] as const).map((caller) => tokens.issue(caller));
    const check = async () => {
      for (const token of credentials) {
        await expect(openWs(port, token)).rejects.toThrow(/403/);
        await expect(openWs(port, token, "?lastSeq=0")).rejects.toThrow(/403/);
      }
    };
    expect(await (await call(base, credentials[0]!, REQ)).json()).toMatchObject({ ok: true });
    await check();
    choices["vault.info"] = false;
    enabled = false;
    mcp.abort();
    expect(await (await call(base, credentials[0]!, REQ)).json()).toMatchObject({ ok: false });
    await check();
    const desktop = tokens.issue("desktop");
    const { ws } = await openWs(port, desktop);
    ws.close();
  });

  test("撤销工作台凭据仅关闭该凭据的事件流", async () => {
    const { tokens, port, events } = await boot();
    const first = tokens.issue("desktop");
    const second = tokens.issue("desktop");
    const a = await openWs(port, first);
    const b = await openWs(port, second);
    const closed = once(a.ws, "close");
    tokens.removeHash(TokenTable.hashHex(first));
    await closed;
    events.publish("entity.changed", { kind: "task", id: "fixture", op: "created" });
    await expect.poll(() => b.msgs.at(-1)?.type).toBe("entity.changed");
    await expect(openWs(port, first)).rejects.toThrow(/401/);
    expect(b.ws.readyState).toBe(WebSocket.OPEN);
    b.ws.close();
  });

  test("慢连接积压受限，快连接持续收齐，旧序号重连获得快照信号", async () => {
    const { tokens, events, port, server } = await boot();
    const token = tokens.issue("desktop");
    const slow = await openWs(port, token);
    const fast = await openWs(port, token);
    await expect.poll(() => slow.msgs[0]?.type).toBe("hello");
    slow.ws.pause();
    const sizes = new Map<WebSocket, number>();
    const actualSend = WebSocket.prototype.send;
    const spy = vi.spyOn(WebSocket.prototype, "send").mockImplementation(function (this: WebSocket, data, ...options) {
      if (typeof data === "string") sizes.set(this, Math.max(sizes.get(this) ?? 0, this.bufferedAmount + Buffer.byteLength(data) + 10));
      Reflect.apply(actualSend, this, [data, ...options]);
    });
    const count = 128;
    const bodyLength = 64 * 1024;
    try {
      for (let seq = 0; seq < count; seq++) {
        events.publish("vault.fileChanged", { path: "fixture/" + "x".repeat(bodyLength) + String(seq), change: "modified" });
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      await expect.poll(server.activeConnections).toBe(1);
      await expect.poll(() => fast.msgs.filter(({ type }) => type === "vault.fileChanged").length).toBe(count);
      expect(fast.msgs.filter(({ type }) => type === "vault.fileChanged").map(({ seq }) => seq)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
      const maxQueued = Math.max(...sizes.values());
      expect(maxQueued).toBeGreaterThan(EVENT_SOCKET_BYTES / 2);
      expect(maxQueued).toBeLessThanOrEqual(EVENT_SOCKET_BYTES);
      console.info(`F18 本地慢连接，${count * bodyLength} B 合成载荷，发送前峰值估计 ${maxQueued} B，快连接完整收到 ${count} 帧`);
      const reconnected = await openWs(port, token, "?lastSeq=0");
      await expect.poll(() => reconnected.msgs.at(0)).toMatchObject({ type: "resync", seq: count });
      reconnected.ws.close();
    } finally {
      spy.mockRestore();
      slow.ws.resume();
      slow.ws.terminate();
      fast.ws.terminate();
    }
  });

  test("巨大事件变为 resync，补发按字节淘汰后仍能继续收新事件", async () => {
    const replay = new EventReplay();
    const event = { id: "evt", vaultId: "v", type: "vault.fileChanged", at: "", payload: { path: "x".repeat(64 * 1024), change: "modified" } } as const;
    for (let i = 0; i < 100; i++) replay.push(event);
    expect(replay.since(0)).toEqual({ resync: true });
    const tail = replay.since(100 - 4);
    expect(tail.resync).toBe(false);
    expect(!tail.resync && tail.events.reduce((total, { frame }) => total + frame.bytes, 0)).toBeLessThan(EVENT_REPLAY_BYTES);
    expect(replay.push({ ...event, payload: { ...event.payload, path: "x".repeat(EVENT_SOCKET_BYTES) } })).not.toHaveProperty("frame");
    expect(replay.since(100)).toEqual({ resync: true });
    replay.push(event);
    expect(replay.since(101)).toMatchObject({ resync: false, events: [{ seq: 102 }] });
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
