import { useCapability, scoreText } from "@huhu/workbench";
import type { ReferenceCandidate } from "@huhu/editor";
import { useCallback, useMemo, useRef } from "react";
import { buildCandidates } from "../shared/references.js";

export interface ReferenceIndex {
  /** `@` 补全：按 scoreText 打分，文件写完整相对路径，文件夹以 / 结尾。 */
  search(query: string): ReferenceCandidate[];
  /** 双链目标是否存在于 Vault（文件按路径，文件夹按以 / 结尾的路径）。 */
  exists(target: string): boolean;
}

/** 引用索引：数据源是 vault.tree，被过滤的内部目录（`.huhu/`）不出现。 */
export function useReferenceIndex(): ReferenceIndex {
  const tree = useCapability<{ path: string; type: "file" | "dir"; mtimeMs?: number }[]>("vault.tree", {});
  const candidates = useMemo(() => buildCandidates(tree.data ?? []).map((c) => (c.kind === "folder" ? { ...c, path: `${c.path}/` } : c)), [tree.data]);
  const known = useMemo(() => new Set(candidates.map((c) => c.path)), [candidates]);
  // 编辑器的补全扩展只在文档创建时装载一次：search 必须是稳定的函数，读取最新的候选（否则目录树加载完成前打开的编辑器永远补全不出东西）
  const latest = useRef(candidates);
  latest.current = candidates;
  const search = useCallback((query: string): ReferenceCandidate[] => {
    const all = latest.current;
    const q = query.trim();
    const ranked = q
      ? all
          .map((c) => ({ c, s: scoreText(q, c.path) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => b.s - a.s || a.c.path.localeCompare(b.c.path))
          .map((x) => x.c)
      : [...all].sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0)).slice(0, 20);
    return ranked.slice(0, 30).map((c) => ({ path: c.path, kind: c.kind }));
  }, []);
  const exists = useCallback((target: string) => known.has(target.replace(/#.*$/, "")) || known.has(`${target.replace(/#.*$/, "")}/`), [known]);
  return { search, exists };
}
