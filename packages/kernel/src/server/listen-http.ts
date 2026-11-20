import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// 端口 0 仍可交给系统分配。已分配端口按 Fetch 的 HTTP(S) 限制检查。
// https://fetch.spec.whatwg.org/#port-blocking
const blocked = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540,
  548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

export class BlockedHttpPort extends Error {
  constructor(port: number) {
    super(port === 0 ? "无法分配浏览器允许的 HTTP 端口" : `浏览器禁止访问 HTTP 端口 ${port}`);
    this.name = "BlockedHttpPort";
  }
}

export function closeHttp(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

/** 让系统分配临时端口，并释放不能用于客户端 Fetch 的分配结果。 */
export async function listenHttp(server: Server, host: string, port: number): Promise<AddressInfo> {
  if (blocked.has(port)) throw new BlockedHttpPort(port);
  for (let attempt = 0; attempt < 16; attempt++) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port }, () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address() as AddressInfo;
    if (!blocked.has(address.port)) return address;
    await closeHttp(server);
  }
  throw new BlockedHttpPort(port);
}
