import { Readable } from "node:stream";
import { CapabilityIntentKeySchema, errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext } from "@huhu/kernel";
import type { SFTPWrapper } from "ssh2";
import { z } from "zod";
import { FileProperties, FileSession, FileSessionId, RemoteFilePath } from "../shared/files.js";
import { FileSessions } from "./file-sessions.js";
import type { SshCredentialHost } from "./host-configurations.js";
import { type HostIntents, withIntentSeal } from "./host-intents.js";
import type { SshManager } from "./manager.js";
import { OwnedConnection, type PublicSshProbes } from "./public-probes.js";
import { externalSshOwner, selectedSshHosts } from "./public-resources.js";
import * as sftp from "./sftp.js";

export const OpenOwnedFiles = OwnedConnection.extend({ intentKey: CapabilityIntentKeySchema });
export const FileIntentFields = { intentKey: CapabilityIntentKeySchema.optional() };
export const TargetRevision = FileProperties.shape.revision;
export const TransferHandle = FileSessionId.extend({ transferId: z.uuid() });
const chunkLimit = 256 * 1024;
export const UploadBytes = TransferHandle.extend({
  remotePath: RemoteFilePath,
  intentKey: CapabilityIntentKeySchema,
  dataBase64: z.base64().max(Math.ceil(chunkLimit / 3) * 4).refine((data) => Buffer.byteLength(data, "base64") <= chunkLimit),
  overwrite: z.boolean().default(false),
  expectedRevision: TargetRevision.optional(),
});
export const DownloadBytes = TransferHandle.extend({
  remotePath: RemoteFilePath,
  offset: z.int().min(0).max(Number.MAX_SAFE_INTEGER - chunkLimit).default(0),
  limit: z.int().min(1).max(chunkLimit).default(chunkLimit),
});
export const DownloadPage = z.strictObject({ dataBase64: z.base64(), size: z.int().min(0).max(chunkLimit), nextOffset: z.int().nonnegative(), eof: z.boolean() });
const Size = z.strictObject({ size: z.int().nonnegative() });
const Ok = z.strictObject({ ok: z.literal(true) });

type Owned = {
  owner: string;
  connection: z.infer<typeof OwnedConnection>;
  hostIds: readonly string[];
  usedRequestIds: Set<string>;
  closed?: true;
  removeListener(): void;
  timer?: NodeJS.Timeout;
};

export class PublicFileSessions {
  readonly files: FileSessions;
  private readonly bindings = new Map<string, Owned>();
  private readonly activeRequests = new Map<string, AbortController>();

  constructor(
    private readonly manager: SshManager,
    private readonly connections: PublicSshProbes,
    private readonly intents: HostIntents | undefined,
    private readonly credentials: SshCredentialHost | undefined,
    private readonly changed: (id: string) => void,
  ) {
    this.files = new FileSessions(manager);
  }

  open(context: CapabilityContext, { intentKey, ...connection }: z.infer<typeof OpenOwnedFiles>) {
    const active = () => this.connections.connection(context, connection);
    const owner = externalSshOwner(context);
    const { hostIds } = active();
    return this.intentStore().run(context, "ssh.fileSessions.open", {
      hosts: hostIds,
      intentKey,
      input: connection,
      output: FileSession,
      authorize: () => active().hostIds,
      run: async () => {
        const current = active();
        if (this.bindings.size >= 64 || [...this.bindings.values()].filter((binding) => binding.owner === owner && !binding.closed).length >= 8) {
          throw errors.invalidInput("SSH 文件会话数量已达上限");
        }
        const session = this.files.openOwned(current);
        const id = session.fileSessionId;
        const close = () => this.closeWorkbench(id);
        current.signal.addEventListener("abort", close, { once: true });
        this.bindings.set(id, { owner, connection, hostIds, usedRequestIds: new Set(), removeListener: () => current.signal.removeEventListener("abort", close) });
        this.changed(id);
        return session;
      },
    });
  }

  list(context: CapabilityContext) {
    const owner = externalSshOwner(context);
    const selected = selectedSshHosts(context);
    return this.files.list().filter(({ fileSessionId }) => {
      const binding = this.bindings.get(fileSessionId);
      if (binding?.owner !== owner || binding.hostIds.some((id) => !selected.has(id))) return false;
      try {
        this.connections.connection(context, binding.connection);
        return true;
      } catch (error) {
        if (!(error instanceof HuhuError)) throw error;
        return false;
      }
    });
  }

  authorize(context: CapabilityContext, fileSessionId: string) {
    return this.require(context, fileSessionId).hostIds;
  }

  close(context: CapabilityContext, request: z.infer<typeof FileSessionId> & { intentKey?: string | undefined }) {
    return this.mutate(context, "ssh.fileSessions.close", request, {}, Ok, async () => {
      this.closeWorkbench(request.fileSessionId);
      return { ok: true as const };
    }, true);
  }

  closeWorkbench(id: string): boolean {
    const binding = this.bindings.get(id);
    if (!binding) return false;
    if (binding.closed) return true;
    binding.closed = true;
    binding.removeListener();
    this.files.close(id);
    binding.timer = setTimeout(() => this.bindings.delete(id), 300_000);
    binding.timer.unref();
    this.changed(id);
    return true;
  }

  async use<T>(context: CapabilityContext, id: string, work: (files: FileSessions) => Promise<T> | T): Promise<T> {
    this.require(context, id);
    context.signal.throwIfAborted();
    try {
      return await work(this.files);
    } finally {
      this.require(context, id);
      context.signal.throwIfAborted();
    }
  }

