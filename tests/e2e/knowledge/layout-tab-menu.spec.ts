import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeItem, treeSettled } from "../helpers/tree.js";

test("B01：标签页就地右键、键盘菜单、复制和定位、关闭前落盘", async () => {
  const { app, page, vault, close } = await openApp();
  const dirtyPath = path.join(vault, "编辑中.md");
  const original = "# 原文\n\n保留这行\n";
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 700));
    writeFileSync(path.join(vault, "左边.md"), "# 左边\n");
    writeFileSync(dirtyPath, original);
    mkdirSync(path.join(vault, "目录"));
    writeFileSync(path.join(vault, "目录/右边.md"), "# 右边\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
    const rail = page.locator('[data-region="rail"]');
    await rail.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByTestId("settings-nav-editor").click();
    const autosave = page.getByRole("switch", { name: "自动保存" });
    await autosave.click();
    await expect(autosave).not.toBeChecked();
    await rail.getByRole("button", { name: "知识库", exact: true }).click();
    await treeSettled(page);
    await treeItem(page, "左边.md").click();
    await treeItem(page, "编辑中.md").click();
    await treeFolder(page, "目录").click();
    await treeItem(page, "目录/右边.md").click();
    const tab = (label: string) => page.getByTestId("document-tab").filter({ hasText: label });
    const menu = page.getByRole("menu", { name: "标签页操作" });

    await tab("右边").click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "关闭右侧" })).toBeDisabled();
    const bounds = await menu.boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await menu.getByRole("menuitem", { name: "复制路径" }).click();
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("目录/右边.md");

    await tab("右边").press("Shift+F10");
    await expect(menu.getByRole("menuitem", { name: "关闭", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "在文件树中显示" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tab("右边")).toBeFocused();
    await tab("右边").press("ContextMenu");
    await menu.getByRole("menuitem", { name: "在文件树中显示" }).click();
    await expect(treeItem(page, "目录/右边.md")).toBeFocused();

    await tab("编辑中").click();
    const prose = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(prose).toContainText("保留这行");
    await prose.focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("批量关闭前的草稿");
    await expect(prose).toContainText("批量关闭前的草稿");
    expect(readFileSync(dirtyPath, "utf8")).toBe(original);
    // 右键指向左边标签，同时关闭右侧正在编辑的标签。
    await tab("左边").click({ button: "right" });
    await menu.getByRole("menuitem", { name: "关闭右侧" }).click();
    await expect(page.getByTestId("document-tab")).toHaveCount(1);
    expect(readFileSync(dirtyPath, "utf8")).toContain("批量关闭前的草稿");
    await treeItem(page, "编辑中.md").click();
    await expect(prose).toContainText("批量关闭前的草稿");
    await tab("编辑中").click({ button: "right" });
    await menu.getByRole("menuitem", { name: "关闭其他" }).click();
    await expect(page.getByTestId("document-tab")).toHaveCount(1);
    await expect(tab("编辑中")).toBeVisible();
    await tab("编辑中").press("Shift+F10");
    await menu.getByRole("menuitem", { name: "关闭", exact: true }).click();
    await expect(page.getByTestId("document-tab")).toHaveCount(0);
  } finally {
    await close();
  }
});
