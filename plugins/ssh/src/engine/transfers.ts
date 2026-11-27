import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { errors, HuhuError } from "@huhu/contracts";
import type { z } from "zod";
import path from "node:path";
import type { TransferBatch, TransferBatchRequest, TransferChoice, TransferEndpoint, TransferJob, TransferOrigin, TransferQueue, TransferRequest } from "../shared/transfers.js";
import { defaultVaultPreferences } from "../shared/preferences.js";
import type { FileSessions } from "./file-sessions.js";
import type { SshManager } from "./manager.js";
import { digest, fingerprint, localTransferFile, remoteTransferFile, removeTemp, sameSnapshot, transferChanged, type Snapshot, type TransferFile } from "./transfer-io.js";
import { localTree, remoteTree, sameDirectory, scanTree, type TransferTree, type TreeItem, type TreeStat } from "./transfer-tree.js";
import type { TransferRecovery } from "./transfer-recovery.js";

const LIVE_LIMIT = 32;
const HISTORY_LIMIT = 64;
const terminal = new Set<TransferJob["state"]>(["completed", "failed", "cancelled", "skipped"]);
type Plan = { source: Snapshot; target: Snapshot | null };
type Publication = {
  staged: { name: string; path: string; snapshot: Snapshot };
  backup?: { name: string; path: string; snapshot: Snapshot };
  failure?: { message: string; code: string };
};
type Batch = Omit<TransferBatch, "state">;
type Record = {
  job: TransferJob;
  recovered?: boolean;
  controller?: AbortController;
  plan?: Plan;
  choice?: "replace" | "resume" | "merge";
  pausedFrom?: "queued" | "running";
  pauseVersion?: number;
  publication?: Publication;
  wake?: () => void;
  locks: string[];
  parentId?: string;
  initial?: TreeStat;
  directoryTarget?: TreeStat | null;
};

function location(origin: TransferOrigin): string {
  return origin.kind === "remote" ? `ssh:${origin.session.connectionId}` : `file:${origin.path.toLowerCase()}`;
}

async function* copyWithPrefix(from: TransferFile, to: TransferFile, length: number, size: number) {
  if (length > 0) yield* to.read(0, length - 1);
  if (size > length) yield* from.read(length, size - 1);
}

export class Transfers {
  private readonly records = new Map<string, Record>();
  private readonly batches = new Map<string, Batch>();
  private readonly active = new Set<Record>();
  private planning = false;
  private disposed = false;

  constructor(
    private readonly sessions: FileSessions,
    private readonly manager: SshManager,
    private readonly changed: (id: string) => void,
    private readonly maxParallel: () => number = () => defaultVaultPreferences.transfer.parallel,
    private readonly owned = false,
    private readonly recovery?: TransferRecovery,
  ) {
    const snapshot = recovery?.load();
    if (!snapshot) return;
    for (const job of snapshot.jobs) {
      if (!terminal.has(job.state)) {
        const unknown = job.state === "committing" || job.state === "uncertain";
        Object.assign(job, {
          state: "failed",
          errorCode: "VERSION_CONFLICT",
          bytesPerSecond: 0,
          message: unknown ? "引擎异常退出，提交结果未知。请核对原目标后重新发起。" : "引擎异常退出，传输已中断。请从新会话重新发起。",
        });
        delete job.conflictRevision;
      }
      this.records.set(job.transferId, { job, recovered: true, locks: [] });
    }
    for (const batch of snapshot.batches) this.batches.set(batch.batchId, batch);
    this.trimHistory();
    this.saveRecovery();
  }

  private saveRecovery() {
    if (!this.disposed) this.recovery?.save(this.list(false));
  }

  preferencesChanged() {
    this.pump();
  }

  list(refresh = true): TransferQueue {
    for (const rec of refresh ? this.records.values() : []) {
      if (terminal.has(rec.job.state) || rec.job.state === "uncertain" || this.active.has(rec)) continue;
      const lost = [rec.job.source, rec.job.target].some((origin) => origin.kind === "remote" && !this.sessions.hasOriginalConnection(origin.session));
      if (lost) this.finish(rec, "failed", "文件会话的原连接已断开", "SSH_DISCONNECTED");
    }
    return {
      jobs: [...this.records.values()].map(({ job }) => ({ ...job })).reverse(),
      batches: [...this.batches.values()].map((batch) => this.batchView(batch)).reverse(),
      liveLimit: LIVE_LIMIT,
      parallel: this.maxParallel(),
      canQueue: this.liveCount() < LIVE_LIMIT,
    };
  }

