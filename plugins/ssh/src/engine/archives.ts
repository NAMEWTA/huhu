import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { errors, HuhuError } from "@huhu/contracts";
import { z } from "zod";
import { ArchiveEntry, type ArchiveRequest, type ArchiveResult, type ArchiveSupport } from "../shared/archives.js";
import type { TransferEndpoint } from "../shared/transfers.js";
import type { FileSessions } from "./file-sessions.js";
import type { SshManager } from "./manager.js";
import { fingerprint, localTransferFile, remoteTransferFile, removeTemp, sameSnapshot, transferChanged, type Snapshot, type TransferFile } from "./transfer-io.js";
import { localTree, remoteTree, safeTreeName, scanTree, type TransferTree } from "./transfer-tree.js";
import { windowsZip, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES, type NativeZipEntry } from "./windows-zip.js";

type Device = { tree: TransferTree; file: (parts: readonly string[]) => TransferFile };
type Member = NativeZipEntry & { parts: string[] };
const NativeRows = z.array(ArchiveEntry.extend({ index: z.number().int().nonnegative(), attributes: z.number().int() })).max(ZIP_MAX_ENTRIES);

function memberName(name: string): boolean {
  return safeTreeName(name) && !name.toLowerCase().startsWith(".huhu-zip-");
}

function members(output: string): Member[] {
  const rows = NativeRows.parse(JSON.parse(output));
  const paths = new Map<string, boolean>();
  const spellings = new Map<string, string>();
  const members = rows.map((row) => {
    const parts = (row.directory ? row.name.slice(0, -1) : row.name).split("/");
    const tag = (row.attributes >>> 16) & 0xf000;
    if (parts.length > 16 || parts.some((part) => part.length > 255 || !memberName(part)) || (row.attributes & 0x400) !== 0 || (tag !== 0 && tag !== (row.directory ? 0x4000 : 0x8000))) {
      throw errors.invalidInput("ZIP 成员路径或类型不安全，解压未开始");
    }
    const address = parts.join("/").toLowerCase();
    for (let i = 1; i <= parts.length; i++) {
      const full = parts.slice(0, i).join("/");
      const key = full.toLowerCase();
      const original = spellings.get(key);
      if (original && original !== full) throw errors.invalidInput("ZIP 含大小写冲突的目录名称");
      spellings.set(key, full);
    }
    if (paths.has(address)) throw errors.invalidInput("ZIP 含重复路径或大小写冲突");
    paths.set(address, row.directory);
    return { ...row, parts };
  });
  for (const entry of members) {
    for (let i = 1; i < entry.parts.length; i++) {
      if (paths.get(entry.parts.slice(0, i).join("/").toLowerCase()) === false) throw errors.invalidInput("ZIP 中文件与目录路径冲突");
    }
  }
  return members;
}

function publicEntries(entries: Member[]) {
  return entries.map(({ name, directory, size, mtime, sha256 }) => ({ name, directory, size, mtime, ...(sha256 ? { sha256 } : {}) }));
}

async function readRequired(file: TransferFile, signal: AbortSignal): Promise<Snapshot> {
  const info = await file.stat();
  if (!info) throw errors.notFound("归档或源文件已移除");
  if (info.size > ZIP_MAX_BYTES) throw errors.invalidInput("归档单项超过 16 MiB 上限");
  const snapshot = await fingerprint(file, signal);
  if (!snapshot || !sameSnapshot(info, snapshot)) throw transferChanged("归档文件");
  return snapshot;
}

async function writeChecked(source: TransferFile, target: TransferFile, expected: Snapshot, signal: AbortSignal, time?: number) {
  let length = 0;
  let opened = false;
  const output = target.stage();
  output.once("open", () => {
    opened = true;
  });
  try {
    await pipeline(
      source.read(),
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          length += chunk.length;
          if (length > expected.size) return done(transferChanged("归档源文件"));
          done(null, chunk);
        },
      }),
      output,
      { signal },
    );
    if (time !== undefined) await target.metadata({ ...expected, mtime: time }, false);
    const written = await fingerprint(target, signal);
    if (!written || written.hash !== expected.hash || written.size !== expected.size || (time !== undefined && Math.abs(written.mtime - time) >= 1000)) throw transferChanged("归档暂存");
  } catch (error) {
    if (opened) {
      try {
        await removeTemp(target);
      } catch {
        throw new HuhuError("INTERNAL", `归档失败，暂存尚待检查：${target.path}`);
      }
    }
    throw error;
  }
}

export class Archives {
  private busy = false;
  private nativeProbe?: Promise<boolean>;

  constructor(
    private readonly sessions: FileSessions,
    private readonly manager: SshManager,
  ) {}

