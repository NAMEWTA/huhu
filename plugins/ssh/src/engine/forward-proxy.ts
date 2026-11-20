import type { Socket } from "node:net";
import { ForwardDestination } from "../shared/forwarding.js";

function read(socket: Socket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const closed = () => {
      cleanup();
      reject(new Error("代理握手已断开"));
    };
    const check = () => {
      const bytes = socket.read(length) as Buffer | null;
      if (bytes) {
        cleanup();
        resolve(bytes);
      }
    };
    const cleanup = () => {
      socket.off("readable", check);
      socket.off("close", closed);
    };
    if (socket.destroyed) return closed();
    socket.on("readable", check);
    socket.on("close", closed);
    check();
  });
}

export const SOCKS_OK = Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
export const socksFailure = (code: number) => Buffer.from([5, code, 0, 1, 0, 0, 0, 0, 0, 0]);

export async function socksDestination(socket: Socket): Promise<ForwardDestination | undefined> {
  const [version, count] = await read(socket, 2);
  if (version !== 5 || !count || !(await read(socket, count)).includes(0)) {
    socket.end(Buffer.from([5, 255]));
    return;
  }
  socket.write(Buffer.from([5, 0]));
  const [requestVersion, command, reserved, type] = await read(socket, 4);
  if (requestVersion !== 5 || reserved !== 0 || command !== 1) {
    socket.end(socksFailure(7));
    return;
  }
  let host: string;
  if (type === 1) {
    host = (await read(socket, 4)).join(".");
  } else if (type === 3) {
    const length = (await read(socket, 1))[0]!;
    host = length ? (await read(socket, length)).toString("latin1") : "";
  } else if (type === 4) {
    const bytes = await read(socket, 16);
    host = Array.from({ length: 8 }, (_, index) => bytes.readUInt16BE(index * 2).toString(16)).join(":");
  } else {
    socket.end(socksFailure(8));
    return;
  }
  const port = (await read(socket, 2)).readUInt16BE();
  const destination = ForwardDestination.safeParse({ host, port });
  if (destination.success) return destination.data;
  socket.end(socksFailure(8));
}

export function httpDestination(authority: string): ForwardDestination | undefined {
  const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(authority);
  if (!match || (match[1] && !match[1].includes(":"))) return;
  const result = ForwardDestination.safeParse({ host: match[1] ?? match[2], port: Number(match[3]) });
  if (result.success) return result.data;
}
