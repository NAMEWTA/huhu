import type { ReactNode } from "react";

export interface PaletteItem {
  id: string;
  group: "module" | "command" | "result";
  /** 搜索结果的分组名（笔记 / 任务 / 档案 / 收件箱…）。 */
  groupLabel?: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
  run(): void;
}

/** 模糊打分：连续子串 > 词首 > 分散字符；不匹配返回 -1。 */
export function scoreText(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx * 2 - (t.length - q.length);
  let ti = 0;
  let score = 0;
  let last = -2;
  for (const ch of q) {
    const f = t.indexOf(ch, ti);
    if (f < 0) return -1;
    score += f === last + 1 ? 5 : 1; // 连续字符加权
    last = f;
    ti = f + 1;
  }
  return score;
}

const GROUP_ORDER: Record<PaletteItem["group"], number> = { module: 0, command: 1, result: 2 };

/** 过滤并排序；空查询时按分组顺序原样返回（最近使用的置顶）。 */
export function rankItems(items: readonly PaletteItem[], query: string, recents: readonly string[] = []): PaletteItem[] {
  const scored = items.map((it) => ({ it, s: scoreText(query, it.title) })).filter((x) => x.s >= 0);
  const recentRank = (id: string) => {
    const i = recents.indexOf(id);
    return i < 0 ? 99 : i;
  };
  return scored.sort((a, b) => (query.trim() ? b.s - a.s : recentRank(a.it.id) - recentRank(b.it.id) || GROUP_ORDER[a.it.group] - GROUP_ORDER[b.it.group]) || a.it.title.localeCompare(b.it.title)).map((x) => x.it);
}

/** 搜索请求去抖后的"过期结果丢弃"：只有最新一次请求的结果会被采纳。 */
export class LatestOnly {
  private n = 0;
  next(): () => boolean {
    const mine = ++this.n;
    return () => mine === this.n;
  }
}
