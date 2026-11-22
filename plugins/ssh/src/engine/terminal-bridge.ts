import type { HuhuApi } from "@huhu/kernel";
import type { WebSocket } from "ws";
import type { SshManager } from "./manager.js";

export type SshTerminalAttacher = Pick<SshManager, "attachShell">["attachShell"];
type View = { cols: number; rows: number; observe: boolean };
const maxBufferedOutput = 4 * 1024 * 1024;
const size = (point: number, min: number, max: number) => Math.min(max, Math.max(min, point));
const message = (socket: WebSocket, payload: object) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
};

export function makeSshTerminalBridge(attachShell: SshTerminalAttacher) {
  const controllers = new Map<string, WebSocket>();
  const waiting = new Map<string, Set<WebSocket>>();
  return async (shellId: string, socket: WebSocket, request: View) => {
    const holder = controllers.get(shellId);
    const controls = !request.observe && (!holder || holder.readyState !== holder.OPEN);
    let overflowed = false;
    const attachment = attachShell(shellId, {
      onData: (data) => {
        if (overflowed || socket.readyState !== socket.OPEN) return;
        if (socket.bufferedAmount + data.length > maxBufferedOutput) {
          overflowed = true;
          // Replay may call onData before attachShell returns its detach handle.
          queueMicrotask(() => socket.terminate());
          return;
        }
        socket.send(data, { binary: true });
      },
      onEnd: () => {
        if (controllers.get(shellId) === socket) controllers.delete(shellId);
        waiting.delete(shellId);
        message(socket, { type: "closed", reason: { reason: "exited" } });
        if (socket.readyState === socket.OPEN) socket.close(1000, "shell ended");
      },
    });
    if (!attachment) return false;
    if (overflowed) {
      attachment.detach();
      return true;
    }
    if (controls) {
      controllers.set(shellId, socket);
      message(socket, { type: "mode", mode: "control" });
      attachment.resize(size(request.cols, 1, 500), size(request.rows, 1, 300));
    } else if (!request.observe) {
      message(socket, { type: "mode", mode: "observe" });
      const views = waiting.get(shellId) ?? new Set<WebSocket>();
      views.add(socket);
      waiting.set(shellId, views);
    }

    socket.on("error", () => undefined);
    socket.on("message", (data, binary) => {
      if (overflowed || controllers.get(shellId) !== socket || socket.readyState !== socket.OPEN) return;
      if (binary) {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
        if (bytes.length) attachment.write(bytes);
        return;
      }
      try {
        const event = JSON.parse(String(data)) as { type?: string; cols?: number; rows?: number };
        const { cols, rows } = event;
        if (event.type === "resize" && Number.isInteger(cols) && Number.isInteger(rows) && cols! > 0 && rows! > 0) {
          attachment.resize(size(cols!, 1, 500), size(rows!, 1, 300));
        }
      } catch {
        // Text frames outside the terminal protocol carry no input.
      }
    });
    socket.once("close", () => {
      attachment.detach();
      const views = waiting.get(shellId);
      views?.delete(socket);
      if (!views?.size) waiting.delete(shellId);
      if (controllers.get(shellId) !== socket) return;
      controllers.delete(shellId);
      const next = [...(views ?? [])].find((candidate) => candidate.readyState === candidate.OPEN);
      if (next) message(next, { type: "mode", mode: "control-free" });
    });
    return true;
  };
}

export function registerSshTerminalBridge(api: HuhuApi, manager: SshManager, local?: SshTerminalAttacher): void {
  api.provide(
    "terminalBridge:ssh",
    makeSshTerminalBridge((id, view) => manager.attachShell(id, view) ?? local?.(id, view) ?? null),
  );
}
