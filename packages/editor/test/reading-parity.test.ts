import { expect, test } from "vitest";
import { readParagraphs, serializeParagraphSlice } from "../src/reading/paragraphs";
import { stripFrontmatter } from "../src/vendor/open-knowledge/core/src/extensions/frontmatter";
import { mdManager } from "../src/vendor/open-knowledge/server-bridge/md-manager";

const paragraphs = (lines: readonly string[]) => lines.map((text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] }));

test("ordinary paragraphs agree with OK for the 1200 combinations from the startup prototype", () => {
  const fragments = ["中文", "English", "Ελληνικά", "العربية", "שָׁלוֹם", "हिन्दी", "5", "１２３", "é", "e\u0301", "ไทย", "日本語", "ß", "안녕", "中文，标点。", "「原文」", "问？", "两  空格", "混合3ABC", "เอกสาร"];
  for (const first of fragments) {
    for (const last of fragments) {
      for (const separator of [" ", "，", "\n\n"]) {
        const source = first + separator + last;
        const projected = readParagraphs(source);
        expect(projected, source).not.toBeNull();
        expect(paragraphs(projected ?? []), source).toEqual(mdManager.parseWithFallback(stripFrontmatter(source).body).content);
      }
    }
  }
  expect(readParagraphs("第一段\r\n\r\n第二段")).toEqual(["第一段", "第二段"]);
});

test("empty, ambiguous and rich Markdown keep the original reader", () => {
  for (const source of [
    "",
    " ",
    "\t",
    "\uFEFF原始正文",
    " 有缩进",
    "尾随空格 ",
    "软换\n行",
    "第一段\n \n第二段",
    "第一段\n\n\n第二段",
    "**粗体**",
    "[链接](https://example.com)",
    "[[笔记]]",
    "- 列表",
    "1. 列表",
    "`代码`",
    "```js\ncode\n```",
    "# 标题",
    "> 引用",
    "---\ntitle: x\n---\n正文",
    "A | B\n--- | ---\n1 | 2",
    "<img src=x>",
    "![附件](image.png)",
    "未知 😀",
    "网址 example.com",
  ]) {
    expect(readParagraphs(source), source).toBeNull();
  }
});

test("selected unmarked paragraphs serialize to the same text/plain as OK", () => {
  for (const first of ["Alpha and  Beta", "记录 自然语言。", "العربية  نص", "１２３  12", "e\u0301 café"]) {
    for (const last of ["", "Second item", "第二段内容。"]) {
      for (let start = 0; start <= first.length; start++) {
        for (let end = last ? 0 : start + 1; end <= (last || first).length; end++) {
          const lines = last ? [first.slice(start), last.slice(0, end)] : [first.slice(start, end)];
          expect(serializeParagraphSlice(lines), JSON.stringify(lines)).toBe(mdManager.serialize({ type: "doc", content: paragraphs(lines) }));
        }
      }
    }
  }
});