  find(transferId: string): TransferJob | undefined {
    const job = this.records.get(transferId)?.job;
    return job && { ...job };
  }

  findBatch(batchId: string): TransferBatch | undefined {
    const batch = this.batches.get(batchId);
    return batch && this.batchView(batch);
  }

  releaseFileSession(id: string): void {
    for (const rec of this.records.values()) {
      if (terminal.has(rec.job.state) || rec.job.state === "uncertain") continue;
      if (![rec.job.source, rec.job.target].some((origin) => origin.kind === "remote" && origin.fileSessionId === id)) continue;
      if (rec.job.state === "committing") rec.controller?.abort();
      else this.cancel(rec.job.transferId);
    }
  }

  start(request: TransferRequest): TransferJob {
    this.checkCapacity(1);
    const source = this.origin(request.source);
    const target = this.origin(request.target);
    this.checkEndpoints(source, target);
    const record = this.add(source, target);
    this.saveRecovery();
    this.changed(record.job.transferId);
    queueMicrotask(() => this.pump());
    return { ...record.job };
  }

  async startBatch(request: TransferBatchRequest, signal: AbortSignal): Promise<TransferBatch> {
    this.checkCapacity(1);
    if (this.planning) throw errors.invalidInput("正在核对另一批目录，请稍后再试");
    const source = this.origin(request.source, true);
    const target = this.origin(request.target, true);
    this.checkEndpoints(source, target);
    for (const origin of [source, target])
      if (origin.kind === "local") {
        if (!request.localFileSessionId) throw errors.invalidInput("请先在双栏选择本机目录");
        this.sessions.checkLocalDirectory(request.localFileSessionId, origin.path);
      }
    this.planning = true;
    let items: TreeItem[];
    try {
      await this.withTree(target, signal, async (tree) => {
        if ((await tree.stat([]))?.kind !== "dir") throw errors.invalidInput("目标目录不存在或不可用");
      });
      items = await this.withTree(source, signal, (tree, active) => scanTree(tree, request.names, LIVE_LIMIT - this.liveCount(), target.kind === "local", active));
    } finally {
      this.planning = false;
    }
    signal.throwIfAborted();
    this.checkCapacity(items.length);
    const batchId = randomUUID();
    const ids = new Map<TreeItem, string>();
    const children = items.map((item) => {
      // Invalid leaf names never reach the IO adapters.
      const sourcePath = item.error ? source.path : this.join(source, item.parts);
      const targetPath = item.error ? target.path : this.join(target, item.parts);
      const parentId = item.parent ? ids.get(item.parent) : undefined;
      const rec = this.add({ ...source, path: sourcePath }, { ...target, path: targetPath }, { batchId, directory: item.stat?.kind === "dir" });
      if (parentId) rec.parentId = parentId;
      if (item.stat) rec.initial = item.stat;
      if (item.error) Object.assign(rec.job, { state: "failed", message: `${item.parts.join("/")} · ${item.error}` });
      ids.set(item, rec.job.transferId);
      return rec.job.transferId;
    });
    const batch = { batchId, source, target, children };
    this.batches.set(batchId, batch);
    this.trimHistory();
    this.saveRecovery();
    this.changed(batchId);
    queueMicrotask(() => this.pump());
    return this.batchView(batch);
  }

  private join(origin: TransferOrigin, parts: string[]) {
    return (origin.kind === "local" ? path : path.posix).join(origin.path, ...parts);
  }

  private add(source: TransferOrigin, target: TransferOrigin, group?: Pick<TransferJob, "batchId" | "directory">): Record {
    const transferId = randomUUID();
    const job: TransferJob = { transferId, source, target, state: "queued", bytes: 0, total: null, bytesPerSecond: 0, ...group };
    const rec = { job, locks: [location(source), location(target)] };
    this.records.set(transferId, rec);
    return rec;
  }

  private checkCapacity(count: number) {
    if (this.disposed) throw errors.notFound("传输中心所属的 Vault 已关闭");
    if (this.liveCount() + count > LIVE_LIMIT) throw errors.invalidInput("传输队列已满，请等待任务结束或取消待处理任务");
  }

