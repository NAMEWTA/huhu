import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { errors, HuhuError } from "@huhu/contracts";
import type { z } from "zod";
import type { TransferChoice, TransferEndpoint, TransferJob, TransferOrigin, TransferQueue, TransferRequest } from "../shared/transfers.js";
import type { FileSessions } from "./file-sessions.js";
import type { SshManager } from "./manager.js";
import { fingerprint, localTransferFile, remoteTransferFile, removeTemp, sameSnapshot, transferChanged, type Snapshot, type TransferFile } from "./transfer-io.js";

const LIVE_LIMIT = 32;
const HISTORY_LIMIT = 64;
const PARALLEL = 2;
const terminal = new Set<TransferJob["state"]>(["completed", "failed", "cancelled", "skipped"]);
type Plan = { source: Snapshot; target: Snapshot | null };
type Record = { job: TransferJob; controller?: AbortController; plan?: Plan; choice?: "replace"; locks: string[] };

function location(origin: TransferOrigin): string {
  return origin.kind === "remote" ? `ssh:${origin.session.connectionId}` : `file:${origin.path.toLowerCase()}`;
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
    return { jobs: [...this.records.values()].map(({ job }) => ({ ...job })).reverse(), liveLimit: LIVE_LIMIT, parallel: PARALLEL, canQueue: this.liveCount() < LIVE_LIMIT };
  }

  start(request: TransferRequest): TransferJob {
    if (this.disposed) throw errors.notFound("传输中心所属的 Vault 已关闭");
    if (this.liveCount() >= LIVE_LIMIT) throw errors.invalidInput("传输队列已满，请等待任务结束或取消待处理任务");
    if (request.source.kind === request.target.kind) throw errors.invalidInput("请选择一个 SSH 端点和一个本机端点");
    const source = this.origin(request.source);
    const target = this.origin(request.target);
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
    if (choice === "replace") {
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
    if (rec.controller) {
      this.update(rec, { state: "cancelling" });
      rec.controller.abort();
    } else this.finish(rec, "cancelled", "已取消，原件保持");
    return { ...rec.job };
  }

  openOrigin(id: string) {
    const { source, target } = this.lookup(id).job;
    const remote = source.kind === "remote" ? source : target;
    if (remote.kind !== "remote") throw errors.notFound("任务没有源文件会话");
    return this.sessions.restoreTransferOrigin(remote.session);
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

  private async run(rec: Record, signal: AbortSignal): Promise<void> {
    const { source, target, transferId } = rec.job;
    const stagedName = `.huhu-transfer-${transferId}.part`;
    let stagedOwned = false;
    try {
      await this.withFile(source, signal, (from, readSignal) =>
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

          const staged = to.sibling(stagedName);
          const sink = staged.stage();
          sink.once("open", () => {
            stagedOwned = true;
          });
          const started = Date.now();
          let last = 0;
          let bytes = 0;
          const meter = new Transform({
            transform: (chunk: Buffer, _encoding, done) => {
              bytes += chunk.length;
              if (bytes > sourceSnapshot.size) return done(transferChanged("源文件"));
              const elapsed = Math.max(1, Date.now() - started);
              if (elapsed - last >= 250 || bytes === sourceSnapshot.size) {
                last = elapsed;
                this.update(rec, { bytes, bytesPerSecond: (bytes * 1000) / elapsed });
              }
              done(null, chunk);
            },
          });
          this.update(rec, { state: "running", total: sourceSnapshot.size });
          await pipeline(from.read(), meter, sink, { signal: active });
          const result = await fingerprint(staged, active);
          if (result?.hash !== sourceSnapshot.hash || result.size !== sourceSnapshot.size || !sameSnapshot(await fingerprint(from, active), sourceSnapshot)) throw transferChanged("源文件");
          if (!sameSnapshot(await fingerprint(to, active), targetSnapshot)) throw transferChanged("目标文件");
          active.throwIfAborted();
          this.update(rec, { state: "committing", bytes });
          await this.publish(staged, to, targetSnapshot, active, transferId);
          try {
            await removeTemp(staged);
            stagedOwned = false;
            this.finish(rec, "completed", "文件已校验并提交");
          } catch {
            stagedOwned = false;
            this.finish(rec, "completed", `文件已提交，暂存清理失败：${staged.path}`);
          }
        }),
      );
    } catch (error) {
      let cleanup = "";
      if (stagedOwned) {
        try {
          await this.withFile(target, AbortSignal.timeout(15_000), async (to) => removeTemp(to.sibling(stagedName)));
        } catch {
          cleanup = `；原连接上的暂存 ${stagedName} 尚待清理`;
        }
      }
      if (signal.aborted) this.finish(rec, "cancelled", `已取消，原件保持${cleanup}`);
      else this.finish(rec, "failed", (error instanceof Error ? error.message : "传输失败") + cleanup, error instanceof HuhuError ? error.code : "INTERNAL");
    }
  }

  private async publish(staged: TransferFile, target: TransferFile, expected: Snapshot | null, signal: AbortSignal, id: string) {
    if (!expected) return staged.install(target);
    const backup = target.sibling(`.huhu-transfer-${id}.old`);
    await target.take(backup);
    try {
      if (!sameSnapshot(await fingerprint(backup, signal), expected)) throw transferChanged("目标文件");
      await staged.install(target);
    } catch (error) {
      try {
        await backup.install(target);
        await removeTemp(backup).catch(() => undefined);
      } catch {
        throw new HuhuError("VERSION_CONFLICT", `目标发生变化，原目标保存在 ${backup.path}`);
      }
      throw error;
    }
    // The verified new bytes are committed. Keep the old copy if cleanup cannot complete.
    await removeTemp(backup).catch(() => undefined);
  }
}
