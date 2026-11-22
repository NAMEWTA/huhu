import { attachTerminal } from "@huhu/herdr-client";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { HerdrCore } from "./herdr-core.js";
import type { SessionsService } from "./sessions.js";
import type { InputOwnership } from "./input-ownership.js";

export type TerminalBridge = (sessionId: string, ws: WebSocket, opts: { cols: number; rows: number; observe: boolean }) => Promise<boolean>;

/**
 * Engine 里的终端桥：WebSocket ↔ Herdr attach。
 * 服务端 → 客户端：二进制 = 终端输出；文本 JSON `{type:"closed",reason}` = 程序结束。
 * 客户端 → 服务端：二进制 = 键盘输入；文本 JSON `{type:"resize",cols,rows}`。
 * 关闭 WebSocket 只是 detach，进程继续运行（可从历史重新打开同一个终端）。
 */
export function createTerminalBridge(d: { sessions: SessionsService; core: HerdrCore; ownership?: InputOwnership; signal?: AbortSignal }): TerminalBridge {
  /** 每个会话同一时刻只有一个视图可以输入（ACC-AG-09）：后来的视图自动成为观察者，不能输入、不改变终端尺寸。 */
  const controllers = new Map<string, WebSocket>();
  const demoted = new Map<string, WebSocket[]>(); // 被降级的视图：控制者离开后通知第一个重新连接以接管输入
  return async (sessionId, ws, requested) => {
    if (d.signal?.aborted) return false;
    const s = d.sessions.list().find((x) => x.id === sessionId);
    if (!s?.terminalId) return false;
    const holder = controllers.get(sessionId);
    const taken = holder !== undefined && holder.readyState === holder.OPEN;
    const controlId = !s.controlled && !requested.observe && !taken ? randomUUID() : undefined;
    const recoveryOnly = controlId !== undefined && d.ownership !== undefined && d.sessions.reviewInputPending(sessionId);
    const reconnect = () => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "mode", mode: "control-free" }));
    };
    const release = controlId ? d.ownership?.take(sessionId, "manual", controlId, recoveryOnly ? { onReviewRecovered: reconnect } : undefined) : undefined;
    const controlsView = controlId !== undefined && (d.ownership === undefined || release !== undefined);
    const opts = { ...requested, observe: !controlsView || recoveryOnly };
    if (controlsView) controllers.set(sessionId, ws);
    else if (!requested.observe && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "mode", mode: "observe" })); // 告诉客户端它被降级为观察者
      demoted.set(sessionId, [...(demoted.get(sessionId) ?? []), ws]);
    }
    const releaseControl = () => {
      demoted.set(
        sessionId,
        (demoted.get(sessionId) ?? []).filter((x) => x !== ws),
      );
      if (controllers.get(sessionId) !== ws) return;
      controllers.delete(sessionId);
      const promoteNext = () => {
        const next = (demoted.get(sessionId) ?? []).find((x) => x.readyState === x.OPEN);
        if (next) next.send(JSON.stringify({ type: "mode", mode: "control-free" }));
      };
      if (release) release(promoteNext);
      else promoteNext();
    };
    ws.on("close", releaseControl);
    // attach 是异步的：客户端可能在连上后立刻发送输入，先收进队列，attach 完成后再按序写入
    const queue: { data: Buffer; isBinary: boolean }[] = [];
    let term: Awaited<ReturnType<typeof attachTerminal>> | null = null;
    const handle = (data: Buffer, isBinary: boolean) => {
      if (!term || opts.observe || d.signal?.aborted) return; // 观察者不能输入
      if (isBinary) return data.length <= 1024 * 1024 ? term.write(data) : undefined; // 单条输入过大直接忽略（也避免帧编码异常）
      try {
        const m = JSON.parse(data.toString("utf8")) as { type?: string; cols?: number; rows?: number };
        if (m.type === "resize" && Number.isInteger(m.cols) && Number.isInteger(m.rows)) term.resize(Math.min(500, Math.max(1, m.cols as number)), Math.min(500, Math.max(1, m.rows as number)));
      } catch {
        // 非 JSON 文本帧忽略
      }
    };
    ws.on("error", () => undefined);
    let wsClosed = false;
    ws.on("message", (data, isBinary) => {
      if (wsClosed || d.signal?.aborted) return;
      if (term) handle(Buffer.from(data as Buffer), isBinary);
      else queue.push({ data: Buffer.from(data as Buffer), isBinary });
    });
    const onScopeEnd = () => {
      wsClosed = true;
      queue.length = 0;
      term?.close();
      if (ws.readyState === ws.OPEN) ws.close(1001, "agent-cli disabled");
    };
    d.signal?.addEventListener("abort", onScopeEnd, { once: true });
    ws.on("close", () => {
      d.signal?.removeEventListener("abort", onScopeEnd);
      wsClosed = true;
      term?.close();
    });
    // 发送缓冲超过 4 MiB 时暂停回报 CREDIT（interfaces.md §7）
    let t: Awaited<ReturnType<typeof attachTerminal>>;
    try {
      await d.core.ensure();
      if (wsClosed) return true;
      t = await attachTerminal(d.core.endpoint, { terminal: s.terminalId, cols: opts.cols, rows: opts.rows, observe: opts.observe, canSend: () => ws.bufferedAmount < 4 * 1024 * 1024 });
    } catch (error) {
      d.signal?.removeEventListener("abort", onScopeEnd);
      releaseControl();
      if (wsClosed) return true;
      throw error;
    }
    if (wsClosed) {
      t.close();
      return true;
    }
    t.onData((b) => {
      if (ws.readyState === ws.OPEN) ws.send(b, { binary: true });
    });
    t.onClose((reason) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "closed", reason }));
        ws.close(1000, "terminal closed");
      }
    });
    term = t;
    if (release && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "mode", mode: opts.observe ? "observe" : "control", controlId }));
    for (const m of queue.splice(0)) handle(m.data, m.isBinary);
    return true;
  };
}
