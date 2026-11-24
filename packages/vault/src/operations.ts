import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import { CREATION_STAGE_PREFIX, normalizeRelPath } from "./paths.js";
import { renameNoReplace } from "./rename.js";
import { fileIdentity, publicationIdentity, VaultFiles, versionOf } from "./write.js";

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
  phase?: "prepared" | "accepted" | "confirmed";
  retained?: RetainedEntry;
}

interface RetainedEntry {
  target: string;
  dir: string;
  dirIdentity: string;
  originalIdentity: string;
  replacement?: { path: string; identity: string };
}

interface OperationHooks {
  afterPublish?: (index: number) => void;
  afterStep?: (index: number) => void;
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

function atOrBelow(relative: string, parent: string): boolean {
  return relative === parent || relative.startsWith(`${parent}/`);
}

function folded(relative: string): string {
  return relative.normalize("NFC").toLowerCase();
}

function entryIdentity(absolute: string): string | null {
  const info = lstatSync(absolute, { bigint: true, throwIfNoEntry: false });
  return info ? publicationIdentity(info) : null;
}

function ownsEntry(absolute: string, identity: string | null | undefined): boolean {
  if (!identity) return false;
  return identity.split(":").length === 3 ? entryIdentity(absolute) === identity : fileIdentity(absolute) === identity;
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
    writeFileSync(tmp, JSON.stringify(op, null, 2), { flush: true });
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
  async run(opId: string, kind: string, steps: OpStep[], hooks: OperationHooks = {}): Promise<OpRecord> {
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
        phase: "prepared",
      };
    });
    const op: OpRecord = { opId, kind, state: "prepared", steps: records, createdAt: new Date(this.now()).toISOString() };
    return this.files.withCommit(stepPaths(records), (write) => this.apply(op, steps, write, hooks));
  }

  private async apply(op: OpRecord, steps: OpStep[], write: VaultFiles["write"], hooks: OperationHooks): Promise<OpRecord> {
    const { opId, steps: records } = op;
    const previous = this.load(opId);
    if (previous?.state === "prepared" || previous?.state === "needs_attention") {
      throw new HuhuError("WRITE_PARTIAL", "原操作仍待核实，请查看恢复详情", { details: { opId, state: previous.state }, recovery: [{ action: "open-health", label: "查看恢复详情" }] });
    }
    if (records[0]) this.checkStepVersion(records[0]);
    this.save(op);

    const untrack = records.flatMap((rec) => [rec.creationStage, rec.renameStage && path.posix.dirname(rec.renameStage), rec.renameStage].flatMap((temporary) => (temporary ? [this.files.receipts.trackTemporaryFile(temporary)] : [])));
    try {
      for (const [i, s] of steps.entries()) {
        const rec = records[i] as StepRecord;
        // 执行前确认目标仍是 prepare 时的版本，绝不覆盖第三方改动
        this.checkStepVersion(rec);
        if (s.action === "write") {
          if (rec.creationStage) {
            try {
              await write(s.path, s.bytes, {
                expectedVersion: null,
                creationStage: {
                  path: rec.creationStage,
                  recordIdentity: (identity) => {
                    rec.creationStageIdentity = identity;
                    rec.phase = "accepted";
                    this.save(op);
                  },
                },
              });
            } catch (error) {
              // The exclusive primitive confirmed the destination was already occupied.
              if (error instanceof HuhuError && error.code === "NAME_CONFLICT") rec.phase = "prepared";
              throw error;
            }
          } else {
            await write(s.path, s.bytes, {
              expectedVersion: rec.beforeVersion,
              publishReplacement: (stage, target, retainStage) => this.changeExisting(op, rec, target, untrack, { path: stage, retainStage }),
            });
          }
        } else if (s.action === "delete") {
          const target = this.entryPath(s.path);
          if (lstatSync(target, { throwIfNoEntry: false })) this.changeExisting(op, rec, target, untrack);
        } else {
          mkdirSync(path.dirname(this.files.abs(s.path)), { recursive: true });
          const source = this.entryPath(s.from);
          rec.renameIdentity = entryIdentity(source);
          if (!rec.renameIdentity) throw new HuhuError("INVALID_INPUT", `源条目所在卷无法提供稳定文件身份，无法安全移动：${s.from}`);
          rec.phase = "accepted";
          this.save(op);
          let from = source;
          if (rec.renameStage) {
            const temporary = this.entryPath(rec.renameStage);
            const stageDirectory = path.dirname(temporary);
            mkdirSync(stageDirectory, { mode: 0o700 });
            rec.renameStageDirectoryIdentity = entryIdentity(stageDirectory);
            this.save(op);
            this.checkStepVersion(rec);
            renameNoReplace(source, temporary, s.from);
            from = temporary;
          }
          if (this.files.exists(s.path)) throw errors.nameConflict(s.path);
          if (!rec.renameStage) this.checkStepVersion(rec);
          renameNoReplace(from, this.entryPath(s.path), s.path);
        }
        hooks.afterPublish?.(i);
        rec.done = true;
        if (rec.phase === "accepted") rec.phase = "confirmed";
        this.save(op);
        hooks.afterStep?.(i);
      }
      op.state = "committed";
      this.save(op);
      this.clearStaging(op);
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
    return op;
  }

  private relative(absolute: string): string {
    return normalizeRelPath(path.relative(realpathSync(this.files.root), absolute).split(path.sep).join("/"));
  }

  private changeExisting(
    op: OpRecord,
    step: StepRecord,
    target: string,
    untrack: (() => void)[],
    replacement?: { path: string; retainStage(): void },
  ): void {
    const original = lstatSync(target, { throwIfNoEntry: false });
    const identity = entryIdentity(target);
    if ((!original?.isFile() && !original?.isSymbolicLink()) || !identity) throw errors.invalidInput(`无法保留原始文件条目：${step.path}`);
    const logicalTarget = this.relative(target);
    const dir = path.posix.join(path.posix.dirname(logicalTarget), `${CREATION_STAGE_PREFIX}${randomUUID()}`);
    const absoluteDir = this.files.abs(dir);
    mkdirSync(absoluteDir, { mode: 0o700 });
    const dirIdentity = entryIdentity(absoluteDir);
    if (!dirIdentity) throw errors.invalidInput(`卷无法识别操作暂存目录：${step.path}`);
    const saved = path.join(absoluteDir, "original");
    const replacementIdentity = replacement && entryIdentity(replacement.path);
    if (replacement && !replacementIdentity) throw errors.invalidInput(`卷无法识别替换文件：${step.path}`);
    const retained: RetainedEntry = {
      target: logicalTarget,
      dir,
      dirIdentity,
      originalIdentity: identity,
      ...(replacement && replacementIdentity && { replacement: { path: this.relative(replacement.path), identity: replacementIdentity } }),
    };
    untrack.push(...[dir, `${dir}/original`, `${dir}/discarded`].map((p) => this.files.receipts.trackTemporaryFile(p)));
    step.retained = retained;
    step.phase = "accepted";
    this.save(op);
    replacement?.retainStage();
    this.checkStepVersion(step);
    if ((replacement && realpathSync(this.files.abs(step.path)) !== target) || entryIdentity(target) !== identity) {
      throw new HuhuError("VERSION_CONFLICT", `文件条目在发布前被替换：${step.path}`, { details: { path: step.path, currentVersion: this.files.currentVersion(step.path) } });
    }
    renameNoReplace(target, saved, step.path);
    // An outside writer can race the validation. The moved entry is still intact.
    if (entryIdentity(saved) !== identity || (original.isFile() && this.files.currentVersion(`${dir}/original`) !== step.beforeVersion)) {
      renameNoReplace(saved, target, step.path);
      throw new HuhuError("VERSION_CONFLICT", `文件在发布期间被修改：${step.path}`, { details: { path: step.path, currentVersion: this.files.currentVersion(step.path) } });
    }
    if (replacement) renameNoReplace(replacement.path, target, step.path);
  }

  private checkStepVersion(step: StepRecord): void {
    const target = step.from ?? step.path;
    if (step.creationStage && this.files.exists(target)) throw errors.nameConflict(target);
    const currentVersion = this.files.currentVersion(target);
    if (currentVersion !== step.beforeVersion) {
      throw new HuhuError("VERSION_CONFLICT", `文件在操作期间被修改：${target}`, { details: { path: target, currentVersion } });
    }
  }

  private stagePath(op: OpRecord, index: number, relative: string): string {
    if (op.state !== "committed") return relative;
    for (const step of op.steps.slice(index + 1)) {
      if (step.action === "rename" && step.from && atOrBelow(relative, step.from)) {
        relative = step.path + relative.slice(step.from.length);
      }
    }
    return relative;
  }

  private clearStaging(op: OpRecord): void {
    for (const [i, s] of op.steps.entries()) {
      const at = (relative: string) => this.entryPath(this.stagePath(op, i, relative));
      try {
        if (s.creationStage && s.creationStageIdentity) {
          for (const relative of [s.creationStage, `${s.creationStage}-rollback`]) {
            const stage = at(relative);
            if (ownsEntry(stage, s.creationStageIdentity)) rmSync(stage);
          }
        }
        if (s.renameStage && s.renameStageDirectoryIdentity) {
          const dir = at(path.posix.dirname(s.renameStage));
          if (ownsEntry(dir, s.renameStageDirectoryIdentity) && readdirSync(dir).length === 0) rmdirSync(dir);
        }
        if (s.retained) {
          const { dir, dirIdentity, originalIdentity, replacement } = s.retained;
          const directory = at(dir);
          if (!ownsEntry(directory, dirIdentity)) continue;
          const original = path.join(directory, "original");
          if (ownsEntry(original, originalIdentity) && this.matchesVersion(original, s.beforeVersion)) rmSync(original);
          const discarded = path.join(directory, "discarded");
          if (ownsEntry(discarded, replacement?.identity) && this.matchesVersion(discarded, s.afterVersion)) rmSync(discarded);
          if (replacement) {
            const unpublished = at(replacement.path);
            if (ownsEntry(unpublished, replacement.identity)) rmSync(unpublished);
          }
          if (readdirSync(directory).length === 0) rmdirSync(directory);
        }
      } catch {
        // 事务已结算；留待下次启动清理，且不得因目录后来改动而阻断。
      }
    }
  }

  private entryPath(rel: string): string {
    rel = normalizeRelPath(rel);
    const parent = path.posix.dirname(rel);
    return path.join(parent === "." ? realpathSync(this.files.root) : this.files.abs(parent), path.posix.basename(rel));
  }

  /** 大小写不敏感的文件系统支持查找原路径别名；回滚需核对实际拼写。 */
  private hasExactName(rel: string): boolean {
    const absolute = this.entryPath(rel);
    const parent = path.dirname(absolute);
    return existsSync(parent) && readdirSync(parent).some((name) => name.normalize("NFC") === path.basename(absolute).normalize("NFC"));
  }

  private matchesVersion(absolute: string, version: string | null): boolean {
    const entry = lstatSync(absolute, { throwIfNoEntry: false });
    // A retained symlink can have a different relative resolution in staging.
    return entry?.isSymbolicLink() === true || (entry?.isFile() === true && versionOf(readFileSync(absolute)) === version);
  }

  private rollbackRetained(step: StepRecord, retained: RetainedEntry): boolean {
    const { dir, dirIdentity, originalIdentity, replacement } = retained;
    const target = this.entryPath(retained.target);
    if (ownsEntry(target, originalIdentity)) return this.matchesVersion(target, step.beforeVersion);
    const directory = this.entryPath(dir);
    const original = path.join(directory, "original");
    if (!ownsEntry(directory, dirIdentity) || !ownsEntry(original, originalIdentity) || !this.matchesVersion(original, step.beforeVersion)) return false;

    const hasTarget = Boolean(lstatSync(target, { throwIfNoEntry: false }));
    if (replacement) {
      const discarded = path.join(directory, "discarded");
      if (hasTarget) {
        if (!ownsEntry(target, replacement.identity) || !this.matchesVersion(target, step.afterVersion)) return false;
        renameNoReplace(target, discarded, step.path);
        if (!ownsEntry(discarded, replacement.identity) || !this.matchesVersion(discarded, step.afterVersion)) {
          renameNoReplace(discarded, target, step.path);
          return false;
        }
      } else if (!ownsEntry(discarded, replacement.identity) && !ownsEntry(this.entryPath(replacement.path), replacement.identity)) {
        // The missing replacement could have been deleted after publication by another writer.
        return false;
      }
    } else if (hasTarget) {
      return false;
    }
    renameNoReplace(original, target, step.path);
    return true;
  }

  private rollbackCreation(step: StepRecord, stage: string): boolean {
    const target = this.entryPath(step.path);
    if (!lstatSync(target, { throwIfNoEntry: false })) return true;
    if (!ownsEntry(target, step.creationStageIdentity) || !this.matchesVersion(target, step.afterVersion)) {
      return !step.creationStageIdentity && !step.done;
    }
    const discarded = this.entryPath(`${stage}-rollback`);
    renameNoReplace(target, discarded, step.path);
    if (ownsEntry(discarded, step.creationStageIdentity) && this.matchesVersion(discarded, step.afterVersion)) return true;
    renameNoReplace(discarded, target, step.path);
    return false;
  }

  /** 逆序回滚：只有文件条目身份和版本都对应本操作才撤回。 */
  rollback(op: OpRecord): OpRecord {
    this.files.guardSynchronousCommit([...stepPaths(op.steps), ...op.steps.flatMap(({ retained }) => (retained ? [retained.target] : []))]);
    return this.rollbackReserved(op);
  }

  private rollbackReserved(op: OpRecord): OpRecord {
    const attention: string[] = [];
    const blockedSources: string[] = [];
    for (let i = op.steps.length - 1; i >= 0; i--) {
      const s = op.steps[i] as StepRecord;
      if (s.phase === "prepared") continue;
      if (stepPaths([s]).some((target) => blockedSources.some((from) => atOrBelow(folded(target), from)))) continue;
      try {
        if (s.action === "rename" && this.rollbackRename(s)) continue;
        if (s.retained && this.rollbackRetained(s, s.retained)) continue;
        if (s.creationStage && this.rollbackCreation(s, s.creationStage)) continue;
      } catch {
        // A racing name or inaccessible stage is retained for manual recovery.
      }
      attention.push(s.path);
      blockedSources.push(folded(s.path));
      if (s.from) {
        attention.push(s.from);
        blockedSources.push(folded(s.from));
      }
    }
    if (attention.length) {
      op.state = "needs_attention";
      op.attention = [...new Set(attention)];
    } else op.state = "rolled_back";
    this.save(op);
    if (op.state === "rolled_back") this.clearStaging(op);
    return op;
  }

  private rollbackRename(s: StepRecord): boolean {
    if (!s.from || s.renameIdentity === undefined) return false;
    if (s.renameIdentity === null) return true;
    const source = this.entryPath(s.from);
    const dest = this.entryPath(s.path);
    const stage = s.renameStage && this.entryPath(s.renameStage);
    const hasSource = s.renameStage ? this.hasExactName(s.from) : Boolean(lstatSync(source, { throwIfNoEntry: false }));
    if (hasSource) return ownsEntry(source, s.renameIdentity);

    let at = stage && ownsEntry(stage, s.renameIdentity) ? stage : (!s.renameStage || this.hasExactName(s.path)) && ownsEntry(dest, s.renameIdentity) ? dest : null;
    if (!at || (!lstatSync(at).isSymbolicLink() && this.files.currentVersion(at === stage ? s.renameStage! : s.path) !== s.afterVersion)) return false;
    if (stage && at === dest && ownsEntry(path.dirname(stage), s.renameStageDirectoryIdentity) && !lstatSync(stage, { throwIfNoEntry: false })) {
      renameNoReplace(dest, stage, s.renameStage!);
      at = stage;
    }
    if ((stage && at !== stage) || this.files.exists(s.from) || lstatSync(source, { throwIfNoEntry: false })) return false;
    renameNoReplace(at, source, s.from);
    return true;
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
