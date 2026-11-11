import net from "node:net";
import { HuhuError } from "@huhu/contracts";
import { FrameDecoder, FrameKind, creditFrame, encodeFrame, resizeFrame, type Frame } from "./frames.js";

export interface RpcError {
  code: number;
  message: string;
  data?: { kind?: string; hint?: string };
}

export class HerdrError extends Error {
  constructor(readonly rpc: RpcError) {
    super(rpc.message);
    this.name = "HerdrError";
  }
  get kind(): string | undefined {
    return this.rpc.data?.kind;
  }
}

interface Pending {
  resolve(v: unknown): void;
  reject(e: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface HerdrClientOptions {
  /** Unix socket 路径或 Windows 命名管道名。 */
  endpoint: string;
  /** 每次调用的超时（毫秒），默认 10 秒。 */
  timeoutMs?: number;
  onEvent?(e: { seq: number; type: string; terminal?: string; data?: unknown }): void;
  onClose?(): void;
}

/** Herdr Core 客户端：先 plain 模式 JSON-RPC，`hello {framed:true}` 后切换到 framed。 */
export class HerdrClient {
  private socket: net.Socket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private framed = false;
  private lineBuf = "";
  private decoder = new FrameDecoder();
  private streams = new Map<number, (f: Frame) => void>();
  /** attach 回复之后、订阅注册之前到达的流帧先缓存，避免丢首屏。 */
  private early = new Map<number, Frame[]>();

  constructor(private readonly o: HerdrClientOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.createConnection(this.o.endpoint);
      const onErr = (e: Error) => reject(new HuhuError("HERDR_UNAVAILABLE", `无法连接 Herdr Core：${e.message}`));
      s.once("error", onErr);
      s.once("connect", () => {
        s.off("error", onErr);
        this.socket = s;
        s.on("data", (d) => this.onData(d));
        s.on("error", () => undefined); // 连接建立后的错误（ECONNRESET 等）由 close 事件处理，不能变成未捕获异常
        s.on("close", () => {
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new HuhuError("HERDR_UNAVAILABLE", "与 Herdr Core 的连接已断开"));
          }
          this.pending.clear();
          this.socket = null;
          this.o.onClose?.();
        });
        resolve();
      });
    });
  }

  private onData(d: Buffer): void {
    try {
      this.handleData(d);
    } catch {
      this.socket?.destroy(); // 帧格式异常：断开连接（挂起的调用被拒绝），不让异常冒泡到进程
    }
  }

  private handleData(d: Buffer): void {
    if (!this.framed) {
      this.lineBuf += d.toString("utf8");
      let i: number;
      while ((i = this.lineBuf.indexOf("\n")) >= 0) {
        const line = this.lineBuf.slice(0, i).trim();
        this.lineBuf = this.lineBuf.slice(i + 1);
        if (line) this.onMessage(line);
        if (this.framed) {
          // 切换后剩余字节按帧解析
          const rest = Buffer.from(this.lineBuf, "utf8");
          this.lineBuf = "";
          if (rest.length) this.dispatchFrames(this.decoder.push(rest));
          return;
        }
      }
      return;
    }
    this.dispatchFrames(this.decoder.push(d));
  }

  private dispatchFrames(frames: Frame[]): void {
    for (const f of frames) {
      if (f.channel === 0 && f.kind === FrameKind.DATA) this.onMessage(f.payload.toString("utf8"));
      else {
        const h = this.streams.get(f.channel);
        if (h) h(f);
        else this.early.set(f.channel, [...(this.early.get(f.channel) ?? []), f]);
      }
    }
  }

  private onMessage(line: string): void {
    let msg: { id?: number; result?: unknown; error?: RpcError; method?: string; params?: { seq: number; type: string; terminal?: string; data?: unknown } };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // 非 JSON 行忽略
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new HerdrError(msg.error));
      else p.resolve(msg.result);
    } else if (msg.method === "event" && msg.params) this.o.onEvent?.(msg.params);
  }

  call<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const s = this.socket;
    if (!s) return Promise.reject(new HuhuError("HERDR_UNAVAILABLE", "尚未连接 Herdr Core"));
    const id = this.nextId++;
    const text = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HuhuError("HERDR_UNAVAILABLE", `Herdr 调用超时：${method}`));
      }, this.o.timeoutMs ?? 10_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      if (this.framed) s.write(encodeFrame({ channel: 0, kind: FrameKind.DATA, payload: Buffer.from(text) }));
      else s.write(text + "\n");
    });
  }

  /** 切换到 framed 模式（attach 需要）。 */
  async hello(): Promise<unknown> {
    const r = await this.call("hello", { framed: true });
    this.framed = true;
    return r;
  }

  onStream(channel: number, fn: (f: Frame) => void): () => void {
    this.streams.set(channel, fn);
    for (const f of this.early.get(channel) ?? []) fn(f);
    this.early.delete(channel);
    return () => this.streams.delete(channel);
  }

  sendFrame(f: Frame): void {
    this.socket?.write(encodeFrame(f));
  }

  close(): void {
    this.socket?.destroy();
  }
}