  async support(id: string, signal: AbortSignal): Promise<ArchiveSupport> {
    const session = this.sessions.get(id);
    const native = await this.available();
    const local = { zip: native, reason: native ? "本机 Windows .NET ZIP 后端" : "本机 Windows .NET ZIP 后端不可用" };
    let remote = { zip: false, reason: !native ? "依赖的本机 ZIP 后端不可用" : "原 SSH 连接已断开" };
    if (native && session.state === "ready") {
      try {
        await this.manager.withSftp(this.sessions.source({ fileSessionId: id }), "archive.support", "", async () => undefined, { signal });
        remote = { zip: true, reason: `${session.name} 的绑定 SFTP 通道可用，ZIP 由本机处理` };
      } catch (error) {
        remote = { zip: false, reason: error instanceof Error ? error.message : "原 SFTP 通道不可用" };
      }
    }
    return { local, remote, nativeSelection: "系统选择器支持单文件或目录。双栏可多选并拖放，系统外部拖入缺少可信路径。", otherFormats: "TAR、TGZ 和 7z 在此后端不可用。远端命令行工具未作为文件归档后端接入。" };
  }

  async run(request: ArchiveRequest, signal: AbortSignal): Promise<ArchiveResult> {
    if (this.busy) throw errors.invalidInput("已有 ZIP 操作在运行");
    if (!memberName(request.name) || (request.output !== undefined && !memberName(request.output))) throw errors.invalidInput("请选择当前目录内的普通名称");
    const zip = request.operation === "compress" ? request.output : request.name;
    if (!zip?.toLowerCase().endsWith(".zip")) throw errors.invalidInput("当前归档后端支持 .zip");
    if (request.operation === "extract" && !request.output) throw errors.invalidInput("请为解压内容指定新目录名称");
    if (request.directory.kind === "local") {
      if (!request.localFileSessionId) throw errors.invalidInput("需要已选的本机目录和文件会话");
      this.sessions.checkLocalDirectory(request.localFileSessionId, request.directory.path);
    }
    this.busy = true;
    try {
      if (!(await this.available())) throw errors.invalidInput("Windows 原生 ZIP 后端不可用");
      return await this.withDevice(request.directory, signal, (device, active) => this.inWorkspace(device, request, zip, active));
    } finally {
      this.busy = false;
    }
  }

  private available() {
    this.nativeProbe ??= windowsZip("probe", "").then(
      (result) => result === "zip",
      () => false,
    );
    return this.nativeProbe;
  }

  private withDevice<T>(endpoint: TransferEndpoint, signal: AbortSignal, use: (device: Device, active: AbortSignal) => Promise<T>) {
    if (endpoint.kind === "local") {
      const tree = localTree(endpoint.path);
      return use({ tree, file: (parts) => localTransferFile(tree.path(parts)) }, signal);
    }
    return this.manager.withSftp(
      this.sessions.source(endpoint),
      "archive",
      endpoint.path,
      async (channel, active) => {
        const tree = remoteTree(channel, endpoint.path);
        return use({ tree, file: (parts) => remoteTransferFile(channel, tree.path(parts)) }, active);
      },
      { signal, timeoutMs: 120_000 },
    );
  }

  private async inWorkspace(device: Device, request: ArchiveRequest, zipName: string, signal: AbortSignal): Promise<ArchiveResult> {
    if ((await device.tree.stat([]))?.kind !== "dir") throw errors.invalidInput("归档所在目录不可用");
    const tempRoot = path.resolve(tmpdir());
    const stage = await mkdtemp(path.join(tempRoot, "huhu-ssh-zip-"));
    const relative = path.relative(tempRoot, stage);
    if (!relative.startsWith("huhu-ssh-zip-") || relative.includes(path.sep)) throw errors.invalidInput("本机归档暂存路径异常");
    try {
      const stagedZip = localTransferFile(path.join(stage, "payload.zip"));
      const boundZip = device.file([zipName]);
      if (request.operation === "compress") return await this.compress(device, request.name, boundZip, stagedZip, stage, signal);
      if (request.operation === "extract" && (await device.tree.stat([request.output!]))) throw errors.nameConflict(request.output!);
      const original = await readRequired(boundZip, signal);
      await writeChecked(boundZip, stagedZip, original, signal);
      if (!sameSnapshot(original, await fingerprint(boundZip, signal))) throw transferChanged("ZIP 文件");
      const results = members(await windowsZip("read", stage, signal));
      if (request.operation === "extract") {
        await this.extract(device, request.output!, results, stage, signal);
      }
      return { archivePath: boundZip.path, archiveSha256: original.hash, entries: publicEntries(results), ...(request.operation === "extract" ? { extractedPath: device.tree.path([request.output!]) } : {}) };
    } finally {
      await rm(stage, { recursive: true, force: true, maxRetries: 3 });
    }
  }

