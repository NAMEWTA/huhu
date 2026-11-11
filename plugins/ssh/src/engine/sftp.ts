import { randomBytes } from "node:crypto";
import { createReadStream as localRead, createWriteStream as localWrite, lstatSync, existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { HuhuError, errors } from "@huhu/contracts";
import type { SFTPWrapper } from "ssh2";

/** 文本预览上限（规格：< 2 MiB）。 */
export const SFTP_PREVIEW_MAX = 2 * 1024 * 1024;
/** 单个文件上传/下载上限（规格未定，先取 512 MiB；超过的拒绝并说明）。 */
export const SFTP_TRANSFER_MAX = 512 * 1024 * 1024;

export interface SftpEntry { name: string; type: "file" | "dir" | "link" | "other"; size: number; mtime: number; mode: string }

const SSH_FX = { NO_SUCH_FILE: 2, PERMISSION_DENIED: 3 } as const;

/** 把 ssh2 的 SFTP 状态错误变成明确的错误码。 */
export function mapSftpError(e: unknown, what: string): HuhuError {
  if (e instanceof HuhuError) return e;
  const err = e as { code?: number | string; message?: string };
  if (err.code === SSH_FX.NO_SUCH_FILE) return errors.notFound(`远端不存在：${what}`);
  if (err.code === SSH_FX.PERMISSION_DENIED) return new HuhuError("PERMISSION_DENIED", `远端没有权限：${what}`);
  if (/Unable to start subsystem|subsystem request failed/i.test(err.message ?? "")) return new HuhuError("INTERNAL", "该服务器没有开启 SFTP 子系统", { retryable: false });
  if (/not connected|No response from server|channel|ECONNRESET|socket/i.test(err.message ?? "")) return new HuhuError("SSH_DISCONNECTED", `连接已中断：${err.message ?? ""}`);
  return new HuhuError("INTERNAL", `SFTP 操作失败（${what}）：${err.message ?? String(e)}`, { retryable: false });
}

/** 远端路径：空串 / "~" 表示登录目录；其余必须是 POSIX 绝对路径。拒绝 NUL。 */
export function normalizeRemote(p: string): string {
  if (p.includes("\0")) throw errors.invalidInput("远端路径不能包含空字符");
  if (p === "" || p === "~") return ".";
  if (!p.startsWith("/")) throw errors.invalidInput("远端路径需要是以 / 开头的绝对路径");
  return path.posix.normalize(p);
}

const call = <T>(fn: (cb: (err: Error | null | undefined, v: T) => void) => void): Promise<T> => new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v))));
const callv = (fn: (cb: (err?: Error | null) => void) => void): Promise<void> => new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));

const typeOf = (mode: number): SftpEntry["type"] => {
  const t = mode & 0o170000;
  return t === 0o040000 ? "dir" : t === 0o100000 ? "file" : t === 0o120000 ? "link" : "other";
};
const modeStr = (mode: number): string => (mode & 0o777).toString(8).padStart(3, "0");

export async function realpath(s: SFTPWrapper, p: string): Promise<string> {
  return call<string>((cb) => s.realpath(p, cb));
}

export async function list(s: SFTPWrapper, dir: string): Promise<{ path: string; entries: SftpEntry[] }> {
  const abs = await realpath(s, normalizeRemote(dir));
  const items = await call<{ filename: string; attrs: { mode: number; size: number; mtime: number } }[]>((cb) => s.readdir(abs, cb));
  const entries = items.filter((i) => i.filename !== "." && i.filename !== "..").map((i): SftpEntry => ({ name: i.filename, type: typeOf(i.attrs.mode), size: i.attrs.size, mtime: i.attrs.mtime * 1000, mode: modeStr(i.attrs.mode) }));
  entries.sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1) || a.name.localeCompare(b.name));
  return { path: abs, entries };
}

async function statOrNull(s: SFTPWrapper, p: string): Promise<{ mode: number; size: number } | null> {
  try {
    return await call((cb) => s.lstat(p, cb));
  } catch (e) {
    if ((e as { code?: number }).code === SSH_FX.NO_SUCH_FILE) return null;
    throw e;
  }
}

