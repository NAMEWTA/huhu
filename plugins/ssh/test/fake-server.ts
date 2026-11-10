import net from "node:net";
import { Server, utils, type Connection } from "ssh2";

export interface FakeSshOptions {
  password?: string;
  /** 记录收到的认证尝试（用于断言"主机密钥不符时没有发送凭据"）。 */
  onAuth?: (user: string, method: string) => void;
  hostKey?: string;
}

export function genHostKey(): string {
  return utils.generateKeyPairSync("ed25519").private;
}

/** 假 SSH 服务器：密码认证、exec（echo/sleep/exit/出错）、tcpip 转发（供跳板测试）。 */
export async function startFakeSsh(o: FakeSshOptions = {}): Promise<{ port: number; close(): Promise<void>; conns: Connection[]; closed(): number }> {
  const conns: Connection[] = [];
  let closed = 0;
  const server = new Server({ hostKeys: [o.hostKey ?? genHostKey()] }, (client) => {
    conns.push(client);
    client.on("close", () => { closed++; });
    client.on("authentication", (ctx) => {
      o.onAuth?.(ctx.username, ctx.method);
      if (ctx.method === "password" && ctx.password === (o.password ?? "pw")) return ctx.accept();
      ctx.reject(["password"]);
    });
    client.on("error", () => undefined);
    client.on("ready", () => {
      client.on("tcpip", (accept, reject, info) => {
        const upstream = net.connect(info.destPort, info.destIP, () => {
          const ch = accept();
          ch.pipe(upstream).pipe(ch);
        });
        upstream.on("error", () => reject());
      });
      client.on("session", (accept) => {
        const session = accept();
        session.on("exec", (acceptExec, _rej, info) => {
          const ch = acceptExec();
          const cmd = info.command;
          if (cmd.startsWith("echo ")) { ch.write(cmd.slice(5) + "\n"); ch.exit(0); ch.end(); }
          else if (cmd.startsWith("fail")) { ch.stderr.write("boom\n"); ch.exit(3); ch.end(); }
          else if (cmd.startsWith("sleep")) {
            const t = setTimeout(() => { ch.exit(0); ch.end(); }, Number(cmd.split(" ")[1] ?? 1) * 1000);
            ch.on("close", () => clearTimeout(t));
            session.on("signal", (acc) => { acc?.(); ch.exit(130); ch.end(); });
          } else { ch.write(`unknown: ${cmd}\n`); ch.exit(127); ch.end(); }
        });
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return { port, conns, closed: () => closed, close: () => new Promise<void>((r) => { for (const c of conns) c.end(); server.close(() => r()); }) };
}
