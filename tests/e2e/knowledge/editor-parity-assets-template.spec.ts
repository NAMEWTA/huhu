import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

test("从导入的本地模板新建笔记，保存重开后模板字节不变", async () => {
  test.setTimeout(90_000);
  const { page, vault, close } = await openApp();
  const initial = "---\ntitle: 本地样板\n---\n\n# 模板正文\n\n**保留粗体**\n";
  const source = path.join(vault, "样板.md");
  const destination = path.join(vault, "模板", "样板.md");
  const readIfPresent = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);
  try {
    mkdirSync(path.join(vault, "目标文件夹"));
    writeFileSync(source, initial);
    await openKnowledge(page);
    await treeMenu(page, treeItem(page, "样板.md"), "作为模板导入");
    await expect.poll(() => readIfPresent(destination), { timeout: 20_000 }).toBe(initial);
    expect(readFileSync(source, "utf8")).toBe(initial);
    await page.getByRole("button", { name: "新建笔记", exact: true }).and(page.getByTitle("新建笔记", { exact: true })).click();
    const dialog = page.getByTestId("new-note-dialog");
    await dialog.getByLabel("文件名", { exact: true }).fill("从模板创建");
    const picker = dialog.getByLabel("内容模板", { exact: true });
    await expect(picker.getByRole("option", { name: "模板/样板.md", exact: true })).toBeAttached({ timeout: 15_000 });
    await picker.selectOption({ label: "模板/样板.md" });
    await dialog.getByTestId("new-note-submit").click();
    const created = path.join(vault, "从模板创建.md");
    await expect.poll(() => readIfPresent(created), { timeout: 15_000 }).toBe(initial);
    const rich = page.getByTestId("markdown-editor").locator(".ProseMirror");
    await expect(rich.getByRole("heading", { name: "模板正文" })).toBeVisible({ timeout: 15_000 });
    await expect(rich.locator("strong")).toHaveText("保留粗体");
    await rich.getByRole("heading", { name: "模板正文" }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("已保存");
    await page.keyboard.press("ControlOrMeta+s");
    await expect.poll(() => readFileSync(created, "utf8")).toContain("# 模板正文已保存");
    const closeTab = page.getByRole("button", { name: "关闭 从模板创建", exact: true });
    await closeTab.click();
    await expect(closeTab).toHaveCount(0);
    await treeItem(page, "从模板创建.md").click();
    await expect(rich.getByRole("heading", { name: "模板正文已保存" })).toBeVisible({ timeout: 15_000 });

    await treeSettled(page);
    await treeFolder(page, "目标文件夹").click({ button: "right" });
    await page.getByRole("menuitem", { name: "从模板新建", exact: true }).hover();
    await page.getByRole("menuitem", { name: "模板/样板.md", exact: true }).click();
    const treeDialog = page.getByRole("dialog", { name: "新建文件", exact: true });
    await expect(treeDialog.getByRole("combobox")).toContainText("模板/样板.md");
    await treeDialog.getByLabel("文件名", { exact: true }).fill("从树创建");
    await treeDialog.getByRole("button", { name: "创建", exact: true }).click();
    await expect.poll(() => readIfPresent(path.join(vault, "目标文件夹", "从树创建.md")), { timeout: 15_000 }).toBe(initial);
    await treeItem(page, "从树创建.md").click();
    await expect(rich.getByRole("heading", { name: "模板正文", exact: true })).toBeVisible({ timeout: 15_000 });

    expect(readFileSync(source, "utf8")).toBe(initial);
    expect(readFileSync(destination)).toEqual(Buffer.from(initial));
  } finally {
    await close();
  }
});
