import { describe, expect, test } from "vitest";
import { nextIndex } from "../src/shell/region-cycle.js";

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
});
