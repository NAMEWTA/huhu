import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { link, open, rm } from "node:fs/promises";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import writeFileAtomic from "write-file-atomic";
import { guardSynchronousCommit, queueCommit } from "./commit-queue.js";
import { filesystemIdentity } from "./identity.js";
import { CREATION_STAGE_PREFIX, normalizeRelPath, resolveInVault, resolveReadableAsset } from "./paths.js";
import { renameNoReplace } from "./rename.js";
import { readAsset } from "./read-asset.js";
import { ReceiptLog } from "./receipts.js";

/** 文件版本：字节 SHA-256 前 16 位。 */
export function versionOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export interface WriteOptions {
  /** string：必须等于当前版本；null：目标必须不存在；undefined：不检查。 */
  expectedVersion?: string | null;
  /** Check a live authorization or equivalent invariant at publication. */
  beforeCommit?: () => void;
  /** 由 OperationLog 保留暂存条目的身份，供重启恢复识别本次创建的文件。 */
  creationStage?: { path: string; recordIdentity(identity: string): void };
  /** OperationLog records publication evidence while it holds the write reservation. */
  publishReplacement?: (stage: string, target: string, retainStage: () => void) => void;
}

export function fileIdentity(file: string): string | null {
  const info = lstatSync(file, { bigint: true, throwIfNoEntry: false });
  return info ? filesystemIdentity(info) : null;
}

/** File birth time also guards against reuse of a previously released inode. */
export function publicationIdentity(info: Parameters<typeof filesystemIdentity>[0] & { birthtimeNs: bigint }): string | null {
  const file = filesystemIdentity(info);
  return file ? `${file}:${info.birthtimeNs}` : null;
}

/** Vault 内文件读写：路径守卫 + 版本校验 + 原子写 + 自写回执。 */
export class VaultFiles {
  constructor(
    readonly root: string,
    readonly receipts: ReceiptLog = new ReceiptLog(),
    readonly readOnly = false,
  ) {}

  assertWritable(): void {
    if (this.readOnly) throw errors.readOnlyVault();
  }

  abs(rel: string): string {
    return resolveInVault(this.root, rel);
  }

  exists(rel: string): boolean {
    return existsSync(this.abs(rel));
  }

  read(rel: string): { bytes: Buffer; version: string } | null {
    const p = this.abs(rel);
    if (!existsSync(p) || !statSync(p).isFile()) return null;
    const bytes = readFileSync(p);
    return { bytes, version: versionOf(bytes) };
  }

  currentVersion(rel: string): string | null {
    return this.read(rel)?.version ?? null;
  }

