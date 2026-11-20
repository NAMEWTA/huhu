import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// S3 / B03–B05：OK 的 `/` 命令菜单、气泡菜单、块插入与撤销在 Huhu 里可用（真实 Electron）。
// 逐项对照见 evidence/parity-matrix.md；这里只覆盖用户路径上最常用的一组。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page); // 树在文件事件合并后会重新列举；稳定后再点
}

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

test("S3：`/` 菜单过滤并插入块；气泡菜单加粗；一次撤销撤回一个命令", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "菜单.md");
    writeFileSync(file, "# 菜单\n\n起始段落\n");
    await gotoNotes(page);
    await treeItem(page, "菜单.md").click();
    await expect(prose(page)).toContainText("起始段落", { timeout: 30_000 });

    // `/`：菜单出现，列出分类与选项；过滤；Esc 关闭
    await prose(page).getByText("起始段落").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    const listbox = page.locator('[role="listbox"]').first();
    await expect(listbox).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('[role="option"]').count()).toBeGreaterThan(5);
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await page.keyboard.press("Backspace"); // 去掉留在文档里的 "/"，再重新触发

    // 过滤 + Enter 插入：选“无序列表”（或匹配项），随后正文里出现列表
    await page.keyboard.type("/无序");
    await expect(listbox).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(prose(page).locator("ul")).toHaveCount(1); // 菜单项已应用，再输入
    await page.keyboard.type("条目甲");
    await expect(prose(page).locator("ul li").first()).toContainText("条目甲");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    expect(readFileSync(file, "utf8")).toMatch(/[-*] 条目甲/);

    // 气泡菜单：选中文字后出现，点加粗
    await prose(page).getByText("起始段落").click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    const bubble = page.getByTestId("bubble-menu-bar");
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("ControlOrMeta+b");
    await expect(prose(page).locator("strong").first()).toContainText("起始段落");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    expect(readFileSync(file, "utf8")).toContain("**起始段落**");

    // 撤销：一次撤销回退加粗，列表仍在
    await page.keyboard.press("ControlOrMeta+z");
    await expect(prose(page).locator("strong")).toHaveCount(0);
    await expect(prose(page).locator("ul li").first()).toContainText("条目甲");
  } finally {
    await close();
  }
});

test("B05 富文本和源码按交错编辑顺序撤销和重做", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "交错撤销.md");
  const disk = () => readFileSync(file, "utf8");
  const switchTo = (name: string) => page.getByRole("tab", { name, exact: true }).click();
  const insertAtEnd = async (editable: Locator, text: string) => {
    await editable.focus();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");
    await page.keyboard.insertText(text);
    await expect.poll(disk).toContain(text);
  };

  try {
    writeFileSync(file, "基线\n");
    await gotoNotes(page);
    await treeItem(page, "交错撤销.md").click();
    const rich = prose(page);
    const source = page.getByTestId("markdown-editor").locator(".cm-content").first();
    await expect(rich).toHaveText("基线");
    await insertAtEnd(rich, "富甲");
    await switchTo("源码");
    await insertAtEnd(source, "源乙");
    await switchTo("实时预览");
    await insertAtEnd(rich, "富丙");

    await switchTo("源码");
    await source.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(source).toContainText("基线富甲源乙");
    await expect.poll(disk).not.toContain("富丙");
    await switchTo("实时预览");
    await rich.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(rich).toHaveText("基线富甲");
    await expect.poll(disk).not.toContain("源乙");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(rich).toHaveText("基线");

    for (const text of ["基线富甲", "基线富甲源乙", "基线富甲源乙富丙"]) {
      await page.keyboard.press("ControlOrMeta+Shift+z");
      await expect(rich).toHaveText(text);
      await expect.poll(() => disk().trimEnd()).toBe(text);
    }
  } finally {
    await close();
  }
});

