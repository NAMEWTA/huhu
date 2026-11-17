/** 文件树计数（A09）：文件与目录分开；有隐藏时显示“可见 / 总数”；分页未完成时标“已加载”，不冒充总数。 */
export interface CountEntry {
  path: string;
  kind: "file" | "dir" | "symlink";
}
export interface ListedDir {
  entries: readonly CountEntry[];
  /** 该目录是否还有未列出的条目（分页 / 截断）。 */
  truncated: boolean;
}
export interface CountSummary {
  /** 已加载且可见 */
  visibleFiles: number;
  visibleDirs: number;
  /** 已加载（含被隐藏） */
  totalFiles: number;
  totalDirs: number;
  hidden: number;
  /** 某个已列出的目录没有列完，或者仍有目录没展开 / 没加载：数字只是“已加载”。 */
  complete: boolean;
}

const isHidden = (path: string, rules: readonly string[]): boolean => rules.some((r) => path === r || path.startsWith(`${r}/`));

export function summarizeCounts(loaded: ReadonlyMap<string, ListedDir>, hiddenRules: readonly string[]): CountSummary {
  let visibleFiles = 0;
  let visibleDirs = 0;
  let totalFiles = 0;
  let totalDirs = 0;
  let complete = true;
  const dirs = new Set<string>();
  for (const [dir, listing] of loaded) {
    if (listing.truncated) complete = false;
    for (const e of listing.entries) {
      const dirLike = e.kind === "dir";
      if (dirLike) dirs.add(e.path);
      const hidden = isHidden(e.path, hiddenRules);
      if (dirLike) {
        totalDirs++;
        if (!hidden) visibleDirs++;
      } else {
        totalFiles++;
        if (!hidden) visibleFiles++;
      }
    }
    void dir;
  }
  // 有目录条目但没有对应的已加载列表（没展开）→ 数字不完整
  for (const d of dirs) if (!loaded.has(d) && !isHidden(d, hiddenRules)) complete = false;
  return { visibleFiles, visibleDirs, totalFiles, totalDirs, hidden: totalFiles + totalDirs - visibleFiles - visibleDirs, complete };
}

/** 显示文案：有隐藏 → “可见 / 总数”；未完整 → 加“已加载”前缀。 */
export function formatCounts(s: CountSummary): { files: string; dirs: string; note: string | null } {
  const f = s.hidden > 0 ? `${s.visibleFiles} / ${s.totalFiles}` : String(s.visibleFiles);
  const d = s.hidden > 0 ? `${s.visibleDirs} / ${s.totalDirs}` : String(s.visibleDirs);
  return { files: f, dirs: d, note: s.complete ? null : "已加载，未完整统计" };
}
