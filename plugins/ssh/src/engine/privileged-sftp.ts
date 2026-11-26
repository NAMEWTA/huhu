import { createRequire } from "node:module";
import { errors, HuhuError } from "@huhu/contracts";
import type { Client, ClientChannel, SFTPWrapper } from "ssh2";

// Use the established sftp-server path list from Motty's internal/sftpclient/sudo.go.
const servers = "/usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/openssh/sftp-server /usr/libexec/sftp-server /usr/local/libexec/sftp-server";
export const privilegedSftpCommand = `for server in ${servers}; do if [ -x "$server" ]; then exec sudo -n -- "$server"; fi; done; exit 127`;

type BridgeWindow = { id: number; state: "open" | "closing"; window: number; packetSize: number };
type BridgeSftp = SFTPWrapper & { push(data: Buffer | null): void; _init(): void; _chunkcb?: () => void };
type BridgeProtocol = { channelData(id: number, data: Buffer): void; channelClose(id: number): void };
type SftpConstructor = new (
  client: { _protocol: BridgeProtocol },
  info: { type: "session"; incoming: BridgeWindow; outgoing: BridgeWindow },
) => BridgeSftp;
const require = createRequire(import.meta.url);
const unavailable = () => new HuhuError("PERMISSION_DENIED", "原主机无法启动 sudo -n SFTP。需要允许免交互运行系统 sftp-server。", { retryable: false });

export function openPrivilegedSftp(client: Client, signal: AbortSignal): Promise<SFTPWrapper> {
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
    const abort = () => {
      channel?.destroy();
      reject(signal.reason);
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      client.exec(privilegedSftpCommand, (error, stream) => {
        channel = stream;
        if (signal.aborted) return abort();
        if (error) {
          signal.removeEventListener("abort", abort);
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
        stream.stderr.resume();
        stream.on("error", () => stream.destroy());
        sftp.on("error", () => {
          reject(unavailable());
          stream.destroy();
        });
        stream.once("close", () => {
          outgoing.state = "closing";
          signal.removeEventListener("abort", abort);
          sftp.push(null);
          sftp.emit("close");
          reject(unavailable());
        });
        sftp.once("ready", () => resolve(sftp));
        sftp._init();
      });
    } catch {
      signal.removeEventListener("abort", abort);
      reject(unavailable());
    }
  });
}
