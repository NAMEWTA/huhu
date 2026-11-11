import { attachTerminal } from "@huhu/herdr-client";
import type { WebSocket } from "ws";
import type { HerdrCore } from "./herdr-core.js";
import type { SessionsService } from "./sessions.js";

export type TerminalBridge = (sessionId: string, ws: WebSocket, opts: { cols: number; rows: number; observe: boolean }) => Promise<boolean>;

/**
 * Engine 里的终端桥：WebSocket ↔ Herdr attach。
 * 服务端 → 客户端：二进制 = 终端输出；文本 JSON `{type:"closed",reason}` = 程序结束。
 * 客户端 → 服务端：二进制 = 键盘输入；文本 JSON `{type:"resize",cols,rows}`。
 * 关闭 WebSocket 只是 detach，进程继续运行（可从历史重新打开同一个终端）。
 */
export function createTerminalBridge(d: { sessions: SessionsService; core: HerdrCore }): TerminalBridge {
  return async (sessionId, ws, opts) => {
    const s = d.sessions.list().find((x) => x.id === sessionId);
    if (!s?.terminalId) return false;
    // attach 是异步的：客户端可能在连上后立刻发送输入，先收进队列，attach 完成后再按序写入
    const queue: { data: Buffer; isBinary: boolean }[] = [];
    let term: Awaited<ReturnType<typeof attachTerminal>> | null = null;
    const handle = (data: Buffer, isBinary: boolean) => {
      if (!term || opts.observe) return; // 观察者不能输入
      if (isBinary) return data.length <= 1024 * 1024 ? term.write(data) : undefined; // 单条输入过大直接忽略（也避免帧编码异常）
      try {
        const m = JSON.parse(data.toString("utf8")) as { type?: string; cols?: number; rows?: number };
        if (m.type === "resize" && Number.isInteger(m.cols) && Number.isInteger(m.rows)) term.resize(Math.min(500, Math.max(1, m.cols as number)), Math.min(500, Math.max(1, m.rows as number)));
      } catch {
        // 非 JSON 文本帧忽略
      }
    };
    ws.on("error", () => undefined);
    ws.on("message", (data, isBinary) => (term ? handle(Buffer.from(data as Buffer), isBinary) : queue.push({ data: Buffer.from(data as Buffer), isBinary })));
    let wsClosed = false;
    ws.on("close", () => {
      wsClosed = true;
      term?.close();
    });
    await d.core.ensure();
    // 发送缓冲超过 4 MiB 时暂停回报 CREDIT（interfaces.md §7）
    const t = await attachTerminal(d.core.endpoint, { terminal: s.terminalId, cols: opts.cols, rows: opts.rows, observe: opts.observe, canSend: () => ws.bufferedAmount < 4 * 1024 * 1024 });
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
    for (const m of queue.splice(0)) handle(m.data, m.isBinary);
    return true;
  };
}