  /**
   * Retain the inspected bytes and the original directory entry before publishing.
   * A writer with an open handle can still update the detached original.
   */
  replaceRecoverably(rel: string, inspected: Buffer, converted: Buffer, limit: number, stateDir: string): string {
    this.assertWritable();
    this.guardSynchronousCommit([rel]);
    const target = resolveReadableAsset(this.root, rel);
    if (!lstatSync(this.abs(rel)).isFile()) throw errors.invalidInput(`请打开符号链接的实际文件再转换编码：${rel}`);
    const recoveryRoot = path.join(stateDir, "operations", "encoding-recovery");
    mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 });
    const recovery = mkdtempSync(path.join(recoveryRoot, "conversion-"));
    const original = path.join(recovery, "original");
    const staged = path.join(recovery, "converted");
    let detached = false;
    const version = versionOf(converted);
    try {
      writeFileSync(path.join(recovery, "path.txt"), rel + "\n", { flag: "wx", flush: true });
      writeFileSync(path.join(recovery, "inspected"), inspected, { flag: "wx", flush: true });
      writeFileSync(staged, converted, { flag: "wx", mode: statSync(target).mode & 0o777, flush: true });
      renameNoReplace(target, original, rel);
      detached = true;
      if (!lstatSync(original).isFile()) throw errors.invalidInput("原文件已被其他条目替换");
      const current = readAsset(recovery, "original", 0, limit, undefined, limit).bytes;
      if (!current.equals(inspected)) throw errors.versionConflict(versionOf(current));
      this.receipts.record(rel, version);
      renameNoReplace(staged, target, rel);
      return version;
    } catch (error) {
      this.receipts.forget(rel, version);
      if (!detached && !lstatSync(original, { throwIfNoEntry: false })) {
        rmSync(recovery, { recursive: true, force: true });
        throw error;
      }
      try {
        renameNoReplace(original, target, rel);
      } catch {
        // The destination was reclaimed or became unavailable. Keep the detached entry.
      }
      throw new HuhuError("VERSION_CONFLICT", `转换已停止：${rel}。可在 ${recovery} 找到转换前的字节及恢复说明。`, {
        details: { path: rel, recoveryPath: recovery, cause: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  async write(rel: string, bytes: Uint8Array, opts: WriteOptions = {}): Promise<{ version: string }> {
    this.assertWritable();
    const target = this.abs(rel);
    const content = Buffer.from(bytes);
    const options = { ...opts };
    return queueCommit([target], () => this.writeChecked(rel, content, options));
  }

  /** OperationLog retains the same reservation until all steps and any rollback finish. */
  withCommit<T>(paths: readonly string[], work: (write: VaultFiles["write"]) => T | Promise<T>): Promise<T> {
    this.assertWritable();
    const members = new Set(paths.map((rel) => this.abs(rel)));
    return queueCommit([...members], () =>
      work((rel, bytes, opts = {}) => {
        if (!members.has(this.abs(rel))) throw new Error("Write path is outside the reserved commit");
        return this.writeChecked(rel, Buffer.from(bytes), opts);
      }),
    );
  }

  guardSynchronousCommit(paths: readonly string[]): void {
    this.assertWritable();
    const root = realpathSync(this.root);
    guardSynchronousCommit(paths.map((rel) => path.resolve(root, normalizeRelPath(rel))));
  }

  private checkVersion(rel: string, expectedVersion: string | null | undefined): void {
    if (expectedVersion === null) {
      if (this.exists(rel)) throw errors.nameConflict(rel);
    } else if (expectedVersion !== undefined) {
      const current = this.currentVersion(rel);
      if (current !== expectedVersion) throw current === null ? errors.notFound(`文件不存在：${rel}`) : errors.versionConflict(current);
    }
  }

  private async writeChecked(rel: string, bytes: Buffer, { expectedVersion, beforeCommit, creationStage, publishReplacement }: WriteOptions): Promise<{ version: string }> {
    const p = this.abs(rel);
    this.checkVersion(rel, expectedVersion);
    mkdirSync(path.dirname(p), { recursive: true });
    const version = versionOf(bytes);
    if (typeof expectedVersion === "string") return this.replaceChecked(rel, p, bytes, version, expectedVersion, { beforeCommit, publishReplacement });
    beforeCommit?.();
    this.receipts.record(rel, version);
    let untrackTemporaryFile: (() => void) | undefined;
    try {
      // Keep local revocation and the protected publication in one event-loop turn.
      if (expectedVersion === null) {
        if (beforeCommit) this.createExclusiveSync(rel, p, bytes, creationStage);
        else await this.createExclusive(rel, p, bytes, creationStage);
      } else if (beforeCommit) {
        writeFileAtomic.sync(p, bytes);
      } else {
        await writeFileAtomic(p, Buffer.from(bytes), {
          tmpfileCreated: (file) => {
            const temporaryPath = path.posix.join(path.posix.dirname(rel), path.basename(file));
            untrackTemporaryFile = this.receipts.trackTemporaryFile(temporaryPath);
          },
        });
      }
    } catch (e) {
      this.receipts.forget(rel, version);
      throw e;
    } finally {
      untrackTemporaryFile?.();
    }
    return { version };
  }

  private async replaceChecked(
    rel: string,
    absolute: string,
    bytes: Buffer,
    version: string,
    expectedVersion: string,
    hooks: { beforeCommit: WriteOptions["beforeCommit"]; publishReplacement: WriteOptions["publishReplacement"] },
  ): Promise<{ version: string }> {
    const target = realpathSync(absolute);
    const previous = statSync(target);
    const stage = path.join(path.dirname(target), `${CREATION_STAGE_PREFIX}${randomUUID()}`);
    const untrack = this.receipts.trackTemporaryFile(path.relative(realpathSync(this.root), stage).split(path.sep).join("/"));
    let ownsStage = false;
    try {
      const file = await open(stage, "wx", previous.mode);
      ownsStage = true;
      try {
        await file.writeFile(bytes);
        if (process.getuid && (previous.uid !== process.getuid() || previous.gid !== process.getgid?.())) {
          await file.chown(previous.uid, previous.gid).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EPERM" && error.code !== "EINVAL") throw error;
          });
        }
        await file.chmod(previous.mode);
        await file.sync();
      } finally {
        await file.close();
      }
      hooks.beforeCommit?.();
      this.checkVersion(rel, expectedVersion);
      if (realpathSync(this.abs(rel)) !== target) throw errors.versionConflict(expectedVersion);
      this.receipts.record(rel, version);
      try {
        if (hooks.publishReplacement) {
          hooks.publishReplacement(stage, target, () => {
            ownsStage = false;
          });
        }
        else renameSync(stage, target);
        ownsStage = false;
      } catch (error) {
        this.receipts.forget(rel, version);
        throw error;
      }
      return { version };
    } finally {
      if (ownsStage) await rm(stage, { force: true }).catch(() => undefined);
      untrack();
    }
  }

  /** 独占创建：先写暂存，再硬链接到目标；卷不支持硬链接时以不覆盖方式改名。 */
  private async createExclusive(rel: string, p: string, bytes: Buffer, creationStage: WriteOptions["creationStage"]): Promise<void> {
    const stage = creationStage?.path ?? path.posix.join(path.posix.dirname(rel), `${CREATION_STAGE_PREFIX}${randomUUID()}`);
    const absoluteStage = this.abs(stage);
    const release = creationStage ? undefined : this.receipts.trackTemporaryFile(stage);
    let ownsStage = false;
    let journaled = false;
    let published = false;
    let stageIdentity: string | null = null;
    let failure: { error: unknown } | undefined;
    try {
      const file = await open(absoluteStage, "wx");
      ownsStage = true;
      try {
        const stat = await file.stat({ bigint: true });
        const identity = publicationIdentity(stat);
        stageIdentity = filesystemIdentity(stat);
        if (creationStage) {
          if (!identity) throw errors.invalidInput(`目标所在卷无法提供稳定文件身份，无法安全创建副本：${rel}`);
          creationStage.recordIdentity(identity);
          journaled = true;
        }
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await link(absoluteStage, p);
      } catch (error) {
        if (!linkUnsupported(error)) throw error;
        renameNoReplace(absoluteStage, p, rel);
        ownsStage = false;
      }
      published = true;
    } catch (error) {
      failure = { error: (error as NodeJS.ErrnoException).code === "EEXIST" ? errors.nameConflict(rel) : error };
    }
    if (ownsStage && !journaled) {
      try {
        await rm(absoluteStage, { force: true });
        release?.();
      } catch (cleanupError) {
        // 目标已发布时，暂存清理失败不改变写入结果；保持暂存登记，稍后重试删除。
        if (published) retryStageCleanup(absoluteStage, stageIdentity, release);
        else {
          release?.();
          failure ??= { error: cleanupError };
        }
      }
    } else release?.();
    if (failure) throw failure.error;
  }

  /** 与 createExclusive 相同的独占创建，全程同步，使 beforeCommit 与发布处于同一事件循环轮次。 */
  private createExclusiveSync(rel: string, p: string, bytes: Buffer, creationStage: WriteOptions["creationStage"]): void {
    const stage = creationStage?.path ?? path.posix.join(path.posix.dirname(rel), `${CREATION_STAGE_PREFIX}${randomUUID()}`);
    const absoluteStage = this.abs(stage);
    const release = creationStage ? undefined : this.receipts.trackTemporaryFile(stage);
    let ownsStage = false;
    let journaled = false;
    let published = false;
    let stageIdentity: string | null = null;
    let failure: { error: unknown } | undefined;
    try {
      const fd = openSync(absoluteStage, "wx");
      ownsStage = true;
      try {
        const stat = fstatSync(fd, { bigint: true });
        const identity = publicationIdentity(stat);
        stageIdentity = filesystemIdentity(stat);
        if (creationStage) {
          if (!identity) throw errors.invalidInput(`目标所在卷无法提供稳定文件身份，无法安全创建副本：${rel}`);
          creationStage.recordIdentity(identity);
          journaled = true;
        }
        writeFileSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      try {
        linkSync(absoluteStage, p);
      } catch (error) {
        if (!linkUnsupported(error)) throw error;
        renameNoReplace(absoluteStage, p, rel);
        ownsStage = false;
      }
      published = true;
    } catch (error) {
      failure = { error: (error as NodeJS.ErrnoException).code === "EEXIST" ? errors.nameConflict(rel) : error };
    }
    if (ownsStage && !journaled) {
      try {
        rmSync(absoluteStage, { force: true });
        release?.();
      } catch (cleanupError) {
        if (published) retryStageCleanup(absoluteStage, stageIdentity, release);
        else {
          release?.();
          failure ??= { error: cleanupError };
        }
      }
    } else release?.();
    if (failure) throw failure.error;
  }
}

const STAGE_CLEANUP_RETRIES = 5;

/**
 * 已发布写入的暂存条目删不掉时在后台重试；删除成功后才解除暂存登记。
 * 每次删除前核对该路径仍是本次创建的那个文件（同一 dev/ino），被外部替换则放手不删。
 */
function retryStageCleanup(absoluteStage: string, identity: string | null, release: (() => void) | undefined, attempt = 1): void {
  const timer = setTimeout(() => {
    const current = fileIdentity(absoluteStage);
    if (current === null || identity === null || current !== identity) {
      // 已不存在，或已不是本次的暂存：不删别人的文件。无身份可核对时同样不冒险删除。
      release?.();
      return;
    }
    rm(absoluteStage, { force: true }).then(
      () => release?.(),
      () => {
        // 放弃后仍保留登记，避免把留下的硬链接误报为外部改动；包收集与同步按保留前缀排除残留。
        if (attempt < STAGE_CLEANUP_RETRIES) retryStageCleanup(absoluteStage, identity, release, attempt + 1);
      },
    );
  }, 200 * attempt);
  timer.unref();
}

function linkUnsupported(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EXDEV" || code === "ENOTSUP" || code === "EOPNOTSUPP";
}
