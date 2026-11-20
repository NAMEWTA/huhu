import { randomUUID } from "node:crypto";
import { createServer, type RequestListener, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { errors } from "@huhu/contracts";
import { BlockedHttpPort, closeHttp, listenHttp } from "./listen-http.js";

export interface WebListenerConfig {
  mode: "local" | "lan";
  /** 0 由系统分配端口。 */
  port: number;
}

interface WebAddress {
  url: string;
  interfaceName: string | null;
}

type ListenerError = "port-in-use" | "address-unavailable" | "permission-denied" | "browser-blocked-port" | "bind-failed";

export type WebListenerStatus = { state: "stopped" } | { state: "error"; config: WebListenerConfig; reason: ListenerError } | { state: "running"; config: WebListenerConfig; generation: string; port: number; addresses: WebAddress[] };

interface Binding {
  server: Server;
  config: WebListenerConfig;
  generation: string;
  address: AddressInfo;
  closeStreams?: () => void;
}

async function bind(handler: RequestListener, port: number, host: string): Promise<Pick<Binding, "server" | "address">> {
  const server = createServer(handler);
  const address = await listenHttp(server, host, port);
  return { server, address };
}

function bindError(error: unknown): ListenerError {
  if (error instanceof BlockedHttpPort) return "browser-blocked-port";
  switch ((error as NodeJS.ErrnoException).code) {
    case "EADDRINUSE":
      return "port-in-use";
    case "EADDRNOTAVAIL":
    case "EAFNOSUPPORT":
      return "address-unavailable";
    case "EACCES":
    case "EPERM":
      return "permission-denied";
    default:
      return "bind-failed";
  }
}

/** Web 监听与回环控制端口独立。宿主提供 Web 路由，启用和关闭均按请求序列执行。 */
export class WebListener {
  private binding: Binding | undefined;
  private failure: { config: WebListenerConfig; reason: ListenerError } | undefined;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly handler: RequestListener,
    private readonly interfaces = networkInterfaces,
    private readonly onBound?: (server: Server, generation: string) => () => void,
  ) {}

  status(): WebListenerStatus {
    const active = this.binding;
    if (!active) return this.failure ? { state: "error", config: { ...this.failure.config }, reason: this.failure.reason } : { state: "stopped" };
    const { port, family } = active.address;
    const addresses: WebAddress[] = [{ url: `http://127.0.0.1:${port}`, interfaceName: null }];
    if (active.config.mode === "lan") {
      if (family === "IPv6") addresses.push({ url: `http://[::1]:${port}`, interfaceName: null });
      for (const [interfaceName, entries] of Object.entries(this.interfaces())) {
        for (const ip of entries ?? []) {
          if (ip.internal || (ip.family === "IPv6" && (family !== "IPv6" || ip.scopeid || ip.address.includes("%")))) continue;
          const host = ip.family === "IPv6" ? `[${ip.address}]` : ip.address;
          addresses.push({ url: `http://${host}:${port}`, interfaceName });
        }
      }
    }
    return { state: "running", config: { ...active.config }, generation: active.generation, port, addresses };
  }

  async start(config: WebListenerConfig): Promise<WebListenerStatus> {
    const options = { ...config };
    if (options.mode !== "local" && options.mode !== "lan") throw errors.invalidInput("Web 监听范围无效");
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw errors.invalidInput("Web 服务端口无效");
    return this.enqueue(async () => {
      const active = this.binding;
      if (active?.config.mode === options.mode && active.config.port === options.port) return this.status();
      await this.stopBinding();
      try {
        const bound = await this.bindMode(options);
        const generation = randomUUID();
        try {
          const closeStreams = this.onBound?.(bound.server, generation);
          this.binding = { ...bound, config: options, generation, ...(closeStreams ? { closeStreams } : {}) };
        } catch (error) {
          await closeHttp(bound.server);
          throw error;
        }
      } catch (error) {
        this.failure = { config: options, reason: bindError(error) };
      }
      return this.status();
    });
  }

  stop(): Promise<WebListenerStatus> {
    return this.enqueue(async () => {
      await this.stopBinding();
      return this.status();
    });
  }

  private async bindMode(config: WebListenerConfig): Promise<Pick<Binding, "server" | "address">> {
    if (config.mode === "local") return bind(this.handler, config.port, "127.0.0.1");
    try {
      return await bind(this.handler, config.port, "::");
    } catch (error) {
      if (bindError(error) !== "address-unavailable") throw error;
      return bind(this.handler, config.port, "0.0.0.0");
    }
  }

  private async stopBinding(): Promise<void> {
    this.failure = undefined;
    if (!this.binding) return;
    const binding = this.binding;
    this.binding = undefined;
    try {
      binding.closeStreams?.();
    } finally {
      await closeHttp(binding.server);
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => undefined);
    return next;
  }
}
