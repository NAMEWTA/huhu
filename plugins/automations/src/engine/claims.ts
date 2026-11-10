import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Claim } from "./scan.js";

/** `.huhu/automations/claims/<processingKey>.json`：先持久化 claim，再启动外部进程。 */
export class ClaimStore {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    return path.join(this.dir, `${key.replace(/[:/\\]/g, "_")}.json`);
  }

  get(key: string): Claim | null {
    try {
      return JSON.parse(readFileSync(this.file(key), "utf8")) as Claim;
    } catch {
      return null;
    }
  }

  /** 原子创建：已存在返回 false（并发/重复激活不会重复 claim）。 */
  create(claim: Claim): boolean {
    mkdirSync(this.dir, { recursive: true });
    try {
      writeFileSync(this.file(claim.processingKey), JSON.stringify(claim, null, 2), { flag: "wx" });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === "EEXIST") return false;
      throw e;
    }
  }

  update(key: string, patch: Partial<Claim>): Claim {
    const cur = this.get(key);
    if (!cur) throw new Error(`claim 不存在：${key}`);
    const next = { ...cur, ...patch };
    writeFileSync(this.file(key), JSON.stringify(next, null, 2));
    return next;
  }

  list(): Claim[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as Claim];
      } catch {
        return [];
      }
    });
  }
}
