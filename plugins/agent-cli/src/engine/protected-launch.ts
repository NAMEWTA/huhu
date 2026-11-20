import { randomBytes } from "node:crypto";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { HuhuError } from "@huhu/contracts";

const HOST = "127.0.0.1";
const TOKEN = /^[a-f0-9]{64}$/;
const MAX_PAYLOAD = 2 * 1024 * 1024;

type Ticket = { content: string; timeout: NodeJS.Timeout };

function windowsConsoleCommand(helperArgv: string[]): string[] {
  // Electron's GUI executable can have discarded stdout/stderr in a ConPTY even in Node mode.
  // Keep a console process on the PTY and stream the masked bytes from explicit child pipes.
  const configuration = Buffer.from(JSON.stringify(helperArgv), "utf8").toString("base64");
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $serialized = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${configuration}'))
  $executable, $helper, $port, $ticket = (ConvertFrom-Json -InputObject $serialized)
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $executable
  $start.Arguments = '"{0}" {1} {2}' -f $helper, $port, $ticket
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $child = [Diagnostics.Process]::Start($start)
  try {
    $out = $child.StandardOutput.BaseStream.CopyToAsync([Console]::OpenStandardOutput())
    $err = $child.StandardError.BaseStream.CopyToAsync([Console]::OpenStandardError())
    $child.WaitForExit()
    [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($out, $err))
    exit $child.ExitCode
  } finally {
    $child.Dispose()
  }
} catch {
  [Console]::Error.WriteLine('Protected terminal launch failed.')
  exit 1
}`;
  return ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
}

/** Core sees a one-use ticket. The program and its private environment stay in memory. */
export class ProtectedLaunch {
  private readonly server = createServer((socket) => this.handle(socket));
  private readonly connections = new Set<Socket>();
  private readonly tickets = new Map<string, Ticket>();
  private ready: Promise<number> | undefined;
  private closed = false;

  constructor(
    private readonly executable: string,
    private readonly helper: string,
    private readonly lifetimeMs = 30_000,
  ) {
    this.server.maxConnections = 32;
  }

  listen(): Promise<number> {
    if (this.closed) return Promise.reject(new HuhuError("ENGINE_CLOSING", "受保护启动服务已关闭"));
    this.ready ??= new Promise<number>((resolve, reject) => {
      const failed = () => {
        this.server.off("close", failed);
        this.server.off("error", failed);
        this.ready = undefined;
        reject(new HuhuError("HERDR_UNAVAILABLE", "无法建立受保护启动连接"));
      };
      this.server.once("error", failed);
      this.server.once("close", failed);
      this.server.listen({ host: HOST, port: 0, exclusive: true }, () => {
        this.server.off("error", failed);
        this.server.off("close", failed);
        this.server.unref();
        resolve((this.server.address() as AddressInfo).port);
      });
    });
    return this.ready;
  }

  issue(port: number, argv: string[], env: Record<string, string>) {
    if (this.closed) throw new HuhuError("ENGINE_CLOSING", "受保护启动服务已关闭");
    const content = JSON.stringify({ argv, env });
    if (Buffer.byteLength(content) > MAX_PAYLOAD) throw new HuhuError("INVALID_INPUT", "受保护启动配置过大");
    const token = randomBytes(32).toString("hex");
    const revoke = () => {
      const ticket = this.tickets.get(token);
      if (!ticket) return;
      clearTimeout(ticket.timeout);
      this.tickets.delete(token);
    };
    const timeout = setTimeout(revoke, this.lifetimeMs);
    timeout.unref();
    this.tickets.set(token, { content, timeout });
    const helperArgv = [this.executable, this.helper, String(port), token];
    return { argv: process.platform === "win32" ? windowsConsoleCommand(helperArgv) : helperArgv, revoke };
  }

  close(): void {
    this.closed = true;
    this.server.close();
    for (const socket of this.connections) socket.destroy();
    for (const ticket of this.tickets.values()) clearTimeout(ticket.timeout);
    this.tickets.clear();
  }

  private handle(socket: Socket): void {
    this.connections.add(socket);
    socket.on("close", () => this.connections.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setTimeout(2_000, () => socket.destroy());
    socket.setEncoding("utf8");
    let input = "";
    socket.on("data", (chunk: string) => {
      input += chunk;
      if (input.length > 65) return socket.destroy();
      if (!input.endsWith("\n")) return;
      socket.removeAllListeners("data");
      const token = input.slice(0, -1);
      const ticket = TOKEN.test(token) ? this.tickets.get(token) : undefined;
      if (!ticket) return socket.end();
      this.tickets.delete(token);
      clearTimeout(ticket.timeout);
      socket.end(ticket.content);
    });
  }
}
