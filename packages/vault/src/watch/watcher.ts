import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import watcher from "@parcel/watcher";
import type { ReceiptLog } from "../receipts.js";
import { versionOf } from "../write.js";
import { infoOf, isIgnored, takeSnapshot, type FileInfo } from "./snapshot.js";

export interface FileChange {
  path: string;
  change: "created" | "modified" | "deleted" | "renamed";
  from?: string;
}

export interface WatcherOptions {
  root: string;
  receipts: ReceiptLog;
  onChanges(changes: FileChange[]): void;
  /**
   * 目录（含空目录）的创建 / 删除 / 改名：只给路径，供资源目录（vault.list）失效。
   * 原生监听可用时才有；轮询回退只比较文件快照，检测不到空目录变化（文件树仍会在下次文件事件或手动刷新时更新）。
   */
  onDirChanges?(paths: string[]): void;
  /** 原生监听不可用（如 Linux inotify 上限）而回退轮询时通知，用于登记健康问题。 */
  onDegraded?(reason: string): void;
  batchMs?: number;
  pollMs?: number;
  /** 测试用：强制使用轮询。 */
  forcePolling?: boolean;
  renameWindowMs?: number;
}

/** 监听 Vault：250ms 批处理，过滤自写回声，配对重命名；原生监听失败时回退 30 秒轮询。 */
export class VaultWatcher {
  private snapshot = new Map<string, FileInfo>();
  private subscription: watcher.AsyncSubscription | null = null;
  private refreshingSubscription: Promise<void> | null = null;
  private nativeCreates = new Set<string>();
  private pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private heldCreated: { path: string; info: FileInfo; at: number }[] = [];
  private holdTimer: NodeJS.Timeout | null = null;
  private recentlyDeleted: { path: string; info: FileInfo; at: number }[] = [];
  private closed = false;
  mode: "native" | "polling" = "native";

  constructor(private readonly o: WatcherOptions) {}

  async start(): Promise<void> {
    this.snapshot = takeSnapshot(this.o.root);
    if (this.o.forcePolling) {
      this.degrade("强制轮询");
      return;
    }
    try {
      await this.subscribeNative();
    } catch (e) {
      this.degrade(e instanceof Error ? e.message : String(e));
    }
  }

  private async subscribeNative(): Promise<void> {
    // Native callbacks report real paths, even when the Vault root is a symlink.
    const real = realpathSync(this.o.root);
    const subscription = await watcher.subscribe(
      real,
      (err, events) => {
        if (err) return this.degrade(String(err.message ?? err));
        for (const e of events) {
          const rel = path.relative(real, e.path).split(path.sep).join("/");
          if (!rel || rel.startsWith("..") || isIgnored(rel)) continue;
          this.pending.add(rel);
          if (process.platform === "linux" && e.type === "create") this.nativeCreates.add(rel);
        }
        this.schedule();
      },
      { ignore: [".git", "node_modules", ".huhu", ".agents"].map((d) => path.join(real, d)) },
    );
    if (this.closed || this.mode !== "native") await subscription.unsubscribe();
    else this.subscription = subscription;
  }

  private refreshNativeSubscription(): void {
    const old = this.subscription;
    if (!old || this.refreshingSubscription || this.closed) return;
    this.subscription = null;
    this.refreshingSubscription = old
      .unsubscribe()
      .then(async () => {
        if (this.closed || this.mode !== "native") return;
        await this.subscribeNative();
        if (this.subscription) this.poll();
      })
      .catch((error: unknown) => this.degrade(error instanceof Error ? error.message : String(error)))
      .finally(() => {
        this.refreshingSubscription = null;
      });
  }

  private degrade(reason: string): void {
    if (this.mode === "polling" || this.closed) return;
    this.mode = "polling";
    void this.subscription?.unsubscribe().catch(() => undefined);
    this.subscription = null;
    this.o.onDegraded?.(reason);
    this.pollTimer = setInterval(() => this.poll(), this.o.pollMs ?? 30_000);
  }

