import { expect, test } from "vitest";
import { shortcutPasteError } from "../src/components/terminal-paste.js";

test.each([false, true])("快捷粘贴在分段粘贴模式 %s 下拒绝控制字符", (bracketed) => {
  for (const control of ["\u0007", "\u001b", "\u007f", "\u0085"]) {
    expect(shortcutPasteError(`输出${control}内容`, false, bracketed)).toBe("control-character");
    expect(shortcutPasteError(`输出${control}内容`, true, bracketed)).toBe("control-character");
  }
});

test("快捷粘贴保留 Unicode，制表符和换行按终端模式放行", () => {
  expect(shortcutPasteError("输出 🐚", false, false)).toBeUndefined();
  expect(shortcutPasteError("第一行\r\n第二行", false, false)).toBe("bracketed-paste-required");
  expect(shortcutPasteError("第一行\r\n第二行", true, false)).toBeUndefined();
  expect(shortcutPasteError("第一行\r\n第二行", false, true)).toBeUndefined();
  expect(shortcutPasteError("带\t缩进", false, true)).toBeUndefined();
  expect(shortcutPasteError("带\t缩进", false, false)).toBe("bracketed-paste-required");
  expect(shortcutPasteError("带\t缩进", true, false)).toBe("bracketed-paste-required");
});
