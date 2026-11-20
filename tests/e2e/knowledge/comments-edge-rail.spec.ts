import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";

async function addComment(page: Page, editor: Locator, quote: string, body: string): Promise<void> {
  const passage = editor.getByText(quote, { exact: true });
  await passage.click();
  await passage.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(quote);
  await page.getByTestId("comment-bubble-button").click();
  const input = page.getByTestId("comment-composer").getByRole("textbox");
  await input.fill(body);
  await input.press("Enter");
  await expect(editor.getByText(quote, { exact: true })).toHaveAttribute("data-comment-thread", /.+/);
}

test("D02：两条边缘按钮定位对应正文，可鼠标和键盘打开，窄窗详情开关时仍可点击", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    const resize = (width: number) => app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(size, 900), width);
    await resize(1500);
    const filename = "edge-rail.md";
    writeFileSync(path.join(vault, filename), "# 评论边缘按钮\n\n第一处选区。\n\n无评论内容。\n\n第二处选区。\n");
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, filename).click();
    const editor = page.getByTestId("markdown-editor").locator(".ProseMirror:visible").first();
    const firstQuote = "第一处选区。";
    const secondQuote = "第二处选区。";
    await addComment(page, editor, firstQuote, "First comment");
    await addComment(page, editor, secondQuote, "Second comment");

    const markers = page.getByRole("button", { name: /^(打开评论|关闭评论)$/ });
    await expect(markers).toHaveCount(2);
    const toolbar = page.getByTestId("note-toolbar");
    const toggle = toolbar.getByRole("button", { name: "文档详情" });
    const inspector = page.getByTestId("note-inspector");
    const markerFor = async (quote: string) => {
      const id = await editor.getByText(quote, { exact: true }).getAttribute("data-comment-thread");
      return markers.and(page.locator(`[data-comment-thread=${JSON.stringify(id)}]`));
    };
    const first = await markerFor(firstQuote);
    const second = await markerFor(secondQuote);
    await resize(1100);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1100);
    for (const open of [true, false]) {
      const isOpen = (await inspector.count()) > 0;
      if (isOpen !== open) await toggle.click();
      await expect(inspector).toHaveCount(open ? 1 : 0);
      for (const [marker, quote] of [
        [first, firstQuote],
        [second, secondQuote],
      ] as const) {
        await marker.click({ trial: true });
        const markerBox = (await marker.boundingBox())!;
        const quoteBox = (await editor.getByText(quote, { exact: true }).boundingBox())!;
        const toolbarBox = (await toolbar.boundingBox())!;
        expect(markerBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height - 1);
        expect(Math.abs(markerBox.y + markerBox.height / 2 - quoteBox.y)).toBeLessThan(24);
        expect(markerBox.x + markerBox.width <= quoteBox.x || markerBox.x >= quoteBox.x + quoteBox.width).toBe(true);
      }
      const firstBox = (await first.boundingBox())!;
      const secondBox = (await second.boundingBox())!;
      expect(firstBox.y + firstBox.height).toBeLessThanOrEqual(secondBox.y);
      await page.screenshot({ path: test.info().outputPath(open ? "detail-open.png" : "detail-closed.png") });
    }
    await first.click();
    await expect(inspector.getByRole("tab", { name: "批注" })).toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveAccessibleName("关闭评论");
    await expect(inspector.getByTestId("comment-thread").filter({ hasText: "First comment" })).toBeVisible();
    await first.focus();
    await page.keyboard.press("Tab");
    await expect(second).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(second).toHaveAccessibleName("关闭评论");
    await expect(first).toHaveAccessibleName("打开评论");
    await expect(inspector.getByTestId("comment-thread").filter({ hasText: "Second comment" })).toBeVisible();
    await inspector.getByRole("tab", { name: "属性" }).click();
    await expect(second).toHaveAccessibleName("打开评论");
    await second.click();
    await expect(second).toHaveAccessibleName("关闭评论");
    await expect(inspector.getByRole("tab", { name: "批注" })).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByTestId("comment-thread").filter({ hasText: "Second comment" })).toBeVisible();
  } finally {
    await close();
  }
});