  private checkEndpoints(source: TransferOrigin, target: TransferOrigin) {
    if (source.kind === "local" && target.kind === "local") throw errors.invalidInput("至少选择一个 SSH 端点");
    if (source.kind === "remote" && target.kind === "remote" && source.session.connectionId === target.session.connectionId) throw errors.invalidInput("跨远端复制需要两个独立 SSH 连接");
  }

  decide(id: string, choice: z.infer<typeof TransferChoice>): TransferJob {
    const rec = this.lookup(id);
    if (rec.job.state !== "waiting") throw errors.invalidInput("此任务当前无需覆盖确认");
    if ((rec.job.directory && (choice === "replace" || choice === "resume")) || (!rec.job.directory && choice === "merge")) throw errors.invalidInput("请按项目类型处理冲突");
    if (choice === "replace" || choice === "resume" || choice === "merge") {
      rec.choice = choice;
      this.update(rec, { state: "queued" });
      queueMicrotask(() => this.pump());
    } else {
      this.finish(rec, choice === "reject" ? "cancelled" : "skipped", "已保留原目标");
      queueMicrotask(() => this.pump());
    }
    return { ...rec.job };
  }

  cancel(id: string): TransferJob {
    const rec = this.lookup(id);
    if (rec.job.state === "committing") throw errors.invalidInput("任务正在提交目标，请等待结果");
    if (terminal.has(rec.job.state) || rec.job.state === "uncertain") return { ...rec.job };
    const inFlight = rec.job.state === "checking" || rec.job.state === "running" || rec.job.state === "cancelling" || (rec.job.state === "paused" && rec.pausedFrom === "running");
    if (rec.controller && inFlight) {
      this.update(rec, { state: "cancelling" });
      rec.controller.abort();
    } else {
      this.finish(rec, "cancelled", "已取消，原件保持");
      queueMicrotask(() => this.pump());
    }
    return { ...rec.job };
  }

  pause(id: string): TransferJob {
    const rec = this.lookup(id);
    if (rec.job.state !== "queued" && rec.job.state !== "running") throw errors.invalidInput("任务当前不能暂停");
    rec.pausedFrom = rec.job.state;
    rec.pauseVersion = (rec.pauseVersion ?? 0) + 1;
    this.update(rec, { state: "paused", bytesPerSecond: 0 });
    return { ...rec.job };
  }

  resume(id: string): TransferJob {
    const rec = this.lookup(id);
    if (rec.job.state !== "paused") throw errors.invalidInput("任务当前未暂停");
    this.update(rec, { state: rec.pausedFrom ?? "queued" });
    delete rec.pausedFrom;
    rec.wake?.();
    queueMicrotask(() => this.pump());
    return { ...rec.job };
  }

  retry(id: string): TransferJob {
    const rec = this.lookup(id);
    if (rec.recovered || rec.job.state !== "failed" || rec.job.errorCode === "VERSION_CONFLICT") throw errors.invalidInput("当前任务需要重新发起并核对目标");
    if (this.liveCount() >= LIVE_LIMIT) throw errors.invalidInput("传输队列已满");
    for (const origin of [rec.job.source, rec.job.target]) {
      if (origin.kind !== "remote") continue;
      if (!this.sessions.hasOriginalConnection(origin.session)) {
        throw new HuhuError("SSH_DISCONNECTED", "原连接已断开，请从新文件会话重新发起");
      }
      if (origin.sudoSessionId) this.sessions.sudoSource(origin.fileSessionId, origin);
    }
    delete rec.job.errorCode;
    delete rec.job.message;
    this.update(rec, { state: "queued", bytes: 0 });
    queueMicrotask(() => this.pump());
    return { ...rec.job };
  }

  async recheck(id: string, signal: AbortSignal): Promise<TransferJob> {
    const rec = this.lookup(id);
    if (rec.job.state !== "uncertain" || this.active.has(rec)) return { ...rec.job };
    if (this.active.size >= this.maxParallel() || [...this.active].some(({ locks }) => locks.some((lock) => rec.locks.includes(lock)))) {
      throw errors.invalidInput("原端点正在传输，请稍后重查提交结果");
    }
    rec.controller = new AbortController();
    this.active.add(rec);
    try {
      await this.reconcile(rec, AbortSignal.any([signal, rec.controller.signal]));
      return { ...rec.job };
    } finally {
      delete rec.controller;
      this.active.delete(rec);
      this.pump();
    }
  }

