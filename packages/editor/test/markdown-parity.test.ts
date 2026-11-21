import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { sharedExtensions } from "../src/vendor/open-knowledge/core/src/extensions/shared";
import { HTML_MAX_BYTES, HtmlPayloadTooLargeError, htmlToMdast, mdastToMarkdown } from "../src/vendor/open-knowledge/core/src/markdown/html-to-mdast";
import { MarkdownManager } from "../src/vendor/open-knowledge/core/src/markdown";

const markdown = new MarkdownManager({ extensions: sharedExtensions });

describe("Markdown 保真", () => {
  test("parseToMdast 返回正文块，parseToEditorMdast 补出可编辑空行", () => {
    const source = "first\n\n\n\nsecond\n";
    expect(markdown.parseToMdast(source).children.map((node) => node.type)).toEqual(["paragraph", "paragraph"]);
    expect(markdown.parseToEditorMdast(source).children.length).toBeGreaterThan(2);
    const document = markdown.parse(source);
    expect(markdown.parseWithFallback(source)).toEqual(document);
    expect(markdown.serialize(document)).toBe(source);
  });

  test("文档边界保留 BOM、前置空行和尾随空行", () => {
    const source = "\uFEFF\n\n# 标题\n\n\n";
    const document = markdown.parse(source);
    expect(document.attrs?.["sourceDocBoundary"]).toMatchObject({ bom: true });
    expect(markdown.serialize(document)).toBe(source);
  });

  test("行内百分号评论和独立 HTML 评论各自使用专用节点再还原", () => {
    const source = "正文 %%行内注释%% 继续\n\n<!-- 独立注释 -->\n";
    const document = markdown.parse(source);
    expect(document.content?.[0]?.content?.find((node) => node.text === "行内注释")?.marks).toContainEqual(expect.objectContaining({ type: "comment" }));
    expect(document.content?.[1]?.type).toBe("commentBlock");
    expect(markdown.serialize(document)).toBe(source);
  });

  test("HTML 块节点序列化保留原始标记", () => {
    const content = "<!DOCTYPE html>";
    expect(markdown.serialize({ type: "doc", content: [{ type: "htmlBlock", attrs: { content } }] })).toBe(`${content}\n`);
  });

  test("HTML 粘贴转换保留下划线形式与加粗，拒绝超过 5 MiB 的 ASCII 输入", () => {
    const html = '<p class="gmail_quote"><strong>粗体</strong> <ins>下划线</ins></p>';
    expect(mdastToMarkdown(htmlToMdast(html))).toBe("**粗体** <ins>下划线</ins>\n");
    expect(() => htmlToMdast("a".repeat(HTML_MAX_BYTES + 1))).toThrow(HtmlPayloadTooLargeError);
  });

  test("HTML 粘贴限制按 UTF-8 字节接受边界值并拒绝多字节超限", () => {
    expect(mdastToMarkdown(htmlToMdast("界界", { maxBytes: 6 }))).toBe("界界\n");
    expect(() => htmlToMdast("界界界", { maxBytes: 8 })).toThrow(HtmlPayloadTooLargeError);
  });
});

describe("B01 Markdown 解析与序列化", () => {
  test.each([
    ["GFM 表格", "| a | b |\n| --- | --- |\n| c | d |\n", "table"],
    ["双链", "[[目标|别名]]\n", "wikiLink"],
    ["反斜杠换行", "第一行\\\n第二行\n", "hardBreak"],
    ["围栏代码块", "~~~ts\nlet x = 1;\n~~~\n", "codeBlock"],
    ["引用块", "> 引用正文\n", "blockquote"],
    ["有序列表", "4. 第四项\n5. 第五项\n", "list"],
    ["分隔线", "* * *\n", "thematicBreak"],
    ["图片引用", "![说明][img]\n\n[img]: ./图.png\n", "imageReference"],
    ["链接定义", '[标签][ref]\n\n[ref]: <./带 空格.md> "标题"\n', "linkRefDef"],
    ["行内公式", "$x^2$\n", "mathInline"],
    ["行内 HTML 换行", "第一行<br />第二行\n", "hardBreak"],
    ["缩进代码", "    indent\n", "codeBlock"],
    ["Mermaid", "```mermaid\ngraph TD\nA-->B\n```\n", "jsxComponent"],
    ["行内代码", "``a ` b``\n", "code"],
    ["标题", "## 标题\n", "heading"],
    ["强调", "_斜_ **粗** ~~删~~\n", "emphasis"],
    ["图片", "段内 ![说明](<./带 空格.png>)\n", "image"],
  ])("%s 生成指定节点或标记并保留源形式", (_name, source, type) => {
    const document = markdown.parse(source);
    const nodes: string[] = [];
    markdown.schema.nodeFromJSON(document).descendants((node) => {
      nodes.push(node.type.name, ...node.marks.map((mark) => mark.type.name));
    });
    expect(nodes).toContain(type);
    expect(markdown.serialize(document)).toBe(source);
  });

  test("解析失败时只把出错的块交给原始 MDX 节点，保留前后相邻 Markdown", () => {
    const broken = "text </Bar> more";
    const source = ["# before", broken, "**after**", ""].join("\n\n");
    const content = markdown.parseWithFallback(source).content ?? [];
    expect(content[0]).toMatchObject({ type: "heading", content: [{ text: "before" }] });
    const fallback = content.find((node) => node.type === "rawMdxFallback");
    expect(fallback).toBeDefined();
    expect(markdown.serialize({ type: "doc", content: [fallback!] })).toContain(broken);
    expect(content).toContainEqual(expect.objectContaining({ type: "paragraph", content: [{ type: "text", text: "after", marks: [expect.objectContaining({ type: "strong" })] }] }));
  });

  test("保留链接角括号、实体与行内反斜杠，回读链接目标和文本一致", () => {
    const source = "[目的地](<./名字 (副本).md>) &amp; \\*\n";
    const doc = markdown.parse(source);
    const text = doc.content?.[0]?.content ?? [];
    expect(text[0]).toMatchObject({ text: "目的地", marks: [expect.objectContaining({ type: "link", attrs: expect.objectContaining({ href: "./名字 (副本).md" }) })] });
    expect(text.map((node) => node.text).join("")).toBe("目的地 &amp; *");
    expect(markdown.serialize(doc)).toBe(source);
  });
});

test.each([
  ["apple-notes-sample.html", /\*\*Grocery list\*\*/],
  ["gdocs-sample.html", /^## .+/m],
  ["github-comment-sample.html", /\[#42\]\(https:\/\/github\.com\/owner\/repo\/issues\/42\)/],
  ["gmail-sample.html", /Hi team,\n{2,}Here's the summary[\s\S]*^> On Tue,/m],
  ["gsheets-sample.html", /^\|.+\|\n\|[ :|-]+\|/m],
  ["notion-sample.html", /an intentional(?: {2}|\\)\nmulti-line break chain/],
  ["slack-sample.html", /^Hey team — can we ship the clipboard feature this week\? @ada thoughts\?\n$/],
  ["vscode-sample.html", /^```\n[\s\S]+\n```$/m],
  ["word-sample.html", /^#.+/m],
])("B01 转换固定剪贴板样本 %s 保留正文结构", (fixture, expected) => {
  const file = new URL(`../src/vendor/open-knowledge/core/src/markdown/rehype-plugins/fixtures/${fixture}`, import.meta.url);
  const converted = mdastToMarkdown(htmlToMdast(readFileSync(file, "utf8")));
  expect(converted).toMatch(expected);
});
