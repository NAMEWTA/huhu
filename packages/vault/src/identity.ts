import type { BigIntStats } from "node:fs";
import { statSync } from "node:fs";

/** 文件身份 `dev:ino`；文件系统不提供稳定 inode 时返回 null。 */
export function filesystemIdentity(stat: Pick<BigIntStats, "dev" | "ino">): string | null {
  if (stat.ino === 0n) return null;
  return `${stat.dev}:${stat.ino}`;
}

export function identityOfPath(abs: string): string | null {
  try {
    return filesystemIdentity(statSync(abs, { bigint: true }));
  } catch {
    return null;
  }
}
