import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { CapabilityRequestSchema, toJsonSchema, type Caller } from "@huhu/contracts";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { CapabilityRegistry } from "../capabilities/define.js";
import type { Dispatcher } from "../dispatcher.js";
import type { EventBus } from "../context.js";
import { createMcpServer } from "../mcp.js";
import { MAX_BODY_BYTES, MAX_CONCURRENT_PER_TOKEN, RENDERER_ORIGIN, bearerFrom, checkIngress } from "./ingress.js";
import type { TokenTable } from "./tokens.js";
import { EventReplay } from "./ws-events.js";

export interface EngineServerDeps {
  dispatcher: Dispatcher;
  registry: CapabilityRegistry;
  tokens: TokenTable;
  events: EventBus;
  /** 当前调用者可见的能力（外部入口按开放状态过滤）。 */
  visibleTo(caller: Caller, name: string): boolean;
  /**
   * 终端字节流路由 `/ws/terminal/:sessionId?cols=&rows=&mode=attach|observe`：鉴权与来源检查通过后交给桥接实现
   * （Agent 会话 → Herdr attach；`ssh-` 前缀 → SSH shell）。返回 false 表示会话不存在。
   */
  terminal?(sessionId: string, ws: import("ws").WebSocket, opts: { cols: number; rows: number; observe: boolean }): Promise<boolean> | boolean;
  /** MCP Streamable HTTP（`POST /mcp`，无状态）：未启用时返回 404。令牌身份必须是 mcp 或 http。 */
  mcpHttp?: { enabled(): boolean };
  /** 测试/嵌入时指定端口，默认随机。 */
  port?: number;
}

export interface RunningServer {
  port: number;
  server: Server;
  replay: EventReplay;
  /** 当前 WebSocket 连接数。 */
  activeConnections(): number;
  /** 令牌被撤销后关闭该身份已建立的 WebSocket 连接。 */
  closeConnectionsOf(caller: Caller): void;
  /** 最近一次 HTTP/WS 活动的时间戳。 */
  lastActivity(): number;
  close(): Promise<void>;
}

