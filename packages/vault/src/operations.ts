import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { VaultFiles, versionOf } from "./write.js";

export type OpStep =
  | { action: "write"; path: string; bytes: Uint8Array }
  | { action: "rename"; from: string; path: string }
  | { action: "delete"; path: string };

interface StepRecord {
  action: "write" | "rename" | "delete";
  path: string;
  from?: string;
  beforeVersion: string | null;
  afterVersion: string | null;
  done: boolean;
}

export type OpState = "prepared" | "committed" | "rolled_back" | "needs_attention";

export interface OpRecord {
  opId: string;
  kind: string;
  state: OpState;
  steps: StepRecord[];
  createdAt: string;
  attention?: string[];
}

const RETENTION_MS = 30 * 24 * 3600 * 1000;

/**
 * 多文件操作：先写日志与备份，再逐步执行；崩溃后 `recover()` 回滚或标记 needs_attention。
 * 不承诺跨文件原子性，承诺可解释、可恢复、不静默覆盖。
 */
export class OperationLog {
  constructor(private readonly files: VaultFiles, private readonly dir: string, private readonly now: () => number = Date.now) {}

  private logPath(opId: string): string {
    return path.join(this.dir, `${opId}.json`);
  }
  private backupDir(opId: string): string {
    return path.join(this.dir, "backups", opId);
  }
  private save(op: OpRecord): void {
    mkdirSync(this.dir, { recursive: true });
    const tmp = this.logPath(op.opId) + ".tmp";
    writeFileSync(tmp, JSON.stringify(op, null, 2));
    renameSync(tmp, this.logPath(op.opId));
  }

  load(opId: string): OpRecord | null {
    return existsSync(this.logPath(opId)) ? (JSON.parse(readFileSync(this.logPath(opId), "utf8")) as OpRecord) : null;
  }

  list(): OpRecord[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as OpRecord);
  }

  /** 执行一个多文件操作。失败时回滚已完成步骤并抛 WRITE_PARTIAL（附 opId）。 */
  async run(opId: string, kind: string, steps: OpStep[], hooks: { afterStep?: (index: number) => void } = {}): Promise<OpRecord> {
    const records: StepRecord[] = steps.map((s) => {
      const target = s.path;
      const before = s.action === "rename" ? this.files.currentVersion(s.from) : this.files.currentVersion(target);
      return {
        action: s.action,
        path: target,
        ...(s.action === "rename" ? { from: s.from } : {}),
        beforeVersion: before,
        afterVersion: s.action === "write" ? versionOf(s.bytes) : s.action === "delete" ? null : before,
        done: false,
      };
    });
    const op: OpRecord = { opId, kind, state: "prepared", steps: records, createdAt: new Date(this.now()).toISOString() };
    // 备份会被覆盖或删除的文件
    steps.forEach((s, i) => {
      const victim = s.action === "rename" ? null : s.path;
      const toBack = victim && this.files.exists(victim) ? victim : null;
      if (toBack) {
        const dest = path.join(this.backupDir(opId), String(i));
        mkdirSync(path.dirname(dest), { recursive: true });
        cpSync(this.files.abs(toBack), dest);
      }
    });
    this.save(op);

    try {
      for (const [i, s] of steps.entries()) {
        const rec = records[i] as StepRecord;
        // 执行前确认目标仍是 prepare 时的版本，绝不覆盖第三方改动
        const guarded = s.action === "rename" ? s.from : s.path;
        const now = this.files.currentVersion(guarded);
        if (now !== rec.beforeVersion) throw new HuhuError("VERSION_CONFLICT", `文件在操作期间被修改：${guarded}`, { details: { currentVersion: now } });
        if (s.action === "write") await this.files.write(s.path, s.bytes);
        else if (s.action === "delete") rmSync(this.files.abs(s.path), { force: true });
        else {
          mkdirSync(path.dirname(this.files.abs(s.path)), { recursive: true });
          if (existsSync(this.files.abs(s.path))) throw new HuhuError("NAME_CONFLICT", `目标已存在：${s.path}`);
          renameSync(this.files.abs(s.from), this.files.abs(s.path));
        }
        rec.done = true;
        this.save(op);
        hooks.afterStep?.(i);
      }
    } catch (e) {
      const restored = this.rollback(op);
      throw new HuhuError("WRITE_PARTIAL", e instanceof HuhuError && e.code === "NAME_CONFLICT" ? e.message : "多文件操作未能完成，已尝试回滚", {
        details: { opId, state: restored.state },
        recovery: [{ action: "open-health", label: "查看恢复详情" }],
      });
    }
    op.state = "committed";
    this.save(op);
    return op;
  }

  /** 逆序回滚：按文件实际版本判断每步状态，遇到第三方改动则停止并标 needs_attention。 */
  rollback(op: OpRecord): OpRecord {
    const attention: string[] = [];
    for (let i = op.steps.length - 1; i >= 0; i--) {
      const s = op.steps[i] as StepRecord;
      const backup = path.join(this.backupDir(op.opId), String(i));
      if (s.action === "rename") {
        const from = s.from as string;
        const toExists = this.files.exists(s.path);
        const fromExists = this.files.exists(from);
        const toIsOurs = toExists && this.files.currentVersion(s.path) === s.afterVersion;
        if (toIsOurs && !fromExists) renameSync(this.files.abs(s.path), this.files.abs(from));
        else if (toIsOurs && fromExists) attention.push(s.path, from); // 移走后第三方又在源路径创建了文件
        else if (!fromExists) attention.push(s.path); // 源不见了且目标也不是我们移过去的
        continue;
      }
      const cur = this.files.currentVersion(s.path);
      if (cur === s.beforeVersion) continue; // 尚未执行或已还原
      if (cur !== s.afterVersion) {
        attention.push(s.path);
        continue;
      }
      if (s.beforeVersion === null) rmSync(this.files.abs(s.path), { force: true });
      else if (existsSync(backup)) {
        mkdirSync(path.dirname(this.files.abs(s.path)), { recursive: true });
        cpSync(backup, this.files.abs(s.path));
      } else attention.push(s.path);
    }
    if (attention.length) {
      op.state = "needs_attention";
      op.attention = attention;
    } else op.state = "rolled_back";
    this.save(op);
    return op;
  }

  /** 启动恢复：处理所有 prepared 日志并清理 30 天前的已结束日志。 */
  recover(): OpRecord[] {
    const results: OpRecord[] = [];
    for (const op of this.list()) {
      if (op.state === "prepared") results.push(this.rollback(op));
      else if ((op.state === "committed" || op.state === "rolled_back") && this.now() - statSync(this.logPath(op.opId)).mtimeMs > RETENTION_MS) {
        rmSync(this.logPath(op.opId), { force: true });
        rmSync(this.backupDir(op.opId), { recursive: true, force: true });
      }
    }
    return results;
  }
}
