import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 历史固定项按 Space 记入 agent-cli/pins.json。 */
export class PinStore {
  constructor(private readonly file: string) {}

  private read(): Record<string, string[]> {
    try {
      if (!existsSync(this.file)) return {};
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []]));
    } catch {
      return {};
    }
  }

  list(spaceId: string): Set<string> {
    return new Set(this.read()[spaceId] ?? []);
  }

  set(spaceId: string, key: string, pinned: boolean, legacyKey?: string): void {
    const all = this.read();
    const cur = new Set(all[spaceId] ?? []);
    if (legacyKey) cur.delete(legacyKey);
    if (pinned) cur.add(key);
    else cur.delete(key);
    all[spaceId] = [...cur];
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n");
    renameSync(tmp, this.file);
  }

  /** 删除 Space 时一并清掉它的固定记录。 */
  clear(spaceId: string): void {
    const all = this.read();
    if (!(spaceId in all)) return;
    delete all[spaceId];
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n");
    renameSync(tmp, this.file);
  }
}
