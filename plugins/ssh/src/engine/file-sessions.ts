import { randomUUID } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import type { FileDirectory, FileEntry, FileSession } from "../shared/files.js";
import type { SshManager, SftpSource } from "./manager.js";
import { documentPath, openDocument, saveDocument, searchNames } from "./sftp.js";

type Binding = { session: FileSession; controller: AbortController; detached: boolean; localRoot?: string; search?: AbortController };

export class FileSessions {
  private readonly bindings = new Map<string, Binding>();
  private readonly documentWrites = new Map<string, Promise<unknown>>();
  private disposed = false;

  constructor(private readonly manager: SshManager) {}

  open(input: { hostId: string; shellId?: string | undefined; attached: boolean } | { fromFileSessionId: string }): FileSession {
    if (this.disposed) throw errors.notFound("文件会话所属的 Vault 已关闭");
    const from = "fromFileSessionId" in input ? this.get(input.fromFileSessionId) : undefined;
    const origin = from ?? ("hostId" in input ? this.manager.fileOrigin(input.hostId, input.shellId) : undefined);
    if (!origin || ("state" in origin && origin.state !== "ready")) throw new HuhuError("SSH_DISCONNECTED", "文件会话的原连接已断开");
    const shellId = "shellId" in input ? input.shellId : from?.shellId;
    const session: FileSession = { ...origin, fileSessionId: randomUUID(), ...(shellId ? { shellId } : {}), state: "ready" };
    this.bindings.set(session.fileSessionId, { session, detached: !("attached" in input && input.attached), controller: new AbortController() });
    return session;
  }

  get(id: string): FileSession {
    const { session } = this.lookup(id);
    return { ...session, state: this.manager.fileOrigin(session.hostId)?.connectionId === session.connectionId ? "ready" : "disconnected" };
  }

  list(): FileSession[] {
    return [...this.bindings.entries()].filter(([, binding]) => binding.detached).map(([id]) => this.get(id));
  }

  source(input: { hostId: string } | { fileSessionId: string }): SftpSource {
    if ("hostId" in input) return input.hostId;
    const { session, controller } = this.lookup(input.fileSessionId);
    return { ...session, signal: controller.signal };
  }

  close(id: string): void {
    this.bindings.get(id)?.controller.abort();
    this.bindings.delete(id);
  }

  dispose(): void {
    this.disposed = true;
    for (const id of this.bindings.keys()) this.close(id);
  }

  async search(id: string, dir: string, query: string, signal: AbortSignal) {
    const binding = this.lookup(id);
    if (binding.search) throw errors.invalidInput("此文件会话已有搜索在运行");
    const search = new AbortController();
    binding.search = search;
    try {
      return await this.manager.withSftp(this.source({ fileSessionId: id }), "search", dir || "~", (channel, active) => searchNames(channel, dir, query, active), {
        signal: AbortSignal.any([signal, search.signal]),
      });
    } finally {
      delete binding.search;
    }
  }

  cancelSearch(id: string): boolean {
    const search = this.lookup(id).search;
    if (!search) return false;
    search.abort();
    return true;
  }

  readDocument(id: string, file: string, signal: AbortSignal) {
    return this.manager.withSftp(this.source({ fileSessionId: id }), "document.open", file, (channel, active) => openDocument(channel, file, active), { signal });
  }

  writeDocument(id: string, file: string, text: string, version: string, signal: AbortSignal) {
    const { session } = this.lookup(id);
    return this.manager.withSftp(
      this.source({ fileSessionId: id }),
      "document.save",
      file,
      async (channel, active) => {
        const abs = await documentPath(channel, file);
        const key = JSON.stringify([session.host.toLowerCase(), session.port, abs]);
        const writing = (this.documentWrites.get(key) ?? Promise.resolve())
          .catch(() => undefined)
          .then(() => {
            active.throwIfAborted();
            return saveDocument(channel, abs, text, version, active);
          });
        this.documentWrites.set(key, writing);
        try {
          return await writing;
        } finally {
          if (this.documentWrites.get(key) === writing) this.documentWrites.delete(key);
        }
      },
      { signal },
    );
  }

  async localList(id: string, parts: string[], root?: string): Promise<FileDirectory> {
    const binding = this.lookup(id);
    const requestedRoot = root ?? binding.localRoot;
    if (!requestedRoot || !path.isAbsolute(requestedRoot) || requestedRoot.includes("\0") || /^(?:\\\\|\/\/)/.test(requestedRoot)) throw errors.invalidInput("请选择本机目录");
    if (parts.some((part) => !part || part === "." || part === ".." || /[\\/:\0]/.test(part))) throw errors.invalidInput("本机目录层级无效");
    try {
      const canonical = await realpath(requestedRoot);
      if (!root && canonical !== binding.localRoot) throw errors.invalidInput("本机目录已改动，请重新选择");
      let dir = canonical;
      for (const part of parts) {
        dir = path.join(dir, part);
        const info = await lstat(dir);
        if (!info.isDirectory() || info.isSymbolicLink()) throw errors.invalidInput("只能进入所选目录下的真实文件夹");
      }
      const resolved = await realpath(dir);
      if (resolved !== dir) throw errors.invalidInput("本机目录已改动，请重新选择");
      const rows = await readdir(dir, { withFileTypes: true });
      const entries: FileEntry[] = [];
      for (const row of rows) {
        binding.controller.signal.throwIfAborted();
        const info = await lstat(path.join(dir, row.name));
        entries.push({ name: row.name, type: row.isSymbolicLink() ? "link" : row.isDirectory() ? "dir" : row.isFile() ? "file" : "other", size: info.size, mtime: info.mtimeMs, mode: (info.mode & 0o777).toString(8).padStart(3, "0") });
      }
      if (root) binding.localRoot = canonical;
      return { path: dir, entries };
    } catch (error) {
      if (error instanceof HuhuError) throw error;
      throw errors.invalidInput("无法读取本机目录");
    }
  }

  private lookup(id: string): Binding {
    const binding = this.bindings.get(id);
    if (!binding) throw errors.notFound("文件会话已关闭");
    return binding;
  }
}
