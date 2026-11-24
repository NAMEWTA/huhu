import { createServer, type IncomingMessage, type Server } from "node:http";
import { MCP_HTTP_PATH, type Caller } from "@huhu/contracts";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import type { CapabilityRegistry } from "../capabilities/define.js";
import type { Dispatcher } from "../dispatcher.js";
import type { EventBus } from "../context.js";
import { resolveMcpToolName } from "../mcp.js";
import { registerCapabilityHttp, type CapabilityHttpEnv } from "./capability-http.js";
import { RENDERER_ORIGIN, bearerFrom, checkIngress } from "./ingress.js";
import { listenHttp } from "./listen-http.js";
import { McpSessions, type McpRecoveryOptions } from "./mcp-http.js";
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
  /** MCP Streamable HTTP（`/mcp`）：未启用时返回 404，使用持久 HTTP 授权。 */
  mcpHttp?: { enabled(): boolean };
  /** Lifetime of the admitted MCP service configuration. */
  mcpSignal?(): AbortSignal;
  /** Stable Vault binding, when available. A listener still owns one Vault without it. */
  vaultInstance?: string;
  /** Local runtime storage and the current persisted Gateway MCP generation. */
  mcpRecovery?: McpRecoveryOptions;
  /** 测试/嵌入时指定端口，默认随机。 */
  port?: number;
}

export interface RunningServer {
  port: number;
  server: Server;
  replay: EventReplay;
  /** 当前 WebSocket 连接数。 */
  activeConnections(): number;
  hasMcpPrincipal(caller: Caller, subject: string): boolean;
  /** 最近一次 HTTP/WS 活动的时间戳。 */
  lastActivity(): number;
  close(): Promise<void>;
}

/** 在 127.0.0.1 上启动 HTTP + WS 服务（interfaces.md §6）。 */
export async function startEngineServer(d: EngineServerDeps): Promise<RunningServer> {
  const inflight = new Map<Caller, number>();
  let lastActivity = Date.now();
  let port = 0;
  const resolveTool = (name: string) => resolveMcpToolName(d.registry.knownNames(), name);

  const sessions = new McpSessions(d, resolveTool);
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
      if (!principal) return c.json({ error: "未授权" }, 401);
      return principal;
    },
    inflight,
  );

  const listener = getRequestListener(app.fetch);
  const server = createServer((req, res) => {
    lastActivity = Date.now();
    const path = req.url?.split("?")[0];
    if (path !== MCP_HTTP_PATH) {
      void listener(req, res);
      return;
    }
    const refuse = (status: number, message: string) => {
      res.writeHead(status, { "cache-control": "no-store", "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    };
    if (!sessions.enabled()) return refuse(404, "MCP 服务未启用");
    const verdict = checkIngress(req.headers, port);
    if (!verdict.ok) return refuse(verdict.status, verdict.reason);
    const credential = d.tokens.principal(bearerFrom(req.headers["authorization"]));
    if (!credential) return refuse(401, "未授权");
    if (credential.caller !== "http") return refuse(403, "该令牌身份不能使用 MCP 服务");
    void sessions.handle(credential, req, res).catch(() => {
      if (!res.headersSent && !res.destroyed) refuse(500, "MCP 请求失败");
    });
  });
  const streams = attachWorkbenchStreams(server, {
    events: d.events,
    ...(d.terminal ? { terminal: d.terminal } : {}),
    bearerProtocol: true,
    authorize: (req) => {
      const verdict = checkIngress(req.headers, port);
      if (!verdict.ok) return { status: verdict.status };
      const protocol = String(req.headers["sec-websocket-protocol"] ?? "")
        .split(",")
        .map((value) => value.trim())
        .find((value) => value.startsWith("bearer."));
      const principal = d.tokens.principal(protocol?.slice("bearer.".length));
      if (!principal) return { status: 401 };
      // The loopback listener owns desktop subscriptions. Invited Web sessions
      // enter through their separate listener and supply the invitation lifetime.
      if (principal.caller !== "desktop") return { status: 403 };
      lastActivity = Date.now();
      return principal;
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
    hasMcpPrincipal: (caller, subject) => sessions.hasPrincipal(caller, subject),
    lastActivity: () => lastActivity,
    close: async () => {
      sessions.close();
      streams.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
