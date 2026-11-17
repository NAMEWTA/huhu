import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";

// S2b 整合点：知识库的 Markdown 文档由 OK 编辑器（LocalDocProvider + DocumentSession）承载。
// 覆盖：打开 → 无编辑不写盘 → 输入 → 自动保存 → 立即切换不丢最后字符 → 三种视图切换 → 关闭 → 重开一致。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
}

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

test("S2b：打开—无编辑不写盘—输入—保存—重开一致；立即切换不丢最后字符；视图切换保留正文", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "S2b.md");
    const other = path.join(vault, "另一篇.md");
    const original = "---\ntitle: S2b\n---\n\n# 标题\n\n第一段，保持原样。\n\n- 条目甲\n- 条目乙\n";
    writeFileSync(file, original);
    writeFileSync(other, "# 另一篇\n\n正文\n");
    const mtime0 = statSync(file).mtimeMs;

    await gotoNotes(page);
    await treeItem(page, "S2b.md").click();
    await expect(prose(page)).toContainText("第一段，保持原样。", { timeout: 30_000 });

    // 无编辑：停留超过自动保存间隔，磁盘字节与 mtime 都不变（B10）
    await page.waitForTimeout(2500);
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(statSync(file).mtimeMs).toBe(mtime0);

    // 输入 → 自动保存
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("末尾追加一");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    expect(readFileSync(file, "utf8")).toContain("末尾追加一");
    expect(readFileSync(file, "utf8")).toContain("title: S2b"); // frontmatter 未丢

    // 输入后立刻切换到另一篇：磁盘必须含最后一个字符（flush 排空防抖）
    await page.keyboard.type("尾字");
    await treeItem(page, "另一篇.md").click();
    await expect(prose(page)).toContainText("正文", { timeout: 30_000 });
    expect(readFileSync(file, "utf8")).toContain("末尾追加一尾字");

    // 回到 S2b：内容保留；源码 / 阅读 / 实时预览来回切，正文一致
    await treeItem(page, "S2b.md").click();
    await expect(prose(page)).toContainText("末尾追加一尾字", { timeout: 30_000 });
    await page.getByRole("tab", { name: "源码" }).click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content").first()).toContainText("末尾追加一尾字", { timeout: 20_000 });
    await page.getByRole("tab", { name: "阅读" }).click();
    await expect(prose(page)).toContainText("末尾追加一尾字");
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(prose(page)).toContainText("条目乙");

    // 源码里输入，保存后磁盘含它，富文本跟随
    await page.getByRole("tab", { name: "源码" }).click();
    const cm = page.getByTestId("markdown-editor").locator(".cm-content").first();
    await cm.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n\n来自源码");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    expect(readFileSync(file, "utf8")).toContain("来自源码");
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(prose(page)).toContainText("来自源码");

    // 撤销只回退最近的编辑
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("临时");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(prose(page)).not.toContainText("临时");
    await expect(prose(page)).toContainText("来自源码");
    expect(existsSync(file)).toBe(true);
  } finally {
    await close();
  }
});

test("S2b：重开应用后内容一致（保存—关闭—重开）", async () => {
  const { app, page, vault, close } = await openApp();
  const file = path.join(vault, "重开.md");
  mkdirSync(vault, { recursive: true });
  writeFileSync(file, "# 重开\n\n初始\n");
  try {
    await gotoNotes(page);
    await treeItem(page, "重开.md").click();
    await expect(prose(page)).toContainText("初始", { timeout: 30_000 });
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("关闭前的最后输入");
    // 不等自动保存，直接关闭应用：退出前 flush 必须把它落盘
    await app.close();
    expect(readFileSync(file, "utf8")).toContain("关闭前的最后输入");
  } finally {
    await close().catch(() => undefined);
  }
});
