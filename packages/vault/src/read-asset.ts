import { closeSync, constants, fstatSync, openSync, readSync, statSync, type BigIntStats } from "node:fs";
import { errors } from "@huhu/contracts";
import { resolveReadableAsset } from "./paths.js";

const assetVersion = (stat: BigIntStats): string => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;

export function readAsset(root: string, rel: string, offset: number, length: number, expectedVersion?: string, maxSize?: number) {
  const real = resolveReadableAsset(root, rel);
  const pathStat = () => statSync(resolveReadableAsset(root, rel), { bigint: true });
  if (!pathStat().isFile()) throw errors.notFound(`文件不存在：${rel}`);
  const fd = openSync(real, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const initial = fstatSync(fd, { bigint: true });
    if (!initial.isFile()) throw errors.notFound(`文件不存在：${rel}`);
    const size = Number(initial.size);
    const version = assetVersion(initial);
    const verifyPath = () => {
      const current = assetVersion(pathStat());
      if (current !== version) throw errors.versionConflict(current);
    };
    if (expectedVersion !== undefined && expectedVersion !== version) throw errors.versionConflict(version);
    if (maxSize !== undefined && size > maxSize) throw errors.invalidInput(`文件超过 ${maxSize < 1024 * 1024 ? `${maxSize / 1024} KiB` : `${maxSize / 1024 / 1024} MiB`}，不支持预览`);
    verifyPath();
    const bytes = Buffer.alloc(Math.min(length, Math.max(0, size - offset)));
    let read = 0;
    while (read < bytes.length) {
      const count = readSync(fd, bytes, read, bytes.length - read, offset + read);
      if (!count) throw errors.versionConflict(assetVersion(fstatSync(fd, { bigint: true })));
      read += count;
    }
    const current = assetVersion(fstatSync(fd, { bigint: true }));
    if (current !== version) throw errors.versionConflict(current);
    verifyPath();
    return { bytes, size, version };
  } finally {
    closeSync(fd);
  }
}
