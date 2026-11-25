import { createHash, randomBytes } from "node:crypto";
import { createReadStream as localRead, createWriteStream as localWrite, lstatSync, existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { HuhuError, errors } from "@huhu/contracts";
import type { InputAttributes, SFTPWrapper, Stats } from "ssh2";
import { EDIT_MAX_BYTES, type FileAttributes, type FileDocument, type FileProperties, type FileSearch } from "../shared/files.js";

/** 文本预览上限（规格：< 2 MiB）。 */
export const SFTP_PREVIEW_MAX = 2 * 1024 * 1024;
/** 单个文件上传/下载上限（规格未定，先取 512 MiB；超过的拒绝并说明）。 */
export const SFTP_TRANSFER_MAX = 512 * 1024 * 1024;

export interface SftpEntry {
  name: string;
  type: "file" | "dir" | "link" | "other";
  size: number;
  mtime: number;
  mode: string;
}

const SSH_FX = { EOF: 1, NO_SUCH_FILE: 2, PERMISSION_DENIED: 3, OP_UNSUPPORTED: 8 } as const;

/** 把 ssh2 的 SFTP 状态错误变成明确的错误码。 */
export function mapSftpError(e: unknown, what: string): HuhuError {
  if (e instanceof HuhuError) return e;
  const err = e as { code?: number | string; message?: string };
  if (err.code === SSH_FX.NO_SUCH_FILE) return errors.notFound(`远端不存在：${what}`);
  if (err.code === SSH_FX.PERMISSION_DENIED) return new HuhuError("PERMISSION_DENIED", `远端没有权限：${what}`);
  if (err.code === SSH_FX.OP_UNSUPPORTED) return errors.invalidInput("此 SFTP 服务端不支持该操作");
  if (/Unable to start subsystem|subsystem request failed/i.test(err.message ?? "")) return new HuhuError("INTERNAL", "该服务器没有开启 SFTP 子系统。当前没有可用的 SCP 后端。", { retryable: false, details: { reason: "sftp-unavailable" } });
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

async function canonicalEntry(s: SFTPWrapper, input: string) {
  const abs = normalizeRemote(input).replace(/\/$/, "");
  if (!abs.startsWith("/") || abs === "/") throw errors.invalidInput("请选择目录中的远端项目");
  const parent = path.posix.dirname(abs);
  if ((await realpath(s, parent)) !== parent) throw errors.invalidInput("父目录已变化或经过符号链接");
  return abs;
}

function attributesView(abs: string, st: Stats, linkTarget: string | null): FileProperties {
  const revision = createHash("sha256")
    .update(JSON.stringify([abs, st.mode, st.size, st.mtime, st.uid, st.gid, linkTarget]))
    .digest("hex");
  return {
    path: abs,
    name: path.posix.basename(abs),
    type: typeOf(st.mode),
    mode: st.mode === undefined ? null : modeStr(st.mode),
    size: st.size ?? null,
    mtime: st.mtime === undefined ? null : st.mtime * 1000,
    atime: st.atime === undefined ? null : st.atime * 1000,
    uid: st.uid ?? null,
    gid: st.gid ?? null,
    linkTarget,
    revision,
  };
}

export async function properties(s: SFTPWrapper, input: string): Promise<FileProperties> {
  const abs = await canonicalEntry(s, input);
  const st = await call<Stats>((cb) => s.lstat(abs, cb));
  const target = typeOf(st.mode) === "link" ? await call<string>((cb) => s.readlink(abs, cb)) : null;
  return attributesView(abs, st, target);
}

export async function changeProperties(s: SFTPWrapper, input: string, revision: string, change: FileAttributes, signal: AbortSignal, beforeWrite?: () => void): Promise<FileProperties> {
  const selected = await properties(s, input);
  if (selected.revision !== revision) throw errors.versionConflict(selected.revision);
  if (selected.type !== "file" && selected.type !== "dir") throw errors.invalidInput("仅能修改普通文件或真实目录的权限和属主");
  // OpenSSH associates FSTAT/FSETSTAT with OPEN descriptors, including
  // read-only directory descriptors on systems that support them.
  const handle = await call<Buffer>((cb) => s.open(selected.path, "r", cb));
  try {
    const st = await call<Stats>((cb) => s.fstat(handle, cb));
    const fromHandle = attributesView(selected.path, st, null);
    const current = await properties(s, selected.path);
    if (current.revision !== revision || fromHandle.revision !== revision) throw errors.versionConflict(current.revision);
    const attrs: InputAttributes = "owner" in change ? change.owner : { mode: (st.mode & 0o7000) | Number.parseInt(change.mode, 8) };
    signal.throwIfAborted();
    beforeWrite?.();
    await callv((cb) => s.fsetstat(handle, attrs, cb));
    return attributesView(selected.path, await call<Stats>((cb) => s.fstat(handle, cb)), null);
  } finally {
    await callv((cb) => s.close(handle, cb)).catch(() => undefined);
  }
}

export async function createEntry(s: SFTPWrapper, input: string, entry: { kind: "file" } | { kind: "link"; target: string }, signal: AbortSignal, beforeWrite?: () => void) {
  const abs = await canonicalEntry(s, input);
  if (await statOrNull(s, abs)) throw errors.nameConflict(abs);
  signal.throwIfAborted();
  beforeWrite?.();
  if (entry.kind === "link") {
    const { target } = entry;
    if (!target || target.includes("\0")) throw errors.invalidInput("请输入有效的链接目标");
    await callv((cb) => s.symlink(target, abs, cb));
  } else {
    const handle = await call<Buffer>((cb) => s.open(abs, "wx", { mode: 0o600 }, cb));
    await callv((cb) => s.close(handle, cb));
  }
}

export async function moveEntry(s: SFTPWrapper, input: string, revision: string, destination: string, signal: AbortSignal, beforeWrite?: () => void) {
  const to = await canonicalEntry(s, destination);
  if (await statOrNull(s, to)) throw errors.nameConflict(to);
  const from = await properties(s, input);
  if (from.revision !== revision) throw errors.versionConflict(from.revision);
  signal.throwIfAborted();
  beforeWrite?.();
  await callv((cb) => s.rename(from.path, to, cb));
}

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

export async function searchNames(s: SFTPWrapper, dir: string, query: string, signal: AbortSignal): Promise<FileSearch> {
  const normalized = normalizeRemote(dir);
  const root = await realpath(s, normalized);
  if (normalized !== "." && root !== normalized) throw errors.invalidInput("搜索根目录不能经过符号链接");
  const pending = [{ path: root, depth: 0 }];
  const needle = query.toLowerCase();
  const hits: FileSearch["hits"] = [];
  let visited = 0;
  let entries = 0;
  let skipped = 0;
  let limited = false;
  for (const folder of pending) {
    signal.throwIfAborted();
    if (++visited > 128) return { hits, limited: true, skipped };
    try {
      if ((await realpath(s, folder.path)) !== folder.path || typeOf((await statOrNull(s, folder.path))?.mode ?? 0) !== "dir") {
        skipped++;
        continue;
      }
      const handle = await call<Buffer>((cb) => s.opendir(folder.path, cb));
      try {
        for (;;) {
          signal.throwIfAborted();
          const batch = await call<import("ssh2").FileEntryWithStats[]>((cb) => s.readdir(handle, (error, items) => ((error as { code?: number } | undefined)?.code === SSH_FX.EOF ? cb(undefined, []) : cb(error, items))));
          if (!batch.length) break;
          for (const { filename, attrs } of batch) {
            if (!filename || filename === "." || filename === ".." || filename.includes("/") || filename.includes("\0")) continue;
            if (++entries > 2000) return { hits, limited: true, skipped };
            const entry: SftpEntry = { name: filename, type: typeOf(attrs.mode), size: attrs.size, mtime: attrs.mtime * 1000, mode: modeStr(attrs.mode) };
            if (filename.toLowerCase().includes(needle)) {
              hits.push({ folder: folder.path, entry });
              if (hits.length >= 100) return { hits, limited: true, skipped };
            }
            if (entry.type !== "dir") continue;
            if (folder.depth >= 6) limited = true;
            else pending.push({ path: path.posix.join(folder.path, filename), depth: folder.depth + 1 });
          }
        }
      } finally {
        if (!signal.aborted) await callv((cb) => s.close(handle, cb)).catch(() => undefined);
      }
    } catch (error) {
      if (signal.aborted || folder.depth === 0) throw error;
      const problem = mapSftpError(error, folder.path);
      if (problem.code !== "NOT_FOUND" && problem.code !== "PERMISSION_DENIED") throw problem;
      skipped++;
    }
  }
  return { hits, limited, skipped };
}

async function statOrNull(s: SFTPWrapper, p: string): Promise<Stats | null> {
  try {
    return await call<Stats>((cb) => s.lstat(p, cb));
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
  const buf = await readBounded(s, abs, SFTP_PREVIEW_MAX, "文件超过预览上限（读取期间变大了），请下载", signal);
  if (buf.subarray(0, 8000).includes(0)) throw errors.invalidInput("这是二进制文件，不能预览");
  try {
    return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf), size: buf.length };
  } catch {
    throw errors.invalidInput("文件不是 UTF-8 文本，不能预览");
  }
}

export async function downloadChunk(s: SFTPWrapper, input: string, offset: number, limit: number, signal: AbortSignal) {
  const abs = normalizeRemote(input);
  const st = await call<Stats>((cb) => s.stat(abs, cb));
  if (typeOf(st.mode) !== "file") throw errors.invalidInput("只能下载普通文件");
  const buffer = await readBounded(s, abs, limit + 1, "下载块超过长度上限", signal, { start: offset, end: offset + limit });
  const bytes = buffer.subarray(0, limit);
  return { dataBase64: bytes.toString("base64"), size: bytes.length, nextOffset: offset + bytes.length, eof: buffer.length <= limit };
}

async function readBounded(s: SFTPWrapper, abs: string, max: number, tooLarge: string, signal?: AbortSignal, range?: { start: number; end: number }): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let got = 0;
  await pipeline(
    s.createReadStream(abs, range),
    new Transform({
      transform(c: Buffer, _e, cb) {
        got += c.length;
        if (got > max) return cb(errors.invalidInput(tooLarge));
        chunks.push(c);
        cb();
      },
    }),
    ...(signal ? [{ signal }] : []),
  );
  return Buffer.concat(chunks);
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const editTooLarge = "远端文件超过 1 MiB，不能编辑";
const editConflict = () => new HuhuError("VERSION_CONFLICT", "远端文件已更改，草稿仍保留");

export async function documentPath(s: SFTPWrapper, input: string): Promise<string> {
  const abs = normalizeRemote(input);
  if (abs === "." || abs === "/") throw errors.invalidInput("请选择远端文件");
  return path.posix.join(await realpath(s, path.posix.dirname(abs)), path.posix.basename(abs));
}

type DocumentPermissions = { mode: number; uid: number | undefined; gid: number | undefined };
const documentPermissions = ({ mode, uid, gid }: Stats): DocumentPermissions => ({ mode: mode & 0o7777, uid, gid });

function documentVersion(abs: string, { mode, uid, gid }: DocumentPermissions, bytes: Buffer): string {
  return createHash("sha256")
    .update(JSON.stringify([abs, mode, uid, gid]))
    .update(bytes)
    .digest("hex");
}

async function documentSnapshot(s: SFTPWrapper, abs: string, signal: AbortSignal) {
  const parent = path.posix.dirname(abs);
  if ((await realpath(s, parent)) !== parent) throw editConflict();
  const st = await statOrNull(s, abs);
  if (!st) throw errors.notFound("远端文件已移除");
  if (typeOf(st.mode) !== "file") throw errors.invalidInput("远端编辑只支持普通文件");
  if (st.size > EDIT_MAX_BYTES) throw errors.invalidInput(editTooLarge);
  const bytes = await readBounded(s, abs, EDIT_MAX_BYTES, editTooLarge, signal);
  const permissions = documentPermissions(st);
  const bom = bytes.subarray(0, BOM.length).equals(BOM);
  return { permissions, bytes, bom, version: documentVersion(abs, permissions, bytes) };
}

export async function openDocument(s: SFTPWrapper, input: string, signal: AbortSignal): Promise<FileDocument> {
  const abs = await documentPath(s, input);
  const { permissions: { mode }, bytes, bom, version } = await documentSnapshot(s, abs, signal);
  if (bytes.includes(0)) throw errors.invalidInput("文件含空字符，不能作为 UTF-8 文本编辑");
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bom ? bytes.subarray(BOM.length) : bytes);
    return { path: abs, version, mode: mode.toString(8).padStart(3, "0"), text };
  } catch {
    throw errors.invalidInput("文件不是 UTF-8 文本，不能编辑");
  }
}

