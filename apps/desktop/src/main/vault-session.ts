import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { importPackage } from "@huhu/vault";

export interface RecentVault {
  path: string;
  name: string;
  at: string;
}
export interface VaultState {
  path: string | null;
  readOnly: boolean;
  /** 本次运行中打开过的 Vault（只在内存里，不写入 userData；D-26）。 */
  recent: RecentVault[];
  /** 命令行 / 环境变量指定的 Vault 打开失败的原因。 */
  error?: string;
}
export type OpenFailure = { ok: false; code: string; message: string };
export type OpenResult = { ok: true } | OpenFailure;

const fail = (code: string, message: string): OpenFailure => ({ ok: false, code, message });

/** 打开已有文件夹前的检查：必须是存在的目录。 */
export function checkOpenable(target: string): OpenFailure | null {
  if (!target || !path.isAbsolute(target)) return fail("INVALID_INPUT", "请选择一个目录");
  if (!existsSync(target)) return fail("NOT_FOUND", `目录不存在：${target}`);
  if (!statSync(target).isDirectory()) return fail("INVALID_INPUT", `不是目录：${target}`);
  return null;
}

/** 新建 / 导入 / 示例的目标必须是空目录（或尚不存在）。 */
export function checkEmptyTarget(target: string): OpenFailure | null {
  if (!target || !path.isAbsolute(target)) return fail("INVALID_INPUT", "请选择一个空目录");
  if (existsSync(target)) {
    if (!statSync(target).isDirectory()) return fail("INVALID_INPUT", `不是目录：${target}`);
    if (readdirSync(target).length > 0) return fail("INVALID_INPUT", "目标目录必须为空，已有内容不会被覆盖");
  }
  return null;
}

/** 把随包的示例 Vault 复制到用户选择的空目录。 */
export function copyDemoVault(demoRoot: string, target: string): OpenFailure | null {
  const bad = checkEmptyTarget(target);
  if (bad) return bad;
  if (!existsSync(demoRoot)) return fail("NOT_FOUND", "这个安装包里没有示例 Vault");
  mkdirSync(target, { recursive: true });
  cpSync(demoRoot, target, { recursive: true });
  return null;
}

/** 导入数据包到空目录；失败不留文件（importPackage 保证）。 */
export function importPackageTo(zipPath: string, target: string): OpenFailure | null {
  const bad = checkEmptyTarget(target);
  if (bad) return bad;
  try {
    importPackage(zipPath, target);
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return fail(err.code ?? "INVALID_INPUT", err.message ?? String(e));
  }
}

export function remember(recent: RecentVault[], entry: RecentVault): RecentVault[] {
  return [entry, ...recent.filter((r) => r.path !== entry.path)].slice(0, 8);
}
