import type { IncomingMessage, Server } from "node:http";
import type { Caller } from "@huhu/contracts";
import { WebSocket, WebSocketServer } from "ws";
import type { EventBus } from "../context.js";
import { EventReplay } from "./ws-events.js";

export type TerminalBridge = (sessionId: string, ws: WebSocket, opts: { cols: number; rows: number; observe: boolean }) => Promise<boolean> | boolean;

interface StreamOptions {
  events: EventBus;
  terminal?: TerminalBridge;
  authorize(req: IncomingMessage, terminal: boolean): { caller: Caller; signal?: AbortSignal } | { status: number };
  bearerProtocol?: boolean;
}

/** 两个监听器共用事件补发和终端桥接，各自验证来源和身份。 */
export function attachWorkbenchStreams(server: Server, options: StreamOptions) {
  const replay = new EventReplay();
  const eventClients = new Set<WebSocket>();
  const byCaller = new Map<Caller, Set<WebSocket>>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
    handleProtocols: (protocols) => (options.bearerProtocol ? ([...protocols].find((p) => p.startsWith("bearer.")) ?? false) : false),
  });
  const unsubscribe = options.events.subscribe((event) => {
    const { seq } = replay.push(event);
    const frame = JSON.stringify({ seq, ...event });
    for (const ws of eventClients) if (ws.readyState === WebSocket.OPEN) ws.send(frame);
  });

  server.on("upgrade", (req, socket, head) => {
    const reject = (status: number) => socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    // 只解释本监听器的 absolute-path 目标。
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) return reject(404);
    const url = new URL(`http://127.0.0.1${req.url}`);
    const terminalId = /^\/ws\/terminal\/([A-Za-z0-9._-]{1,64})$/.exec(url.pathname)?.[1];
    if (url.pathname !== "/ws/events" && !(terminalId && options.terminal)) return reject(404);
    const principal = options.authorize(req, terminalId !== undefined);
    if ("status" in principal) return reject(principal.status);
    if (principal.signal?.aborted) return reject(401);

    wss.handleUpgrade(req, socket, head, (ws) => {
      const { caller, signal } = principal;
      const clients = byCaller.get(caller) ?? new Set<WebSocket>();
      clients.add(ws);
      byCaller.set(caller, clients);
      const revoke = () => ws.terminate();
      signal?.addEventListener("abort", revoke, { once: true });
      ws.on("error", () => undefined);
      ws.once("close", () => {
        clients.delete(ws);
        if (clients.size === 0) byCaller.delete(caller);
        eventClients.delete(ws);
        signal?.removeEventListener("abort", revoke);
      });

      const terminal = options.terminal;
      if (terminalId && terminal) {
        const dims = (name: string, fallback: number) => Math.min(500, Math.max(1, Math.trunc(Number(url.searchParams.get(name))) || fallback));
        void Promise.resolve()
          .then(() => {
            if (ws.readyState !== WebSocket.OPEN || signal?.aborted) return true;
            return terminal(terminalId, ws, { cols: dims("cols", 80), rows: dims("rows", 24), observe: url.searchParams.get("mode") === "observe" });
          })
          .then((ok) => {
            if (!ok) ws.close(4404, "会话不存在");
          })
          .catch(() => ws.close(1011, "终端桥接失败"));
        return;
      }

      eventClients.add(ws);
      const last = url.searchParams.get("lastSeq");
      const epoch = url.searchParams.get("epoch");
      if (last === null) {
        ws.send(JSON.stringify({ type: "hello", seq: replay.lastSeq, epoch: replay.epoch }));
      } else {
        const result = epoch !== null && epoch !== replay.epoch ? { resync: true as const } : replay.since(Number(last));
        if (result.resync) ws.send(JSON.stringify({ type: "resync", seq: replay.lastSeq, epoch: replay.epoch }));
        else for (const { seq, event } of result.events) ws.send(JSON.stringify({ seq, ...event }));
      }
    });
  });

  return {
    replay,
    activeConnections: () => wss.clients.size,
    closeConnectionsOf: (caller: Caller) => {
      for (const ws of byCaller.get(caller) ?? []) ws.close(4401, "令牌已撤销");
    },
    close: () => {
      unsubscribe();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
