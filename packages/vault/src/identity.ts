import type { BigIntStats } from "node:fs";
import { realpathSync, statSync } from "node:fs";

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

export function directoryInstance(abs: string): [identity: string, birthtime: string] | null {
  const stat = statSync(abs, { bigint: true });
  const identity = filesystemIdentity(stat);
  return stat.isDirectory() && identity && stat.birthtimeNs > 0n ? [identity, String(stat.birthtimeNs)] : null;
}

/** Binds a loopback descriptor to one vault directory, including volumes without a usable inode. */
export function endpointRootBinding(root: string): string {
  const instance = directoryInstance(root);
  return instance ? JSON.stringify(["directory", ...instance]) : JSON.stringify(["path", realpathSync(root)]);
}
