import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeMenu, treeSettled } from "../helpers/tree.js";

async function openComments(page: Page): Promise<void> {
  const inspector = page.getByTestId("note-inspector");
  if (!(await inspector.isVisible())) await page.getByRole("button", { name: "文档详情", exact: true }).click();
  await inspector.getByRole("tab", { name: "批注" }).click();
}

test("D01 / D06 属性评论取消不落盘，创建后重开、移动、回收站恢复均保留", async () => {
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "目标"));
    writeFileSync(path.join(vault, "目标", "占位.md"), "目标文件夹\n");
    const originalPath = path.join(vault, "带批注.md");
    const movedPath = path.join(vault, "目标", "带批注.md");
    writeFileSync(originalPath, "---\ntitle: 可批注\n---\n\n正文\n");
    const storage = path.join(vault, "Comments");
    const files = () => (existsSync(storage) ? readdirSync(storage) : []);
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    const row = page.locator('[data-testid="notes-resource-tree"] [data-item-path="带批注.md"]');
    const movedRow = page.locator('[data-testid="notes-resource-tree"] [data-item-path="目标/带批注.md"]');
    const showMoved = async () => {
      const parent = treeFolder(page, "目标");
      await expect(parent).toBeVisible();
      if ((await parent.getAttribute("aria-expanded")) === "false") await parent.click();
      await expect(movedRow).toBeVisible();
      await treeSettled(page);
      await movedRow.click();
    };
    await row.click();

    const trigger = page.getByTestId("property-comment-button").and(page.locator('[data-key="title"]'));
    const input = page.getByPlaceholder("添加评论", { exact: true });
    await trigger.click();
    await input.fill("应当取消");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(input).toHaveCount(0);
    expect(files()).toHaveLength(0);
    await trigger.click();
    await input.fill("保留属性批注");
    await input.press("Enter");
    await expect.poll(files).toHaveLength(1);
    const [id] = files();
    const stored = () => readFileSync(path.join(storage, id!), "utf8");
    expect(stored()).toContain("target: property");
    expect(stored()).toContain("保留属性批注");
    expect(stored()).not.toContain("应当取消");

    await page.getByRole("button", { name: "关闭 带批注", exact: true }).click();
    await row.click();
    await openComments(page);
    await expect(page.getByTestId("comment-thread")).toContainText("保留属性批注");

    await treeMenu(page, row, "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("目标");
    await page.getByRole("button", { name: "移动", exact: true }).click();
    await expect.poll(() => existsSync(movedPath)).toBe(true);
    expect(existsSync(originalPath)).toBe(false);
    await expect.poll(stored).toContain("documentPath: 目标/带批注.md");
    await showMoved();
    await openComments(page);
    await expect(page.getByTestId("comment-thread")).toContainText("保留属性批注");

    await treeMenu(page, movedRow, /^删除/);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /移到|删除/ })
      .first()
      .click();
    await expect.poll(() => existsSync(movedPath)).toBe(false);
    await page.getByTestId("notes-section-trash").click();
    await page.getByTestId("trash-list").getByRole("listitem").filter({ hasText: "目标/带批注.md" }).getByRole("button", { name: "恢复笔记", exact: true }).click();
    await expect.poll(() => existsSync(movedPath)).toBe(true);
    await page.getByTestId("notes-section-all").click();
    await showMoved();
    await openComments(page);
    await expect(page.getByTestId("comment-thread")).toContainText("保留属性批注");
    expect(files()).toEqual([id]);
    expect(stored()).toContain("documentPath: 目标/带批注.md");
  } finally {
    await close();
  }
});
