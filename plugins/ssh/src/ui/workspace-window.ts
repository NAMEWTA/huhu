import type { TerminalConnection } from "@huhu/ui";
import type { SshWorkspacePaneAddress, WorkspaceWindowHost } from "@huhu/workbench";
import type { SshHandoffEvent, SshHandoffRequest } from "../shared/terminal-handoff.js";

export function sameWorkspacePane(left: SshWorkspacePaneAddress, right: SshWorkspacePaneAddress) {
  return left.vaultId === right.vaultId && left.runId === right.runId && left.generation === right.generation && left.paneId === right.paneId && left.sessionId === right.sessionId;
}

function handoffEvent(message: unknown): SshHandoffEvent | undefined {
  if (message && typeof message === "object" && "type" in message && typeof message.type === "string" && message.type.startsWith("handoff.")) return message as SshHandoffEvent;
}

function requestHandoff<T extends "handoff.prepared" | "handoff.committed">(connection: TerminalConnection, request: SshHandoffRequest, type: T, matches: (event: SshHandoffEvent) => boolean) {
  return new Promise<Extract<SshHandoffEvent, { type: T }> | undefined>((resolve, reject) => {
    const disconnected = () => finish(new Error("原终端连接已断开。"));
    const unsubscribe = connection.subscribe((message) => {
      const event = handoffEvent(message);
      if (!event || !matches(event)) return;
      if (event.type === type) finish(null, event as Extract<SshHandoffEvent, { type: T }>);
      else if (event.type === "handoff.cancelled" || (event.type === "handoff.failed" && event.request === request.type)) finish(new Error("当前终端无法完成换窗，请从现有分栏重试。"));
    });
    const timeout = window.setTimeout(() => finish(null), 2_000);
    function finish(error: Error | null, event?: Extract<SshHandoffEvent, { type: T }>) {
      window.clearTimeout(timeout);
      connection.signal.removeEventListener("abort", disconnected);
      unsubscribe();
      if (error) reject(error);
      else resolve(event);
    }
    connection.signal.addEventListener("abort", disconnected, { once: true });
    if (!connection.send(request)) disconnected();
  });
}

export async function moveWorkspacePane(host: WorkspaceWindowHost, target: SshWorkspacePaneAddress, connection: TerminalConnection, cancelSignal: AbortSignal, onCommitting: () => void) {
  const operationId = crypto.randomUUID();
  const prepare = () => requestHandoff(connection, { type: "handoff.prepare", operationId }, "handoff.prepared", (event) => event.operationId === operationId);
  const prepared = (await prepare()) ?? (await prepare());
  if (!prepared) throw new Error("终端未确认换窗请求，请重试。");
  const { ticket } = prepared;
  const signal = AbortSignal.any([cancelSignal, connection.signal]);
  const cancel = () => {
    connection.send({ type: "handoff.cancel", ticket });
    void host.cancel(ticket).catch(() => undefined);
  };
  let submitted = false;
  try {
    signal.throwIfAborted();
    signal.addEventListener("abort", cancel, { once: true });
    const attached = await host.open(target, ticket);
    signal.throwIfAborted();
    if (!attached) throw new Error("新窗口未能附着原分栏。请重试。");
    signal.removeEventListener("abort", cancel);
    onCommitting();
    submitted = true;

    const commit = () => requestHandoff(connection, { type: "handoff.commit", ticket }, "handoff.committed", (event) => event.ticket === ticket);
    const receipt = (await commit()) ?? (await commit());
    if (receipt && (await host.complete(ticket, receipt.targetMode))) return;
    throw new Error("无法确认换窗结果。请查看目标窗口或当前分栏。");
  } catch (error) {
    if (submitted && (await host.moved().catch(() => [])).some((entry) => sameWorkspacePane(entry, target))) return;
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!submitted) cancel();
  }
}

export function attachWorkspacePane(host: WorkspaceWindowHost, ticket: string, connection: TerminalConnection) {
  const cancel = () => void host.cancel(ticket).catch(() => undefined);
  const stop = () => {
    unsubscribe();
    connection.signal.removeEventListener("abort", cancel);
  };
  const unsubscribe = connection.subscribe((message) => {
    const event = handoffEvent(message);
    if (!event || event.ticket !== ticket) return;
    if (event.type === "handoff.claimed") {
      void host.attached(ticket).then((accepted) => {
        if (!accepted) cancel();
      }, cancel);
    } else if (event.type === "handoff.committed") {
      stop();
      void host.complete(ticket, event.targetMode).then(
        (complete) => {
          if (complete) connection.focus();
        },
        () => undefined,
      );
    } else if (event.type === "handoff.cancelled" || (event.type === "handoff.failed" && event.request === "handoff.claim")) {
      stop();
      cancel();
    }
  });
  connection.signal.addEventListener("abort", cancel, { once: true });
  if (!connection.send({ type: "handoff.claim", ticket, ...connection.dimensions() })) {
    stop();
    cancel();
  }
}
