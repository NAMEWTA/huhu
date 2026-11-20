import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

test("OP-D18 紧凑任务描述保留文本命令和 @，隐藏文档级命令与批注", async () => {
  const { page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "Research"));
    writeFileSync(path.join(vault, "Research", "资料.md"), "# 资料\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 40_000 });
    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    await page.getByLabel("任务名称").fill("紧凑命令");
    const scope = page.getByTestId("task-body");
    const body = scope.locator(".ProseMirror");
    await body.click();
    await page.keyboard.type("/");
    await expect(page.locator('[data-slash-command="heading2"]')).toBeVisible();
    await expect(page.locator('[data-slash-command="component-File"], [data-slash-command^="embed-starter-"], [data-slash-command="footnote"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("参考 @Resea");
    await expect(page.getByTestId("editor-ref-menu")).toContainText("Research");
    await page.keyboard.press("Enter");
    await expect(body.locator("[data-wiki-link]")).toContainText("Research/");

    await page.keyboard.press("ControlOrMeta+a");
    await expect(page.getByTestId("bubble-menu-bar")).toBeVisible();
    await expect(page.getByTestId("comment-bubble-button")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+m");
    await expect(page.getByTestId("comment-composer")).toHaveCount(0);
    await expect(body).toBeFocused();
    await expect(scope.getByTestId("editor-properties")).toHaveCount(0);
    await page.getByTestId("task-save").click();
    await expect(page.getByTestId("detail-references")).toContainText("Research");
  } finally {
    await close();
  }
});
