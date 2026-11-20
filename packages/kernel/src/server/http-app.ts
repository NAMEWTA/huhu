import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { errors, type Caller } from "@huhu/contracts";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import type { CapabilityRegistry } from "../capabilities/define.js";
import type { Dispatcher } from "../dispatcher.js";
import type { EventBus } from "../context.js";
import { createMcpServer, resolveMcpToolName } from "../mcp.js";
import { discoverCapabilities, registerCapabilityHttp, unknownTool, type CapabilityHttpEnv } from "./capability-http.js";
import { MAX_BODY_BYTES, MAX_CONCURRENT_PER_TOKEN, RENDERER_ORIGIN, bearerFrom, checkIngress } from "./ingress.js";
import { listenHttp } from "./listen-http.js";
import type { TokenTable } from "./tokens.js";
import type { EventReplay } from "./ws-events.js";
import { attachWorkbenchStreams, type TerminalBridge } from "./ws-workbench.js";

export interface EngineServerDeps {
  dispatcher: Dispatcher;
  registry: CapabilityRegistry;
  tokens: TokenTable;
  events: EventBus;
  /**
   * 终端字节流路由 `/ws/terminal/:sessionId?cols=&rows=&mode=attach|observe`：鉴权与来源检查通过后交给桥接实现
   * （Agent 会话 → Herdr attach；`ssh-` 前缀 → SSH shell）。返回 false 表示会话不存在。
   */
  terminal?: TerminalBridge;
  /** MCP Streamable HTTP（`POST /mcp`，无状态）：未启用时返回 404。令牌身份必须是 mcp 或 http。 */
  mcpHttp?: { enabled(): boolean };
  /** stdio 适配器每次经控制端点读目录、调用或取资源时核对当前开关。 */
  mcpStdioEnabled?(): boolean;
  /** Lifetime of the admitted MCP service configuration. */
  mcpSignal?(): AbortSignal;
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
  const inflight = new Map<Caller, number>();
  let lastActivity = Date.now();
  let port = 0;
  const discover = (caller: Caller) => discoverCapabilities(d.dispatcher, caller);
  const resolveTool = (name: string) => resolveMcpToolName(d.registry.knownNames(), name);

  const app = new Hono<CapabilityHttpEnv>();
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
  registerCapabilityHttp(
    app,
    d.dispatcher,
    (c) => {
      const verdict = checkIngress(c.env.incoming.headers, port);
      if (!verdict.ok) return c.json({ error: verdict.reason }, verdict.status);
      const principal = d.tokens.principal(bearerFrom(c.req.header("authorization")));
      if (principal?.caller === "mcp" && d.mcpStdioEnabled?.() === false) {
        if (c.req.method === "GET" && c.req.path === "/api/v1/capabilities") return c.json([]);
        return c.json({ ok: false, error: errors.permissionDenied("MCP 服务已关闭").toJSON() });
      }
      if (!principal) return c.json({ error: "未授权" }, 401);
      const mcp = principal.caller === "mcp" ? d.mcpSignal?.() : undefined;
      return mcp ? { ...principal, signal: AbortSignal.any([principal.signal, mcp]) } : principal;
    },
    inflight,
    resolveTool,
  );

  const listener = getRequestListener(app.fetch);
  const handleMcp = async (req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> => {
    res.setHeader("cache-control", "no-store");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (!d.mcpHttp?.enabled()) return send(404, { error: "MCP over HTTP 未启用" });
    const verdict = checkIngress(req.headers, port);
    if (!verdict.ok) return send(verdict.status, { error: verdict.reason });
    const principal = d.tokens.principal(bearerFrom(req.headers["authorization"]));
    if (!principal) return send(401, { error: "未授权" });
    const { caller, subject, signal: tokenSignal } = principal;
    const disconnected = new AbortController();
    res.once("close", () => disconnected.abort());
    const mcpSignal = d.mcpSignal?.();
    const signal = AbortSignal.any([tokenSignal, disconnected.signal, ...(mcpSignal ? [mcpSignal] : [])]);
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
    const call = async (capability: string, input: unknown, intentKey?: string) => {
      const revoked = () => ({ ok: false as const, error: errors.permissionDenied("MCP 会话已关闭").toJSON() });
      if (signal.aborted) return revoked();
      const result = await d.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID(), ...(intentKey && { intentKey }) }, signal, subject);
      return signal.aborted ? revoked() : result;
    };
    const mcp = createMcpServer(
      {
        list: () => discover(caller),
        callTool: async (name, input, intentKey) => {
          const capability = resolveTool(name);
          return capability ? call(capability, input, intentKey) : unknownTool(name);
        },
        call,
        operation: (lookup) => d.dispatcher.readOperation(caller, subject, lookup),
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
  const streams = attachWorkbenchStreams(server, {
    events: d.events,
    ...(d.terminal ? { terminal: d.terminal } : {}),
    bearerProtocol: true,
    authorize: (req, terminal) => {
      const verdict = checkIngress(req.headers, port);
      if (!verdict.ok) return { status: verdict.status };
      const protocol = String(req.headers["sec-websocket-protocol"] ?? "")
        .split(",")
        .map((value) => value.trim())
        .find((value) => value.startsWith("bearer."));
      const caller = d.tokens.authenticate(protocol?.slice("bearer.".length));
      if (!caller) return { status: 401 };
      // 回环终端只接受桌面令牌，外部扩展也不能订阅事件流。
      if ((terminal && caller !== "desktop") || caller.startsWith("plugin:")) return { status: 403 };
      lastActivity = Date.now();
      return { caller };
    },
  });

  try {
    port = (await listenHttp(server, "127.0.0.1", d.port ?? 0)).port;
  } catch (error) {
    streams.close();
    throw error;
  }

  return {
    port,
    server,
    replay: streams.replay,
    activeConnections: streams.activeConnections,
    closeConnectionsOf: streams.closeConnectionsOf,
    lastActivity: () => lastActivity,
    close: async () => {
      streams.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
