import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFileRows } from "../helpers/tree.js";

// S3 / F07：笔记顶部工具栏在不同窗口宽度、长中文标题下保持单行、不溢出；窄时先收起撤销 / 重做 / 导出，核心按钮仍可达。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
}

for (const width of [1440, 1100, 900]) {
  test(`S3：窗口 ${width}px，长中文标题下工具栏单行且不溢出`, async () => {
    const { app, page, vault, close } = await openApp();
    try {
      const name = "这是一个非常非常长的中文文件标题用来检验工具栏在窄宽度下的收纳行为与省略号显示效果";
      writeFileSync(path.join(vault, `${name}.md`), "---\ntitle: T\n---\n\n正文\n");
      await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 800), width);
      await gotoNotes(page);
      await treeFileRows(page).first().click();
      await expect(page.getByTestId("note-document")).toBeVisible({ timeout: 30_000 });
      const bar = page.getByTestId("note-toolbar");
      await expect(bar).toBeVisible();
      const box = await bar.boundingBox();
      expect(box?.height ?? 999).toBeLessThan(64); // 单行
      const overflow = await bar.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      // 核心操作始终可达
      await expect(page.getByRole("button", { name: "添加批注" }).first()).toBeVisible();
      await expect(page.getByRole("tab", { name: "实时预览" })).toBeVisible();
    } finally {
      await close();
    }
  });
}
