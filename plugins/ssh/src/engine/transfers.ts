import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { errors, HuhuError } from "@huhu/contracts";
import type { z } from "zod";
import type { TransferChoice, TransferEndpoint, TransferJob, TransferOrigin, TransferQueue, TransferRequest } from "../shared/transfers.js";
import type { FileSessions } from "./file-sessions.js";
import type { SshManager } from "./manager.js";
import { digest, fingerprint, localTransferFile, remoteTransferFile, removeTemp, sameSnapshot, transferChanged, type Snapshot, type TransferFile } from "./transfer-io.js";

const LIVE_LIMIT = 32;
const HISTORY_LIMIT = 64;
const PARALLEL = 2;
const terminal = new Set<TransferJob["state"]>(["completed", "failed", "cancelled", "skipped"]);
type Plan = { source: Snapshot; target: Snapshot | null };
type Record = { job: TransferJob; controller?: AbortController; plan?: Plan; choice?: "replace" | "resume"; pausedFrom?: "queued" | "running"; wake?: () => void; locks: string[] };

function location(origin: TransferOrigin): string {
  return origin.kind === "remote" ? `ssh:${origin.session.connectionId}` : `file:${origin.path.toLowerCase()}`;
}

async function* copyWithPrefix(from: TransferFile, to: TransferFile, length: number, size: number) {
  if (length > 0) yield* to.read(0, length - 1);
  if (size > length) yield* from.read(length, size - 1);
}

export class Transfers {
  private readonly records = new Map<string, Record>();
  private readonly active = new Set<Record>();
  private disposed = false;

  constructor(
    private readonly sessions: FileSessions,
    private readonly manager: SshManager,
    private readonly changed: (id: string) => void,
  ) {}

  list(): TransferQueue {
    for (const rec of this.records.values()) {
      if (terminal.has(rec.job.state) || this.active.has(rec)) continue;
      const lost = [rec.job.source, rec.job.target].some((origin) => origin.kind === "remote" && this.manager.fileOrigin(origin.session.hostId)?.connectionId !== origin.session.connectionId);
      if (lost) this.finish(rec, "failed", "文件会话的原连接已断开", "SSH_DISCONNECTED");
    }
    return { jobs: [...this.records.values()].map(({ job }) => ({ ...job })).reverse(), liveLimit: LIVE_LIMIT, parallel: PARALLEL, canQueue: this.liveCount() < LIVE_LIMIT };
  }

  start(request: TransferRequest): TransferJob {
    if (this.disposed) throw errors.notFound("传输中心所属的 Vault 已关闭");
    if (this.liveCount() >= LIVE_LIMIT) throw errors.invalidInput("传输队列已满，请等待任务结束或取消待处理任务");
    if (request.source.kind === "local" && request.target.kind === "local") throw errors.invalidInput("至少选择一个 SSH 端点");
    const source = this.origin(request.source);
    const target = this.origin(request.target);
    if (source.kind === "remote" && target.kind === "remote" && source.session.connectionId === target.session.connectionId) throw errors.invalidInput("跨远端复制需要两个独立 SSH 连接");
    const transferId = randomUUID();
    const job: TransferJob = { transferId, source, target, state: "queued", bytes: 0, total: null, bytesPerSecond: 0 };
    this.records.set(transferId, { job, locks: [location(source), location(target)] });
    this.changed(transferId);
    queueMicrotask(() => this.pump());
    return { ...job };
  }

  decide(id: string, choice: z.infer<typeof TransferChoice>): TransferJob {
    const rec = this.lookup(id);
    if (rec.job.state !== "waiting") throw errors.invalidInput("此任务当前无需覆盖确认");
    if (choice === "replace" || choice === "resume") {
      rec.choice = choice;
      this.update(rec, { state: "queued" });
      queueMicrotask(() => this.pump());
    } else this.finish(rec, choice === "reject" ? "cancelled" : "skipped", "已保留原目标");
    return { ...rec.job };
  }

