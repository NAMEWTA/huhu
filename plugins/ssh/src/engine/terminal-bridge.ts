import { randomBytes } from "node:crypto";
import type { HuhuApi } from "@huhu/kernel";
import type { WebSocket } from "ws";
import type { SshHandoffCancelReason, SshHandoffEvent, SshHandoffFailure, SshHandoffMode, SshHandoffOutcome, SshHandoffRequest } from "../shared/terminal-handoff.js";
import type { SshManager } from "./manager.js";

export type SshTerminalAttacher = Pick<SshManager, "attachShell">["attachShell"];
type Dimensions = { cols: number; rows: number };
export type SshTerminalView = Dimensions & { observe: boolean; desktopHandoff?: boolean };
type AttachedView = {
  socket: WebSocket;
  requestedObserve: boolean;
  desktopHandoff: boolean;
  dimensions: Dimensions;
  resize: (cols: number, rows: number) => void;
  live: () => boolean;
  receipt?: { event: SshHandoffOutcome; expiresAt: number; timer: ReturnType<typeof setTimeout> } | undefined;
};

type Handoff = {
  source: AttachedView;
  target?: AttachedView;
  prepared: Extract<SshHandoffEvent, { type: "handoff.prepared" }>;
  timer: ReturnType<typeof setTimeout>;
};

const maxBufferedOutput = 4 * 1024 * 1024;
const handoffTtlMs = 30_000;
const maxControlFrameBytes = 1024;
const size = (point: number, min: number, max: number) => Math.min(max, Math.max(min, point));
const message = (socket: WebSocket, payload: SshHandoffEvent | { type: "mode"; mode: SshHandoffMode | "control-free" } | { type: "closed"; reason: { reason: "exited" } }) => {
  if (socket.readyState !== socket.OPEN) return;
  const text = JSON.stringify(payload);
  if (socket.bufferedAmount + Buffer.byteLength(text) > maxBufferedOutput) queueMicrotask(() => socket.terminate());
  else socket.send(text);
};

function dimensions(cols: unknown, rows: unknown): Dimensions | undefined {
  if (typeof cols !== "number" || typeof rows !== "number" || !Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) return;
  return { cols: size(cols, 1, 500), rows: size(rows, 1, 300) };
}

