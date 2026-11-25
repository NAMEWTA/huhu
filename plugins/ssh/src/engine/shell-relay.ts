import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { HuhuError } from "@huhu/contracts";
import type { Client, ClientChannel } from "ssh2";

const startupOutputLimit = 64 * 1024;

function relayError(reason: "unsupported-target" | "shell-unavailable" | "relay-unavailable" | "startup-output" | "timeout" | "cancelled") {
  const messages = {
    "unsupported-target": "ViaShell 需要有效的目标主机名或 IP 与端口",
    "shell-unavailable": "跳板无法为 ViaShell 打开独立 Shell",
    "relay-unavailable": "ViaShell 启动失败，请确认跳板可运行 nc 且能访问目标",
    "startup-output": "ViaShell 启动输出超出上限",
    timeout: "ViaShell 启动超时",
    cancelled: "ViaShell 已取消",
  };
  return new HuhuError(reason === "timeout" ? "SSH_TIMEOUT" : "SSH_DISCONNECTED", messages[reason], { details: { stage: "forwarding", reason } });
}

export function dialShellRelay(client: Client, target: { host: string; port: number }, signal: AbortSignal): Promise<ClientChannel> {
  const host = target.host.replace(/^\[([^\]]+)\]$/u, "$1");
  const address = (isIP(host) && /^[a-z\d.:%_-]{1,253}$/iu.test(host)) || /^[a-z\d][a-z\d.-]{0,252}$/iu.test(host);
  if (!address || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    return Promise.reject(relayError("unsupported-target"));
  }
  const nonce = randomBytes(16).toString("hex");
  const marker = Buffer.from(`HUHU_RELAY_${nonce}\n`);
  // A separate shell executes one bounded invocation. Split the marker so that an echoed command cannot complete the handshake.
  const command = `command -v nc >/dev/null 2>&1 && printf '%s%s\\n' HUHU_RELAY_ ${nonce} && exec nc '${host}' ${target.port}; exit\n`;
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
    const abort = () => fail(relayError(signal.reason instanceof Error && signal.reason.name === "TimeoutError" ? "timeout" : "cancelled"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    client.shell(false, (error, opened) => {
      if (error || !opened) return fail(relayError("shell-unavailable"));
      if (!pending) {
        opened.on("error", () => undefined);
        opened.destroy();
        return;
      }
      channel = opened;
      opened.stderr.resume();
      const onFailure = () => fail(relayError("relay-unavailable"));
      const onData = (data: Buffer) => {
        const bytes = prefix.length ? Buffer.concat([prefix, data]) : data;
        const start = bytes.indexOf(marker);
        if (start < 0) {
          received += data.length;
          if (received > startupOutputLimit) return fail(relayError("startup-output"));
          prefix = bytes.subarray(Math.max(0, bytes.length - marker.length + 1));
          return;
        }
        if (received - prefix.length + start > startupOutputLimit) return fail(relayError("startup-output"));
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
      opened.write(command, (writeError) => { if (writeError) onFailure(); });
    });
  });
}
