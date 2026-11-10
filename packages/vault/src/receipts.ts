const TTL_MS = 10_000;

/** 自写回执：监听器收到事件后用 `consume` 识别并过滤自己写入造成的回声。 */
export class ReceiptLog {
  private readonly map = new Map<string, { version: string; at: number }[]>();

  constructor(private readonly now: () => number = Date.now) {}

  record(path: string, version: string): void {
    const list = this.map.get(path) ?? [];
    list.push({ version, at: this.now() });
    this.map.set(path, list);
  }

  forget(path: string, version: string): void {
    const list = this.map.get(path);
    if (!list) return;
    const i = list.findIndex((r) => r.version === version);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this.map.delete(path);
  }

  /** 当前文件版本与某条未过期回执匹配则消耗它并返回 true。 */
  consume(path: string, version: string): boolean {
    const list = this.map.get(path);
    if (!list) return false;
    const t = this.now();
    const fresh = list.filter((r) => t - r.at < TTL_MS);
    const i = fresh.findIndex((r) => r.version === version);
    if (i < 0) {
      if (fresh.length) this.map.set(path, fresh);
      else this.map.delete(path);
      return false;
    }
    fresh.splice(i, 1);
    if (fresh.length) this.map.set(path, fresh);
    else this.map.delete(path);
    return true;
  }
}