export interface TerminalStream {
  onData(fn: (b: Buffer) => void): void;
  onClose(fn: (reason: { reason?: string; exit_code?: number | null; signal?: string | null } | null) => void): void;
  write(b: Buffer): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

/**
 * 在独立连接上 attach 到终端：返回字节流。framed 模式只影响这条连接，不影响共享的 plain 客户端。
 * 每转交一段输出就回报 CREDIT（Herdr 的流控）。
 */
export async function attachTerminal(endpoint: string, o: { terminal: string; cols: number; rows: number; observe?: boolean; history?: number; canSend?: () => boolean }): Promise<TerminalStream> {
  const dataFns: ((b: Buffer) => void)[] = [];
  const closeFns: Parameters<TerminalStream["onClose"]>[0][] = [];
  // 订阅者尚未注册时到达的输出/结束事件先暂存，注册时补发（首屏和 CLOSE 不会丢）
  const pendingData: Buffer[] = [];
  let pendingClose: { reason: Parameters<Parameters<TerminalStream["onClose"]>[0]>[0] } | null = null;
  let closed = false;
  const c = new HerdrClient({ endpoint, timeoutMs: 10_000, onClose: () => finish(null) });
  let r: { channel: number };
  try {
    await c.connect();
    await c.hello();
    r = await c.call<{ channel: number }>("terminal.attach", { terminal: o.terminal, cols: o.cols, rows: o.rows, ...(o.observe ? { observe: true } : {}), ...(o.history ? { history: o.history } : {}) });
  } catch (e) {
    c.close(); // attach 失败：不留下泄漏的 socket
    throw e;
  }
  function finish(reason: Parameters<Parameters<TerminalStream["onClose"]>[0]>[0]) {
    if (closed) return;
    closed = true;
    if (closeFns.length === 0) pendingClose = { reason };
    for (const f of closeFns) f(reason);
    c.close();
  }
  const credit = (n: number) => {
    // 背压：宿主说发送缓冲已满时延迟回报 CREDIT，让 Herdr 停止推送
    if (o.canSend && !o.canSend() && !closed) return void setTimeout(() => credit(n), 50);
    if (!closed) c.sendFrame({ channel: r.channel, kind: FrameKind.CREDIT, payload: creditFrame(0, n).subarray(9) });
  };
  c.onStream(r.channel, (f) => {
    if (f.kind === FrameKind.DATA) {
      if (dataFns.length === 0) pendingData.push(f.payload);
      else for (const fn of dataFns) fn(f.payload);
      credit(f.payload.length);
    } else if (f.kind === FrameKind.CLOSE) {
      let reason = null;
      try {
        reason = f.payload.length ? JSON.parse(f.payload.toString("utf8")) : null;
      } catch {
        /* 空/非 JSON 的 CLOSE */
      }
      finish(reason);
    }
  });
  return {
    onData: (fn) => {
      dataFns.push(fn);
      for (const b of pendingData.splice(0)) fn(b);
    },
    onClose: (fn) => {
      closeFns.push(fn);
      if (pendingClose) {
        const p = pendingClose;
        pendingClose = null;
        fn(p.reason);
      }
    },
    write: (b) => {
      if (!closed) c.sendFrame({ channel: r.channel, kind: FrameKind.DATA, payload: b });
    },
    resize: (cols, rows) => {
      if (!closed) c.sendFrame({ channel: r.channel, kind: FrameKind.RESIZE, payload: resizeFrame(0, cols, rows).subarray(9) });
    },
    close: () => {
      if (!closed) {
        c.sendFrame({ channel: r.channel, kind: FrameKind.CLOSE, payload: Buffer.alloc(0) });
        finish(null);
      }
    },
  };
}
