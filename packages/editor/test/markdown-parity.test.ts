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
});
