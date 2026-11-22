import { randomUUID } from "node:crypto";
import net from "node:net";
import { errors, HuhuError } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import type { Client, ClientChannel } from "ssh2";
import { z } from "zod";
import { FORWARD_BIND, ForwardPort } from "../shared/forwarding.js";
import { ProxyShareConfig, ProxyShareStatus } from "../shared/proxy-share.js";
import { ForwardListener } from "./forward-listener.js";
import type { SshManager } from "./manager.js";

const timeout = 5_000;
const maxOutput = 8192;
const testTarget = "example.com:443";
const limit = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
const error = (message: string) => new HuhuError("SSH_DISCONNECTED", message);

function dialLocal(port: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: FORWARD_BIND, port, signal: limit(signal) });
    socket.once("connect", () => { socket.end(); resolve(); });
    socket.once("error", () => reject(error("本机代理端口未响应")));
  });
}

// Motty local_proxy_tunnel.go verifies the actual server policy before enabling the tunnel.
export function privateRemoteListeners(output: string, port: number): boolean {
  const rows = output.trim().split("\n").filter((line) => line.trim());
  return rows.length > 0 && rows.every((line) => {
    const [state, , , bind] = line.trim().split(/\s+/u);
    return state === "LISTEN" && bind === `${FORWARD_BIND}:${port}`;
  });
}

function collect(channel: ClientChannel, signal: AbortSignal, done: (error: Error | undefined, data?: string) => void, headersOnly = false): void {
  let data = "";
  let settled = false;
  function finish(failure: Error | undefined) {
    if (settled) return;
    settled = true;
    signal.removeEventListener("abort", abort);
    done(failure, data);
    channel.close();
  }
  const abort = () => finish(error("等待远端代理验证超时"));
  channel.on("error", () => finish(error("无法读取远端代理验证结果")));
  channel.on("data", (bytes: Buffer) => {
    data += bytes.toString("utf8", 0, maxOutput + 1);
    if (Buffer.byteLength(data) > maxOutput) finish(error("远端代理验证响应超限"));
    else if (headersOnly && data.includes("\r\n\r\n")) finish(undefined);
  });
  channel.once("close", (code: number | undefined) => finish(!headersOnly && code !== 0 ? error("无法确认远端监听仅绑定回环地址") : undefined));
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
}

function useChannel(signal: AbortSignal, open: (receive: (err: Error | undefined, channel: ClientChannel) => void) => void, headersOnly = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const deadline = limit(signal);
    const abort = () => reject(error("等待 SSH 代理验证超时"));
    if (deadline.aborted) return abort();
    deadline.addEventListener("abort", abort, { once: true });
    open((failure, channel) => {
      deadline.removeEventListener("abort", abort);
      if (failure) return reject(error("远端代理验证所需的 SSH 通道不可用"));
      collect(channel, deadline, (err, data) => err ? reject(err) : resolve(data!), headersOnly);
      if (headersOnly && !deadline.aborted) channel.write(`CONNECT ${testTarget} HTTP/1.1\r\nHost: ${testTarget}\r\n\r\n`);
    });
  });
}

export class SshProxyShare {
  private view: ProxyShareStatus = { state: "idle" };
  private run: { listener: ForwardListener; client: Client; off(): void } | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();

  constructor(private readonly manager: Pick<SshManager, "proxyShareTransport">) {}

  status(): ProxyShareStatus {
    return this.view;
  }

  detect(port: number, signal: AbortSignal): Promise<void> {
    return dialLocal(port, signal);
  }

  start(config: ProxyShareConfig, signal: AbortSignal): Promise<ProxyShareStatus> {
    return this.serial(async () => {
      if (this.run) throw errors.invalidInput("请先停止当前辅助代理分享");
      const operation = AbortSignal.any([signal, this.lifetime.signal]);
      operation.throwIfAborted();
      this.view = { state: "starting", config };
      try {
        await this.detect(config.localPort, operation);
        const client = this.manager.proxyShareTransport(config.hostId, config.connectionId);
        const listener = new ForwardListener({
          id: randomUUID(), revision: randomUUID(), name: "辅助代理分享", mode: "remote", resume: false,
          hostId: config.hostId, listenPort: config.remotePort, boundTarget: "0".repeat(64), target: { host: FORWARD_BIND, port: config.localPort },
        }, client);
        const lost = () => {
          void this.serial(async () => {
            if (this.run?.listener !== listener) return this.view;
            await this.close(true);
            return this.view = { state: "stopped", message: "原 SSH 连接已结束" };
          });
        };
        client.once("close", lost);
        this.run = { listener, client, off: () => client.off("close", lost) };
        await listener.open(operation);
        const output = await useChannel(operation, (receive) => client.exec(`ss -H -ltn 'sport = :${config.remotePort}'`, receive));
        if (!privateRemoteListeners(output, config.remotePort)) throw error("远端代理监听未确认只绑定 IPv4 回环地址");
        operation.throwIfAborted();
        listener.enable();
        return this.view = { state: "running", config };
      } catch (reason) {
        try {
          await this.close(false);
        } catch {
          return this.view = { state: "stop-failed", config, message: "代理分享未启动，远端端口释放仍待确认" };
        }
        return this.view = { state: "failed", message: reason instanceof HuhuError ? reason.message : "无法开启代理分享" };
      }
    });
  }

