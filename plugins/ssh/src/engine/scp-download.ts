import { randomUUID } from "node:crypto";
import { once } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { errors, HuhuError } from "@huhu/contracts";
import type { Client, ClientChannel } from "ssh2";
import { SFTP_TRANSFER_MAX } from "./sftp.js";
import { localTransferFile, removeTemp } from "./transfer-io.js";
import { safeTreeName } from "./transfer-tree.js";

const ack = Buffer.from([0]);
const protocolError = () => errors.invalidInput("远端 SCP 没有确认所请求的单个普通文件");

class ScpReader {
  private buffered: Buffer = Buffer.alloc(0);
  private readonly chunks: AsyncIterator<Buffer>;

  constructor(channel: ClientChannel) {
    this.chunks = channel[Symbol.asyncIterator]();
  }

  private async fill(): Promise<boolean> {
    if (this.buffered.length) return true;
    const next = await this.chunks.next();
    if (next.done) return false;
    this.buffered = next.value;
    return true;
  }

  async line(): Promise<string> {
    const parts: Buffer[] = [];
    let length = 0;
    while (await this.fill()) {
      const newline = this.buffered.indexOf(10);
      const count = newline < 0 ? this.buffered.length : newline;
      length += count;
      if (length > 4096) break;
      parts.push(this.buffered.subarray(0, count));
      this.buffered = this.buffered.subarray(count + (newline < 0 ? 0 : 1));
      if (newline >= 0) return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
      if (parts[0]?.[0] === 1 || parts[0]?.[0] === 2) break;
    }
    throw protocolError();
  }

  async *read(length: number, signal: AbortSignal): AsyncGenerator<Buffer> {
    while (length > 0) {
      signal.throwIfAborted();
      if (!(await this.fill())) throw protocolError();
      const count = Math.min(this.buffered.length, length);
      const part = this.buffered.subarray(0, count);
      this.buffered = this.buffered.subarray(count);
      length -= count;
      yield part;
    }
  }

  async checkAck() {
    if (!(await this.fill()) || this.buffered[0] !== 0) throw protocolError();
    this.buffered = this.buffered.subarray(1);
  }

  async checkEnd() {
    if (await this.fill()) throw protocolError();
  }
}

async function openScp(client: Client, command: string, signal: AbortSignal): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new HuhuError("SSH_DISCONNECTED", "SCP 下载已取消或超时"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      client.exec(command, (error, channel) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) {
          channel?.destroy();
          return abort();
        }
        if (error) return reject(new HuhuError("SSH_DISCONNECTED", "原 SSH 连接无法打开 SCP 通道"));
        resolve(channel);
      });
    } catch {
      signal.removeEventListener("abort", abort);
      reject(new HuhuError("SSH_DISCONNECTED", "原 SSH 连接无法打开 SCP 通道"));
    }
  });
}

export async function downloadScp(client: Client, remote: string, local: string, signal: AbortSignal, assertCurrent: () => void): Promise<{ size: number }> {
  const name = path.posix.basename(remote);
  if (!remote.startsWith("/") || /[\p{Cc}]/u.test(remote) || remote.endsWith("/") || remote.split("/").slice(1).some((part) => !part || part === "." || part === "..") || !safeTreeName(name)) {
    throw errors.invalidInput("请输入远端普通文件的绝对路径");
  }
  const target = localTransferFile(local);
  if (await target.stat()) throw errors.nameConflict(target.path);
  assertCurrent();
  const quoted = "'" + remote.replaceAll("'", "'\\''") + "'";
  const command = `test -f ${quoted} && test ! -L ${quoted} && exec scp -f -- ${quoted}`;
  const channel = await openScp(client, command, signal);
  if (channel.closed) throw protocolError();
  const ended = once(channel, "close", { signal });
  void ended.catch(() => undefined);
  let exitCode: number | undefined;
  channel.on("exit", (code) => { exitCode = typeof code === "number" ? code : undefined; });
  channel.stderr.resume();
  const stop = () => channel.destroy();
  signal.addEventListener("abort", stop, { once: true });
  const reader = new ScpReader(channel);
  const temporary = target.sibling(`.huhu-scp-${randomUUID()}.part`);
  let created = false;
  try {
    signal.throwIfAborted();
    channel.write(ack);
    const header = /^C[0-7]{4} (0|[1-9][0-9]{0,12}) (.+)$/u.exec(await reader.line());
    const size = Number(header?.[1]);
    if (!header || header[2] !== name || size > SFTP_TRANSFER_MAX) throw protocolError();
    channel.write(ack);
    const output = temporary.stage();
    output.once("open", () => { created = true; });
    await pipeline(Readable.from(reader.read(size, signal)), output, { signal });
    await reader.checkAck();
    channel.end(ack);
    await reader.checkEnd();
    await ended;
    if (exitCode !== 0) throw protocolError();
    signal.throwIfAborted();
    assertCurrent();
    try {
      await temporary.install(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw errors.nameConflict(target.path);
      throw error;
    }
    return { size };
  } catch (error) {
    if (signal.aborted) throw new HuhuError("SSH_DISCONNECTED", "SCP 下载已取消或超时");
    if (error instanceof HuhuError) throw error;
    throw protocolError();
  } finally {
    signal.removeEventListener("abort", stop);
    channel.destroy();
    if (created) await removeTemp(temporary);
  }
}
