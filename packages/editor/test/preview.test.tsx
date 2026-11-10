// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MarkdownPreview, parseWikiHref, stripFrontmatter } from "../src/index.js";

afterEach(cleanup);

describe("MarkdownPreview", () => {
  test("隐藏 frontmatter，渲染 GFM 表格与任务列表", () => {
    const { container } = render(<MarkdownPreview source={"---\ntitle: x\n---\n# 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] 完成\n"} />);
    expect(container.textContent).not.toContain("title: x");
    expect(container.querySelector("h1")?.textContent).toBe("标题");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("input[type=checkbox]")).not.toBeNull();
  });
  test("双链：可点击打开；不存在的链接标记并不触发；代码内不解析", () => {
    const open = vi.fn();
    render(<MarkdownPreview source={"见 [[笔记A#小节|别名]] 与 [[不存在]]，`[[代码]]`"} onOpenWikiLink={open} resolveWikiLink={(t) => t === "笔记A"} />);
    fireEvent.click(screen.getByText("别名"));
    expect(open).toHaveBeenCalledWith("笔记A", "小节");
    const missing = screen.getByText("不存在");
    expect(missing.className).toContain("missing");
    fireEvent.click(missing);
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByText("[[代码]]").tagName).toBe("CODE");
  });
  test("消毒：脚本与事件处理器被移除，javascript: 链接不可用", () => {
    const { container } = render(<MarkdownPreview source={'<script>window.__x=1</script><img src=x onerror="window.__y=1">\n\n[bad](javascript:alert(1))'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    const a = container.querySelector("a");
    expect(a?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    expect((window as unknown as Record<string, unknown>)["__x"]).toBeUndefined();
  });
  test("工具函数", () => {
    expect(stripFrontmatter("---\na: 1\n---\n正文")).toBe("正文");
    expect(stripFrontmatter("无 frontmatter")).toBe("无 frontmatter");
    expect(parseWikiHref("wikilink:%E7%AC%94#h")).toEqual({ target: "笔", heading: "h" });
    expect(parseWikiHref("https://x")).toBeNull();
  });
});
