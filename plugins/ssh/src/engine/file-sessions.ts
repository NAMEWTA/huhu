import { randomUUID } from "node:crypto";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import type { Client } from "ssh2";
import type { z } from "zod";
import type { DirectoryFollowState, FileAttributes, FileDirectory, FileEntry, FileOrigin, FileSession, PreparedFileDirectory } from "../shared/files.js";
import type { SshManager, SftpSource } from "./manager.js";
import { changeProperties, createEntry, documentPath, list, moveEntry, openDocument, properties, saveDocument, searchNames } from "./sftp.js";

type Navigation = { follow?: { id: string; path: string; revision: number; expires: number } };
type OwnedOrigin = { client: Client; signal: AbortSignal; origin: z.infer<typeof FileOrigin> };
type Binding = { session: FileSession; controller: AbortController; detached: boolean; localRoot?: string; search?: AbortController; navigation?: Navigation; owned?: OwnedOrigin };

export class FileSessions {
  private readonly bindings = new Map<string, Binding>();
  private readonly entryWrites = new Map<string, Promise<unknown>>();
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
    const { session, owned } = this.lookup(id);
    const ready = owned ? !owned.signal.aborted : this.manager.fileOrigin(session.hostId)?.connectionId === session.connectionId;
    return { ...session, state: ready ? "ready" : "disconnected" };
  }

  openOwned(owned: OwnedOrigin): FileSession {
    if (this.disposed) throw errors.notFound("文件会话所属的 Vault 已关闭");
    owned.signal.throwIfAborted();
    const session: FileSession = { ...owned.origin, fileSessionId: randomUUID(), source: "external", state: "ready" };
    this.bindings.set(session.fileSessionId, { session, owned, detached: true, controller: new AbortController() });
    return session;
  }

  list(): FileSession[] {
    return [...this.bindings.entries()].filter(([, binding]) => binding.detached).map(([id]) => this.get(id));
  }

  restoreTransferOrigin(session: FileSession): FileSession {
    if (this.disposed) throw errors.notFound("文件会话所属的 Vault 已关闭");
    const binding = this.bindings.get(session.fileSessionId);
    if (binding) binding.detached = true;
    else this.bindings.set(session.fileSessionId, { session, detached: true, controller: new AbortController() });
    return this.get(session.fileSessionId);
  }

  checkLocalDirectory(id: string, directory: string): void {
    const root = this.lookup(id).localRoot;
    if (!root || !path.isAbsolute(directory)) throw errors.invalidInput("请先在该双栏选择本机目录");
    const relative = path.relative(root, directory);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) throw errors.invalidInput("本机目录超出所选范围");
  }

  source(input: { hostId: string } | { fileSessionId: string }): SftpSource {
    if ("hostId" in input) return input.hostId;
    const { session, controller, owned } = this.lookup(input.fileSessionId);
    if (owned) return { ...session, externalClient: owned.client, signal: AbortSignal.any([controller.signal, owned.signal]) };
    return { ...session, signal: controller.signal };
  }

  close(id: string, attached = false): void {
    const binding = this.bindings.get(id);
    if (attached && binding?.detached) return;
    binding?.controller.abort();
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

  directoryState(id: string): DirectoryFollowState {
    const binding = this.lookup(id);
    return binding.detached ? { state: "unsupported", revision: 0 } : this.manager.directoryState(binding.session);
  }

  async prepareDirectory(id: string, path: string, revision: number, signal: AbortSignal): Promise<PreparedFileDirectory> {
    const binding = this.lookup(id);
    const navigation: Navigation = {};
    binding.navigation = navigation;
    const before = this.directoryState(id);
    const directory = await this.manager.withSftp(this.source({ fileSessionId: id }), "list", path, (channel) => list(channel, path), { signal });
    signal.throwIfAborted();
    binding.controller.signal.throwIfAborted();
    const now = this.directoryState(id);
    if (before.state !== "ready" || before.revision !== revision || now.state !== "ready" || now.revision !== revision || binding.navigation !== navigation) {
      return { ...directory, skipped: true };
    }
    if (now.cwd === directory.path) return { ...directory, skipped: false };
    const follow = randomUUID();
    navigation.follow = { id: follow, path: directory.path, revision, expires: performance.now() + 5000 };
    return { ...directory, follow, skipped: false };
  }

  commitDirectory(id: string, token: string): boolean {
    const binding = this.lookup(id);
    const follow = binding.navigation?.follow;
    if (!follow || follow.id !== token || binding.detached) return false;
    delete binding.navigation;
    return follow.expires >= performance.now() && this.manager.followDirectory(binding.session, follow.revision, follow.path);
  }

  properties(id: string, path: string, signal: AbortSignal) {
    return this.manager.withSftp(this.source({ fileSessionId: id }), "properties", path, (channel) => properties(channel, path), { signal });
  }

  changeProperties(id: string, path: string, revision: string, change: FileAttributes, signal: AbortSignal) {
    const { session } = this.lookup(id);
    return this.manager.withSftp(
      this.source({ fileSessionId: id }),
      "attributes",
      path,
      async (channel, active) => {
        const abs = await documentPath(channel, path);
        return this.writeEntry(session, abs, () => changeProperties(channel, path, revision, change, active));
      },
      { signal },
    );
  }

  async createEntry(id: string, path: string, entry: { kind: "file" } | { kind: "link"; target: string }, signal: AbortSignal) {
    await this.manager.withSftp(this.source({ fileSessionId: id }), "create", path, (channel, active) => createEntry(channel, path, entry, active), { signal });
    return { ok: true as const };
  }

  async moveEntry(id: string, path: string, revision: string, destination: string, signal: AbortSignal) {
    await this.manager.withSftp(this.source({ fileSessionId: id }), "move", path, (channel, active) => moveEntry(channel, path, revision, destination, active), { signal });
    return { ok: true as const };
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
        return this.writeEntry(session, abs, () => {
          active.throwIfAborted();
          return saveDocument(channel, abs, text, version, active);
        });
      },
      { signal },
    );
  }

  private async writeEntry<T>(session: FileSession, abs: string, update: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([session.host.toLowerCase(), session.port, abs]);
    const writing = (this.entryWrites.get(key) ?? Promise.resolve()).catch(() => undefined).then(update);
    this.entryWrites.set(key, writing);
    try {
      return await writing;
    } finally {
      if (this.entryWrites.get(key) === writing) this.entryWrites.delete(key);
    }
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
