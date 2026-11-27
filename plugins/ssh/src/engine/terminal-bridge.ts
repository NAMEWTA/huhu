import type { HuhuApi } from "@huhu/kernel";
import type { WebSocket } from "ws";
import { z } from "zod";
import type { SshManager } from "./manager.js";
import { MAX_WORKSPACE_PANES } from "../shared/workspace.js";

export type SshTerminalAttacher = Pick<SshManager, "attachShell">["attachShell"];
type View = { cols: number; rows: number; observe: boolean; allowHandoff?: boolean };
const HandoffId = z.uuidv4();
type Claim = { socket: WebSocket; resize(): void };
type Member = { source: WebSocket; claim?: Claim };
type Handoff = { id: string; size: number; members: Map<string, Member>; expiry: ReturnType<typeof setTimeout> };
const maxBufferedOutput = 4 * 1024 * 1024;
const size = (point: number, min: number, max: number) => Math.min(max, Math.max(min, point));
const message = (socket: WebSocket, payload: object) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
};

export function makeSshTerminalBridge(attachShell: SshTerminalAttacher) {
  const controllers = new Map<string, WebSocket>();
  const waiting = new Map<string, Set<WebSocket>>();
  const handoffs = new Map<string, Handoff>();
  const prepared = new Map<string, Handoff>();
  const active = new Map<WebSocket, Handoff>();

  function clearHandoff(group: Handoff) {
    clearTimeout(group.expiry);
    handoffs.delete(group.id);
    for (const shell of group.members.keys()) if (prepared.get(shell) === group) prepared.delete(shell);
  }

  function release(shell: string, socket: WebSocket, origin?: WebSocket) {
    if (controllers.get(shell) !== socket) return;
    controllers.delete(shell);
    if (origin && origin.readyState === origin.OPEN) {
      controllers.set(shell, origin);
      message(origin, { type: "mode", mode: "control" });
    } else {
      const next = [...(waiting.get(shell) ?? [])].find((candidate) => candidate.readyState === candidate.OPEN);
      if (next) message(next, { type: "mode", mode: "control-free" });
    }
  }

  function restore(group: Handoff) {
    for (const [shell, { source, claim }] of group.members) {
      if (!claim) continue;
      active.delete(claim.socket);
      release(shell, claim.socket, source);
    }
    for (const { claim } of group.members.values()) {
      if (claim && claim.socket.readyState === claim.socket.OPEN) claim.socket.close(1000, "handoff ended");
    }
  }
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
        const pending = prepared.get(shellId);
        if (pending) clearHandoff(pending);
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
      if (overflowed || socket.readyState !== socket.OPEN) return;
      const source = controllers.get(shellId);
      if (binary) {
        if (source !== socket) return;
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
        if (bytes.length) attachment.write(bytes);
        return;
      }
      try {
        const event = JSON.parse(String(data)) as { type?: string; cols?: number; rows?: number; id?: string; members?: number };
        const { cols, rows } = event;
        if (request.allowHandoff && event.type === "prepare-handoff" && source === socket && HandoffId.safeParse(event.id).success) {
          const id = event.id!;
          const count = event.members ?? 1;
          if (!Number.isInteger(count) || count < 1 || count > MAX_WORKSPACE_PANES || active.has(source)) return;
          const old = prepared.get(shellId);
          if (old && old.id !== id) clearHandoff(old);
          let group = handoffs.get(id);
          if (!group) {
            const expiry = setTimeout(() => clearHandoff(group!), 20_000);
            expiry.unref();
            group = { id, size: count, members: new Map(), expiry };
            handoffs.set(id, group);
          }
          if (group.size !== count || (!group.members.has(shellId) && group.members.size >= group.size)) return;
          if (!group.members.has(shellId)) group.members.set(shellId, { source });
          prepared.set(shellId, group);
          message(socket, { type: "handoff-prepared", id: event.id });
          return;
        }
        if (request.allowHandoff && request.observe && event.type === "claim-handoff") {
          const group = prepared.get(shellId);
          const member = group?.members.get(shellId);
          if (!source || !group || !member || member.claim || member.source !== source || group.id !== event.id || source.readyState !== source.OPEN) {
            socket.close(4403, "原终端未授权输入交接");
            return;
          }
          member.claim = { socket, resize: () => attachment.resize(size(request.cols, 1, 500), size(request.rows, 1, 300)) };
          if (group.members.size !== group.size || [...group.members.values()].some(({ claim }) => !claim)) return;
          clearHandoff(group);
          const members = [...group.members];
          if (members.some(([shell, { source: origin, claim }]) => origin.readyState !== origin.OPEN || controllers.get(shell) !== origin || claim!.socket.readyState !== claim!.socket.OPEN)) {
            for (const [, { claim }] of members) claim!.socket.close(4403, "原工作区已变更");
            return;
          }
          for (const [shell, { claim }] of members) {
            controllers.set(shell, claim!.socket);
            active.set(claim!.socket, group);
          }
          for (const [, { source: origin, claim }] of members) {
            message(origin, { type: "mode", mode: "observe" });
            message(claim!.socket, { type: "mode", mode: "control" });
            if (group.size === 1) claim!.resize();
          }
          return;
        }
        if (source !== socket) return;
        if (event.type === "resize" && Number.isInteger(cols) && Number.isInteger(rows) && cols! > 0 && rows! > 0) {
          attachment.resize(size(cols!, 1, 500), size(rows!, 1, 300));
        }
      } catch {
        // Text frames outside the terminal protocol carry no input.
      }
    });
    socket.once("close", () => {
      attachment.detach();
      const pending = prepared.get(shellId);
      const member = pending?.members.get(shellId);
      if (pending && (member?.source === socket || member?.claim?.socket === socket)) clearHandoff(pending);
      const views = waiting.get(shellId);
      views?.delete(socket);
      if (!views?.size) waiting.delete(shellId);
      const group = active.get(socket);
      if (group) restore(group);
      else release(shellId, socket);
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