  private async compress(device: Device, name: string, boundZip: TransferFile, stagedZip: TransferFile, stage: string, signal: AbortSignal): Promise<ArchiveResult> {
    if (await boundZip.stat()) throw errors.nameConflict(boundZip.path);
    const plan = await scanTree(device.tree, [name], ZIP_MAX_ENTRIES, true, signal);
    let size = 0;
    const entries: Member[] = [];
    for (const [index, item] of plan.entries()) {
      if (item.error || !item.stat || item.parts.some((part) => !memberName(part))) throw errors.invalidInput(`无法压缩：${item.error ?? item.parts.join("/")}`);
      const directory = item.stat.kind === "dir";
      const row = { index, name: item.parts.join("/") + (directory ? "/" : ""), directory, mtime: item.stat.mtime, size: directory ? 0 : item.stat.size, parts: item.parts };
      if (directory) {
        entries.push(row);
        continue;
      }
      size += item.stat.size;
      if (size > ZIP_MAX_BYTES) throw errors.invalidInput("压缩源超过 16 MiB 上限");
      const source = device.file(item.parts);
      const original = await readRequired(source, signal);
      if (!sameSnapshot(original, item.stat)) throw transferChanged("压缩源文件");
      await writeChecked(source, localTransferFile(path.join(stage, `${index}.bin`)), original, signal);
      if (!sameSnapshot(original, await fingerprint(source, signal))) throw transferChanged("压缩源文件");
      entries.push({ ...row, sha256: original.hash });
    }
    await writeFile(path.join(stage, "entries.json"), JSON.stringify(entries), "utf8");
    await windowsZip("create", stage, signal);
    const archive = await readRequired(stagedZip, signal);
    const temp = boundZip.sibling(`.huhu-zip-${randomUUID()}.part`);
    await writeChecked(stagedZip, temp, archive, signal);
    try {
      signal.throwIfAborted();
      await temp.install(boundZip);
    } finally {
      await removeTemp(temp);
    }
    return { archivePath: boundZip.path, archiveSha256: archive.hash, entries: publicEntries(entries) };
  }

  private async extract(device: Device, output: string, entries: Member[], stage: string, signal: AbortSignal) {
    const { tree } = device;
    const stageName = `.huhu-zip-${randomUUID()}`;
    const directories = new Map<string, { parts: string[]; stamp?: number }>();
    for (const entry of entries) {
      for (let i = 1; i <= entry.parts.length - (entry.directory ? 0 : 1); i++) {
        const parts = entry.parts.slice(0, i);
        const key = parts.join("/").toLowerCase();
        if (entry.directory && i === entry.parts.length) directories.set(key, { parts, stamp: entry.mtime });
        else if (!directories.has(key)) directories.set(key, { parts });
      }
    }
    const built = [[stageName]];
    const written: TransferFile[] = [];
    await tree.mkdir([stageName]);
    try {
      const inOrder = [...directories.values()].sort((a, b) => a.parts.length - b.parts.length);
      for (const { parts } of inOrder) {
        signal.throwIfAborted();
        const dir = [stageName, ...parts];
        await tree.mkdir(dir);
        built.push(dir);
      }
      for (const entry of entries) {
        if (entry.directory) continue;
        signal.throwIfAborted();
        const bytes = localTransferFile(path.join(stage, `${entry.index}.bin`));
        const digest = await readRequired(bytes, signal);
        if (digest.hash !== entry.sha256 || digest.size !== entry.size) throw transferChanged("ZIP 成员");
        const result = device.file([stageName, ...entry.parts]);
        await writeChecked(bytes, result, digest, signal, entry.mtime);
        written.push(result);
      }
      for (const { parts, stamp } of inOrder.reverse()) if (stamp !== undefined) await tree.touchDirectory([stageName, ...parts], stamp);
      signal.throwIfAborted();
      if (await tree.stat([output])) throw errors.nameConflict(output);
      await tree.moveDirectory([stageName], [output]);
    } catch (error) {
      let cleanupFailed = false;
      for (const file of written)
        await removeTemp(file).catch(() => {
          cleanupFailed = true;
        });
      for (const dir of built.reverse())
        await tree.rmdir(dir).catch(() => {
          cleanupFailed = true;
        });
      if (cleanupFailed) throw new HuhuError("INTERNAL", `解压失败，独立暂存目录尚待检查：${tree.path([stageName])}`);
      throw error;
    }
  }
}
