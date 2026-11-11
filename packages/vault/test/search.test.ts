import { describe, expect, test } from "vitest";
import { SearchIndex, parseTags, parseWikiLinks, tokenize } from "../src/index.js";

describe("双链与标签", () => {
  test("解析三种形式，跳过代码", () => {
    const md = "见 [[笔记A]] 和 [[笔记B|别名]]、[[笔记C#小节]]。\n`[[行内]]`\n```\n[[围栏]]\n```\n";
    expect(parseWikiLinks(md)).toEqual([
      { target: "笔记A", alias: null, heading: null },
      { target: "笔记B", alias: "别名", heading: null },
      { target: "笔记C", alias: null, heading: "小节" },
    ]);
  });
  test("标签", () => {
    expect(parseTags("# 标题\n正文 #工作 #a/b 123 #2026\n`#code`")).toEqual(["工作", "a/b"]);
  });
});

describe("分词", () => {
  test("中文二元切分，英文小写", () => {
    expect(tokenize("知识库 Search")).toEqual(["知识", "识库", "search"]);
    expect(tokenize("a")).toEqual(["a"]);
  });
});

describe("全文检索", () => {
  function build() {
    const ix = new SearchIndex();
    ix.upsert({ path: "n/研究摘要.md", kind: "note", title: "研究摘要", body: "整理本周的研究进展与实验结果", tags: "工作" });
    ix.upsert({ path: "n/readme.md", kind: "note", title: "Readme", body: "Hello world project overview", tags: "" });
    ix.upsert({ path: "Tasks/整理--task-1.md", kind: "task", title: "整理文档", body: "", tags: "" });
    return ix;
  }
  test("中文：子串能命中", () => {
    const hits = build().query("研究进展");
    expect(hits[0]?.path).toBe("n/研究摘要.md");
  });
  test("英文与 kind 过滤", () => {
    const ix = build();
    expect(ix.query("hello")[0]?.path).toBe("n/readme.md");
    expect(ix.query("整理", { kind: "task" }).map((h) => h.path)).toEqual(["Tasks/整理--task-1.md"]);
  });
  test("更新与删除", () => {
    const ix = build();
    ix.upsert({ path: "n/readme.md", kind: "note", title: "Readme", body: "完全不同的内容", tags: "" });
    expect(ix.query("hello")).toEqual([]);
    ix.removePath("n/readme.md");
    expect(ix.size).toBe(2);
    expect(ix.query("完全")).toEqual([]);
  });
  test("清空", () => {
    const ix = build();
    ix.clear();
    expect(ix.query("研究")).toEqual([]);
  });
});
