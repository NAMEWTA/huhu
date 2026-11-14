/** `@` 引用补全的候选与搜索（沿用上游文件名优先的分档，多词按各词分数相加）。 */
export interface ResourceCandidate {
  kind: "file" | "folder";
  path: string;
  label: string;
  /** 最近修改时间（空输入时按它列出最近的资料）。 */
  mtimeMs?: number;
}

const basename = (p: string): string => p.split("/").at(-1) ?? p;

/** 0 最好；null = 不匹配。 */
export function scorePath(path: string, query: string): number | null {
  if (!query) return 0;
  const p = path.toLowerCase();
  const name = basename(p);
  if (p === query) return 0;
  if (name === query) return 1;
  if (p.startsWith(query)) return 2;
  if (name.startsWith(query)) return 3;
  if (name.includes(query)) return 4;
  if (p.includes(query)) return 5;
  return null;
}

/** 来自 vault.tree：文件 + 文件夹。只有 Vault 内的路径可选；`.huhu/` 等内部目录不出现。 */
export function buildCandidates(tree: readonly { path: string; type: "file" | "dir"; mtimeMs?: number }[]): ResourceCandidate[] {
  const out: ResourceCandidate[] = [];
  for (const e of tree) {
    if (e.path.startsWith(".huhu/") || e.path === ".huhu") continue; // 内部目录不是用户资料
    out.push({ kind: e.type === "dir" ? "folder" : "file", path: e.path, label: basename(e.path), ...(e.mtimeMs !== undefined ? { mtimeMs: e.mtimeMs } : {}) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

export function searchCandidates(candidates: readonly ResourceCandidate[], query: string, limit = 50): ResourceCandidate[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    // 空输入：最近修改的 20 项
    return [...candidates].sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.path.localeCompare(b.path)).slice(0, Math.min(20, limit));
  }
  return candidates
    .map((c) => {
      const scores = terms.map((t) => {
        const a = scorePath(c.path, t);
        const b = scorePath(c.label, t);
        return a === null ? b : b === null ? a : Math.min(a, b);
      });
      return { c, score: scores.some((s) => s === null) ? null : scores.reduce((x: number, s) => x + (s ?? 0), 0) };
    })
    .filter((r): r is { c: ResourceCandidate; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.c.path.localeCompare(b.c.path))
    .slice(0, limit)
    .map((r) => r.c);
}
