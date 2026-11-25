import http from "node:http";
import net, { type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { HuhuError } from "@huhu/contracts";
import type { Client, ClientChannel, TcpConnectionDetails } from "ssh2";
import { FORWARD_BIND, type ForwardDestination, type ForwardListenerView, type ForwardRule } from "../shared/forwarding.js";
import { httpDestination, SOCKS_OK, socksDestination, socksFailure } from "./forward-proxy.js";
import { dialShellRelay } from "./shell-relay.js";

const MAX_CONNECTIONS = 64;
const HANDSHAKE_MS = 10_000;
type Incoming = (accept: () => ClientChannel, reject: () => void) => void;
const routers = new WeakMap<Client, { ports: Map<number, Incoming>; receive(info: TcpConnectionDetails, accept: () => ClientChannel, reject: () => void): void }>();

function routeRemote(client: Client, port: number, incoming: Incoming): () => void {
  let router = routers.get(client);
  if (!router) {
    const ports = new Map<number, Incoming>();
    router = {
      ports,
      receive(info, accept, reject) {
        const route = info.destIP === FORWARD_BIND && ports.get(info.destPort);
        if (route) route(accept, reject);
        else reject();
      },
    };
    client.on("tcp connection", router.receive);
    routers.set(client, router);
  }
  if (router.ports.has(port)) throw new HuhuError("NAME_CONFLICT", "该 SSH 连接的远端回环端口已被转发占用");
  const { ports, receive } = router;
  ports.set(port, incoming);
  return () => {
    ports.delete(port);
    if (ports.size === 0) {
      client.off("tcp connection", receive);
      routers.delete(client);
    }
  };
}

function sshRequest<T>(client: Client, signal: AbortSignal, request: (done: (error?: Error | null, value?: T) => void) => void, discard?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const complete = (error?: Error | null, value?: T) => {
      if (finished) {
        if (value !== undefined) discard?.(value);
        return;
      }
      finished = true;
      client.off("close", lost);
      signal.removeEventListener("abort", cancelled);
      if (error) reject(error);
      else resolve(value as T);
    };
    const lost = () => complete(new HuhuError("SSH_DISCONNECTED", "原转发连接已断开"));
    const cancelled = () => complete(new HuhuError("SSH_TIMEOUT", "SSH 转发请求已取消或等待回执超时"));
    if (signal.aborted) return cancelled();
    client.once("close", lost);
    signal.addEventListener("abort", cancelled, { once: true });
    try {
      request(complete);
    } catch {
      lost();
    }
  });
}

export class ForwardListener {
  private server: net.Server | undefined;
  private remote: "idle" | "pending" | "bound" | "denied" = "idle";
  private unroute: (() => void) | undefined;
  private readonly inbound = new Set<Duplex>();
  private readonly streams = new Set<Duplex>();
  private readonly abort = new AbortController();
  private serving = false;
  private active = 0;
  private accepted = 0;
  private uploaded = 0;
  private downloaded = 0;
  private lastError?: string;

  constructor(
    private readonly rule: ForwardRule,
    private readonly client: Client,
  ) {}

  stats() {
    return { active: this.active, accepted: this.accepted, uploaded: this.uploaded, downloaded: this.downloaded, ...(this.lastError && { lastError: this.lastError }) };
  }

  enable() {
    this.serving = true;
  }

  async open(signal: AbortSignal): Promise<ForwardListenerView> {
    const { rule } = this;
    if (rule.mode === "remote") {
      const target = rule.target;
      this.unroute = routeRemote(this.client, rule.listenPort, (accept, reject) => {
        if (!this.serving || this.inbound.size >= MAX_CONNECTIONS) return reject();
        const channel = accept();
        this.track(channel, true);
        void this.fromRemote(channel, target);
      });
      this.remote = "pending";
      await sshRequest<number>(this.client, AbortSignal.any([signal, AbortSignal.timeout(HANDSHAKE_MS)]), (done) => {
        this.client.forwardIn(FORWARD_BIND, rule.listenPort, (error, port) => {
          // Protocol-reported denial means no listener was created.
          this.remote = error?.message === `Unable to bind to ${FORWARD_BIND}:${rule.listenPort}` ? "denied" : error ? "pending" : "bound";
          done(this.remote === "denied" ? new HuhuError("NAME_CONFLICT", "远端拒绝监听，回环端口可能已占用或服务器禁止转发") : error, port);
        });
      });
      // The SSH success reply cannot attest the address selected by the server's bind policy.
      return { device: "remote", requestedHost: FORWARD_BIND, requestedPort: rule.listenPort, binding: "server-policy-unknown" };
    }

    if (rule.mode === "http-connect") {
      const server = http.createServer({ maxHeaderSize: 8192 }, (_request, response) => {
        response.writeHead(405, { Connection: "close" }).end();
      });
      server.on("connection", (socket) => this.acceptSocket(socket));
      server.on("connect", (request, stream, head) => {
        const socket = stream as Socket;
        if (socket.destroyed) return;
        const target = httpDestination(request.url ?? "");
        if (!target) {
          this.lastError = "HTTP CONNECT 目的地址无效";
          socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
          return;
        }
        void this.outbound(socket, target, "http-connect", head);
      });
      this.server = server;
    } else {
      this.server = net.createServer({ allowHalfOpen: true }, (socket) => {
        if (!this.acceptSocket(socket)) return;
        if (rule.mode === "local") void this.outbound(socket, rule.target, "local");
        else void this.socks(socket);
      });
    }
    const server = this.server;
    await new Promise<void>((resolve, reject) => {
      server.on("error", (error: NodeJS.ErrnoException) => {
        this.lastError = error.code === "EADDRINUSE" ? "本机回环端口已被占用" : "本机回环监听失败";
        reject(new HuhuError(error.code === "EADDRINUSE" ? "NAME_CONFLICT" : "INTERNAL", this.lastError));
      });
      server.listen({ host: FORWARD_BIND, port: rule.listenPort, exclusive: true }, resolve);
    });
    const bound = server.address();
    if (!bound || typeof bound === "string" || bound.address !== FORWARD_BIND) throw new HuhuError("INTERNAL", "无法确认本机回环监听地址");
    return { device: "local", host: bound.address, port: bound.port };
  }