  withSftp<T>(context: CapabilityContext, id: string, work: (channel: SFTPWrapper, signal: AbortSignal) => Promise<T>, request?: { kind: "transfer" | "search"; id: string }) {
    if (request) {
      const generation = JSON.stringify([request.kind, request.id]);
      const key = JSON.stringify([id, generation]);
      return this.use(context, id, async (files) => {
        const { usedRequestIds } = this.require(context, id);
        if (usedRequestIds.has(generation)) throw errors.invalidInput("该 SSH 请求 ID 已使用");
        if (usedRequestIds.size >= 4096 || this.activeRequests.size >= 16) throw errors.invalidInput("SSH 文件请求数量已达上限");
        usedRequestIds.add(generation);
        const controller = new AbortController();
        const signal = AbortSignal.any([context.signal, controller.signal]);
        this.activeRequests.set(key, controller);
        try {
          return await this.manager.withSftp(files.source({ fileSessionId: id }), "external", "", work, { signal, timeoutMs: 30_000 });
        } finally {
          this.activeRequests.delete(key);
        }
      });
    }
    return this.use(context, id, (files) =>
      this.manager.withSftp(files.source({ fileSessionId: id }), "external", "", work, { signal: context.signal, timeoutMs: 30_000 }),
    );
  }

  download(context: CapabilityContext, { fileSessionId, remotePath, offset, limit, transferId }: z.infer<typeof DownloadBytes>) {
    return this.withSftp(context, fileSessionId, (channel, signal) => sftp.downloadChunk(channel, remotePath, offset, limit, signal), { kind: "transfer", id: transferId });
  }

  cancelTransfer(context: CapabilityContext, { fileSessionId, transferId, intentKey }: z.infer<typeof TransferHandle> & { intentKey?: string | undefined }) {
    return this.cancelRequest(context, "ssh.sftp.cancel", { fileSessionId, intentKey }, "transfer", transferId);
  }

  cancelRequest(context: CapabilityContext, capability: string, request: z.infer<typeof FileSessionId> & { intentKey?: string | undefined }, kind: "transfer" | "search", id: string) {
    const key = JSON.stringify([request.fileSessionId, JSON.stringify([kind, id])]);
    return this.mutate(context, capability, request, { id }, z.strictObject({ cancelled: z.boolean() }), async () => {
      const pending = this.activeRequests.get(key);
      if (!pending || pending.signal.aborted) return { cancelled: false };
      pending.abort();
      return { cancelled: true };
    });
  }

  seal(context: CapabilityContext, id: string, capability: string, content: string) {
    this.require(context, id);
    return withIntentSeal(this.credentials, (seal) => seal([capability, content]));
  }

  async write(
    context: CapabilityContext,
    capability: string,
    { fileSessionId, intentKey, overwrite, expectedRevision, transferId }: z.infer<typeof FileSessionId> & { intentKey?: string | undefined; overwrite: boolean; expectedRevision?: string | undefined; transferId?: string },
    remotePath: string,
    content: Buffer,
  ) {
    const request = { fileSessionId, intentKey };
    if (overwrite && !expectedRevision) throw errors.invalidInput("覆盖远端文件需要原文件修订");
    const digest = await this.seal(context, fileSessionId, capability, content.toString("base64"));
    return this.mutate(context, capability, request, { remotePath, digest, overwrite, expectedRevision, transferId }, Size, (assertCurrent) =>
      this.withSftp(context, fileSessionId, (channel, signal) => sftp.writeAtomic(channel, remotePath, Readable.from(content), {
        overwrite,
        signal,
        verifyTarget: async () => {
          if (expectedRevision) await assertEntryRevision(channel, remotePath, expectedRevision);
          assertCurrent();
        },
      }), transferId ? { kind: "transfer", id: transferId } : undefined),
    );
  }

  mutate<T>(
    context: CapabilityContext,
    capability: string,
    { fileSessionId, intentKey }: z.infer<typeof FileSessionId> & { intentKey?: string | undefined },
    input: unknown,
    output: z.ZodType<T>,
    run: (assertCurrent: () => void) => Promise<T>,
    closed = false,
  ) {
    const authorize = () => this.require(context, fileSessionId, closed).hostIds;
    const hosts = authorize();
    if (!intentKey) throw errors.invalidInput("外部 SSH 文件变更需要稳定意图键");
    return this.intentStore().run(context, capability, {
      hosts,
      intentKey,
      input: [fileSessionId, input],
      output,
      authorize,
      run: async (assertCurrent) => {
        try {
          return await run(assertCurrent);
        } catch (error) {
          if (error instanceof HuhuError && ["NOT_FOUND", "INVALID_INPUT", "NAME_CONFLICT", "VERSION_CONFLICT"].includes(error.code)) {
            throw new HuhuError(error.code, "SSH 文件操作未完成");
          }
          throw new HuhuError("INTERNAL", "SSH 文件操作结果待核实", { retryable: false, details: { outcome: "unknown" } });
        }
      },
    });
  }

  dispose() {
    this.files.dispose();
    for (const binding of this.bindings.values()) {
      binding.removeListener();
      clearTimeout(binding.timer);
    }
    this.bindings.clear();
    this.activeRequests.clear();
  }

  private require(context: CapabilityContext, id: string, closed = false): Owned {
    const binding = this.bindings.get(id);
    if (binding?.owner !== externalSshOwner(context)) throw errors.notFound("SSH 文件会话");
    this.connections.connection(context, binding.connection);
    if (binding.closed && !closed) throw errors.notFound("SSH 文件会话");
    return binding;
  }

  private intentStore(): HostIntents {
    if (!this.intents) throw errors.invalidInput("此 Vault 无法保存 SSH 文件会话意图");
    return this.intents;
  }
}

export async function assertEntryRevision(channel: SFTPWrapper, path: string, revision: string) {
  const current = await sftp.properties(channel, path);
  if (current.revision !== revision) throw errors.versionConflict(current.revision);
}
