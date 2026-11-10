import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import writeFileAtomic from "write-file-atomic";
import { resolveInVault } from "./paths.js";
import { ReceiptLog } from "./receipts.js";

/** 文件版本：字节 SHA-256 前 16 位。 */
export function versionOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export interface WriteOptions {
  /** string：必须等于当前版本；null：目标必须不存在；undefined：不检查。 */
  expectedVersion?: string | null;
}

/** Vault 内文件读写：路径守卫 + 版本校验 + 原子写 + 自写回执。 */
export class VaultFiles {
  constructor(readonly root: string, readonly receipts: ReceiptLog = new ReceiptLog()) {}

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

  async write(rel: string, bytes: Uint8Array, opts: WriteOptions = {}): Promise<{ version: string }> {
    const p = this.abs(rel);
    if (opts.expectedVersion !== undefined) {
      const cur = this.currentVersion(rel);
      if (opts.expectedVersion === null ? cur !== null : cur !== opts.expectedVersion) {
        throw cur === null ? errors.notFound(`文件不存在：${rel}`) : opts.expectedVersion === null ? errors.nameConflict(rel) : errors.versionConflict(cur);
      }
    }
    mkdirSync(path.dirname(p), { recursive: true });
    const version = versionOf(bytes);
    this.receipts.record(rel, version);
    try {
      await writeFileAtomic(p, bytes);
    } catch (e) {
      this.receipts.forget(rel, version);
      throw e;
    }
    return { version };
  }
}
