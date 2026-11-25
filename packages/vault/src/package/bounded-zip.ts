import { errors, isHuhuError } from "@huhu/contracts";
import { unzipSync, zipSync } from "fflate";
import { normalizeRelPath } from "../paths.js";

export type ZipLimits = { archiveBytes: number; entryBytes: number; totalBytes: number; entries: number };
const invalid = (message: string) => errors.invalidInput("ZIP 数据包无效：" + message);

function requirePath(name: string) {
  if (name.length > 512 || /[\u0000-\u001f\u007f]/u.test(name) || name.split("/").includes("__proto__") || normalizeRelPath(name) !== name) {
    throw invalid("文件路径不规范");
  }
}

/** Inspect the declared size and canonical paths before inflating entries. */
export function readBoundedZip(bytes: Uint8Array, limits: ZipLimits): Map<string, Uint8Array> {
  if (bytes.byteLength > limits.archiveBytes) throw invalid("压缩包超出大小上限");
  const names = new Set<string>();
  const expected = new Map<string, number>();
  let total = 0;
  try {
    const entries = unzipSync(bytes, { filter(entry) {
      const directory = entry.name.endsWith("/");
      const name = directory ? entry.name.slice(0, -1) : entry.name;
      requirePath(name);
      const key = name.normalize("NFC").toLowerCase();
      if (names.has(key)) throw invalid("有重复路径");
      names.add(key);
      if (names.size > limits.entries || entry.originalSize > limits.entryBytes) throw invalid("文件数量或大小超出上限");
      total += entry.originalSize;
      if (total > limits.totalBytes || (directory && entry.originalSize !== 0)) throw invalid("解压大小超出上限");
      if (!directory) expected.set(name, entry.originalSize);
      return !directory;
    } });
    for (const [name, originalSize] of expected) {
      if (entries[name]?.byteLength !== originalSize) throw invalid("声明大小与解压内容不符");
    }
    return new Map(Object.entries(entries));
  } catch (failure) {
    if (isHuhuError(failure)) throw failure;
    throw invalid("无法读取 ZIP 文件");
  }
}

export function writeBoundedZip(files: ReadonlyMap<string, Uint8Array>, limits: ZipLimits): Uint8Array {
  if (files.size > limits.entries) throw invalid("文件数量超出上限");
  let total = 0;
  for (const [name, bytes] of files) {
    requirePath(name);
    total += bytes.length;
    if (bytes.length > limits.entryBytes || total > limits.totalBytes) throw invalid("文件大小超出上限");
  }
  const bytes = zipSync(Object.fromEntries(files), { level: 6 });
  if (bytes.byteLength > limits.archiveBytes) throw invalid("压缩包超出大小上限");
  return bytes;
}
