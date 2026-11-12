import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface Notification {
  id: string;
  title: string;
  module: string;
  /** 正文（一行）；可选。 */
  body?: string;
  at: string;
  read: boolean;
}

const MAX = 1000;

/** 站内通知（`.huhu/notifications.ndjson`，最近 1000 条）；属于 kernel，health 停用时仍可用。 */
export class NotificationStore {
  private items: Notification[] | null = null;

  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
    private readonly onCreated?: (n: Notification) => void,
  ) {}

  private load(): Notification[] {
    if (this.items) return this.items;
    const out = new Map<string, Notification>();
    if (existsSync(this.file)) {
      for (const line of readFileSync(this.file, "utf8").split("\n").filter(Boolean)) {
        try {
          const n = JSON.parse(line) as Notification & { deleted?: boolean };
          if (n.deleted) out.delete(n.id);
          else out.set(n.id, n);
        } catch {
          // 崩溃时的半行
        }
      }
    }
    this.items = [...out.values()].slice(-MAX);
    return this.items;
  }

  private rewrite(): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(
      tmp,
      this.load()
        .map((n) => JSON.stringify(n))
        .join("\n") + (this.load().length ? "\n" : ""),
    );
    renameSync(tmp, this.file); // 原子替换：崩溃不会留下被截断的文件
  }

  create(input: { title: string; module: string; body?: string }): Notification {
    const n: Notification = {
      // 通知可能在同一毫秒批量产生，newId 的 4 位随机后缀会碰撞；这里用完整 UUID
      id: `ntf-${randomUUID()}`,
      title: input.title,
      module: input.module,
      ...(input.body ? { body: input.body } : {}),
      at: this.now().toISOString(),
      read: false,
    };
    const list = this.load();
    list.push(n);
    mkdirSync(path.dirname(this.file), { recursive: true });
    if (list.length > MAX) {
      list.splice(0, list.length - MAX);
      this.rewrite();
    } else appendFileSync(this.file, JSON.stringify(n) + "\n");
    this.onCreated?.(n);
    return n;
  }

  list(filter: { unreadOnly?: boolean; module?: string } = {}): Notification[] {
    return this.load()
      .filter((n) => (!filter.unreadOnly || !n.read) && (!filter.module || n.module === filter.module))
      .slice()
      .reverse();
  }

  markRead(ids: string[] | "all"): number {
    let c = 0;
    for (const n of this.load())
      if (!n.read && (ids === "all" || ids.includes(n.id))) {
        n.read = true;
        c++;
      }
    if (c) this.rewrite();
    return c;
  }

  delete(ids: string[]): number {
    const before = this.load().length;
    this.items = this.load().filter((n) => !ids.includes(n.id));
    if (this.items.length !== before) this.rewrite();
    return before - this.items.length;
  }

  clearRead(): number {
    const before = this.load().length;
    this.items = this.load().filter((n) => !n.read);
    if (this.items.length !== before) this.rewrite();
    return before - this.items.length;
  }
}
