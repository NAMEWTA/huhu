import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { HuhuError } from "@huhu/contracts";
import type { Client, ClientChannel } from "ssh2";

const startupOutputLimit = 64 * 1024;
const tcpRelay = String.raw`
import os
import socket
import sys
import threading

host, port, nonce = sys.argv[1:]
with socket.create_connection((host, int(port)), timeout=8) as peer:
    peer.settimeout(None)
    output = sys.stdout.buffer
    output.write(("HUHU_RELAY_" + nonce + "\n").encode("ascii"))
    output.flush()

    def send():
        try:
            while chunk := os.read(0, 65536):
                peer.sendall(chunk)
            peer.shutdown(socket.SHUT_WR)
        except OSError:
            pass

    threading.Thread(target=send, daemon=True).start()
    while chunk := peer.recv(65536):
        output.write(chunk)
        output.flush()
`;

function relayError(reason: "unsupported-target" | "shell-unavailable" | "relay-unavailable" | "startup-output" | "timeout" | "cancelled", transport: "ssh" | "tcp") {
  const messages = {
    "unsupported-target": "ViaShell 需要有效的目标主机名或 IP 与端口",
    "shell-unavailable": "跳板无法为 ViaShell 打开独立 Shell",
    "relay-unavailable": transport === "ssh" ? "ViaShell 启动失败，请确认跳板可运行 nc 且能访问目标" : "ViaShell 未打开 TCP 连接，请确认 SSH 主机支持 Python 3.8 以上版本且目的地可达",
    "startup-output": "ViaShell 启动输出超出上限",
    timeout: "ViaShell 启动超时",
    cancelled: "ViaShell 已取消",
  };
  return new HuhuError(reason === "timeout" ? "SSH_TIMEOUT" : "SSH_DISCONNECTED", messages[reason], { details: { stage: "forwarding", reason } });
}

export function dialShellRelay(client: Client, target: { host: string; port: number }, signal: AbortSignal, transport: "ssh" | "tcp" = "ssh"): Promise<ClientChannel> {
  const failure = (reason: Parameters<typeof relayError>[0]) => relayError(reason, transport);
  const host = target.host.replace(/^\[([^\]]+)\]$/u, "$1");
  const address = (isIP(host) && /^[a-z\d.:%_-]{1,253}$/iu.test(host)) || /^[a-z\d][a-z\d.-]{0,252}$/iu.test(host);
  if (!address || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    return Promise.reject(failure("unsupported-target"));
  }
  const nonce = randomBytes(16).toString("hex");
  const marker = Buffer.from(`HUHU_RELAY_${nonce}\n`);
  // A separate shell executes one bounded invocation. Split the marker so that an echoed command cannot complete the handshake.
  const command = transport === "ssh" ? `command -v nc >/dev/null 2>&1 && printf '%s%s\\n' HUHU_RELAY_ ${nonce} && exec nc '${host}' ${target.port}; exit\n` : `exec python3 -I -c '${tcpRelay}' '${host}' ${target.port} ${nonce}\n`;
  return new Promise((resolve, reject) => {
    let channel: ClientChannel | undefined;
    let pending = true;
    let received = 0;
    let prefix: Buffer = Buffer.alloc(0);
    const fail = (error: HuhuError) => {
      if (!pending) return;
      pending = false;
      signal.removeEventListener("abort", abort);
      channel?.destroy();
      reject(error);
    };
    const abort = () => fail(failure(signal.reason instanceof Error && signal.reason.name === "TimeoutError" ? "timeout" : "cancelled"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    client.shell(false, (error, opened) => {
      if (error || !opened) return fail(failure("shell-unavailable"));
      if (!pending) {
        opened.on("error", () => undefined);
        opened.destroy();
        return;
      }
      channel = opened;
      opened.stderr.resume();
      const onFailure = () => fail(failure("relay-unavailable"));
      const onData = (data: Buffer) => {
        const bytes = prefix.length ? Buffer.concat([prefix, data]) : data;
        const start = bytes.indexOf(marker);
        if (start < 0) {
          received += data.length;
          if (received > startupOutputLimit) return fail(failure("startup-output"));
          prefix = bytes.subarray(Math.max(0, bytes.length - marker.length + 1));
          return;
        }
        if (received - prefix.length + start > startupOutputLimit) return fail(failure("startup-output"));
        pending = false;
        signal.removeEventListener("abort", abort);
        opened.pause();
        opened.off("data", onData);
        opened.off("close", onFailure);
        opened.off("end", onFailure);
        // ssh2 attaches the next hop's binary reader and resumes the channel.
        const remainder = bytes.subarray(start + marker.length);
        if (remainder.length) opened.unshift(remainder);
        resolve(opened);
      };
      opened.on("error", onFailure);
      opened.once("close", onFailure);
      opened.once("end", onFailure);
      opened.on("data", onData);
      opened.write(command, (writeError) => {
        if (writeError) onFailure();
      });
    });
  });
}
