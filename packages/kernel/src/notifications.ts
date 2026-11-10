import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { newId } from "@huhu/contracts";

export interface Notification {
  id: string;
  title: string;
  module: string;
  at: string;
  read: boolean;
}

const MAX = 1000;

/** 站内通知（`.huhu/notifications.ndjson`，最近 1000 条）；属于 kernel，health 停用时仍可用。 */
export class NotificationStore {
  private items: Notification[] | null = null;

  constructor(private readonly file: string, private readonly now: () => Date = () => new Date(), private readonly onCreated?: (n: Notification) => void) {}

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
    writeFileSync(this.file, this.load().map((n) => JSON.stringify(n)).join("\n") + (this.load().length ? "\n" : ""));
  }

  create(input: { title: string; module: string }): Notification {
    const n: Notification = { id: newId("cap").replace("cap", "ntf"), title: input.title, module: input.module, at: this.now().toISOString(), read: false };
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
    return this.load().filter((n) => (!filter.unreadOnly || !n.read) && (!filter.module || n.module === filter.module)).slice().reverse();
  }

  markRead(ids: string[] | "all"): number {
    let c = 0;
    for (const n of this.load()) if (!n.read && (ids === "all" || ids.includes(n.id))) { n.read = true; c++; }
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
