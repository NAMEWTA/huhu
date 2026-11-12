import { readFileSync, realpathSync } from "node:fs";
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
    if (!this.o.forcePolling) {
      try {
        // 原生监听报告的是真实路径（macOS 的临时目录 /var → /private/var；Vault 放在符号链接下也一样）：相对路径要按真实根计算
        let real = this.o.root;
        try {
          real = realpathSync(this.o.root);
        } catch {
          /* 根目录不存在时沿用原路径 */
        }
        this.subscription = await watcher.subscribe(
          real,
          (err, events) => {
            if (err) return this.degrade(String(err.message ?? err));
            for (const e of events) {
              const rel = path.relative(real, e.path).split(path.sep).join("/");
              if (rel && !rel.startsWith("..") && !isIgnored(rel)) this.pending.add(rel);
            }
            this.schedule();
          },
          { ignore: [".git", "node_modules", ".huhu", ".agents"].map((d) => path.join(real, d)) },
        );
        return;
      } catch (e) {
        this.degrade(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    this.degrade("强制轮询");
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
    this.flush(true);
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.o.batchMs ?? 250);
  }

  private flush(immediate = false): void {
    if ((this.pending.size === 0 && this.heldCreated.length === 0) || this.closed) return;
    const paths = [...this.pending];
    this.pending.clear();
    const now = Date.now();
    const created: { path: string; info: FileInfo }[] = [];
    const deleted: { path: string; info: FileInfo }[] = [];
    const changes: FileChange[] = [];

    for (const p of paths) {
      const before = this.snapshot.get(p);
      const after = infoOf(path.join(this.o.root, p), true);
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
    const createdPool = [...this.heldCreated.map((h) => ({ path: h.path, info: h.info, at: h.at })), ...created.map((c) => ({ ...c, at: now }))];
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
    await this.subscription?.unsubscribe();
  }
}
