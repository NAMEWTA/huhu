import { isBlockedHttpPort } from "@huhu/contracts";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

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
  if (isBlockedHttpPort(port)) throw new BlockedHttpPort(port);
  for (let attempt = 0; attempt < 16; attempt++) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port }, () => {
        server.off("error", reject);
        resolve();
      });
    });
    const address = server.address() as AddressInfo;
    if (!isBlockedHttpPort(address.port)) return address;
    await closeHttp(server);
  }
  throw new BlockedHttpPort(port);
}
