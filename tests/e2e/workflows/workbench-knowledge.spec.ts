import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

async function openKnowledge(page: Page, filename: string) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  await treeSettled(page);
  await treeItem(page, filename).click();
  await expect(page.getByTestId("markdown-editor")).toBeVisible();
}

test("UX01：混合 Markdown 三种模式铺满知识库编辑区并保留焦点", async () => {
  const filename = "编辑排版.md";
  const markdown = "# 排版验收\n\n中文正文与选择范围。\n\n> 引用内容\n\n- 普通列表\n- [x] 已完成清单\n\n```text\n原始代码\n```\n\n![[进度记录]]\n\n末段。\n";
  const { app, page, vault, close } = await openApp({}, (root) => {
    writeFileSync(path.join(root, filename), markdown);
    writeFileSync(path.join(root, "进度记录.md"), "## 进度记录\n\n已整理 7 / 10。\n");
  });
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 960));
    await openKnowledge(page, filename);
    const editor = page.getByTestId("markdown-editor");
    const rich = editor.locator(".tiptap-editor-portal-content > .ProseMirror").first();
    await expect(rich.getByRole("heading", { name: "排版验收" })).toBeVisible();
    await rich.getByText("中文正文与选择范围。").click();
    await page.keyboard.press("Shift+End");
    await expect(rich).toBeFocused();
    await expect.poll(() => rich.evaluate((element) => {
      const pane = element.closest("[data-testid=markdown-editor]")!;
      return { outline: getComputedStyle(element).outlineStyle, fillsPane: element.getBoundingClientRect().width >= pane.getBoundingClientRect().width * 0.8 };
    })).toEqual({ outline: "none", fillsPane: true });
    await expect.poll(() => editor.evaluate((element) => getComputedStyle(element, "::before").borderBlockStartWidth)).toBe("2px");

    const toolbar = page.getByTestId("note-toolbar");
    await toolbar.getByRole("tab", { name: "源码" }).click();
    await expect(editor.locator(".cm-content")).toContainText("![[进度记录]]");
    await toolbar.getByRole("tab", { name: "阅读" }).click();
    const reading = page.getByTestId("notes-reading-pane");
    await expect(reading.getByRole("heading", { name: "排版验收" })).toBeVisible();
    await expect(reading.locator("blockquote")).toContainText("引用内容");
    await expect(reading.locator("pre")).toContainText("原始代码");
    await toolbar.getByRole("tab", { name: "实时预览" }).click();
    await expect(rich.getByText("末段。")).toBeVisible();
    expect(readFileSync(path.join(vault, filename), "utf8")).toBe(markdown);
  } finally {
    await close();
  }
});
