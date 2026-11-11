import type { GuidePath } from "./guide-files.js";

/** 单个文件的状态（plugins §4）。disabled 由界面在插件停用时显示，引擎只在启用时回答。 */
export type FileStatus = "current" | "missing" | "outdated" | "conflict" | "preserved" | "needs-check" | "error";
export type GuideStatus = FileStatus | "disabled";

export interface FileFacts {
  /** 当前磁盘内容的哈希；缺失为 null。读取失败时 error 为 true。 */
  current: string | null;
  /** 内置版本的哈希。 */
  builtin: string;
  /** HUHU 上一次写入这份文件时的哈希（基线）；从未写过为 null。 */
  baseline: string | null;
  preserved: boolean;
  needsCheck: boolean;
  error: boolean;
}

/** 状态判定：与内置一致 → current；缺失 → missing；等于基线但基线不是内置 → outdated（可自动升级）；其余有差异 → conflict。 */
export function judgeFile(f: FileFacts): FileStatus {
  if (f.error) return "error";
  if (f.current === null) return "missing";
  if (f.current === f.builtin) return "current";
  if (f.needsCheck) return "needs-check";
  if (f.baseline !== null && f.current === f.baseline) return "outdated";
  if (f.preserved) return "preserved";
  return "conflict";
}

/** 总状态取最需要处理的那份。 */
const ORDER: FileStatus[] = ["error", "conflict", "needs-check", "preserved", "outdated", "missing", "current"];
export function overall(statuses: readonly FileStatus[]): FileStatus {
  return ORDER.find((s) => statuses.includes(s)) ?? "current";
}

export interface GuideStateFile {
  /** 每个文件上一次由 HUHU 写入的内容哈希。 */
  baseline: Partial<Record<GuidePath, string>>;
  preserved: Partial<Record<GuidePath, boolean>>;
  needsCheck: Partial<Record<GuidePath, boolean>>;
}
export const emptyState = (): GuideStateFile => ({ baseline: {}, preserved: {}, needsCheck: {} });
