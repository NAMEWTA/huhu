import type { IncomingMessage, Server } from "node:http";
import { isWorkbenchCaller, type Caller } from "@huhu/contracts";
import { WebSocket, WebSocketServer } from "ws";
import type { EventBus } from "../context.js";
import { EventReplay, EVENT_SOCKET_BYTES, eventFrame, type EventFrame } from "./ws-events.js";

export type TerminalBridge = (sessionId: string, ws: WebSocket, opts: { cols: number; rows: number; observe: boolean }) => Promise<boolean> | boolean;

interface StreamOptions {
  events: EventBus;
  terminal?: TerminalBridge;
  authorize(req: IncomingMessage, terminal: boolean): { caller: Caller; signal: AbortSignal } | { status: number };
  bearerProtocol?: boolean;
}

/**
 * /ws/events returns raw workbench events to desktop or invited Web sessions.
 * Listeners validate their own origin and credential. Revocation terminates all
 * sockets for that credential. Reconnect sends lastSeq/epoch; the listener
 * requests a fresh snapshot if replay is unavailable or exceeds one send budget.
 */
export function attachWorkbenchStreams(server: Server, options: StreamOptions) {
  const replay = new EventReplay();
  const eventClients = new Set<WebSocket>();
  const credentials = new Map<AbortSignal, { clients: Set<WebSocket>; revoke: () => void }>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
    handleProtocols: (protocols) => (options.bearerProtocol ? ([...protocols].find((p) => p.startsWith("bearer.")) ?? false) : false),
  });
  const send = (ws: WebSocket, frame: EventFrame) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount + frame.bytes > EVENT_SOCKET_BYTES) {
      // Termination sheds queued bytes immediately. Reconnect can resume with
      // lastSeq/epoch, or fetch a snapshot if the backlog no longer fits.
      ws.terminate();
      return;
    }
    ws.send(frame.text);
  };
  const resync = () => eventFrame({ type: "resync", seq: replay.lastSeq, epoch: replay.epoch });
  const unsubscribe = options.events.subscribe((event) => {
    const { frame } = replay.push(event);
    const message = frame ?? resync();
    for (const ws of eventClients) send(ws, message);
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
    if (principal.signal.aborted) return reject(401);
    if (!isWorkbenchCaller(principal.caller)) return reject(403);

    wss.handleUpgrade(req, socket, head, (ws) => {
      const { signal } = principal;
      let credential = credentials.get(signal);
      if (!credential) {
        const clients = new Set<WebSocket>();
        const revoke = () => {
          for (const client of clients) client.terminate();
        };
        credential = { clients, revoke };
        credentials.set(signal, credential);
        signal.addEventListener("abort", revoke, { once: true });
      }
      const { clients, revoke } = credential;
      clients.add(ws);
      ws.on("error", () => undefined);
      ws.once("close", () => {
        clients.delete(ws);
        eventClients.delete(ws);
        if (clients.size === 0) {
          credentials.delete(signal);
          signal.removeEventListener("abort", revoke);
        }
      });
      if (signal.aborted) {
        ws.terminate();
        return;
      }

      const terminal = options.terminal;
      if (terminalId && terminal) {
        const dims = (name: string, fallback: number) => Math.min(500, Math.max(1, Math.trunc(Number(url.searchParams.get(name))) || fallback));
        void Promise.resolve()
          .then(() => {
            if (ws.readyState !== WebSocket.OPEN || signal.aborted) return true;
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
        send(ws, eventFrame({ type: "hello", seq: replay.lastSeq, epoch: replay.epoch }));
      } else {
        const result = epoch !== null && epoch !== replay.epoch ? { resync: true as const } : replay.since(Number(last));
        if (result.resync || result.events.reduce((bytes, { frame }) => bytes + frame.bytes, 0) > EVENT_SOCKET_BYTES) {
          send(ws, resync());
        } else {
          for (const { frame } of result.events) send(ws, frame);
        }
      }
    });
  });

  return {
    replay,
    activeConnections: () => wss.clients.size,
    close: () => {
      unsubscribe();
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
