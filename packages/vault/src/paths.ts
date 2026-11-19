import { realpathSync, lstatSync } from "node:fs";
import path from "node:path";
import { errors, type ProtectedKind } from "@huhu/contracts";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const protectedNames = new Map<string, ProtectedKind>([
  [".huhu", "internal"],
  [".git", "git"],
  ["node_modules", "dependency"],
  [".agents", "agents"],
]);

export function protectedKindOf(rel: string): ProtectedKind | undefined {
  for (const segment of rel.split("/")) {
    const kind = protectedNames.get(segment.toLowerCase());
    if (kind) return kind;
  }
}

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

/** 共享附件只读普通资源。允许库内链接，实际读取已经校验过的真实路径。 */
export function resolveReadableAsset(vaultRoot: string, rel: string): string {
  const normalized = normalizeRelPath(rel);
  if (protectedKindOf(normalized)) throw errors.permissionDenied(normalized);
  const root = realpathSync(vaultRoot);
  let real: string;
  try {
    real = realpathSync(resolveInVault(root, normalized));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw errors.notFound(`文件不存在：${rel}`);
    throw error;
  }
  const target = path.relative(root, real);
  if (target === ".." || target.startsWith(`..${path.sep}`) || path.isAbsolute(target)) throw errors.pathOutsideVault(rel);
  if (protectedKindOf(target.split(path.sep).join("/"))) throw errors.permissionDenied(normalized);
  return real;
}
