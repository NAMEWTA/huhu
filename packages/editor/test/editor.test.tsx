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
      return <MarkdownEditor value={val} onChange={setVal} ariaLabel="正文" />;
    }
    const { container, rerender } = render(<Host v="# 你好" />);
    expect(container.querySelector(".cm-content")?.textContent).toContain("你好");
    expect(container.querySelector(".cm-content")?.getAttribute("aria-label")).toBe("正文");
    rerender(<Host v="# 你好" />);
  });
  test("value 属性变化会替换文档且不触发 onChange 回环", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<MarkdownEditor value="A" onChange={onChange} ariaLabel="x" />);
    rerender(<MarkdownEditor value="B" onChange={onChange} ariaLabel="x" />);
    expect(container.querySelector(".cm-content")?.textContent).toBe("B");
  });
});
