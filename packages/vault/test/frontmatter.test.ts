import { describe, expect, test } from "vitest";
import { parseFrontmatter, patchFrontmatter, replaceBody, splitDocument } from "../src/semantic/frontmatter.js";

const SRC = `---
# 顶部注释
huhu:
  kind: task
  id: task-abc12345
  schema: 1
completed: false   # 行尾注释
custom: { a: 1 }
due: 2026-11-12
---
# 正文

内容 [[链接]]
`;

describe("frontmatter", () => {
  test("解析", () => {
    const p = parseFrontmatter(SRC);
    expect(p.errors).toEqual([]);
    expect((p.data["huhu"] as { kind: string }).kind).toBe("task");
    expect(p.doc.body.startsWith("# 正文")).toBe(true);
  });
  test("无变化原样返回", () => {
    expect(patchFrontmatter(SRC, { completed: false })).toBe(SRC);
  });
  test("只改变化的键，保留注释/顺序/未知键/正文", () => {
    const out = patchFrontmatter(SRC, { completed: true });
    expect(out).toBe(SRC.replace("completed: false   # 行尾注释", "completed: true # 行尾注释"));
  });
  test("新增与删除键", () => {
    const out = patchFrontmatter(SRC, { priority: "high", custom: undefined });
    const p = parseFrontmatter(out);
    expect(p.data["priority"]).toBe("high");
    expect("custom" in p.data).toBe(false);
    expect(out).toContain("# 顶部注释");
    expect(out.endsWith("内容 [[链接]]\n")).toBe(true);
  });
  test("CRLF 与 BOM 保留", () => {
    const crlf = "﻿" + SRC.replace(/\n/g, "\r\n");
    const out = patchFrontmatter(crlf, { completed: true });
    expect(out.startsWith("﻿---\r\n")).toBe(true);
    expect(out.includes("\n") && !/[^\r]\n/.test(out)).toBe(true);
    expect(out).toBe(crlf.replace("completed: false   #", "completed: true #"));
  });
  test("无 frontmatter 的文件加键", () => {
    const out = patchFrontmatter("# 标题\n", { a: 1 });
    expect(out).toBe("---\na: 1\n---\n# 标题\n");
  });
  test("坏 YAML 报错，不改文件", () => {
    const bad = "---\na: [1, 2\n---\nbody\n";
    expect(parseFrontmatter(bad).errors.length).toBeGreaterThan(0);
    expect(() => patchFrontmatter(bad, { a: 1 })).toThrow();
  });
  test("未闭合 frontmatter 视为正文", () => {
    expect(splitDocument("---\na: 1\n").yaml).toBeNull();
  });
  test("替换正文保留 frontmatter 字节", () => {
    expect(replaceBody(SRC, "新正文\n")).toBe(SRC.slice(0, SRC.indexOf("# 正文")) + "新正文\n");
  });
});
