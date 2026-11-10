import type { CapabilityResult, HuhuEvent } from "@huhu/contracts";

export interface EngineEndpoint {
  baseUrl: string;
  token: string;
  vaultId: string;
}

export class CapabilityError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "CapabilityError";
  }
}

/** Engine HTTP 客户端：调用能力；业务错误抛 CapabilityError。 */
export class EngineClient {
  constructor(readonly endpoint: EngineEndpoint, private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init)) {}

  get vaultId(): string {
    return this.endpoint.vaultId;
  }

  async call<T>(capability: string, input: unknown = {}, opts: { write?: boolean } = {}): Promise<T> {
    const body = { capability, input, requestId: crypto.randomUUID(), ...(opts.write ? { idempotencyKey: crypto.randomUUID() } : {}) };
    const res = await this.fetchImpl(`${this.endpoint.baseUrl}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.endpoint.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) throw new CapabilityError("UNAUTHENTICATED", "引擎令牌失效");
    let json: CapabilityResult<T>;
    try {
      json = (await res.json()) as CapabilityResult<T>;
    } catch {
      throw new CapabilityError("INTERNAL", `引擎返回了无法解析的响应（HTTP ${res.status}）`);
    }
    if (!json.ok) throw new CapabilityError(json.error.code, json.error.message, json.error.details);
    return json.data;
  }
}

export type EngineEventHandler = (e: HuhuEvent & { seq: number }) => void;

export interface EventStreamOptions {
  onEvent: EngineEventHandler;
  /** 需要全量刷新（Engine 重启或补发缓冲溢出）。 */
  onResync(): void;
  onState?(s: "connected" | "reconnecting"): void;
  /** 注入以便测试。 */
  WebSocketImpl?: typeof WebSocket;
  backoffMs?: (attempt: number) => number;
}

export const defaultBackoff = (attempt: number): number => Math.min(15_000, 500 * 2 ** attempt);

/** WS 事件流：带 lastSeq/epoch 重连，指数退避；丢弃其他 Vault 的事件。 */
export class EventStream {
  private ws: WebSocket | null = null;
  private lastSeq: number | null = null;
  private epoch: string | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly endpoint: EngineEndpoint, private readonly o: EventStreamOptions) {}

  start(): void {
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const WS = this.o.WebSocketImpl ?? WebSocket;
    const url = new URL(this.endpoint.baseUrl.replace(/^http/, "ws") + "/ws/events");
    if (this.lastSeq !== null) url.searchParams.set("lastSeq", String(this.lastSeq));
    if (this.epoch !== null) url.searchParams.set("epoch", this.epoch);
    const ws = new WS(url.toString(), [`bearer.${this.endpoint.token}`]);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.o.onState?.("connected");
    };
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { type: string; seq: number; epoch?: string; vaultId?: string };
      if (msg.epoch) this.epoch = msg.epoch;
      if (msg.type === "hello") this.lastSeq = msg.seq;
      else if (msg.type === "resync") {
        this.lastSeq = msg.seq;
        this.o.onResync();
      } else {
        this.lastSeq = msg.seq;
        if (msg.vaultId === this.endpoint.vaultId) this.o.onEvent(msg as unknown as HuhuEvent & { seq: number });
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.o.onState?.("reconnecting");
      this.timer = setTimeout(() => this.connect(), (this.o.backoffMs ?? defaultBackoff)(this.attempt++));
    };
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