export async function readText(s: SFTPWrapper, p: string, signal?: AbortSignal): Promise<{ text: string; size: number }> {
  const abs = normalizeRemote(p);
  const st = await call<{ mode: number; size: number }>((cb) => s.stat(abs, cb)); // 跟随符号链接预览
  if (typeOf(st.mode) !== "file") throw errors.invalidInput("只能预览普通文件");
  if (st.size > SFTP_PREVIEW_MAX) throw errors.invalidInput(`文件超过 ${SFTP_PREVIEW_MAX / 1024 / 1024} MiB，不能预览，请下载`);
  const chunks: Buffer[] = [];
  let got = 0;
  await pipeline(s.createReadStream(abs), new Transform({ transform(c: Buffer, _e, cb) { got += c.length; if (got > SFTP_PREVIEW_MAX) return cb(errors.invalidInput("文件超过预览上限（读取期间变大了），请下载")); chunks.push(c); cb(); } }), ...(signal ? [{ signal }] : []));
  const buf = Buffer.concat(chunks);
  if (buf.subarray(0, 8000).includes(0)) throw errors.invalidInput("这是二进制文件，不能预览");
  try {
    return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf), size: buf.length };
  } catch {
    throw errors.invalidInput("文件不是 UTF-8 文本，不能预览");
  }
}

/** 先写 `<name>.huhu-upload-<rand>` 再 rename；已存在且未确认覆盖则不动远端；失败/取消/断线都清理临时文件。 */
/** 用 `from` 替换已存在的 `to`：优先 posix-rename（原子）；服务器不支持时先把旧文件改名成备份，改名成功后才删备份，失败则还原旧文件。 */
async function replaceRemote(s: SFTPWrapper, from: string, to: string): Promise<void> {
  try {
    await callv((cb) => s.ext_openssh_rename(from, to, cb));
    return;
  } catch (e) {
    if (!/not support|unsupported|extension/i.test((e as Error).message ?? "")) throw e; // 不是“不支持扩展”：别走降级路径
  }
  const backup = `${to}.huhu-old-${randomBytes(4).toString("hex")}`;
  await callv((cb) => s.rename(to, backup, cb));
  try {
    await callv((cb) => s.rename(from, to, cb));
  } catch (e) {
    await callv((cb) => s.rename(backup, to, cb)).catch(() => undefined); // 还原旧文件
    throw e;
  }
  await callv((cb) => s.unlink(backup, cb)).catch(() => undefined);
}

export async function writeAtomic(s: SFTPWrapper, target: string, source: Readable, opts: { overwrite: boolean; signal?: AbortSignal; maxBytes?: number }): Promise<{ size: number }> {
  const abs = normalizeRemote(target);
  if (abs === ".") throw errors.invalidInput("需要完整的远端文件路径");
  const existing = await statOrNull(s, abs);
  if (existing && !opts.overwrite) { source.destroy(); throw errors.nameConflict(abs); }
  if (existing && typeOf(existing.mode) === "dir") { source.destroy(); throw errors.invalidInput("目标是目录，不能覆盖"); }
  const tmp = `${abs}.huhu-upload-${randomBytes(4).toString("hex")}`;
  let size = 0;
  const limit = opts.maxBytes ?? SFTP_TRANSFER_MAX;
  const counter = new Transform({ transform(c: Buffer, _e, cb) { size += c.length; if (size > limit) return cb(errors.invalidInput(`文件超过 ${limit / 1024 / 1024} MiB 上限`)); cb(null, c); } });
  try {
    await pipeline(source, counter, s.createWriteStream(tmp, { flags: "wx" }), ...(opts.signal ? [{ signal: opts.signal }] : []));
    if (existing) {
      await replaceRemote(s, tmp, abs);
    } else {
      await callv((cb) => s.rename(tmp, abs, cb));
    }
    return { size };
  } catch (e) {
    await callv((cb) => s.unlink(tmp, cb)).catch(() => undefined); // 清理临时文件（连接已断时尽力而为）
    if (opts.signal?.aborted) throw errors.invalidInput("传输已取消");
    throw e;
  }
}

