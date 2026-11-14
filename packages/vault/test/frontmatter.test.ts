import { describe, expect, test } from "vitest";
import { parseFrontmatter, patchFrontmatter, replaceBody, splitDocument } from "../src/semantic/frontmatter.js";

const SRC = `---
# 顶部注释
huhu:
  kind: task
  id: task-abc12345
  schema: 1
status: not_started   # 行尾注释
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
    expect(patchFrontmatter(SRC, { status: "not_started" })).toBe(SRC);
  });
  test("只改变化的键，保留注释/顺序/未知键/正文", () => {
    const out = patchFrontmatter(SRC, { status: "completed" });
    expect(out).toBe(SRC.replace("status: not_started   # 行尾注释", "status: completed # 行尾注释"));
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
    const out = patchFrontmatter(crlf, { status: "completed" });
    expect(out.startsWith("﻿---\r\n")).toBe(true);
    expect(out.includes("\n") && !/[^\r]\n/.test(out)).toBe(true);
    expect(out).toBe(crlf.replace("status: not_started   #", "status: completed #"));
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

describe("档案用的 frontmatter 辅助", () => {
  test("frontmatterScalarSources：取 YAML 原文，0123 不会变成 123", async () => {
    const { frontmatterScalarSources, parseFrontmatter } = await import("../src/semantic/frontmatter.js");
    const text = '---\n电话: 0123\n手机: "0456"\n生日: 1990-05-01\n列表: [1, 2]\n---\n正文\n';
    expect(parseFrontmatter(text).data["电话"]).toBe(123);
    expect(frontmatterScalarSources(text)).toEqual({ 电话: "0123", 手机: "0456", 生日: "1990-05-01" });
  });
  test("patchFrontmatter quoted：文本字段加双引号；renameFrontmatterKeys 保持位置与其他键", async () => {
    const { patchFrontmatter, renameFrontmatterKeys } = await import("../src/semantic/frontmatter.js");
    const out = patchFrontmatter("---\n电话: x\n---\n正文\n", { 电话: "0123", 手机: "5" }, { quoted: ["电话", "手机"] });
    expect(out).toContain('电话: "0123"');
    expect(out).toContain('手机: "5"');
    const renamed = renameFrontmatterKeys("---\na: 1 # 注释\n电话: '1'\nc: 3\n---\n正文\n", [{ from: "电话", to: "手机" }]);
    expect(renamed).toBe("---\na: 1 # 注释\n手机: '1'\nc: 3\n---\n正文\n");
    expect(() => renameFrontmatterKeys("---\na: 1\nb: 2\n---\n", [{ from: "a", to: "b" }])).toThrow(/已存在/);
    expect(() => renameFrontmatterKeys("---\na: [\n---\n", [{ from: "a", to: "b" }])).toThrow(/无法解析/);
  });
});
