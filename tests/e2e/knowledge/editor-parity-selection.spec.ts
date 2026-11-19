import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

test("B06：格式化后立即点击另一段并输入斜杠，保留两个原段落", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "快速选区.md");
  try {
    writeFileSync(file, "起始\n\n选中格式\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeSettled(page);
    await treeItem(page, "快速选区.md").click();
    const rich = page.getByTestId("markdown-editor").locator(".ProseMirror");
    const first = rich.getByText("起始", { exact: true });
    const last = rich.getByText("选中格式", { exact: true });
    const destination = await first.boundingBox();
    if (!destination) throw new Error("第一段尚未渲染");
    await last.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("选中格式");

    await page.keyboard.press("ControlOrMeta+u");
    await page.mouse.click(destination.x + destination.width / 2, destination.y + destination.height / 2);
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/embed");

    const list = page.getByRole("listbox", { name: /斜杠命令|Slash commands/ });
    const paragraphs = rich.locator(":scope > p");
    await expect(paragraphs).toHaveText(["起始", "/embed", "选中格式"]);
    await expect(rich.locator("u")).toHaveText("选中格式");
    await expect
      .poll(() =>
        paragraphs.nth(1).evaluate((paragraph) => {
          const selection = window.getSelection();
          return selection?.isCollapsed && paragraph.contains(selection.anchorNode);
        }),
      )
      .toBe(true);
    await list.getByRole("option", { name: "嵌入", exact: true }).click();
    await expect(rich.locator('[data-component-name="Embed"]')).toHaveCount(1);
    await expect.poll(() => readFileSync(file, "utf8")).toMatch(/^起始\n\n<Embed[^>]*\/>\n\n<u>选中格式<\/u>\n$/);
  } finally {
    await close();
  }
});