function token(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function applyViewSize(view: AttachedView) {
  const { cols, rows } = view.dimensions;
  try {
    view.resize(cols, rows);
  } catch {
    // A PTY can close while receiving a resize. Role confirmation still describes the bridge.
  }
}

export function makeSshTerminalBridge(attachShell: SshTerminalAttacher) {
  const controllers = new Map<string, WebSocket>();
  const waiting = new Map<string, Set<WebSocket>>();
  const handoffs = new Map<string, Handoff>();

  function role(shellId: string, view: AttachedView): SshHandoffMode {
    return controllers.get(shellId) === view.socket ? "control" : "observe";
  }

  function removeWaiting(shellId: string, socket: WebSocket) {
    const views = waiting.get(shellId);
    views?.delete(socket);
    if (!views?.size) waiting.delete(shellId);
    return views;
  }

  function clearReceipt(view: AttachedView) {
    if (!view.receipt) return;
    clearTimeout(view.receipt.timer);
    view.receipt = undefined;
  }

  function finish(shellId: string, handoff: Handoff, event: SshHandoffOutcome) {
    handoffs.delete(shellId);
    clearTimeout(handoff.timer);
    const { source } = handoff;
    clearReceipt(source);
    if (!source.live()) return;
    const timer = setTimeout(() => clearReceipt(source), handoffTtlMs);
    timer.unref();
    source.receipt = { event, expiresAt: Date.now() + handoffTtlMs, timer };
  }

  function cancel(shellId: string, handoff: Handoff, reason: SshHandoffCancelReason) {
    const { ticket, operationId } = handoff.prepared;
    const event = { type: "handoff.cancelled", ticket, operationId, reason } as const;
    finish(shellId, handoff, event);
    message(handoff.source.socket, event);
    if (handoff.target) message(handoff.target.socket, event);
  }

  function handleHandoff(shellId: string, view: AttachedView, request: SshHandoffRequest["type"], fields: Record<string, unknown>) {
    const operationId = token(fields["operationId"], /^[A-Za-z0-9._-]{1,64}$/u);
    const ticket = token(fields["ticket"], /^[A-Za-z0-9_-]{32}$/u);
    const fail = (reason: SshHandoffFailure) =>
      message(view.socket, { type: "handoff.failed", request, reason, ...(request === "handoff.prepare" && operationId ? { operationId } : {}), ...(request !== "handoff.prepare" && ticket ? { ticket } : {}) });
    if (!view.desktopHandoff) return fail("not-allowed");

    let pending = handoffs.get(shellId);
    if (pending && Date.now() >= pending.prepared.expiresAt) {
      cancel(shellId, pending, "expired");
      pending = undefined;
    }
    if (view.receipt && Date.now() >= view.receipt.expiresAt) clearReceipt(view);
    const previous = view.receipt?.event;

    if (request === "handoff.prepare") {
      if (!operationId) return fail("malformed");
      if (previous?.operationId === operationId) return message(view.socket, previous);
      if (pending) {
        if (pending.source !== view || pending.prepared.operationId !== operationId) return fail("busy");
        message(view.socket, pending.prepared);
        if (pending.target) message(view.socket, { type: "handoff.claimed", operationId, ticket: pending.prepared.ticket, targetMode: "observe" });
        return;
      }
      const prepared = {
        type: "handoff.prepared",
        operationId,
        ticket: randomBytes(24).toString("base64url"),
        expiresAt: Date.now() + handoffTtlMs,
        targetMode: role(shellId, view),
      } as const;
      const timer = setTimeout(() => {
        const active = handoffs.get(shellId);
        if (active?.prepared === prepared) cancel(shellId, active, "expired");
      }, handoffTtlMs);
      timer.unref();
      handoffs.set(shellId, { source: view, prepared, timer });
      return message(view.socket, prepared);
    }

    if (!ticket) return fail("malformed");
    if (previous?.ticket === ticket && request !== "handoff.claim") return message(view.socket, previous);
    if (pending?.prepared.ticket !== ticket) return fail("invalid-ticket");

    const { prepared, source } = pending;
    if (request === "handoff.claim") {
      if (view === source || !view.requestedObserve || role(shellId, view) !== "observe") return fail("wrong-role");
      if (pending.target && pending.target !== view) return fail("busy");
      if (!source.live() || role(shellId, source) !== prepared.targetMode) {
        cancel(shellId, pending, "source-changed");
        if (!pending.target) fail("invalid-ticket");
        return;
      }
      const cols = fields["cols"];
      const rows = fields["rows"];
      if (cols !== undefined || rows !== undefined) {
        const next = dimensions(cols, rows);
        if (!next) return fail("malformed");
        view.dimensions = next;
      }
      const claimed = { type: "handoff.claimed", operationId: prepared.operationId, ticket, targetMode: "observe" } as const;
      if (!pending.target) {
        pending.target = view;
        message(source.socket, claimed);
      }
      return message(view.socket, claimed);
    }

    const target = pending.target;
    if (request === "handoff.cancel") {
      if (view !== source && view !== target) return fail("wrong-role");
      return cancel(shellId, pending, "cancelled");
    }
    if (view !== source) return fail("wrong-role");
    if (!target) return fail("target-required");
    if (!target.live()) return cancel(shellId, pending, "target-closed");
    if (!source.live() || role(shellId, source) !== prepared.targetMode || role(shellId, target) !== "observe") return cancel(shellId, pending, "source-changed");
    if (target.socket.bufferedAmount > maxBufferedOutput - maxControlFrameBytes) return cancel(shellId, pending, "target-backpressure");

    // The map is changed in one turn. No close/re-attach or control-free gap is involved.
    removeWaiting(shellId, source.socket);
    removeWaiting(shellId, target.socket);
    if (prepared.targetMode === "control") controllers.set(shellId, target.socket);
    const committed = { type: "handoff.committed", operationId: prepared.operationId, ticket, sourceMode: "observe", targetMode: prepared.targetMode } as const;
    finish(shellId, pending, committed);
    if (prepared.targetMode === "control") applyViewSize(target);
    message(source.socket, { type: "mode", mode: "observe" });
    message(target.socket, { type: "mode", mode: prepared.targetMode });
    message(source.socket, committed);
    message(target.socket, committed);
  }

  return async (shellId: string, socket: WebSocket, request: SshTerminalView) => {
    const holder = controllers.get(shellId);
    const controls = !request.observe && (!holder || holder.readyState !== holder.OPEN);
    const desktopHandoff = request.desktopHandoff === true && !shellId.startsWith("ssh-local-") && !shellId.startsWith("ssh-external-");
    let overflowed = false;
    let ended = false;
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
        ended = true;
        const pending = handoffs.get(shellId);
        if (pending) cancel(shellId, pending, "shell-ended");
        if (controllers.get(shellId) === socket) controllers.delete(shellId);
        waiting.delete(shellId);
        message(socket, { type: "closed", reason: { reason: "exited" } });
        if (socket.readyState === socket.OPEN) socket.close(1000, "shell ended");
      },
    });
    if (!attachment) return false;
    if (overflowed || ended || socket.readyState !== socket.OPEN) {
      attachment.detach();
      return true;
    }
    const view: AttachedView = {
      socket,
      desktopHandoff,
      requestedObserve: request.observe,
      dimensions: { cols: size(request.cols, 1, 500), rows: size(request.rows, 1, 300) },
      live: () => !overflowed && !ended && socket.readyState === socket.OPEN,
      resize: (cols, rows) => attachment.resize(cols, rows),
    };
    if (controls) {
      controllers.set(shellId, socket);
      message(socket, { type: "mode", mode: "control" });
      attachment.resize(view.dimensions.cols, view.dimensions.rows);
    } else {
      if (desktopHandoff || !request.observe) message(socket, { type: "mode", mode: "observe" });
    }
    if (!controls && !request.observe) {
      const views = waiting.get(shellId) ?? new Set<WebSocket>();
      views.add(socket);
      waiting.set(shellId, views);
    }

    socket.on("error", () => undefined);
    socket.on("message", (data, binary) => {
      if (!view.live()) return;
      if (binary) {
        if (controllers.get(shellId) !== socket) return;
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
        if (bytes.length) attachment.write(bytes);
        return;
      }
      const text = String(data);
      if (Buffer.byteLength(text) > maxControlFrameBytes) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Text frames outside the terminal protocol carry no input.
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const event = parsed as Record<string, unknown>;
      const type = event["type"];
      if (type === "resize") {
        const next = dimensions(event["cols"], event["rows"]);
        if (!next) return;
        view.dimensions = next;
        if (controllers.get(shellId) === socket) applyViewSize(view);
      } else if (type === "handoff.prepare" || type === "handoff.claim" || type === "handoff.commit" || type === "handoff.cancel") {
        handleHandoff(shellId, view, type, event);
      }
    });
    socket.once("close", () => {
      attachment.detach();
      clearReceipt(view);
      const pending = handoffs.get(shellId);
      if (pending?.source === view) cancel(shellId, pending, "source-closed");
      else if (pending?.target === view) cancel(shellId, pending, "target-closed");
      const views = removeWaiting(shellId, socket);
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
