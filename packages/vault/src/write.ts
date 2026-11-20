import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { link, open, rm } from "node:fs/promises";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import writeFileAtomic from "write-file-atomic";
import { filesystemIdentity } from "./identity.js";
import { resolveInVault, resolveReadableAsset } from "./paths.js";
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
  /** 由 OperationLog 保留暂存条目的身份，供重启恢复识别本次创建的文件。 */
  creationStage?: { path: string; recordIdentity(identity: string): void };
}

export function fileIdentity(file: string): string | null {
  const info = lstatSync(file, { bigint: true, throwIfNoEntry: false });
  return info ? filesystemIdentity(info) : null;
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
    const p = this.abs(rel);
    if (opts.expectedVersion === null) {
      if (this.exists(rel)) throw errors.nameConflict(rel);
    } else if (opts.expectedVersion !== undefined) {
      const cur = this.currentVersion(rel);
      if (cur !== opts.expectedVersion) {
        throw cur === null ? errors.notFound(`文件不存在：${rel}`) : errors.versionConflict(cur);
      }
    }
    mkdirSync(path.dirname(p), { recursive: true });
    const version = versionOf(bytes);
    this.receipts.record(rel, version);
    let untrackTemporaryFile: (() => void) | undefined;
    try {
      if (opts.expectedVersion === null) {
        const stage = opts.creationStage?.path ?? path.posix.join(path.posix.dirname(rel), `.huhu-create-${randomUUID()}`);
        const absoluteStage = this.abs(stage);
        const release = opts.creationStage ? undefined : this.receipts.trackTemporaryFile(stage);
        let ownsStage = false;
        let journaled = false;
        try {
          const file = await open(absoluteStage, "wx");
          ownsStage = true;
          try {
            if (opts.creationStage) {
              const identity = filesystemIdentity(await file.stat({ bigint: true }));
              if (!identity) throw errors.invalidInput(`目标所在卷无法提供稳定文件身份，无法安全创建副本：${rel}`);
              opts.creationStage.recordIdentity(identity);
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
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EPERM" && code !== "EXDEV" && code !== "ENOTSUP" && code !== "EOPNOTSUPP") throw error;
            renameNoReplace(absoluteStage, p, rel);
            ownsStage = false;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") throw errors.nameConflict(rel);
          throw error;
        } finally {
          try {
            if (ownsStage && !journaled) await rm(absoluteStage, { force: true });
          } finally {
            release?.();
          }
        }
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
}