  async close(transportLost = false) {
    this.serving = false;
    this.abort.abort();
    for (const stream of this.streams) stream.destroy();
    this.active = 0;
    if (this.server?.listening) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    if (this.unroute) {
      if (!transportLost && this.remote !== "denied" && this.remote !== "idle") {
        await sshRequest<void>(this.client, AbortSignal.timeout(HANDSHAKE_MS), (done) => {
          this.client.unforwardIn(FORWARD_BIND, this.rule.listenPort, (error) => done(error ? new HuhuError("INTERNAL", "未确认远端已释放端口") : undefined));
        });
      }
      this.unroute();
      this.unroute = undefined;
    }
  }

  private track(stream: Duplex, incoming = false) {
    this.streams.add(stream);
    if (incoming) this.inbound.add(stream);
    stream.on("error", () => {
      if (this.serving) this.lastError = "转发流中断";
    });
    stream.once("close", () => {
      this.streams.delete(stream);
      this.inbound.delete(stream);
    });
  }

  private acceptSocket(socket: Socket) {
    if (!this.serving || this.inbound.size >= MAX_CONNECTIONS) {
      socket.destroy();
      return false;
    }
    this.track(socket, true);
    socket.setTimeout(HANDSHAKE_MS, () => socket.destroy());
    return true;
  }

  private async socks(socket: Socket) {
    try {
      const target = await socksDestination(socket);
      if (!target) {
        this.lastError = "SOCKS5 仅支持免认证 TCP CONNECT";
        return;
      }
      await this.outbound(socket, target, "socks5");
    } catch {
      if (this.serving) this.lastError = "SOCKS5 握手未完成";
      socket.destroy();
    }
  }

  private async outbound(socket: Socket, target: ForwardDestination, mode: "local" | "http-connect" | "socks5", head?: Buffer) {
    let channel: ClientChannel;
    const socketLifetime = new AbortController();
    const closed = () => socketLifetime.abort();
    socket.once("close", closed);
    const signal = AbortSignal.any([socketLifetime.signal, this.abort.signal, AbortSignal.timeout(HANDSHAKE_MS)]);
    try {
      channel = this.rule.relay === "shell"
        ? await dialShellRelay(this.client, target, signal, "tcp")
        : await sshRequest<ClientChannel>(
          this.client,
          signal,
          (done) => this.client.forwardOut(FORWARD_BIND, socket.remotePort ?? 0, target.host, target.port, done),
          (late) => late.destroy(),
        );
    } catch (reason) {
      if (this.serving && !socket.destroyed) this.lastError = this.rule.relay === "shell" && reason instanceof HuhuError ? reason.message : "SSH 拒绝打开 TCP 出口或目的地不可达";
      if (mode === "http-connect") socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      else if (mode === "socks5") socket.end(socksFailure(5));
      else socket.destroy();
      return;
    } finally {
      socket.off("close", closed);
    }
    if (!this.serving || socket.destroyed) {
      channel.destroy();
      return;
    }
    socket.setTimeout(0);
    this.track(channel);
    if (mode === "http-connect") socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (mode === "socks5") socket.write(SOCKS_OK);
    this.bridge(socket, channel, head);
  }

  private async fromRemote(channel: ClientChannel, target: ForwardDestination) {
    const socket = net.createConnection({ host: target.host, port: target.port, allowHalfOpen: true });
    this.track(socket);
    socket.setTimeout(HANDSHAKE_MS, () => socket.destroy());
    channel.once("close", () => socket.destroy());
    socket.once("close", () => channel.destroy());
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("close", () => reject(new Error("本机目的地不可达")));
      });
    } catch {
      if (this.serving) this.lastError = "远端进入的连接无法到达本机目的地";
      return;
    }
    if (!this.serving || channel.destroyed) {
      socket.destroy();
      return;
    }
    socket.setTimeout(0);
    this.bridge(channel, socket);
  }

  private bridge(incoming: Duplex, outgoing: Duplex, head?: Buffer) {
    this.active++;
    this.accepted++;
    const finish = () => {
      incoming.off("close", finish);
      outgoing.off("close", finish);
      this.active = Math.max(0, this.active - 1);
      incoming.destroy();
      outgoing.destroy();
    };
    incoming.once("close", finish);
    outgoing.once("close", finish);
    if (head?.length) {
      this.uploaded += head.length;
      outgoing.write(head);
    }
    incoming.on("data", (chunk: Buffer) => {
      this.uploaded += chunk.length;
    });
    outgoing.on("data", (chunk: Buffer) => {
      this.downloaded += chunk.length;
    });
    incoming.pipe(outgoing).pipe(incoming);
  }
}