  test(signal: AbortSignal): Promise<ProxyShareStatus> {
    return this.serial(async () => {
      const { config } = this.view;
      if (!this.run || this.view.state !== "running" || !config) throw errors.invalidInput("当前没有可测试的代理分享");
      this.view = { state: "running", config };
      try {
        const { client } = this.run;
        const reply = await useChannel(AbortSignal.any([signal, this.lifetime.signal]), (receive) => client.forwardOut(FORWARD_BIND, 0, FORWARD_BIND, config.remotePort, receive), true);
        if (!reply.includes("\r\n\r\n") || !/^HTTP\/1\.[01] 200(?:[ \r]|$)/u.test(reply)) throw error("本机代理拒绝 CONNECT 或要求认证");
        return this.view = { state: "running", config, tested: "accepted" };
      } catch (reason) {
        return this.view = { state: "running", config, tested: "failed", message: reason instanceof HuhuError ? reason.message : "代理测试失败" };
      }
    });
  }

  stop(signal: AbortSignal): Promise<ProxyShareStatus> {
    return this.serial(async () => {
      signal.throwIfAborted();
      const { config } = this.view;
      try {
        await this.close(false);
        return this.view = { state: "stopped" };
      } catch {
        return this.view = { state: "stop-failed", ...(config && { config }), message: "未确认远端已释放端口，可再次停止" };
      }
    });
  }

  dispose(): void {
    this.lifetime.abort();
    void this.stop(new AbortController().signal);
  }

  private serial(operation: () => Promise<ProxyShareStatus>): Promise<ProxyShareStatus> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async close(lost: boolean) {
    const current = this.run;
    if (!current) return;
    await current.listener.close(lost);
    current.off();
    this.run = undefined;
  }
}

const common = { plugin: "ssh", desktopOnly: true, exposable: true, defaultExposed: false, risk: "normal" } as const;
const empty = z.strictObject({});
export const sshProxyShareDescriptors = {
  proxyShareDetect: defineCapabilityDescriptor({ ...common, name: "ssh.proxyShare.detect", title: "检测本机代理端口", description: "仅检测本机回环 TCP 端口。", scope: "execute", input: z.strictObject({ port: ForwardPort }), output: z.strictObject({ available: z.boolean() }) }),
  proxyShareStatus: defineCapabilityDescriptor({ ...common, name: "ssh.proxyShare.status", title: "读取辅助代理分享状态", description: "查看正在使用的分享、远端端口及测试结果。", scope: "read", input: empty, output: ProxyShareStatus }),
  proxyShareStart: defineCapabilityDescriptor({ ...common, name: "ssh.proxyShare.start", title: "开始辅助代理分享", description: "使用当前 SSH 连接向远端回环分享本机 HTTP 代理。", scope: "execute", input: ProxyShareConfig, output: ProxyShareStatus }),
  proxyShareTest: defineCapabilityDescriptor({ ...common, name: "ssh.proxyShare.test", title: "测试辅助代理分享", description: "从远端回环测试本机代理的 CONNECT 答复。", scope: "execute", input: empty, output: ProxyShareStatus }),
  proxyShareStop: defineCapabilityDescriptor({ ...common, name: "ssh.proxyShare.stop", title: "停止辅助代理分享", description: "关闭隧道并确认远端端口释放。", scope: "execute", input: empty, output: ProxyShareStatus }),
};

export function registerSshProxyShare(api: HuhuApi, manager: SshManager): SshProxyShare {
  const share = new SshProxyShare(manager);
  const d = sshProxyShareDescriptors;
  const requireDesktop = (caller: string) => { if (caller !== "desktop") throw errors.permissionDenied("SSH 辅助代理分享"); };
  api.defineCapability(bindCapability(d.proxyShareDetect, async ({ caller, signal }, { port }) => {
    requireDesktop(caller);
    await share.detect(port, signal);
    return { available: true };
  }));
  api.defineCapability(bindCapability(d.proxyShareStatus, ({ caller }) => { requireDesktop(caller); return share.status(); }));
  api.defineCapability(bindCapability(d.proxyShareStart, ({ caller, signal }, config) => { requireDesktop(caller); return share.start(config, signal); }));
  api.defineCapability(bindCapability(d.proxyShareTest, ({ caller, signal }) => { requireDesktop(caller); return share.test(signal); }));
  api.defineCapability(bindCapability(d.proxyShareStop, ({ caller, signal }) => { requireDesktop(caller); return share.stop(signal); }));
  return share;
}
