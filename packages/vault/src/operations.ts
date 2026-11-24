import { randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import { normalizeRelPath } from "./paths.js";
import { renameNoReplace } from "./rename.js";
import { CREATION_STAGE_PREFIX, fileIdentity, VaultFiles, versionOf } from "./write.js";

export type OpStep =
  | { action: "write"; path: string; bytes: Uint8Array; expectedVersion?: string | null }
  | { action: "rename"; from: string; path: string; caseOnly?: true; expectedVersion?: string }
  | { action: "delete"; path: string; expectedVersion?: string };

interface StepRecord {
  action: "write" | "rename" | "delete";
  path: string;
  from?: string;
  creationStage?: string;
  creationStageIdentity?: string;
  renameStage?: string;
  renameStageDirectoryIdentity?: string | null;
  renameIdentity?: string | null;
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

function stepPaths(steps: readonly { path: string; from?: string }[]): string[] {
  return steps.flatMap(({ path, from }) => (from ? [from, path] : [path]));
}

/**
 * 多文件操作：先写日志与备份，再逐步执行；崩溃后 `recover()` 回滚或标记 needs_attention。
 * 不承诺跨文件原子性，承诺可解释、可恢复、不静默覆盖。
 */
export class OperationLog {
  constructor(
    private readonly files: VaultFiles,
    private readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {}

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
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as OpRecord);
  }

  /** 执行一个多文件操作。失败时回滚已完成步骤并抛 WRITE_PARTIAL（附 opId）。 */
  async run(opId: string, kind: string, steps: OpStep[], hooks: { afterStep?: (index: number) => void } = {}): Promise<OpRecord> {
    this.files.assertWritable();
    steps = steps.map((step) => {
      const relative = normalizeRelPath(step.path);
      if (step.action === "rename") return { ...step, path: relative, from: normalizeRelPath(step.from) };
      return step.action === "write" ? { ...step, path: relative, bytes: Buffer.from(step.bytes) } : { ...step, path: relative };
    });
    const versions = new Map<string, string | null>();
    const records: StepRecord[] = steps.map((s) => {
      const target = s.action === "rename" ? s.from : s.path;
      const before = versions.has(target) ? (versions.get(target) ?? null) : this.files.currentVersion(target);
      const create = s.action === "write" && before === null;
      if (s.expectedVersion === null && before !== null) throw errors.nameConflict(target);
      if (typeof s.expectedVersion === "string" && s.expectedVersion !== before) {
        throw new HuhuError("VERSION_CONFLICT", `文件在准备操作期间被修改：${target}`, { details: { path: target, currentVersion: before } });
      }
      const afterVersion = s.action === "write" ? versionOf(s.bytes) : s.action === "delete" ? null : before;
      if (s.action === "rename") versions.set(s.from, null);
      versions.set(s.path, afterVersion);
      return {
        action: s.action,
        path: s.path,
        ...(s.action === "rename" ? { from: s.from, renameIdentity: null } : {}),
        ...(create ? { creationStage: path.posix.join(path.posix.dirname(s.path), `${CREATION_STAGE_PREFIX}${randomUUID()}`) } : {}),
        ...(s.action === "rename" && s.caseOnly ? { renameStage: path.posix.join(path.posix.dirname(s.from), `.huhu-case-${randomUUID()}`, "entry") } : {}),
        beforeVersion: before,
        afterVersion,
        done: false,
      };
    });
    const op: OpRecord = { opId, kind, state: "prepared", steps: records, createdAt: new Date(this.now()).toISOString() };
    return this.files.withCommit(stepPaths(records), (write) => this.apply(op, steps, write, hooks.afterStep));
  }

  private async apply(op: OpRecord, steps: OpStep[], write: VaultFiles["write"], afterStep?: (index: number) => void): Promise<OpRecord> {
    const { opId, steps: records } = op;
    if (records[0]) this.checkStepVersion(records[0]);
    this.save(op);

    const untrack = records.flatMap((rec) => [rec.creationStage, rec.renameStage && path.posix.dirname(rec.renameStage), rec.renameStage].flatMap((temporary) => (temporary ? [this.files.receipts.trackTemporaryFile(temporary)] : [])));
    try {
      for (const [i, s] of steps.entries()) {
        const rec = records[i] as StepRecord;
        // 执行前确认目标仍是 prepare 时的版本，绝不覆盖第三方改动
        this.checkStepVersion(rec);
        // Repeated steps on one path back up the bytes visible immediately before that step.
        if (s.action !== "rename" && rec.beforeVersion !== null) {
          const dest = path.join(this.backupDir(opId), String(i));
          mkdirSync(path.dirname(dest), { recursive: true });
          cpSync(this.files.abs(s.path), dest);
        }
        if (s.action === "write") {
          if (rec.creationStage) {
            await write(s.path, s.bytes, {
              expectedVersion: null,
              creationStage: {
                path: rec.creationStage,
                recordIdentity: (identity) => {
                  rec.creationStageIdentity = identity;
                  this.save(op);
                },
              },
            });
          } else await write(s.path, s.bytes, { expectedVersion: rec.beforeVersion });
        } else if (s.action === "delete") {
          this.checkStepVersion(rec);
          rmSync(this.files.abs(s.path), { force: true });
        } else {
          mkdirSync(path.dirname(this.files.abs(s.path)), { recursive: true });
          const source = this.entryPath(s.from);
          rec.renameIdentity = fileIdentity(source);
          if (!rec.renameIdentity) throw new HuhuError("INVALID_INPUT", `源条目所在卷无法提供稳定文件身份，无法安全移动：${s.from}`);
          this.save(op);
          let from = source;
          if (rec.renameStage) {
            const temporary = this.entryPath(rec.renameStage);
            const stageDirectory = path.dirname(temporary);
            mkdirSync(stageDirectory, { mode: 0o700 });
            rec.renameStageDirectoryIdentity = fileIdentity(stageDirectory);
            this.save(op);
            this.checkStepVersion(rec);
            renameNoReplace(source, temporary, s.from);
            from = temporary;
          }
          if (this.files.exists(s.path)) throw errors.nameConflict(s.path);
          if (!rec.renameStage) this.checkStepVersion(rec);
          renameNoReplace(from, this.entryPath(s.path), s.path);
        }
        rec.done = true;
        this.save(op);
        afterStep?.(i);
      }
      op.state = "committed";
      this.save(op);
    } catch (e) {
      const restored = this.rollbackReserved(op);
      if (restored.state === "rolled_back" && !records.some((rec) => rec.done) && e instanceof HuhuError && (e.code === "NAME_CONFLICT" || e.code === "VERSION_CONFLICT")) throw e;
      throw new HuhuError("WRITE_PARTIAL", e instanceof HuhuError ? e.message : "多文件操作未能完成，已尝试回滚", {
        details: { ...(e instanceof HuhuError && e.details), opId, state: restored.state },
        recovery: [{ action: "open-health", label: "查看恢复详情" }],
      });
    } finally {
      for (const release of untrack) release();
    }
    this.clearStaging(op);
    return op;
  }

  private checkStepVersion(step: StepRecord): void {
    const target = step.from ?? step.path;
    if (step.creationStage && this.files.exists(target)) throw errors.nameConflict(target);
    const currentVersion = this.files.currentVersion(target);
    if (currentVersion !== step.beforeVersion) {
      throw new HuhuError("VERSION_CONFLICT", `文件在操作期间被修改：${target}`, { details: { path: target, currentVersion } });
    }
  }

  private clearStaging(op: OpRecord): void {
    for (const s of op.steps) {
      try {
        if (s.creationStage && s.creationStageIdentity) {
          const stage = this.files.abs(s.creationStage);
          if (fileIdentity(stage) === s.creationStageIdentity) rmSync(stage, { force: true });
        }
        if (s.renameStage && s.renameStageDirectoryIdentity) {
          const dir = this.files.abs(path.posix.dirname(s.renameStage));
          if (fileIdentity(dir) === s.renameStageDirectoryIdentity && readdirSync(dir).length === 0) rmdirSync(dir);
        }
      } catch {
        // 事务已结算；留待下次启动清理，且不得因目录后来改动而阻断。
      }
    }
  }

  private entryPath(rel: string): string {
    rel = normalizeRelPath(rel);
    const parent = path.posix.dirname(rel);
    return path.join(parent === "." ? this.files.root : this.files.abs(parent), path.posix.basename(rel));
  }

  /** 大小写不敏感的文件系统支持查找原路径别名；回滚需核对实际拼写。 */
  private hasExactName(rel: string): boolean {
    const absolute = this.entryPath(rel);
    const parent = path.dirname(absolute);
    return existsSync(parent) && readdirSync(parent).some((name) => name.normalize("NFC") === path.basename(absolute).normalize("NFC"));
  }

  /** 逆序回滚：按文件实际版本判断每步状态，遇到第三方改动则停止并标 needs_attention。 */
  rollback(op: OpRecord): OpRecord {
    this.files.guardSynchronousCommit(stepPaths(op.steps));
    return this.rollbackReserved(op);
  }

  private rollbackReserved(op: OpRecord): OpRecord {
    const attention: string[] = [];
    const blockedSources: string[] = [];
    for (let i = op.steps.length - 1; i >= 0; i--) {
      const s = op.steps[i] as StepRecord;
      const backup = path.join(this.backupDir(op.opId), String(i));
      if (blockedSources.some((from) => s.path === from || s.path.startsWith(`${from}/`))) continue;
      if (s.action === "rename") {
        const from = s.from as string;
        if (s.renameIdentity !== undefined) {
          if (s.renameIdentity === null) continue; // 该重命名尚未开始
          const source = this.entryPath(from);
          const dest = this.entryPath(s.path);
          const stage = s.renameStage && this.entryPath(s.renameStage);
          const hasSource = s.renameStage ? this.hasExactName(from) : Boolean(lstatSync(source, { throwIfNoEntry: false }));
          if (hasSource && fileIdentity(source) === s.renameIdentity) continue;
          let at = stage && fileIdentity(stage) === s.renameIdentity ? stage : (!s.renameStage || this.hasExactName(s.path)) && fileIdentity(dest) === s.renameIdentity ? dest : null;
          if (!hasSource && at && (lstatSync(at).isSymbolicLink() || this.files.currentVersion(at === stage ? (s.renameStage as string) : s.path) === s.afterVersion)) {
            try {
              if (stage && at === dest && fileIdentity(path.dirname(stage)) === s.renameStageDirectoryIdentity && !lstatSync(stage, { throwIfNoEntry: false })) {
                renameNoReplace(dest, stage, s.renameStage as string);
                at = stage;
              }
              // On an insensitive filesystem the rival spelling can resolve through
              // the old path even though there is no directory entry with that name.
              if ((!stage || at === stage) && !this.files.exists(from) && !lstatSync(source, { throwIfNoEntry: false })) {
                renameNoReplace(at, source, from);
                continue;
              }
            } catch {
              // A competing entry or unsupported volume leaves the original for recovery.
            }
          }
          attention.push(s.path, from);
          if (stage) blockedSources.push(from);
          continue;
        }
        const toExists = this.files.exists(s.path);
        const fromExists = this.files.exists(from);
        const toIsOurs = toExists && this.files.currentVersion(s.path) === s.afterVersion;
        if (toIsOurs && !fromExists) {
          try {
            renameNoReplace(this.entryPath(s.path), this.entryPath(from), from);
          } catch {
            attention.push(s.path, from);
          }
        } else if (toIsOurs && fromExists) attention.push(s.path, from); // 移走后第三方又在源路径创建了文件
        else if (!fromExists) attention.push(s.path); // 源不见了且目标也不是我们移过去的
        continue;
      }
      if (s.creationStage) {
        const target = fileIdentity(this.files.abs(s.path));
        if (s.creationStageIdentity && s.creationStageIdentity === target) {
          if (this.files.currentVersion(s.path) === s.afterVersion) rmSync(this.files.abs(s.path));
          else attention.push(s.path);
        } else if (s.done && target) attention.push(s.path);
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
    if (op.state === "rolled_back") this.clearStaging(op);
    return op;
  }

  /** 启动恢复：处理所有 prepared 日志并清理 30 天前的已结束日志。 */
  recover(): OpRecord[] {
    const results: OpRecord[] = [];
    for (const op of this.list()) {
      if (op.state === "prepared") results.push(this.rollback(op));
      else if (op.state === "committed" || op.state === "rolled_back") {
        this.clearStaging(op);
        if (this.now() - statSync(this.logPath(op.opId)).mtimeMs > RETENTION_MS) {
          rmSync(this.logPath(op.opId), { force: true });
          rmSync(this.backupDir(op.opId), { recursive: true, force: true });
        }
      }
    }
    return results;
  }
}