async function preserveDocumentPermissions(s: SFTPWrapper, file: string, { mode, uid, gid }: DocumentPermissions, signal: AbortSignal): Promise<DocumentPermissions> {
  const read = async () => documentPermissions(await call<Stats>((cb) => s.lstat(file, cb)));
  const ownerMatches = (current: DocumentPermissions) => (uid === undefined || uid === current.uid) && (gid === undefined || gid === current.gid);
  const unsupported = () => new HuhuError("PERMISSION_DENIED", "无法验证暂存文件保留了原权限和属主，原文件未修改");
  if (!ownerMatches(await read())) {
    if (uid === undefined || gid === undefined) throw unsupported();
    signal.throwIfAborted();
    await callv((cb) => s.chown(file, uid, gid, cb));
  }
  // chown can clear SUID/SGID bits, so restore the mode after the owner.
  signal.throwIfAborted();
  await callv((cb) => s.chmod(file, mode, cb));
  const current = await read();
  if (current.mode !== mode || !ownerMatches(current)) throw unsupported();
  return current;
}

export async function saveDocument(s: SFTPWrapper, abs: string, text: string, version: string, signal: AbortSignal, beforeWrite?: () => void): Promise<Omit<FileDocument, "text">> {
  if (text.includes("\0") || Buffer.from(text, "utf8").toString("utf8") !== text) throw errors.invalidInput("需要不含空字符的 UTF-8 文本");
  async function verify() {
    try {
      const current = await documentSnapshot(s, abs, signal);
      if (current.version !== version) throw editConflict();
      return current;
    } catch (error) {
      if (error instanceof HuhuError && ["NOT_FOUND", "INVALID_INPUT"].includes(error.code)) throw editConflict();
      throw error;
    }
  }
  const { permissions, bytes: current, bom } = await verify();
  const original = current.toString("utf8");
  const body = original.includes("\r\n") && !original.replaceAll("\r\n", "").includes("\n") ? text.replace(/\r\n|\n/g, "\r\n") : text;
  const bytes = Buffer.from((bom ? "\uFEFF" : "") + body, "utf8");
  if (bytes.length > EDIT_MAX_BYTES) throw errors.invalidInput(editTooLarge);
  let publishedPermissions = permissions;
  await writeAtomic(s, abs, Readable.from(bytes), {
    overwrite: true,
    signal,
    maxBytes: EDIT_MAX_BYTES,
    checkedReplace: {
      async prepare(staging) {
        publishedPermissions = await preserveDocumentPermissions(s, staging, permissions, signal);
        await verify();
      },
    },
    ...(beforeWrite && { verifyTarget: async () => beforeWrite() }),
  });
  return { path: abs, version: documentVersion(abs, publishedPermissions, bytes), mode: publishedPermissions.mode.toString(8).padStart(3, "0") };
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

export async function writeAtomic(
  s: SFTPWrapper,
  target: string,
  source: Readable,
  opts: {
    overwrite: boolean;
    signal?: AbortSignal;
    maxBytes?: number;
    checkedReplace?: { prepare: (staging: string) => Promise<void> };
    verifyTarget?: () => Promise<void>;
  },
): Promise<{ size: number }> {
  const abs = normalizeRemote(target);
  if (abs === ".") throw errors.invalidInput("需要完整的远端文件路径");
  await opts.verifyTarget?.();
  const existing = await statOrNull(s, abs);
  if (existing && !opts.overwrite) {
    source.destroy();
    throw errors.nameConflict(abs);
  }
  if (existing && typeOf(existing.mode) === "dir") {
    source.destroy();
    throw errors.invalidInput("目标是目录，不能覆盖");
  }
  const tmp = `${abs}.huhu-upload-${randomBytes(4).toString("hex")}`;
  let size = 0;
  const limit = opts.maxBytes ?? SFTP_TRANSFER_MAX;
  const counter = new Transform({
    transform(c: Buffer, _e, cb) {
      size += c.length;
      if (size > limit) return cb(errors.invalidInput(`文件超过 ${limit / 1024 / 1024} MiB 上限`));
      cb(null, c);
    },
  });
  try {
    await pipeline(source, counter, s.createWriteStream(tmp, { flags: "wx", ...(opts.checkedReplace ? { mode: 0o600 } : {}) }), ...(opts.signal ? [{ signal: opts.signal }] : []));
    await opts.checkedReplace?.prepare(tmp);
    await opts.verifyTarget?.();
    opts.signal?.throwIfAborted();
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
  try {
    st = lstatSync(localFile);
  } catch {
    throw errors.notFound("本机文件不存在");
  }
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
  try {
    lstatSync(localFile);
    localExists = true;
  } catch {
    /* 不存在 */
  }
  if (localExists && !opts.overwrite) throw errors.nameConflict(localFile);
  if (localExists && lstatSync(localFile).isSymbolicLink()) throw errors.invalidInput("目标是符号链接，不覆盖");
  const tmp = `${localFile}.huhu-download-${randomBytes(4).toString("hex")}`;
  let size = 0;
  const counter = new Transform({
    transform(c: Buffer, _e, cb) {
      size += c.length;
      cb(null, c);
    },
  });
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

export async function mkdir(s: SFTPWrapper, p: string, beforeWrite?: () => void): Promise<void> {
  const abs = normalizeRemote(p);
  if (await statOrNull(s, abs)) throw errors.nameConflict(abs);
  beforeWrite?.();
  await callv((cb) => s.mkdir(abs, cb));
}

export async function rename(s: SFTPWrapper, from: string, to: string, overwrite: boolean, beforeWrite?: () => void): Promise<void> {
  const a = normalizeRemote(from);
  const b = normalizeRemote(to);
  const target = await statOrNull(s, b);
  if (target && !overwrite) throw errors.nameConflict(b);
  if (target && typeOf(target.mode) === "dir") throw errors.invalidInput("目标是目录，不能覆盖");
  beforeWrite?.();
  if (target) return replaceRemote(s, a, b);
  await callv((cb) => s.rename(a, b, cb));
}

/** 删除文件 / 符号链接 / 空目录；不递归，不跟随符号链接。 */
export async function remove(s: SFTPWrapper, p: string, beforeWrite?: () => void): Promise<void> {
  const abs = normalizeRemote(p);
  if (abs === "." || abs === "/") throw errors.invalidInput("不能删除根目录或登录目录");
  const st = await call<{ mode: number }>((cb) => s.lstat(abs, cb));
  beforeWrite?.();
  if (typeOf(st.mode) === "dir") await callv((cb) => s.rmdir(abs, cb));
  else await callv((cb) => s.unlink(abs, cb));
}
