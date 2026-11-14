import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, linkSync, writeFileSync } from "node:fs";
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
    const file = this.file(claim.processingKey);
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(tmp, JSON.stringify(claim, null, 2));
    try {
      linkSync(tmp, file); // 硬链接：写满内容后才出现，且目标已存在会失败（原子创建）
      return true;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "EEXIST") return false;
      if (code === "EPERM" || code === "ENOTSUP" || code === "EXDEV" || code === "EOPNOTSUPP") {
        // 文件系统不支持硬链接（FAT/exFAT 等）：退回 wx 创建
        try {
          writeFileSync(file, JSON.stringify(claim, null, 2), { flag: "wx" });
          return true;
        } catch (e2) {
          if ((e2 as { code?: string }).code === "EEXIST") return false;
          throw e2;
        }
      }
      throw e;
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* 已清理 */
      }
    }
  }

  update(key: string, patch: Partial<Claim>): Claim {
    const cur = this.get(key);
    if (!cur) throw new Error(`claim 不存在：${key}`);
    const next = { ...cur, ...patch };
    const file = this.file(key);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2)); // 临时文件 + rename：崩溃不会留下写坏的 claim（写坏会让任务被当成“没有 claim”而重复启动）
    renameSync(tmp, file);
    return next;
  }

  /** 派发回滚：markDispatched 失败时撤回刚创建的 claim。 */
  delete(key: string): void {
    try {
      unlinkSync(this.file(key));
    } catch {
      /* 已不存在 */
    }
  }

  list(): Claim[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as Claim];
        } catch {
          return [];
        }
      });
  }
}