  openOrigin(id: string) {
    const record = this.lookup(id);
    if (record.recovered) throw new HuhuError("SSH_DISCONNECTED", "引擎已重启，原文件会话已关闭");
    const { source, target } = record.job;
    const remote = source.kind === "remote" ? source : target;
    if (remote.kind !== "remote") throw errors.notFound("任务没有源文件会话");
    const session = remote.session.source === "external" ? this.sessions.get(remote.fileSessionId) : this.sessions.restoreTransferOrigin(remote.session);
    return { ...session, transferPath: remote.path };
  }

  clear(allow: (record: TransferJob | TransferBatch) => boolean = () => true): { removed: number } {
    let removed = 0;
    for (const [id, { job }] of this.records)
      if (!job.batchId && terminal.has(job.state) && allow(job)) {
        this.records.delete(id);
        removed++;
      }
    for (const [id, batch] of this.batches)
      if (this.batchView(batch).state !== "active" && allow(this.batchView(batch))) {
        for (const child of batch.children) if (this.records.delete(child)) removed++;
        this.batches.delete(id);
      }
    if (removed) {
      this.saveRecovery();
      this.changed("history");
    }
    return { removed };
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.active) entry.controller?.abort();
    this.recovery?.clear();
  }

  private lookup(transferId: string): Record {
    const found = this.records.get(transferId);
    if (!found) throw errors.notFound("传输任务已从历史移除");
    return found;
  }

  private origin(input: TransferEndpoint, directory = false): TransferOrigin {
    if (input.kind === "local") return { kind: "local", path: directory ? localTree(input.path).path([]) : localTransferFile(input.path).path };
    const session = this.sessions.get(input.fileSessionId);
    if (input.sudoSessionId && !input.sudo) throw errors.invalidInput("此传输未启用 sudo");
    if (input.sudo && (this.owned || session.source === "external")) throw errors.permissionDenied("本机 SSH 文件 sudo 传输");
    if (input.sudoSessionId) this.sessions.sudoSource(input.fileSessionId, input);
    if (session.state !== "ready") throw new HuhuError("SSH_DISCONNECTED", "传输的原连接已断开");
    return { ...input, session };
  }

  private liveCount() {
    return [...this.records.values()].filter(({ job }) => !terminal.has(job.state)).length;
  }

  private update(rec: Record, patch: Partial<TransferJob>) {
    if (this.owned && patch.state === "waiting") rec.job.conflictRevision = randomUUID();
    const stateChanged = patch.state !== undefined && patch.state !== rec.job.state;
    Object.assign(rec.job, patch);
    if (stateChanged) this.saveRecovery();
    if (!this.disposed) this.changed(rec.job.transferId);
  }

  private finish(rec: Record, state: "completed" | "failed" | "cancelled" | "skipped", message?: string, errorCode?: string) {
    this.update(rec, { state, bytesPerSecond: 0, ...(message ? { message } : {}), ...(errorCode ? { errorCode } : {}) });
    this.trimHistory();
  }

  private batchView(batch: Batch): TransferBatch {
    const states = batch.children.map((id) => this.records.get(id)?.job.state ?? "skipped");
    const state = states.some((state) => !terminal.has(state)) ? "active" : states.every((state) => state === "completed") ? "completed" : states.some((state) => state === "completed") ? "partial" : "failed";
    return { ...batch, state };
  }

  private trimHistory() {
    let count = this.records.size - this.liveCount();
    for (const [id, { job }] of this.records) {
      if (count <= HISTORY_LIMIT) break;
      if (!terminal.has(job.state)) continue;
      if (!job.batchId) {
        this.records.delete(id);
        count--;
        continue;
      }
      const batch = this.batches.get(job.batchId);
      if (batch && this.batchView(batch).state !== "active") {
        for (const child of batch.children) if (this.records.delete(child)) count--;
        this.batches.delete(batch.batchId);
      }
    }
  }

  private pump(): void {
    if (this.disposed) return;
    const limit = this.maxParallel();
    const occupied = new Set([...this.active].flatMap(({ locks }) => locks));
    for (const rec of this.records.values()) {
      if (this.active.size >= limit) break;
      if (rec.job.state !== "queued" || this.active.has(rec) || rec.locks.some((lock) => occupied.has(lock))) continue;
      if (rec.parentId) {
        const parent = this.records.get(rec.parentId)?.job.state;
        if (parent !== "completed") {
          if (parent && terminal.has(parent)) this.finish(rec, "skipped", "上级目录未创建或未同意合并");
          continue;
        }
      }
      for (const lock of rec.locks) occupied.add(lock);
      this.active.add(rec);
      rec.controller = new AbortController();
      this.update(rec, { state: "checking" });
      const work = rec.job.directory ? this.runDirectory(rec, rec.controller.signal) : this.run(rec, rec.controller.signal);
      void work.finally(() => {
        this.active.delete(rec);
        delete rec.controller;
        this.pump();
      });
    }
  }

  private withTree<T>(origin: TransferOrigin, signal: AbortSignal, use: (tree: TransferTree, active: AbortSignal) => Promise<T>): Promise<T> {
    if (origin.kind === "local") return use(localTree(origin.path), signal);
    return this.manager.withSftp(this.source(origin, signal), "transfer.directory", origin.path, (channel, active) => use(remoteTree(channel, origin.path), active), { signal, elevated: origin.sudo === true });
  }

  private source(origin: Extract<TransferOrigin, { kind: "remote" }>, signal: AbortSignal) {
    if (origin.sudoSessionId) return this.sessions.sudoSource(origin.fileSessionId, origin);
    return origin.session.source === "external" ? this.sessions.source(origin) : { ...origin.session, signal };
  }

  private async runDirectory(rec: Record, signal: AbortSignal) {
    const { source, target } = rec.job;
    try {
      const current = await this.withTree(source, signal, (tree) => tree.stat([]));
      if (!rec.initial || !sameDirectory(current, rec.initial)) throw transferChanged("源目录");
      await this.withTree(target, signal, async (tree, active) => {
        const dest = await tree.stat([]);
        if (dest && dest.kind !== "dir") throw errors.invalidInput("同名目标不是普通目录，原件保持");
        if (rec.directoryTarget !== undefined && !sameDirectory(rec.directoryTarget, dest)) throw transferChanged("目标目录");
        rec.directoryTarget = dest;
        if (dest && !rec.choice) {
          this.update(rec, { state: "waiting" });
          return;
        }
        active.throwIfAborted();
        this.update(rec, { state: "committing" });
        if (!dest) await tree.mkdir([]);
        this.finish(rec, "completed", dest ? "已确认此目录合并，文件冲突另行处理" : "已创建目标目录");
      });
    } catch (error) {
      if (rec.job.state === "completed") return;
      if (signal.aborted) this.finish(rec, "cancelled", "已取消，原件保持");
      else this.finish(rec, "failed", error instanceof Error ? error.message : "目录任务失败", error instanceof HuhuError ? error.code : "INTERNAL");
    }
  }

  private withFile<T>(origin: TransferOrigin, signal: AbortSignal, use: (file: TransferFile, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (origin.kind === "local") return use(localTransferFile(origin.path), signal);
    return this.manager.withSftp(this.source(origin, signal), "transfer", origin.path, (channel, active) => use(remoteTransferFile(channel, origin.path), active), {
      signal,
      timeoutMs: 30 * 60_000,
      elevated: origin.sudo === true,
    });
  }

  private async waitIfPaused(rec: Record, signal: AbortSignal) {
    while (rec.job.state === "paused") {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const stop = () => {
          delete rec.wake;
          reject(signal.reason);
        };
        rec.wake = () => {
          signal.removeEventListener("abort", stop);
          delete rec.wake;
          resolve();
        };
        signal.addEventListener("abort", stop, { once: true });
      });
    }
    signal.throwIfAborted();
  }

  private async run(rec: Record, signal: AbortSignal): Promise<void> {
    const { source, target, transferId } = rec.job;
    const stagedName = `.huhu-transfer-${transferId}.part`;
    let stagedOwned = false;
    try {
      const prepared = await this.withFile(source, signal, (from, readSignal) =>
        this.withFile(target, readSignal, async (to, active) => {
          const sourceSnapshot = await fingerprint(from, active);
          const targetSnapshot = await fingerprint(to, active);
          if (!sourceSnapshot) throw errors.notFound("源文件已移除");
          if (rec.initial && !sameSnapshot(sourceSnapshot, rec.initial)) throw transferChanged("源文件");
          if (rec.plan && (!sameSnapshot(sourceSnapshot, rec.plan.source) || !sameSnapshot(targetSnapshot, rec.plan.target))) {
            throw transferChanged(!sameSnapshot(sourceSnapshot, rec.plan.source) ? "源文件" : "目标文件");
          }
          rec.plan ??= { source: sourceSnapshot, target: targetSnapshot };
          if (targetSnapshot && !rec.choice) {
            this.update(rec, { state: "waiting", total: sourceSnapshot.size });
            return;
          }

          let input = from.read;
          if (rec.choice === "resume" && targetSnapshot) {
            const length = targetSnapshot.size;
            if (length > sourceSnapshot.size) throw transferChanged("续传前缀");
            if (length > 0) {
              const prefix = await digest(from.read(0, length - 1), length, active);
              if (prefix.length !== length || prefix.hash !== targetSnapshot.hash) throw new HuhuError("VERSION_CONFLICT", "续传前缀不匹配，已保留原目标");
            }
            input = () => Readable.from(copyWithPrefix(from, to, length, sourceSnapshot.size));
          }
          const staged = to.sibling(stagedName);
          const sink = staged.stage();
          sink.once("open", () => {
            stagedOwned = true;
          });
          let started = Date.now();
          let rateFrom = 0;
          let last = 0;
          let bytes = 0;
          const meter = new Transform({
            transform: (chunk: Buffer, _encoding, done) => {
              const paused = rec.job.state === "paused";
              void this.waitIfPaused(rec, active).then(() => {
                if (paused) {
                  started = Date.now();
                  rateFrom = bytes;
                  last = 0;
                }
                bytes += chunk.length;
                if (bytes > sourceSnapshot.size) return done(transferChanged("源文件"));
                const elapsed = Math.max(1, Date.now() - started);
                if (elapsed - last >= 250 || bytes === sourceSnapshot.size) {
                  last = elapsed;
                  this.update(rec, { bytes, bytesPerSecond: ((bytes - rateFrom) * 1000) / elapsed });
                }
                done(null, chunk);
              }, done);
            },
          });
          this.update(rec, { state: "running", total: sourceSnapshot.size });
          await pipeline(input(), meter, sink, { signal: active });
          await this.waitIfPaused(rec, active);
          const result = await fingerprint(staged, active);
          if (result?.hash !== sourceSnapshot.hash || result.size !== sourceSnapshot.size || !sameSnapshot(await fingerprint(from, active), sourceSnapshot)) throw transferChanged("源文件");
          return { bytes, sourceSnapshot, targetSnapshot };
        }),
      );
      if (!prepared) return;
      await this.withFile(target, signal, async (to, active) => {
        const staged = to.sibling(stagedName);
        const { bytes, sourceSnapshot, targetSnapshot } = prepared;
        await staged.metadata(sourceSnapshot, source.kind === "remote");
        const checked = await fingerprint(staged, active);
        const correctTime = checked && Math.abs(checked.mtime - sourceSnapshot.mtime) < 1000;
        const correctMode = target.kind === "local" || checked?.mode === (source.kind === "remote" ? sourceSnapshot.mode & 0o777 : 0o600);
        if (!checked || !correctTime || !correctMode || checked.size !== sourceSnapshot.size || checked.hash !== sourceSnapshot.hash) throw transferChanged("暂存文件");
        for (;;) {
          const version = rec.pauseVersion;
          await this.waitIfPaused(rec, active);
          const current = await fingerprint(to, active);
          // A pause accepted during fingerprinting invalidates this read, even after a quick resume.
          if (version !== rec.pauseVersion || rec.job.state === "paused") continue;
          if (!sameSnapshot(current, targetSnapshot)) throw transferChanged("目标文件");
          break;
        }
        active.throwIfAborted();
        const publication: Publication = { staged: { name: stagedName, path: staged.path, snapshot: checked } };
        if (targetSnapshot) {
          const name = `.huhu-transfer-${transferId}-${randomUUID()}.old`;
          publication.backup = { name, path: to.sibling(name).path, snapshot: targetSnapshot };
        }
        rec.publication = publication;
        this.update(rec, { state: "committing", bytes, recovery: { stagingPath: publication.staged.path, ...(publication.backup && { backupPath: publication.backup.path }) } });
        if (publication.backup) {
          const backup = to.sibling(publication.backup.name);
          await to.take(backup);
          if (!sameSnapshot(await fingerprint(backup, active), targetSnapshot)) throw transferChanged("目标文件");
        }
        await staged.install(to);
        const notes = await this.cleanupPublication(to, publication);
        active.throwIfAborted();
        delete rec.publication;
        delete rec.job.recovery;
        this.finish(rec, "completed", "文件已校验并提交" + notes);
      });
    } catch (error) {
      if (rec.job.state === "completed") return;
      if (rec.publication) {
        rec.publication.failure = { message: error instanceof Error ? error.message : "传输失败", code: error instanceof HuhuError ? error.code : "INTERNAL" };
        await this.reconcile(rec, signal);
        return;
      }
      let cleanup = "";
      if (stagedOwned) {
        try {
          await this.withFile(target, AbortSignal.timeout(15_000), async (to) => removeTemp(to.sibling(stagedName)));
        } catch {
          cleanup += `；原连接上的暂存 ${stagedName} 尚待清理`;
        }
      }
      if (signal.aborted) this.finish(rec, "cancelled", `已取消，原件保持${cleanup}`);
      else this.finish(rec, "failed", (error instanceof Error ? error.message : "传输失败") + cleanup, error instanceof HuhuError ? error.code : "INTERNAL");
    }
  }

  private async cleanupPublication(target: TransferFile, publication: Publication, verified?: { staging: Snapshot | null; backup: Snapshot | null }) {
    let notes = "";
    for (const [item, observed] of [
      [publication.staged, verified?.staging],
      [publication.backup, verified?.backup],
    ] as const) {
      if (!item) continue;
      try {
        const file = target.sibling(item.name);
        const current = await file.stat();
        if (!current) continue;
        if (!sameSnapshot(current, item.snapshot) || (verified && !sameSnapshot(observed ?? null, item.snapshot))) throw transferChanged("暂存或备份");
        await removeTemp(file);
      } catch {
        notes += `。尚待检查 ${item.path}`;
      }
    }
    return notes;
  }

  private async reconcile(rec: Record, signal: AbortSignal) {
    const publication = rec.publication;
    if (!publication) return;
    const original = publication.backup?.snapshot ?? null;
    const intended = publication.staged.snapshot;
    try {
      const result = await this.withFile(rec.job.target, AbortSignal.any([signal, AbortSignal.timeout(15_000)]), async (target, active) => {
        const current = await fingerprint(target, active);
        const staging = await fingerprint(target.sibling(publication.staged.name), active);
        const backupFile = publication.backup && target.sibling(publication.backup.name);
        const backup = backupFile ? await fingerprint(backupFile, active) : null;
        const stagedIntact = sameSnapshot(staging, intended);
        if (sameSnapshot(current, intended) && (!staging || (intended.identity && stagedIntact))) {
          const notes = await this.cleanupPublication(target, publication, { staging, backup });
          return { state: "completed", message: "已从原端点回读确认提交" + notes } as const;
        }
        if (!stagedIntact || (backup && !sameSnapshot(backup, original))) return;
        if (!sameSnapshot(current, original)) {
          if (current || !backupFile || !backup) return;
          await backupFile.install(target);
          if (!sameSnapshot(await fingerprint(target, active), original)) return;
        }
        const notes = await this.cleanupPublication(target, publication, { staging, backup });
        // Keep the same task out of the write queue until any remaining staging is accounted for.
        if (!notes) return { state: "failed", message: `${publication.failure?.message ?? "提交失败"}。回读确认未提交，原目标保持` } as const;
      });
      if (result) {
        delete rec.publication;
        delete rec.job.recovery;
        const code = publication.failure?.code;
        this.finish(rec, result.state, result.message, result.state === "failed" ? (code === "SSH_DISCONNECTED" ? "INTERNAL" : code) : undefined);
        return;
      }
    } catch {
      // The original connection or paths cannot currently establish the outcome.
    }
    this.update(rec, {
      state: "uncertain",
      bytesPerSecond: 0,
      message: "无法核实提交结果，保留现场。可通过原端点重查。",
      recovery: { stagingPath: publication.staged.path, ...(publication.backup && { backupPath: publication.backup.path }) },
    });
  }
}
