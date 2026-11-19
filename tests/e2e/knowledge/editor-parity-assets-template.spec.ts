import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeItem, treeMenu, treeSettled } from "../helpers/tree.js";

async function openKnowledge(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await treeSettled(page);
}

test("B01：在正文就地操作附件、图片和双链，支持键盘菜单", async () => {
  const { app, page, vault, close } = await openApp();
  try {
    mkdirSync(path.join(vault, "附件"));
    writeFileSync(path.join(vault, "附件", "样本.txt"), "样本文本");
    writeFileSync(path.join(vault, "附件", "像素.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    writeFileSync(path.join(vault, "双链目标.md"), "# 双链目标\n");
    writeFileSync(path.join(vault, "正文.md"), '# 正文\n\n[[双链目标]]\n\n<File src="/附件/样本.txt" name="样本附件" />\n\n![像素](/附件/像素.png)\n');
    await openKnowledge(page);
    await treeItem(page, "正文.md").click();
    const rich = page.getByTestId("markdown-editor").locator(".ProseMirror");
    const attachment = rich.getByRole("link", { name: "样本附件" });
    const wiki = rich.locator("[data-wiki-link]").filter({ hasText: "双链目标" });
    const image = rich.getByTestId("image-slot");
    const menu = page.getByRole("menu", { name: /资源操作/ });

    await attachment.click({ button: "right" });
    await expect(menu).toHaveAccessibleName("资源操作：附件/样本.txt");
    await menu.getByRole("menuitem", { name: "复制相对路径" }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe("附件/样本.txt");

    await image.click({ button: "right" });
    await expect(menu).toHaveAccessibleName("资源操作：附件/像素.png");
    await menu.getByRole("menuitem", { name: "在文件树中显示" }).click();
    await expect(treeItem(page, "像素.png")).toBeVisible();
    await expect(treeItem(page, "像素.png")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("document-tabs").getByRole("button", { name: "正文", exact: true })).toHaveAttribute("aria-current", "true");

    await wiki.focus();
    await page.keyboard.press("Shift+F10");
    await expect(menu).toHaveAccessibleName("资源操作：双链目标.md");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(wiki).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await menu.getByRole("menuitem", { name: "打开" }).click();
    await expect(rich.getByRole("heading", { name: "双链目标" })).toBeVisible({ timeout: 15_000 });
  } finally {
    await close();
  }
});

test("把 Vault 笔记导入为本地模板，保存后关闭和重开", async () => {
  const { page, vault, close } = await openApp();
  const initial = "---\ntitle: 本地样板\n---\n\n# 模板正文\n\n**保留粗体**\n";
  const source = path.join(vault, "样板.md");
  const destination = path.join(vault, "模板", "样板.md");
  try {
    writeFileSync(source, initial);
    await openKnowledge(page);
    await treeMenu(page, treeItem(page, "样板.md"), "作为模板导入");
    await expect
      .poll(() => {
        try {
          return readFileSync(destination, "utf8");
        } catch {
          return null;
        }
      })
      .toBe(initial);
    expect(readFileSync(source, "utf8")).toBe(initial);
    await treeSettled(page);
    await treeFolder(page, "模板").click();
    const imported = page.locator('[data-testid="notes-resource-tree"] [data-item-path="模板/样板.md"]');
    await imported.click();
    const rich = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(rich.getByRole("heading", { name: "模板正文" })).toBeVisible({ timeout: 15_000 });
    await expect(rich.locator("strong")).toHaveText("保留粗体");
    await rich.getByRole("heading", { name: "模板正文" }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("已保存");
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => readFileSync(destination, "utf8")).toContain("# 模板正文已保存");
    const closeTab = page.getByRole("button", { name: "关闭 样板", exact: true });
    await closeTab.click();
    await expect(closeTab).toHaveCount(0);
    await imported.click();
    await expect(rich.getByRole("heading", { name: "模板正文已保存" })).toBeVisible({ timeout: 15_000 });
    expect(readFileSync(source, "utf8")).toBe(initial);
  } finally {
    await close();
  }
});