test("B05 一次撤销 H2 斜杠命令，外部更新不会产生历史项", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "命令撤销.md");
  try {
    writeFileSync(file, "邻文甲\n\n原文\n\n邻文乙\n");
    await gotoNotes(page);
    await treeItem(page, "命令撤销.md").click();
    const rich = prose(page);
    await rich.getByText("原文", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" /h2");
    await expect(page.locator('[data-slash-command="heading2"]')).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(rich.locator("h2")).toHaveText("原文");
    await expect.poll(() => readFileSync(file, "utf8")).toContain("## 原文");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(rich.locator("h2")).toHaveCount(0);
    await expect(rich.locator(":scope > p")).toHaveText(["邻文甲", expect.stringContaining("原文"), "邻文乙"]);
    await expect.poll(() => readFileSync(file, "utf8")).not.toContain("## 原文");

    const undoDepth = () =>
      rich.evaluate((element) => {
        const root = element as HTMLElement & { editor?: { extensionManager: { extensions: { name: string; options: { yUndoOptions?: { undoManager: { undoStack: unknown[] } } } }[] } } };
        const collaboration = root.editor?.extensionManager.extensions.find(({ name }) => name === "collaboration");
        return collaboration?.options.yUndoOptions?.undoManager.undoStack.length;
      });
    const depth = await undoDepth();
    expect(depth).toBeGreaterThan(0);
    const external = "邻文甲\n\n外来正文\n\n邻文乙\n";
    writeFileSync(file, external);
    await expect(rich.getByText("外来正文", { exact: true })).toBeVisible();
    expect(await undoDepth()).toBe(depth);
    expect(readFileSync(file, "utf8")).toBe(external);
  } finally {
    await close();
  }
});

test("B03 斜杠合法前缀、键盘循环、滚动重定位及切文档清理", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "菜单边界.md");
    writeFileSync(file, Array.from({ length: 24 }, (_, index) => `第 ${index + 1} 段`).join("\n\n") + "\n");
    writeFileSync(path.join(vault, "另一位.md"), "切换目标\n");
    await gotoNotes(page);
    await treeItem(page, "另一位.md").click();
    await expect(prose(page)).toHaveText("切换目标");
    await treeItem(page, "菜单边界.md").click();
    const rich = prose(page);
    const row = rich.getByText("第 14 段", { exact: true });
    await row.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await row.click();
    await page.keyboard.press("End");
    const menu = page.getByRole("listbox", { name: /斜杠命令|Slash commands/ });
    await page.keyboard.type("/h2");
    await expect(menu).toBeHidden();
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText("　/");
    await expect(menu).toBeVisible();
    const options = menu.getByRole("option");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");

    const original = await menu.boundingBox();
    if (!original) throw new Error("菜单没有布局");
    const scroller = page.getByTestId("editor-scroll-container");
    await scroller.evaluate((element) => element.scrollBy(0, 70));
    await expect.poll(async () => Math.abs((await menu.boundingBox())!.y - original.y)).toBeGreaterThan(20);
    await expect(menu).toBeVisible();
    await expect(rich).toBeFocused();

    await treeItem(page, "另一位.md").click();
    await expect(prose(page)).toHaveText("切换目标");
    await expect(menu).toBeHidden();
    await expect.poll(() => readFileSync(file, "utf8")).toContain("第 14 段　/");
  } finally {
    await close();
  }
});

test("B04 Electron 组合输入的斜杠触发、Enter、字面上下文和表格菜单", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "组合菜单.md");
    writeFileSync(file, "开头\n\n`code`\n\nhttps://example.com/alpha\n\n| 表头 |\n| --- |\n| 单元格 |\n");
    await gotoNotes(page);
    await treeItem(page, "组合菜单.md").click();
    const rich = prose(page);
    const cdp = await page.context().newCDPSession(page);
    const menu = page.getByRole("listbox", { name: /斜杠命令|Slash commands/ });
    await rich.getByText("开头", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    for (const trigger of ["/", "／"]) {
      await cdp.send("Input.imeSetComposition", { text: `${trigger}h2`, selectionStart: 3, selectionEnd: 3 });
      await expect(rich).toContainText(`${trigger}h2`);
      await expect(menu).toBeHidden();
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229 });
      await expect(rich.locator("h2")).toHaveCount(0);
      await cdp.send("Input.insertText", { text: `${trigger}h2` });
      await expect(menu.locator('[data-slash-command="heading2"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Shift+Home");
      await page.keyboard.press("Backspace");
    }

    await rich.locator("code").getByText("code", { exact: true }).click();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.insertText("/h2");
    await expect(menu).toBeHidden();
    await rich.getByText("https://example.com/alpha", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("/h2");
    await expect(menu).toBeHidden();
    await expect(rich).toContainText("https://example.com/alpha/h2");

    await rich.getByRole("cell", { name: "单元格", exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" /");
    await expect(menu.locator('[data-slash-command="heading2"]')).toBeVisible();
    await expect(menu.locator('[data-slash-command="component-File"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(rich).toBeFocused();
    await expect.poll(() => readFileSync(file, "utf8")).toContain("单元格 /");
  } finally {
    await close();
  }
});