  cancel(id: string): TransferJob {
    const rec = this.lookup(id);
    if (rec.job.state === "committing") throw errors.invalidInput("任务正在提交目标，请等待结果");
    if (terminal.has(rec.job.state)) return { ...rec.job };
    const inFlight = rec.job.state === "checking" || rec.job.state === "running" || rec.job.state === "cancelling" || (rec.job.state === "paused" && rec.pausedFrom === "running");
    if (rec.controller && inFlight) {
      this.update(rec, { state: "cancelling" });
      rec.controller.abort();
    } else this.finish(rec, "cancelled", "已取消，原件保持");
    return { ...rec.job };
  }

  pause(id: string): TransferJob {
    const rec = this.lookup(id);
    if (rec.job.state !== "queued" && rec.job.state !== "running") throw errors.invalidInput("任务当前不能暂停");
    rec.pausedFrom = rec.job.state;
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
    if (rec.job.state !== "failed" || rec.job.errorCode === "VERSION_CONFLICT") throw errors.invalidInput("当前任务需要重新发起并核对目标");
    if (this.liveCount() >= LIVE_LIMIT) throw errors.invalidInput("传输队列已满");
    for (const origin of [rec.job.source, rec.job.target]) {
      if (origin.kind === "remote" && this.manager.fileOrigin(origin.session.hostId)?.connectionId !== origin.session.connectionId) {
        throw new HuhuError("SSH_DISCONNECTED", "原连接已断开，请从新文件会话重新发起");
      }
    }
    delete rec.job.errorCode;
    delete rec.job.message;
    this.update(rec, { state: "queued", bytes: 0 });
    queueMicrotask(() => this.pump());
    return { ...rec.job };
  }

  openOrigin(id: string) {
    const { source, target } = this.lookup(id).job;
    const remote = source.kind === "remote" ? source : target;
    if (remote.kind !== "remote") throw errors.notFound("任务没有源文件会话");
    return { ...this.sessions.restoreTransferOrigin(remote.session), transferPath: remote.path };
  }

