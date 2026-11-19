import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";

test("Mod+K：富文本选区与链接内光标编辑 URL，编辑器外和源码打开命令面板", async () => {
  const { page, vault, close } = await openApp();
  try {
    const filename = "link-shortcut.md";
    const note = path.join(vault, filename);
    writeFileSync(note, "# Link shortcut\n\nSelect this phrase\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, filename).click();
    const editor = page.getByTestId("markdown-editor");
    const text = editor.locator(".ProseMirror:visible").getByText("Select this phrase", { exact: true });
    const shortcut = process.platform === "darwin" ? "Meta+k" : "Control+k";
    const input = page.getByRole("combobox", { name: "链接 URL" });
    const palette = page.getByRole("dialog", { name: "命令面板" });
    await text.click();
    await text.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("Select this phrase");
    await expect(page.getByTestId("bubble-menu-bar").getByRole("button", { name: "插入链接" })).toBeVisible();
    await page.keyboard.press(shortcut);
    await expect(input).toBeFocused();
    await expect(palette).toBeHidden();
    await input.fill("https://example.com/first");
    await input.press("Enter");
    await expect.poll(() => readFileSync(note, "utf8")).toContain("[Select this phrase](https://example.com/first)");

    await text.click();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
    await page.keyboard.press(shortcut);
    await expect(input).toBeFocused();
    await input.fill("https://example.com/second");
    await input.press("Enter");
    const finished = "[Select this phrase](https://example.com/second)";
    await expect.poll(() => readFileSync(note, "utf8")).toContain(finished);

    const toolbar = page.getByTestId("note-toolbar");
    await toolbar.getByRole("button", { name: "文档详情" }).focus();
    await page.keyboard.press(shortcut);
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();

    await toolbar.getByRole("tab", { name: "源码" }).click();
    const source = editor.locator(".cm-content[contenteditable]");
    await expect(source).toContainText(finished);
    await source.click();
    await source.press(shortcut);
    await expect(palette).toBeVisible();
    await expect(input).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(source).toContainText(finished);
    expect(readFileSync(note, "utf8")).toContain(finished);

    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-shortcuts").click();
    const shortcutRow = page.getByTestId("shortcut-row").filter({ hasText: "富文本内编辑链接" });
    await expect(shortcutRow).toContainText("命令面板");
    await expect(shortcutRow.locator("kbd")).toHaveText(process.platform === "darwin" ? "⌘+K" : "Ctrl+K");
  } finally {
    await close();
  }
});
