import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { errors, HuhuError } from "@huhu/contracts";
import type { Client, ClientChannel, SFTPWrapper } from "ssh2";

// Use the established sftp-server path list from Motty's internal/sftpclient/sudo.go.
const servers = "/usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/openssh/sftp-server /usr/libexec/sftp-server /usr/local/libexec/sftp-server";
export const privilegedSftpCommand = `for server in ${servers}; do if [ -x "$server" ]; then exec sudo -n -- "$server"; fi; done; exit 127`;

type BridgeWindow = { id: number; state: "open" | "closing"; window: number; packetSize: number };
type BridgeSftp = SFTPWrapper & { push(data: Buffer | null): void; _init(): void; _chunkcb?: () => void };
type BridgeProtocol = { channelData(id: number, data: Buffer): void; channelClose(id: number): void };
type SftpConstructor = new (client: { _protocol: BridgeProtocol }, info: { type: "session"; incoming: BridgeWindow; outgoing: BridgeWindow }) => BridgeSftp;
const require = createRequire(import.meta.url);
const unavailable = () => new HuhuError("PERMISSION_DENIED", "原主机无法通过 sudo 启动系统 sftp-server。请核对远端 sudo 权限。", { retryable: false });

export function openPrivilegedSftp(client: Client, signal: AbortSignal, auth?: { password: string; signal: AbortSignal }): Promise<SFTPWrapper> {
  const challenge = auth ? randomUUID() : undefined;
  const prompt = `huhu-sudo-${challenge}:`;
  const ready = `huhu-ready-${challenge}:`;
  // Motty waits for a private stderr marker before starting the binary SFTP protocol.
  const command = auth ? `for server in ${servers}; do if [ -x "$server" ]; then exec sudo -S -p '${prompt}' -- /bin/sh -c 'printf %s "${ready}" >&2; exec "$1"' huhu "$server"; fi; done; exit 127` : privilegedSftpCommand;
  // ssh2's public sftp() API only opens a subsystem. Its SSH 2.0 SFTP codec
  // can also use an exec channel carrying the same binary stream.
  let SFTP: SftpConstructor;
  try {
    ({ SFTP } = require("ssh2/lib/protocol/SFTP.js") as { SFTP: SftpConstructor });
    if (!SFTP?.prototype?._init || !SFTP.prototype.push) throw new Error("SFTP codec unavailable");
  } catch {
    return Promise.reject(errors.invalidInput("当前版本的 SSH 组件不支持 sudo 文件后端"));
  }
  return new Promise((resolve, reject) => {
    let channel: ClientChannel | undefined;
    let password = auth ? Buffer.from(auth.password + "\n", "utf8") : undefined;
    if (auth) auth.password = "";
    const authSignal = auth?.signal;
    const clearPassword = () => {
      password?.fill(0);
      password = undefined;
    };
    const abort = () => {
      clearPassword();
      channel?.destroy();
      reject(signal.reason ?? authSignal?.reason);
    };
    const detach = () => {
      signal.removeEventListener("abort", abort);
      authSignal?.removeEventListener("abort", abort);
    };
    if (signal.aborted || authSignal?.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    authSignal?.addEventListener("abort", abort, { once: true });
    try {
      client.exec(command, (error, stream) => {
        channel = stream;
        if (signal.aborted || authSignal?.aborted) return abort();
        if (error) {
          detach();
          clearPassword();
          reject(unavailable());
          return;
        }
        const outgoing: BridgeWindow = { id: 0, state: "open", window: 64 * 1024, packetSize: 64 * 1024 };
        const transport: BridgeProtocol = {
          channelData(_id, data) {
            if (stream.write(data)) outgoing.window += data.length;
            else outgoing.window = 0;
          },
          channelClose() {
            stream.close();
          },
        };
        const sftp = new SFTP({ _protocol: transport }, { type: "session", incoming: { ...outgoing }, outgoing });
        stream.on("drain", () => {
          outgoing.window = 64 * 1024;
          sftp._chunkcb?.call(sftp);
        });
        stream.on("data", (data: Buffer) => sftp.push(data));
        if (!authSignal) stream.stderr.resume();
        else {
          let response = "";
          const onProbe = (data: Buffer) => {
            response += data.toString("utf8");
            if (response.length > 4096) {
              failAuthentication();
            } else if (response.includes(ready)) {
              clearPassword();
              stream.stderr.off("data", onProbe);
              stream.stderr.resume();
              sftp._init();
            } else if (response.includes(prompt)) {
              const submitted = password;
              password = undefined;
              response = "";
              if (!submitted) return failAuthentication();
              stream.write(submitted, () => submitted.fill(0));
            }
          };
          const failAuthentication = () => {
            clearPassword();
            reject(new HuhuError("PERMISSION_DENIED", "sudo 口令被拒绝或主机未提供可用的 SFTP 后端", { retryable: false }));
            stream.destroy();
          };
          stream.stderr.on("data", onProbe);
        }
        stream.on("error", () => stream.destroy());
        sftp.on("error", () => {
          reject(unavailable());
          stream.destroy();
        });
        stream.once("close", () => {
          outgoing.state = "closing";
          detach();
          clearPassword();
          sftp.push(null);
          sftp.emit("close");
          reject(unavailable());
        });
        sftp.once("ready", () => {
          authSignal?.removeEventListener("abort", abort);
          resolve(sftp);
        });
        if (!authSignal) sftp._init();
      });
    } catch {
      detach();
      clearPassword();
      reject(unavailable());
    }
  });
}
