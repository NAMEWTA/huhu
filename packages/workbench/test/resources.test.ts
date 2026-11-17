import { describe, expect, test } from "vitest";
import { buildCandidates, formatCounts, searchCandidates, summarizeCounts, type ListedDir } from "../src/resources/index.js";

const L = (entries: [string, "file" | "dir"][], truncated = false): ListedDir => ({ entries: entries.map(([path, kind]) => ({ path, kind })), truncated });

describe("A04 `@` 候选来自索引查询，不依赖树的展开状态", () => {
  const tree = [
    { path: "Big", type: "dir" as const },
    ...Array.from({ length: 20_000 }, (_, i) => ({ path: `Big/f${i}.md`, type: "file" as const, mtimeMs: i })),
    { path: "Big/deep/needle.pdf", type: "file" as const, mtimeMs: 1 },
    { path: ".huhu/state.json", type: "file" as const },
  ];
  test("未展开的大目录里的文件仍然可被找到；内部目录不出现", () => {
    const c = buildCandidates(tree);
    expect(c.some((x) => x.path.startsWith(".huhu"))).toBe(false);
    expect(searchCandidates(c, "needle")[0]?.path).toBe("Big/deep/needle.pdf");
    expect(searchCandidates(c, "f19999")[0]?.path).toBe("Big/f19999.md");
  });
  test("隐藏规则不参与候选（hiddenPaths 只在树视图叠加）", () => {
    const c = buildCandidates([{ path: "Secret/a.md", type: "file" }]);
    expect(searchCandidates(c, "a.md").map((x) => x.path)).toEqual(["Secret/a.md"]);
  });
});

describe("A09 计数", () => {
  test("文件与目录分开；有隐藏时“可见 / 总数”", () => {
    const loaded = new Map([
      ["", L([["A", "dir"], ["B", "dir"], ["x.md", "file"], ["y.json", "file"]])],
      ["A", L([["A/1.md", "file"]])],
      ["B", L([])],
    ]);
    const s = summarizeCounts(loaded, ["A"]);
    expect(s).toMatchObject({ visibleFiles: 2, totalFiles: 3, visibleDirs: 1, totalDirs: 2, hidden: 2, complete: true });
    expect(formatCounts(s)).toEqual({ files: "2 / 3", dirs: "1 / 2", note: null });
  });
  test("无隐藏时只显示数量；分页未完成或有目录未展开 → 标“已加载”，不冒充总数", () => {
    const partial = summarizeCounts(new Map([["", L([["A", "dir"], ["x.md", "file"]], true)]]), []);
    expect(partial.complete).toBe(false);
    expect(formatCounts(partial)).toEqual({ files: "1", dirs: "1", note: "已加载，未完整统计" });
    const unexpanded = summarizeCounts(new Map([["", L([["A", "dir"]])]]), []);
    expect(unexpanded.complete).toBe(false);
  });
  test("档案是真实目录，只计一次（投影不重复计数）", () => {
    const s = summarizeCounts(new Map([["", L([["Archives", "dir"]])], ["Archives", L([["Archives/X", "dir"]])], ["Archives/X", L([["Archives/X/index.md", "file"]])]]), []);
    expect(s).toMatchObject({ totalDirs: 2, totalFiles: 1, complete: true });
  });
});