  /** 全量 stat 比较（轮询模式与测试使用）。 */
  poll(): void {
    const next = takeSnapshot(this.o.root);
    const paths = new Set([...this.snapshot.keys(), ...next.keys()]);
    for (const p of paths) {
      const a = this.snapshot.get(p);
      const b = next.get(p);
      if (!a !== !b || (a && b && (a.mtimeMs !== b.mtimeMs || a.size !== b.size))) this.pending.add(p);
    }
    this.flush(true, next);
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.o.batchMs ?? 250);
  }

  private flush(immediate = false, polled?: ReadonlyMap<string, FileInfo>): void {
    if ((this.pending.size === 0 && this.heldCreated.length === 0) || this.closed) return;
    const paths = new Set(this.pending);
    this.pending.clear();
    const nativeCreates = this.nativeCreates;
    this.nativeCreates = new Set();
    let refreshNative = false;
    const now = Date.now();
    const created: { path: string; info: FileInfo }[] = [];
    const deleted: { path: string; info: FileInfo }[] = [];
    const changes: FileChange[] = [];
    const dirs: string[] = [];

    for (const p of paths) {
      if (this.o.receipts.isTemporaryFile(p)) continue;
      const absolute = path.join(this.o.root, p);
      const before = this.snapshot.get(p);
      // The poll already enumerated exact directory names. Looking up an absent
      // old spelling again can resolve to its renamed file on case-insensitive volumes.
      const after = polled ? (polled.get(p) ?? null) : infoOf(absolute, true);
      if (!after && !before) {
        // 不是已跟踪的文件：目录被创建 / 删除 / 改名，或已不存在的未跟踪项（保守地都通知，只会多刷新一次列表）
        try {
          const entry = lstatSync(absolute);
          if (entry.isDirectory() || entry.isSymbolicLink()) dirs.push(p);
          // inotify adds the new directory itself, but misses children created before that watch.
          if (entry.isDirectory() && nativeCreates.has(p)) {
            for (const child of readdirSync(absolute, { withFileTypes: true })) {
              const rel = `${p}/${child.name}`;
              if (isIgnored(rel)) continue;
              if (child.isDirectory()) refreshNative = true;
              else if (child.isFile()) paths.add(rel);
            }
          }
        } catch {
          dirs.push(p);
          // Some native backends report a removed directory without its file descendants.
          const prefix = `${p}/`;
          for (const tracked of this.snapshot.keys()) {
            if (tracked.startsWith(prefix)) paths.add(tracked);
          }
        }
        continue;
      }
      if (!after) {
        if (before) {
          deleted.push({ path: p, info: before });
          this.snapshot.delete(p);
        }
        continue;
      }
      this.snapshot.set(p, after);
      if (this.isEcho(p)) continue;
      if (before) {
        if (before.mtimeMs !== after.mtimeMs || before.size !== after.size || before.hash !== after.hash) changes.push({ path: p, change: "modified" });
      } else created.push({ path: p, info: after });
    }

    // 配对重命名：新增（含上一批暂扣的）与删除（含最近 2 秒内的）按 inode / 哈希配对。
    // 原生监听可能把 rename 拆成相隔数百毫秒的两个批次，所以未配对的"新增"先暂扣一个批处理周期再上报。
    const window = this.o.renameWindowMs ?? 2000;
    const hold = this.o.batchMs ?? 250;
    this.recentlyDeleted = this.recentlyDeleted.filter((d) => now - d.at < window);
    const createdPool = [...this.heldCreated.filter((h) => !polled || polled.has(h.path)).map((h) => ({ path: h.path, info: h.info, at: h.at })), ...created.map((c) => ({ ...c, at: now }))];
    this.heldCreated = [];
    const pool = [...this.recentlyDeleted.map((d) => ({ path: d.path, info: d.info })), ...deleted];
    const takenDeleted = new Set<string>();
    for (const c of createdPool) {
      const match = pool.find((d) => !takenDeleted.has(d.path) && ((c.info.identity !== null && d.info.identity === c.info.identity) || (c.info.identity === null && d.info.hash !== null && d.info.hash === c.info.hash)));
      if (match) {
        takenDeleted.add(match.path);
        changes.push({ path: c.path, change: "renamed", from: match.path });
      } else if (immediate || now - c.at >= hold) changes.push({ path: c.path, change: "created" });
      else this.heldCreated.push(c);
    }
    for (const d of deleted) if (!takenDeleted.has(d.path)) changes.push({ path: d.path, change: "deleted" });
    this.recentlyDeleted = [...this.recentlyDeleted.filter((d) => !takenDeleted.has(d.path)), ...deleted.filter((d) => !takenDeleted.has(d.path)).map((d) => ({ ...d, at: now }))];
    if (this.heldCreated.length && !this.holdTimer) {
      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;
        this.flush();
      }, hold);
    }

    if (changes.length) this.o.onChanges(changes);
    if (dirs.length) this.o.onDirChanges?.(dirs);
    if (refreshNative) this.refreshNativeSubscription();
  }

  private isEcho(rel: string): boolean {
    try {
      const bytes = readFileSync(path.join(this.o.root, rel));
      return this.o.receipts.consume(rel, versionOf(bytes));
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.holdTimer) clearTimeout(this.holdTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.refreshingSubscription;
    await this.subscription?.unsubscribe();
  }
}