/** 在 127.0.0.1 上启动 HTTP + WS 服务（interfaces.md §6）。 */
export async function startEngineServer(d: EngineServerDeps): Promise<RunningServer> {
  const replay = new EventReplay();
  const unsub = d.events.subscribe((e) => {
    const s = replay.push(e);
    const frame = JSON.stringify({ seq: s.seq, ...s.event });
    for (const c of wss.clients) if (c.readyState === 1) c.send(frame);
  });
  const inflight = new Map<Caller, number>();
  let lastActivity = Date.now();
  let port = 0;

  const app = new Hono();
  app.get("/healthz", (c) => c.text("ok"));

  app.use("*", async (c, next) => {
    lastActivity = Date.now();
    // CORS 只对 Renderer 源开放；预检请求不带令牌，故在鉴权之前处理
    const origin = c.req.header("origin");
    if (origin === RENDERER_ORIGIN) {
      const cors = { "access-control-allow-origin": RENDERER_ORIGIN, vary: "Origin" };
      if (c.req.method === "OPTIONS") {
        const raw = c.env as { incoming: IncomingMessage };
        const verdict = checkIngress(raw.incoming.headers, port);
        if (!verdict.ok) return c.json({ error: verdict.reason }, verdict.status);
        return c.body(null, 204, { ...cors, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "600" });
      }
      await next();
      for (const [k, v] of Object.entries(cors)) c.res.headers.set(k, v);
      return;
    }
    await next();
  });
  app.use("/api/*", async (c, next) => {
    const raw = c.env as { incoming: IncomingMessage };
    const verdict = checkIngress(raw.incoming.headers, port);
    if (!verdict.ok) return c.json({ error: verdict.reason }, verdict.status);
    const caller = d.tokens.authenticate(bearerFrom(c.req.header("authorization")));
    if (!caller) return c.json({ error: "未授权" }, 401);
    c.set("caller" as never, caller as never);
    await next();
  });

  app.post("/api/v1/call", async (c) => {
    const caller = c.get("caller" as never) as Caller;
    const declared = Number(c.req.header("content-length") ?? 0);
    if (Number.isNaN(declared) || declared > MAX_BODY_BYTES) return c.json({ error: "请求体过大" }, 413);
    // 边读边计数：不带 Content-Length（chunked）的请求超过上限时立即中止，不缓冲全部内容
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = c.req.raw.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          await reader.cancel();
          return c.json({ error: "请求体过大" }, 413);
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks);
    let body: unknown;
    try {
      body = JSON.parse(buf.toString("utf8"));
    } catch {
      return c.json({ error: "请求不是合法 JSON" }, 400);
    }
    const req = CapabilityRequestSchema.safeParse(body);
    if (!req.success) return c.json({ error: "请求格式错误", issues: req.error.issues }, 400);
    const n = inflight.get(caller) ?? 0;
    if (n >= MAX_CONCURRENT_PER_TOKEN) return c.json({ error: "并发调用过多" }, 429);
    inflight.set(caller, n + 1);
    try {
      return c.json(await d.dispatcher.call(caller, req.data, c.req.raw.signal));
    } finally {
      inflight.set(caller, (inflight.get(caller) ?? 1) - 1);
    }
  });

  app.get("/api/v1/capabilities", (c) => {
    const caller = c.get("caller" as never) as Caller;
    return c.json(
      d.registry
        .list()
        .filter((def) => d.visibleTo(caller, def.name))
        .map((def) => ({ name: def.name, plugin: def.plugin, scope: def.scope, input: toJsonSchema(def.input), output: toJsonSchema(def.output) })),
    );
  });

  const listener = getRequestListener(app.fetch);
  const handleMcp = async (req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (!d.mcpHttp?.enabled()) return send(404, { error: "MCP over HTTP 未启用" });
    const verdict = checkIngress(req.headers, port);
    if (!verdict.ok) return send(verdict.status, { error: verdict.reason });
    const caller = d.tokens.authenticate(bearerFrom(req.headers["authorization"]));
    if (!caller) return send(401, { error: "未授权" });
    if (caller !== "mcp" && caller !== "http") return send(403, { error: "该令牌身份不能使用 MCP 服务" });
    if (req.method !== "POST") return send(405, { error: "仅支持 POST" });
    const n = inflight.get(caller) ?? 0;
    if (n >= MAX_CONCURRENT_PER_TOKEN) return send(429, { error: "并发调用过多" });
    inflight.set(caller, n + 1);
    res.on("close", () => inflight.set(caller, Math.max(0, (inflight.get(caller) ?? 1) - 1)));
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of req) {
      total += (c as Buffer).length;
      if (total > MAX_BODY_BYTES) return send(413, { error: "请求体过大" });
      chunks.push(c as Buffer);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send(400, { error: "请求不是合法 JSON" });
    }
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const mcp = createMcpServer(
      {
        list: () =>
          d.registry
            .list()
            .filter((c) => d.visibleTo(caller, c.name))
            .map((c) => ({ name: c.name, plugin: c.plugin, scope: c.scope, input: toJsonSchema(c.input) })),
        call: (capability, input) => d.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
      },
      "0.0.1",
    );
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true } as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]); // 无状态：不生成会话 id;
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  };
  const server = createServer((req, res) => {
    lastActivity = Date.now();
    if (req.url?.split("?")[0] === "/mcp")
      void handleMcp(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    else void listener(req, res);
  });
  const byCaller = new Map<Caller, Set<import("ws").WebSocket>>();
  const track = (who: Caller, ws: import("ws").WebSocket) => {
    const set = byCaller.get(who) ?? new Set();
    set.add(ws);
    byCaller.set(who, set);
    ws.on("close", () => set.delete(ws));
  };
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024, handleProtocols: (protocols) => [...protocols].find((p) => p.startsWith("bearer.")) ?? false });

  server.on("upgrade", (req, socket, head) => {
    const reject = (status: number) => {
      socket.write(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const termMatch = /^\/ws\/terminal\/([A-Za-z0-9._-]{1,64})$/.exec(url.pathname);
    if (url.pathname !== "/ws/events" && !(termMatch && d.terminal)) return reject(404);
    const verdict = checkIngress(req.headers, port);
    if (!verdict.ok) return reject(verdict.status);
    const proto = String(req.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .find((s) => s.startsWith("bearer."));
    const who = d.tokens.authenticate(proto?.slice("bearer.".length));
    if (!who) return reject(401);
    // 终端流承载 Agent/SSH 执行，永不对外（security.md §1）：只有桌面身份可以连接
    if (termMatch && who !== "desktop") return reject(403);
    // 事件流载荷（任务标题、文件路径、通知……）不受权限表约束：外部扩展令牌不能订阅
    if (who.startsWith("plugin:")) return reject(403);
    if (termMatch && d.terminal) {
      const dims = (k: string, def: number) => Math.min(500, Math.max(1, Number(url.searchParams.get(k)) || def));
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("error", () => undefined);
        track(who, ws);
        void Promise.resolve(d.terminal!(termMatch[1] as string, ws, { cols: dims("cols", 80), rows: dims("rows", 24), observe: url.searchParams.get("mode") === "observe" }))
          .then((ok) => {
            if (!ok) ws.close(4404, "会话不存在");
          })
          .catch(() => ws.close(1011, "终端桥接失败"));
      });
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", () => undefined);
      track(who, ws);
      const last = url.searchParams.get("lastSeq");
      const epoch = url.searchParams.get("epoch");
      if (last !== null) {
        const r = epoch !== null && epoch !== replay.epoch ? ({ resync: true } as const) : replay.since(Number(last));
        if (r.resync) ws.send(JSON.stringify({ type: "resync", seq: replay.lastSeq, epoch: replay.epoch }));
        else for (const e of r.events) ws.send(JSON.stringify({ seq: e.seq, ...e.event }));
      } else ws.send(JSON.stringify({ type: "hello", seq: replay.lastSeq, epoch: replay.epoch }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(d.port ?? 0, "127.0.0.1", resolve);
  });
  port = (server.address() as AddressInfo).port;

  return {
    port,
    server,
    replay,
    activeConnections: () => wss.clients.size,
    closeConnectionsOf: (caller: Caller) => {
      for (const ws of byCaller.get(caller) ?? []) ws.close(4401, "令牌已撤销");
    },
    lastActivity: () => lastActivity,
    close: async () => {
      unsub();
      for (const c of wss.clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
