// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useState } from "react";
import { MarkdownEditor } from "../src/index.js";

afterEach(cleanup);

describe("MarkdownEditor", () => {
  test("挂载显示内容；外部 value 变化同步到文档", () => {
    function Host({ v }: { v: string }) {
      const [val, setVal] = useState(v);
      return <MarkdownEditor documentId="a" mode="source" value={val} onChange={setVal} ariaLabel="正文" />;
    }
    const { container, rerender } = render(<Host v="# 你好" />);
    expect(container.querySelector(".cm-content")?.textContent).toContain("你好");
    expect(container.querySelector(".cm-content")?.getAttribute("aria-label")).toBe("正文");
    rerender(<Host v="# 你好" />);
  });
  test("value 属性变化会替换文档且不触发 onChange 回环", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<MarkdownEditor documentId="a" mode="source" value="A" onChange={onChange} ariaLabel="x" />);
    rerender(<MarkdownEditor documentId="a" mode="source" value="B" onChange={onChange} ariaLabel="x" />);
    expect(container.querySelector(".cm-content")?.textContent).toBe("B");
  });
  test("外部同步只改变化的那一段、不进撤销栈、不回流 onChange", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<MarkdownEditor documentId="a" mode="source" value="第一行\n第二行" onChange={onChange} ariaLabel="x" />);
    rerender(<MarkdownEditor documentId="a" mode="source" value="第一行\n第二行已改" onChange={onChange} ariaLabel="x" />);
    expect(container.querySelector(".cm-content")?.textContent).toContain("第二行已改");
    expect(onChange).not.toHaveBeenCalled();
  });
  test("切换 documentId 换成另一篇文档的内容", () => {
    const { container, rerender } = render(<MarkdownEditor documentId="a" mode="source" value="甲" onChange={() => undefined} ariaLabel="x" />);
    rerender(<MarkdownEditor documentId="b" mode="source" value="乙" onChange={() => undefined} ariaLabel="x" />);
    expect(container.querySelector(".cm-content")?.textContent).toBe("乙");
  });
  test("三种可编辑模式都能挂载；阅读模式只读", () => {
    for (const mode of ["live", "source", "split", "preview"] as const) {
      const { container, unmount } = render(<MarkdownEditor documentId="a" mode={mode} value="# 标题\n\n| a | b |\n| - | - |\n| 1 | 2 |" onChange={() => undefined} ariaLabel="x" />);
      expect(container.querySelector(".huhu-markdown-editor")?.className).toContain(`mode-${mode}`);
      unmount();
    }
  });
});