export async function uploadLocal(s: SFTPWrapper, localFile: string, remote: string, opts: { overwrite: boolean; signal?: AbortSignal }): Promise<{ size: number }> {
  if (!path.isAbsolute(localFile) || localFile.includes("\0")) throw errors.invalidInput("本机路径必须是绝对路径");
  let st;
  try { st = lstatSync(localFile); } catch { throw errors.notFound("本机文件不存在"); }
  if (st.isSymbolicLink() || !st.isFile()) throw errors.invalidInput("只能上传普通文件（不跟随符号链接）");
  if (st.size > SFTP_TRANSFER_MAX) throw errors.invalidInput(`文件超过 ${SFTP_TRANSFER_MAX / 1024 / 1024} MiB 上限`);
  return writeAtomic(s, remote, localRead(localFile), opts);
}

export async function downloadToLocal(s: SFTPWrapper, remote: string, localFile: string, opts: { overwrite: boolean; signal?: AbortSignal }): Promise<{ size: number }> {
  const abs = normalizeRemote(remote);
  if (!path.isAbsolute(localFile) || localFile.includes("\0")) throw errors.invalidInput("本机保存路径必须是绝对路径");
  const st = await call<{ mode: number; size: number }>((cb) => s.stat(abs, cb));
  if (typeOf(st.mode) !== "file") throw errors.invalidInput("只能下载普通文件");
  if (st.size > SFTP_TRANSFER_MAX) throw errors.invalidInput(`文件超过 ${SFTP_TRANSFER_MAX / 1024 / 1024} MiB 上限`);
  if (!existsSync(path.dirname(localFile))) throw errors.invalidInput("保存目录不存在");
  let localExists = false;
  try { lstatSync(localFile); localExists = true; } catch { /* 不存在 */ }
  if (localExists && !opts.overwrite) throw errors.nameConflict(localFile);
  if (localExists && lstatSync(localFile).isSymbolicLink()) throw errors.invalidInput("目标是符号链接，不覆盖");
  const tmp = `${localFile}.huhu-download-${randomBytes(4).toString("hex")}`;
  let size = 0;
  const counter = new Transform({ transform(c: Buffer, _e, cb) { size += c.length; cb(null, c); } });
  try {
    await pipeline(s.createReadStream(abs), counter, localWrite(tmp, { flags: "wx", mode: 0o600 }), ...(opts.signal ? [{ signal: opts.signal }] : []));
    renameSync(tmp, localFile);
    return { size };
  } catch (e) {
    rmSync(tmp, { force: true });
    if (opts.signal?.aborted) throw errors.invalidInput("传输已取消");
    throw e;
  }
}

export async function mkdir(s: SFTPWrapper, p: string): Promise<void> {
  const abs = normalizeRemote(p);
  if (await statOrNull(s, abs)) throw errors.nameConflict(abs);
  await callv((cb) => s.mkdir(abs, cb));
}

export async function rename(s: SFTPWrapper, from: string, to: string, overwrite: boolean): Promise<void> {
  const a = normalizeRemote(from); const b = normalizeRemote(to);
  const target = await statOrNull(s, b);
  if (target && !overwrite) throw errors.nameConflict(b);
  if (target && typeOf(target.mode) === "dir") throw errors.invalidInput("目标是目录，不能覆盖");
  if (target) return replaceRemote(s, a, b);
  await callv((cb) => s.rename(a, b, cb));
}

/** 删除文件 / 符号链接 / 空目录；不递归，不跟随符号链接。 */
export async function remove(s: SFTPWrapper, p: string): Promise<void> {
  const abs = normalizeRemote(p);
  if (abs === "." || abs === "/") throw errors.invalidInput("不能删除根目录或登录目录");
  const st = await call<{ mode: number }>((cb) => s.lstat(abs, cb));
  if (typeOf(st.mode) === "dir") await callv((cb) => s.rmdir(abs, cb));
  else await callv((cb) => s.unlink(abs, cb));
}
