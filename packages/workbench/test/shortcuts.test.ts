import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SHORTCUTS, displayKeys } from "../src/shortcuts.js";

describe("快捷键登记表", () => {
  test("Mod 按平台显示：macOS 为 ⌘，其他为 Ctrl；没有重复的按键+范围", () => {
    expect(displayKeys("Mod+K", "darwin")).toBe("⌘+K");
    expect(displayKeys("Mod+K", "win32")).toBe("Ctrl+K");
    expect(displayKeys("Esc", "linux")).toBe("Esc");
    expect(new Set(SHORTCUTS.map((s) => `${s.keys}|${s.scope}`)).size).toBe(SHORTCUTS.length);
  });
  test("登记表里的快捷键确实在代码里实现了（命令面板的 Mod+K、编辑器的 Mod-s）", () => {
    const palette = readFileSync(new URL("../src/command-palette/CommandPalette.tsx", import.meta.url), "utf8");
    expect(palette).toMatch(/metaKey \|\| .*ctrlKey/);
    expect(palette).toMatch(/"k"/);
    const editor = readFileSync(new URL("../../editor/src/MarkdownEditor.tsx", import.meta.url), "utf8");
    expect(editor).toContain('"Mod-s"');
    expect(SHORTCUTS.map((s) => s.keys)).toEqual(expect.arrayContaining(["Mod+K", "Mod+S"]));
  });
});
