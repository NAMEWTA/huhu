/** 任务标签规则（spec §2.4）：规范化后逐字相等、区分大小写；筛选语义是全部匹配。 */
export const MAX_TAGS = 20;
const MAX_TAG_LEN = 40;

/** 去掉首尾空白和开头的 #，转为 NFC；不合法（空、过长、含换行或逗号）返回 null。 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.normalize("NFC").trim().replace(/^#+/, "").trim();
  if (t.length < 1 || t.length > MAX_TAG_LEN || /[\r\n,]/.test(t)) return null;
  return t;
}

/** 规范化一组标签：去重并保持原顺序，丢弃不合法项，最多 20 个。 */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t !== null && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** 全部匹配：`filter` 里的每个标签都在任务标签里；空筛选表示不限。 */
export const matchesTags = (taskTags: readonly string[], filter: readonly string[]): boolean => filter.every((t) => taskTags.includes(t));
