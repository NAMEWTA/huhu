import { readFileSync } from "node:fs";
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
  private recentlyDeleted: { path: string; info: FileInfo; at: number }[] = [];
  private closed = false;
  mode: "native" | "polling" = "native";

  constructor(private readonly o: WatcherOptions) {}

  async start(): Promise<void> {
    this.snapshot = takeSnapshot(this.o.root);
    if (!this.o.forcePolling) {
      try {
        this.subscription = await watcher.subscribe(
          this.o.root,
          (err, events) => {
            if (err) return this.degrade(String(err.message ?? err));
            for (const e of events) {
              const rel = path.relative(this.o.root, e.path).split(path.sep).join("/");
              if (rel && !rel.startsWith("..") && !isIgnored(rel)) this.pending.add(rel);
            }
            this.schedule();
          },
          { ignore: [".git", "node_modules", ".huhu", ".agents"].map((d) => path.join(this.o.root, d)) },
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
    this.flush();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.o.batchMs ?? 250);
  }

  private flush(): void {
    if (this.pending.size === 0 || this.closed) return;
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

    // 配对重命名：先在本批内，再在最近 2 秒删除窗口内
    const window = this.o.renameWindowMs ?? 2000;
    this.recentlyDeleted = this.recentlyDeleted.filter((d) => now - d.at < window);
    const pool = [...this.recentlyDeleted.map((d) => ({ path: d.path, info: d.info })), ...deleted];
    const taken = new Set<string>();
    for (const c of created) {
      const match = pool.find((d) => !taken.has(d.path) && ((c.info.identity !== null && d.info.identity === c.info.identity) || (c.info.identity === null && d.info.hash !== null && d.info.hash === c.info.hash)));
      if (match) {
        taken.add(match.path);
        changes.push({ path: c.path, change: "renamed", from: match.path });
      } else changes.push({ path: c.path, change: "created" });
    }
    for (const d of deleted) if (!taken.has(d.path)) changes.push({ path: d.path, change: "deleted" });
    this.recentlyDeleted = [...this.recentlyDeleted.filter((d) => !taken.has(d.path)), ...deleted.filter((d) => !taken.has(d.path)).map((d) => ({ ...d, at: now }))];

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
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.subscription?.unsubscribe();
  }
}
