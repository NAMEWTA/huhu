import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, lstat, realpath, rename, unlink, utimes } from "node:fs/promises";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { errors, HuhuError } from "@huhu/contracts";
import type { SFTPWrapper } from "ssh2";
import { normalizeRemote, realpath as remoteRealpath, SFTP_TRANSFER_MAX } from "./sftp.js";

type Metadata = { size: number; mtime: number; mode: number; identity?: string };
export type Snapshot = Metadata & { hash: string };

export interface TransferFile {
  path: string;
  sibling(name: string): TransferFile;
  stat(): Promise<Metadata | null>;
  read(start?: number, end?: number): Readable;
  stage(): Writable;
  metadata(source: Snapshot, preserveRemoteMode: boolean): Promise<void>;
  take(destination: TransferFile): Promise<void>;
  install(destination: TransferFile): Promise<void>;
  remove(): Promise<void>;
}

const call = <T>(operation: (cb: (error?: Error | null, value?: T) => void) => void): Promise<T> => new Promise((resolve, reject) => operation((error, value) => (error ? reject(error) : resolve(value as T))));
const code = (error: unknown) => (error as { code?: string | number } | undefined)?.code;
const bounds = (start?: number, end?: number) => ({ ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) });

export function localTransferFile(input: string): TransferFile {
  if (!path.isAbsolute(input) || input.includes("\0") || /^(?:\\\\|\/\/)/.test(input)) throw errors.invalidInput("请选择本机绝对文件路径");
  const abs = path.resolve(input);
  const parts = abs.slice(path.parse(abs).root.length).split(path.sep);
  const leaf = parts.at(-1);
  if (!leaf || parts.some((part) => /[<>:"|?*]|[ .]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw errors.invalidInput("本机路径包含受保留的名称");
  const parent = path.dirname(abs);
  const guard = async () => {
    if ((await realpath(parent)).toLowerCase() !== parent.toLowerCase()) throw errors.invalidInput("文件目录经过链接或已变更");
  };
  const at = (file: string): TransferFile => ({
    path: file,
    sibling: (name) => at(path.join(parent, name)),
    async stat() {
      await guard();
      try {
        const st = await lstat(file);
        if (!st.isFile() || st.isSymbolicLink()) throw errors.invalidInput("传输仅支持普通文件，链接和目录不得覆盖");
        return { size: st.size, mtime: st.mtimeMs, mode: st.mode & 0o7777, identity: `${st.dev}:${st.ino}:${st.birthtimeMs}` };
      } catch (error) {
        if (code(error) === "ENOENT") return null;
        throw error;
      }
    },
    read: (start, end) => createReadStream(file, bounds(start, end)),
    stage: () => createWriteStream(file, { flags: "wx", mode: 0o600 }),
    async metadata(source) {
      await guard();
      const time = new Date(source.mtime);
      await utimes(file, time, time);
    },
    async take(dest) {
      await guard();
      return rename(file, dest.path);
    },
    // Hard-linking the staged inode only succeeds if the pathname is still free.
    async install(dest) {
      await guard();
      return link(file, dest.path);
    },
    async remove() {
      await guard();
      return unlink(file);
    },
  });
  return at(abs);
}

export function remoteTransferFile(channel: SFTPWrapper, input: string): TransferFile {
  if (input.split("/").includes("..")) throw errors.invalidInput("远端传输路径不能包含上级目录");
  const abs = normalizeRemote(input);
  if (abs === "." || abs === "/") throw errors.invalidInput("请选择远端文件");
  const parent = path.posix.dirname(abs);
  const guard = async () => {
    if ((await remoteRealpath(channel, parent)) !== parent) throw errors.invalidInput("远端文件目录经过链接或已变更");
  };
  const move = async (file: string, dest: TransferFile) => {
    await guard();
    return call<void>((cb) => channel.rename(file, dest.path, cb));
  };
  const at = (file: string): TransferFile => ({
    path: file,
    sibling: (name) => at(path.posix.join(parent, name)),
    async stat() {
      await guard();
      try {
        const st = await call<import("ssh2").Stats>((cb) => channel.lstat(file, cb));
        if ((st.mode & 0o170000) !== 0o100000) throw errors.invalidInput("传输仅支持普通文件，链接和目录不得覆盖");
        return { size: st.size, mtime: st.mtime * 1000, mode: st.mode & 0o7777 };
      } catch (error) {
        if (code(error) === 2) return null;
        throw error;
      }
    },
    read: (start, end) => channel.createReadStream(file, bounds(start, end)),
    stage: () => channel.createWriteStream(file, { flags: "wx", mode: 0o600 }),
    async metadata(source, preserveRemoteMode) {
      await guard();
      const time = Math.floor(source.mtime / 1000);
      await call<void>((cb) => channel.setstat(file, { atime: time, mtime: time, mode: preserveRemoteMode ? source.mode & 0o777 : 0o600 }, cb));
    },
    take: (dest) => move(file, dest),
    install: (dest) => move(file, dest),
    async remove() {
      await guard();
      return call<void>((cb) => channel.unlink(file, cb));
    },
  });
  return at(abs);
}

export const transferChanged = (which: string) => new HuhuError("VERSION_CONFLICT", `${which}已变更，原件已保留，请重新发起传输`);

export async function fingerprint(file: TransferFile, signal: AbortSignal): Promise<Snapshot | null> {
  signal.throwIfAborted();
  const before = await file.stat();
  if (!before) return null;
  if (before.size > SFTP_TRANSFER_MAX) throw errors.invalidInput("文件超过 512 MiB 传输上限");
  const { length, hash } = await digest(file.read(), before.size, signal);
  if (!sameSnapshot(before, await file.stat()) || before.size !== length) throw transferChanged("文件");
  return { ...before, hash };
}

export async function digest(stream: Readable, maxLength: number, signal: AbortSignal): Promise<{ length: number; hash: string }> {
  const hash = createHash("sha256");
  let length = 0;
  const stop = () => stream.destroy(new Error("传输已取消"));
  signal.addEventListener("abort", stop, { once: true });
  try {
    if (signal.aborted) stop();
    for await (const chunk of stream) {
      length += chunk.length;
      if (length > maxLength) throw transferChanged("文件");
      hash.update(chunk);
    }
    return { length, hash: hash.digest("hex") };
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

export function sameSnapshot(a: Metadata | Snapshot | null, b: Metadata | Snapshot | null): boolean {
  return a === null || b === null ? a === b : a.size === b.size && a.mtime === b.mtime && a.mode === b.mode && a.identity === b.identity && (!("hash" in a) || !("hash" in b) || a.hash === b.hash);
}

export async function removeTemp(file: TransferFile): Promise<void> {
  try {
    await file.remove();
  } catch (error) {
    if (code(error) !== 2 && code(error) !== "ENOENT") throw error;
  }
}
