import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { CapabilityRequestSchema, toJsonSchema, type Caller } from "@huhu/contracts";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { CapabilityRegistry } from "../capabilities/define.js";
import type { Dispatcher } from "../dispatcher.js";
import type { EventBus } from "../context.js";
import { MAX_BODY_BYTES, MAX_CONCURRENT_PER_TOKEN, bearerFrom, checkIngress } from "./ingress.js";
import type { TokenTable } from "./tokens.js";
import { EventReplay } from "./ws-events.js";

export interface EngineServerDeps {
  dispatcher: Dispatcher;
  registry: CapabilityRegistry;
  tokens: TokenTable;
  events: EventBus;
  /** 当前调用者可见的能力（外部入口按开放状态过滤）。 */
  visibleTo(caller: Caller, name: string): boolean;
  /** 测试/嵌入时指定端口，默认随机。 */
  port?: number;
}

export interface RunningServer {
  port: number;
  server: Server;
  replay: EventReplay;
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
  let port = 0;

  const app = new Hono();
  app.get("/healthz", (c) => c.text("ok"));

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
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_BODY_BYTES) return c.json({ error: "请求体过大" }, 413);
    const buf = await c.req.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) return c.json({ error: "请求体过大" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(buf));
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
  const server = createServer(listener);
  const wss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => ([...protocols].find((p) => p.startsWith("bearer.")) ?? false) });

  server.on("upgrade", (req, socket, head) => {
    const reject = (status: number) => {
      socket.write(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/ws/events") return reject(404);
    const verdict = checkIngress(req.headers, port);
    if (!verdict.ok) return reject(verdict.status);
    const proto = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim()).find((s) => s.startsWith("bearer."));
    if (!d.tokens.authenticate(proto?.slice("bearer.".length))) return reject(401);
    wss.handleUpgrade(req, socket, head, (ws) => {
      const last = url.searchParams.get("lastSeq");
      if (last !== null) {
        const r = replay.since(Number(last));
        if (r.resync) ws.send(JSON.stringify({ type: "resync", seq: replay.lastSeq }));
        else for (const e of r.events) ws.send(JSON.stringify({ seq: e.seq, ...e.event }));
      } else ws.send(JSON.stringify({ type: "hello", seq: replay.lastSeq }));
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
    close: async () => {
      unsub();
      for (const c of wss.clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
