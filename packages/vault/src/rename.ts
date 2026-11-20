import { lstatSync } from "node:fs";
import { createRequire } from "node:module";
import { constants } from "node:os";
import path from "node:path";
import { errors } from "@huhu/contracts";

const require = createRequire(import.meta.url);
let exclusiveRename: ((from: string, to: string) => number) | undefined;

function platformRename() {
  const koffi = require("koffi") as typeof import("koffi");
  if (process.platform === "win32") {
    const kernel = koffi.load("kernel32.dll");
    const move = kernel.func("int __stdcall MoveFileExW(str16, str16, uint32_t)");
    const lastError = kernel.func("uint32_t __stdcall GetLastError()");
    return (from: string, to: string) => (move(path.toNamespacedPath(from), path.toNamespacedPath(to), 0) ? 0 : lastError());
  }
  if (process.platform === "darwin") {
    const rename = koffi.load("/usr/lib/libSystem.B.dylib").func("int renamex_np(str, str, unsigned int)");
    return (from: string, to: string) => (rename(from, to, 0x04 /* RENAME_EXCL */) === 0 ? 0 : koffi.errno());
  }
  if (process.platform === "linux") {
    const rename = koffi.load(null).func("int renameat2(int, str, int, str, unsigned int)");
    const atCwd = -100; // AT_FDCWD
    return (from: string, to: string) => (rename(atCwd, from, atCwd, to, 1 /* RENAME_NOREPLACE */) === 0 ? 0 : koffi.errno());
  }
  throw new Error("此操作系统没有受支持的独占移动接口");
}

/** Publishes a directory entry without replacing any entry already at the destination. */
export function renameNoReplace(from: string, to: string, label: string): void {
  try {
    exclusiveRename ??= platformRename();
  } catch (error) {
    throw errors.invalidInput(`独占移动不可用：${label}（${error instanceof Error ? error.message : String(error)}）`);
  }
  const code = exclusiveRename(from, to);
  if (code === 0) return;
  const errno = constants.errno;
  const conflicts = process.platform === "win32" ? [80, 183] : [errno.EEXIST, errno.ENOTEMPTY];
  if (conflicts.includes(code) || lstatSync(to, { throwIfNoEntry: false })) throw errors.nameConflict(label);
  const unsupported = process.platform === "win32" ? [1, 17, 50, 87] : [errno.EXDEV, errno.EINVAL, errno.ENOTSUP, errno.ENOSYS];
  if (unsupported.includes(code)) throw errors.invalidInput(`目标所在卷不支持安全的独占移动：${label}（系统错误 ${code}）`);
  throw errors.invalidInput(`无法独占移动：${label}（系统错误 ${code}）`);
}
