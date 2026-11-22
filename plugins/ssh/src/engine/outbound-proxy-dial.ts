import { request, type ClientRequest } from "node:http";
import { isIPv6, Socket } from "node:net";
import type { Duplex } from "node:stream";
import { domainToASCII } from "node:url";
import { HuhuError } from "@huhu/contracts";
import { SocksClient } from "socks";

type Endpoint = { host: string; port: number };
type Credentials = { username: string; password: string };
type OutboundProxy = Endpoint & { protocol: "socks5" | "http-connect"; credentials?: Credentials };

const dialTimeoutMs = 20_000;
const maxHeaderBytes = 16 * 1024;
const maxHandshakeBytes = 128 * 1024;

const failureMessages = {
  "authentication-failed": "SSH 代理认证失败",
  refused: "SSH 代理拒绝连接目标",
  "connect-failed": "无法建立 SSH 代理连接",
  "invalid-configuration": "SSH 代理连接参数无效",
  "response-too-large": "SSH 代理握手响应过大",
  timeout: "SSH 代理连接超时",
  cancelled: "SSH 代理连接已取消",
};

type FailureReason = keyof typeof failureMessages;

function proxyError(reason: FailureReason) {
  return new HuhuError(reason === "timeout" ? "SSH_TIMEOUT" : "SSH_DISCONNECTED", failureMessages[reason], {
    details: { stage: "proxy", reason },
  });
}

function abortReason(signal: AbortSignal): FailureReason {
  return signal.reason instanceof Error && signal.reason.name === "TimeoutError" ? "timeout" : "cancelled";
}

function endpointHost(endpoint: Endpoint): string {
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) {
    throw proxyError("invalid-configuration");
  }
  const host = endpoint.host;
  if (isIPv6(host)) return host;
  if (host.startsWith("[") && host.endsWith("]") && isIPv6(host.slice(1, -1))) return host.slice(1, -1);
  // Keep ASCII names as supplied. SOCKS5's domain length is a single octet.
  const ascii = /^[!-~]+$/u.test(host) ? host : domainToASCII(host);
  if (!/^[A-Za-z0-9._-]{1,255}$/u.test(ascii) || /[\s:/@?#%\\[\]]/u.test(host)) {
    throw proxyError("invalid-configuration");
  }
  return ascii;
}

function validateCredentials(protocol: OutboundProxy["protocol"], credentials: Credentials | undefined) {
  if (!credentials) return;
  const { username, password } = credentials;
  const userBytes = Buffer.byteLength(username);
  const passwordBytes = Buffer.byteLength(password);
  const valid = protocol === "socks5" ? userBytes > 0 && userBytes <= 255 && passwordBytes > 0 && passwordBytes <= 255 : !username.includes(":") && userBytes + passwordBytes <= 4096;
  if (!valid) throw proxyError("invalid-configuration");
}

// The locked socks release emits an error with connection options attached.
// Map its protocol outcomes here and retain neither the error nor its options.
function socksFailure(message: string): FailureReason {
  if (message === "Socks5 Authentication failed" || message === "Received invalid Socks5 initial handshake (no accepted authentication type)") {
    return "authentication-failed";
  }
  if (message.startsWith("Socks5 proxy rejected connection - ")) return "refused";
  if (message === "Proxy connection timed out") return "timeout";
  return "connect-failed";
}

function ignoreSocketError() {
  // The socket may error during the handoff before the caller installs its listeners.
}

export async function dialOutboundProxy(proxy: OutboundProxy, target: Endpoint, signal: AbortSignal): Promise<Duplex> {
  if (signal.aborted) throw proxyError(abortReason(signal));
  const proxyHost = endpointHost(proxy);
  const targetHost = endpointHost(target);
  validateCredentials(proxy.protocol, proxy.credentials);

  return new Promise<Duplex>((resolve, reject) => {
    const socket = new Socket();
    let httpRequest: ClientRequest | undefined;
    let settled = false;
    let handshakeBytes = 0;
    const timer = setTimeout(() => fail("timeout"), dialTimeoutMs);
    timer.unref();

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      socket.off("close", onClose);
      socket.off("error", onClose);
      socket.off("data", countBytes);
      socket.on("error", ignoreSocketError);
    }

    function fail(reason: FailureReason) {
      if (settled) return;
      cleanup();
      httpRequest?.destroy();
      socket.destroy();
      reject(proxyError(reason));
    }

    function handOff() {
      if (settled) return;
      if (signal.aborted) {
        fail(abortReason(signal));
      } else if (socket.destroyed) {
        fail("connect-failed");
      } else {
        socket.pause();
        cleanup();
        resolve(socket);
      }
    }

    function onAbort() {
      fail(abortReason(signal));
    }

    function onClose() {
      fail("connect-failed");
    }

    function countBytes(chunk: Buffer) {
      handshakeBytes += chunk.length;
      if (handshakeBytes > maxHandshakeBytes) fail("response-too-large");
    }

    signal.addEventListener("abort", onAbort, { once: true });
    socket.on("error", onClose);
    socket.once("close", onClose);
    socket.prependListener("data", countBytes);

    try {
      if (proxy.protocol === "socks5") {
        const auth = proxy.credentials ? { userId: proxy.credentials.username, password: proxy.credentials.password } : {};
        const client = new SocksClient({
          command: "connect",
          proxy: { type: 5, host: proxyHost, port: proxy.port, ...auth },
          destination: { host: targetHost, port: target.port },
          timeout: dialTimeoutMs,
        });
        client.on("error", (error) => fail(socksFailure(error.message)));
        client.once("established", ({ remoteHost }) => {
          if (settled) return;
          if (!remoteHost) {
            fail("connect-failed");
            return;
          }
          socket.off("data", countBytes);
          // socks@2.8.10 re-emits its excess bytes in a setImmediate, then resumes.
          // A readable listener keeps the socket in pull mode through that resume.
          const restoreHead = (chunk: Buffer) => socket.unshift(chunk);
          const hold = () => {};
          socket.on("readable", hold);
          socket.once("data", restoreHead);
          setImmediate(() => {
            socket.off("data", restoreHead);
            socket.off("readable", hold);
            handOff();
          });
        });
        socket.once("connect", () => {
          if (!settled) client.connect(socket);
        });
      } else {
        const authority = isIPv6(targetHost) ? `[${targetHost}]:${target.port}` : `${targetHost}:${target.port}`;
        const headers: Record<string, string> = { host: authority };
        if (proxy.credentials) {
          const { username, password } = proxy.credentials;
          headers["proxy-authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
        }
        httpRequest = request({
          hostname: proxyHost,
          port: proxy.port,
          method: "CONNECT",
          path: authority,
          headers,
          maxHeaderSize: maxHeaderBytes,
          // Supplying a socket directly keeps this request out of connection pools.
          createConnection: () => socket,
        });
        httpRequest.on("error", (error: NodeJS.ErrnoException) => fail(error.code === "HPE_HEADER_OVERFLOW" ? "response-too-large" : "connect-failed"));
        httpRequest.once("connect", (response, tunnel, head) => {
          if (settled) {
            tunnel.destroy();
            return;
          }
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            fail(status === 407 ? "authentication-failed" : "refused");
            return;
          }
          socket.pause();
          if (head.length > 0) socket.unshift(head);
          handOff();
        });
      }

      socket.connect({ host: proxyHost, port: proxy.port });
      httpRequest?.end();
    } catch {
      fail("connect-failed");
    }
  });
}
