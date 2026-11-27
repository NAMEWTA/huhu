import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { errors, type PlanOccurrenceLink } from "@huhu/contracts";

export interface Notification {
  id: string;
  title: string;
  module: string;
  /** 正文（一行）；可选。 */
  body?: string;
  occurrence?: PlanOccurrenceLink;
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

  private rewrite(items = this.load()): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, items.map((n) => JSON.stringify(n)).join("\n") + (items.length ? "\n" : ""));
    renameSync(tmp, this.file); // 原子替换：崩溃不会留下被截断的文件
  }

  has(id: string): boolean {
    return this.load().some((notification) => notification.id === id);
  }

  create(input: Pick<Notification, "title" | "module" | "body" | "occurrence">, reservedId?: string): Notification {
    const list = this.load();
    const existing = reservedId ? list.find(({ id }) => id === reservedId) : undefined;
    if (existing) {
      if (
        existing.title !== input.title ||
        existing.module !== input.module ||
        existing.body !== (input.body || undefined) ||
        (existing.occurrence && (existing.occurrence.planId !== input.occurrence?.planId || existing.occurrence.occurrenceId !== input.occurrence?.occurrenceId))
      ) {
        throw errors.idempotencyMismatch();
      }
      return existing;
    }
    const n: Notification = {
      // 通知可能在同一毫秒批量产生，newId 的 4 位随机后缀会碰撞；这里用完整 UUID
      id: reservedId ?? `ntf-${randomUUID()}`,
      title: input.title,
      module: input.module,
      ...(input.body ? { body: input.body } : {}),
      ...(input.occurrence ? { occurrence: input.occurrence } : {}),
      at: this.now().toISOString(),
      read: false,
    };
    mkdirSync(path.dirname(this.file), { recursive: true });
    if (list.length >= MAX) {
      const retained = [...list.slice(1), n];
      this.rewrite(retained);
      this.items = retained;
    } else {
      appendFileSync(this.file, JSON.stringify(n) + "\n");
      list.push(n);
    }
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
