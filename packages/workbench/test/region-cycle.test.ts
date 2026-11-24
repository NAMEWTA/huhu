// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { handleRegionCycle, nextIndex } from "../src/shell/region-cycle.js";

describe("F6 区域循环", () => {
  test("向前循环并在末尾回到开头；Shift+F6 反向", () => {
    expect(nextIndex(4, 0, false)).toBe(1);
    expect(nextIndex(4, 3, false)).toBe(0);
    expect(nextIndex(4, 0, true)).toBe(3);
    expect(nextIndex(4, 2, true)).toBe(1);
  });
  test("焦点不在任何区域时：向前去第一个，反向去最后一个；没有区域返回 -1", () => {
    expect(nextIndex(3, -1, false)).toBe(0);
    expect(nextIndex(3, -1, true)).toBe(2);
    expect(nextIndex(0, -1, false)).toBe(-1);
  });

  test("模态层阻止 F6 和 Shift+F6 的浏览器默认导航", () => {
    const dialog = document.body.appendChild(document.createElement("dialog"));
    dialog.open = true;
    const input = dialog.appendChild(document.createElement("input"));
    input.focus();
    try {
      for (const shiftKey of [false, true]) {
        const event = new KeyboardEvent("keydown", { key: "F6", shiftKey, cancelable: true });
        handleRegionCycle(document, event);
        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(input);
      }
    } finally {
      dialog.remove();
    }
  });
});
