import net from "node:net";
import { HuhuError } from "@huhu/contracts";
import { FrameDecoder, FrameKind, encodeFrame, type Frame } from "./frames.js";

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
      else this.streams.get(f.channel)?.(f);
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
    return () => this.streams.delete(channel);
  }

  sendFrame(f: Frame): void {
    this.socket?.write(encodeFrame(f));
  }

  close(): void {
    this.socket?.destroy();
  }
}