  clear(): { removed: number } {
    let removed = 0;
    for (const [id, { job }] of this.records)
      if (terminal.has(job.state)) {
        this.records.delete(id);
        removed++;
      }
    if (removed) this.changed("history");
    return { removed };
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.active) entry.controller?.abort();
  }

  private lookup(transferId: string): Record {
    const found = this.records.get(transferId);
    if (!found) throw errors.notFound("传输任务已从历史移除");
    return found;
  }

  private origin(input: TransferEndpoint): TransferOrigin {
    if (input.kind === "local") return { kind: "local", path: localTransferFile(input.path).path };
    const session = this.sessions.get(input.fileSessionId);
    if (session.state !== "ready") throw new HuhuError("SSH_DISCONNECTED", "传输的原连接已断开");
    return { ...input, session };
  }

  private liveCount() {
    return [...this.records.values()].filter(({ job }) => !terminal.has(job.state)).length;
  }

  private update(rec: Record, patch: Partial<TransferJob>) {
    Object.assign(rec.job, patch);
    if (!this.disposed) this.changed(rec.job.transferId);
  }

  private finish(rec: Record, state: "completed" | "failed" | "cancelled" | "skipped", message?: string, errorCode?: string) {
    this.update(rec, { state, bytesPerSecond: 0, ...(message ? { message } : {}), ...(errorCode ? { errorCode } : {}) });
    const finished = [...this.records].filter(([, { job }]) => terminal.has(job.state));
    for (const [id] of finished.slice(0, Math.max(0, finished.length - HISTORY_LIMIT))) this.records.delete(id);
  }

  private pump(): void {
    if (this.disposed) return;
    const occupied = new Set([...this.active].flatMap(({ locks }) => locks));
    for (const rec of this.records.values()) {
      if (this.active.size >= PARALLEL) break;
      if (rec.job.state !== "queued" || this.active.has(rec) || rec.locks.some((lock) => occupied.has(lock))) continue;
      for (const lock of rec.locks) occupied.add(lock);
      this.active.add(rec);
      rec.controller = new AbortController();
      this.update(rec, { state: "checking" });
      void this.run(rec, rec.controller.signal).finally(() => {
        this.active.delete(rec);
        delete rec.controller;
        this.pump();
      });
    }
  }

  private withFile<T>(origin: TransferOrigin, signal: AbortSignal, use: (file: TransferFile, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (origin.kind === "local") return use(localTransferFile(origin.path), signal);
    return this.manager.withSftp({ ...origin.session, signal }, "transfer", origin.path, (channel, active) => use(remoteTransferFile(channel, origin.path), active), {
      signal,
      timeoutMs: 30 * 60_000,
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
    let backupName: string | undefined;
    try {
      const prepared = await this.withFile(source, signal, (from, readSignal) =>
        this.withFile(target, readSignal, async (to, active) => {
          const sourceSnapshot = await fingerprint(from, active);
          const targetSnapshot = await fingerprint(to, active);
          if (!sourceSnapshot) throw errors.notFound("源文件已移除");
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
        if (!correctTime || !correctMode || checked?.hash !== sourceSnapshot.hash) throw transferChanged("暂存文件");
        if (!sameSnapshot(await fingerprint(to, active), targetSnapshot)) throw transferChanged("目标文件");
        // When a pause did not await during byte copy, verify the target again after waking.
        if (rec.job.state === "paused") {
          await this.waitIfPaused(rec, active);
          if (!sameSnapshot(await fingerprint(to, active), targetSnapshot)) throw transferChanged("目标文件");
        }
        active.throwIfAborted();
        this.update(rec, { state: "committing", bytes });
        if (targetSnapshot) backupName = `.huhu-transfer-${transferId}-${randomUUID()}.old`;
        const warning = await this.publish(staged, to, targetSnapshot, active, backupName);
        stagedOwned = false;
        let notes = warning ?? "文件已校验并提交";
        try {
          await removeTemp(staged);
        } catch {
          notes += `；暂存清理失败：${staged.path}`;
        }
        this.finish(rec, "completed", notes);
      });
    } catch (error) {
      if (rec.job.state === "completed") return;
      let cleanup = "";
      if (backupName) cleanup = await this.recoverBackup(target, backupName);
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

  private async recoverBackup(origin: TransferOrigin, name: string): Promise<string> {
    try {
      return await this.withFile(origin, AbortSignal.timeout(15_000), async (target) => {
        const backup = target.sibling(name);
        if (!(await backup.stat())) return "";
        if (await target.stat()) return `；原目标备份保存在 ${backup.path}`;
        try {
          await backup.install(target);
          await removeTemp(backup);
          return "；已恢复原目标";
        } catch {
          return `；原目标备份保存在 ${backup.path}`;
        }
      });
    } catch {
      return `；发布回执未确认，请在原设备检查备份 ${name}`;
    }
  }

  private async publish(staged: TransferFile, target: TransferFile, expected: Snapshot | null, signal: AbortSignal, backupName?: string) {
    if (!expected || !backupName) {
      await staged.install(target);
      return undefined;
    }
    const backup = target.sibling(backupName);
    await target.take(backup);
    try {
      if (!sameSnapshot(await fingerprint(backup, signal), expected)) throw transferChanged("目标文件");
      await staged.install(target);
    } catch (error) {
      try {
        await backup.install(target);
      } catch {
        throw new HuhuError("VERSION_CONFLICT", `目标发生变化，原目标保存在 ${backup.path}`);
      }
      await removeTemp(backup).catch(() => undefined);
      throw error;
    }
    // The verified new bytes are committed. Keep the old copy if cleanup cannot complete.
    try {
      await removeTemp(backup);
    } catch {
      return `文件已提交，原目标备份尚待清理：${backup.path}`;
    }
    return undefined;
  }
}
