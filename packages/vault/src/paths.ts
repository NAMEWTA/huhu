import { realpathSync, lstatSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** 校验并规范化 Vault 相对 POSIX 路径；非法则抛 PATH_OUTSIDE_VAULT。 */
export function normalizeRelPath(rel: string): string {
  if (rel.includes("\0") || rel.includes("\\")) throw errors.pathOutsideVault(rel);
  if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) throw errors.pathOutsideVault(rel);
  const parts = rel.split("/").filter((p) => p !== "" && p !== ".");
  for (const p of parts) {
    if (p === "..") throw errors.pathOutsideVault(rel);
    if (WINDOWS_RESERVED.test(p) || /[<>:"|?*]/.test(p) || /[. ]$/.test(p)) throw errors.pathOutsideVault(rel);
  }
  if (parts.length === 0) throw errors.pathOutsideVault(rel);
  return parts.join("/");
}

/**
 * 路径守卫：把 Vault 相对路径转为本机绝对路径，并确认真实路径（解析符号链接后）仍在 Vault 内。
 * 目标不存在时校验其最近的已存在祖先。
 */
export function resolveInVault(vaultRoot: string, rel: string): string {
  const norm = normalizeRelPath(rel);
  const root = realpathSync(vaultRoot);
  const abs = path.join(root, ...norm.split("/").filter(Boolean));
  let probe = abs;
  for (;;) {
    try {
      lstatSync(probe);
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) throw errors.pathOutsideVault(rel);
      probe = parent;
    }
  }
  const real = realpathSync(probe);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (real !== root && !real.startsWith(rootWithSep)) throw errors.pathOutsideVault(rel);
  return abs;
}
