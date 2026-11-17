import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

// S3 / B03–B05：OK 的 `/` 命令菜单、气泡菜单、块插入与撤销在 Huhu 里可用（真实 Electron）。
// 逐项对照见 evidence/parity-matrix.md；这里只覆盖用户路径上最常用的一组。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
}

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

test("S3：`/` 菜单过滤并插入块；气泡菜单加粗；一次撤销撤回一个命令", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "菜单.md");
    writeFileSync(file, "# 菜单\n\n起始段落\n");
    await gotoNotes(page);
    await page.getByTestId("note-item").filter({ hasText: "菜单.md" }).click();
    await expect(prose(page)).toContainText("起始段落", { timeout: 30_000 });

    // `/`：菜单出现，列出分类与选项；过滤；Esc 关闭
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    const listbox = page.locator('[role="listbox"]').first();
    await expect(listbox).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('[role="option"]').count()).toBeGreaterThan(5);
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();

    // 过滤 + Enter 插入：选“无序列表”（或匹配项），随后正文里出现列表
    await page.keyboard.type("/bullet");
    await expect(listbox).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type("条目甲");
    await expect(prose(page).locator("ul li").first()).toContainText("条目甲");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    expect(readFileSync(file, "utf8")).toMatch(/[-*] 条目甲/);

    // 气泡菜单：选中文字后出现，点加粗
    await prose(page).getByText("起始段落").dblclick();
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
