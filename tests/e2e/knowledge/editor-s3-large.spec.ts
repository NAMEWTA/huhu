import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

// S3 / F09：大文档的两条性能路径不得牺牲正确性。
//  (a) 超过 LARGE_DOC_CHARS 的文档以源码模式打开，富文本表示延后到切换时才构建（P-S3-01）。
//  (b) 桥结算在大文档里自适应推迟（P-S3-02）：输入后立刻切换 / 切源码 / 关闭，磁盘与另一视图都必须含最后一个字符。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
  await treeSettled(page); // 树在文件事件合并后会重新列举；稳定后再点
}

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();
const cm = (page: Page) => page.getByTestId("markdown-editor").locator(".cm-content").first();

test("S3：1 MiB 文档源码优先打开；切到实时预览才构建富文本；源码里的改动在富文本里可见", async () => {
  const { page, vault, close } = await openApp();
  try {
    const line = "这是一行用于测试大文档的正文，包含 **加粗** 与 [[链接]]。\n\n";
    const file = path.join(vault, "巨型.md");
    const original = `# 巨型\n\n${line.repeat(Math.ceil((1024 * 1024) / Buffer.byteLength(line)))}`;
    writeFileSync(file, original);

    await gotoNotes(page);
    await treeItem(page, "巨型.md").click();
    await expect(cm(page)).toContainText("巨型", { timeout: 20_000 });
    // 源码优先：此时没有构建富文本（没有 ProseMirror 内容）
    await expect(page.getByTestId("markdown-editor").locator(".ProseMirror")).toHaveCount(0);

    // 无编辑不写盘
    await page.waitForTimeout(2000);
    expect(readFileSync(file, "utf8")).toBe(original);

    // 源码里改标题，随后切到实时预览：富文本构建后含该标题
    await cm(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");
    await page.keyboard.type("改");
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(prose(page)).toContainText("巨型改", { timeout: 60_000 });
  } finally {
    await close();
  }
});

test("S3：5000 段文档在实时预览里输入后立刻切源码 / 切文件，最后一个字符不丢", async () => {
  const { page, vault, close } = await openApp();
  try {
    const body = Array.from({ length: 5000 }, (_, i) => `第 ${i} 行：这是一段正文，包含 **加粗**。`).join("\n\n");
    const file = path.join(vault, "长文.md");
    writeFileSync(file, `# 长文\n\n${body}\n`);
    writeFileSync(path.join(vault, "短文.md"), "# 短文\n\n正文\n");

    await gotoNotes(page);
    await treeItem(page, "长文.md").click();
    await expect(prose(page)).toContainText("第 0 行", { timeout: 30_000 });

    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("前缀甲乙丙");

    // 立刻切源码：CodeMirror 必须看到最新的 Y.Text（切换前先结算被推迟的桥）
    await page.getByRole("tab", { name: "源码" }).click();
    await expect(cm(page)).toContainText("前缀甲乙丙", { timeout: 20_000 });

    // 回到实时预览再输入，然后立刻切到另一个文件：磁盘必须含最后一个字符
    await page.getByRole("tab", { name: "实时预览" }).click();
    await expect(prose(page)).toContainText("前缀甲乙丙", { timeout: 30_000 });
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.keyboard.type("尾丁");
    await treeItem(page, "短文.md").click();
    await expect(prose(page)).toContainText("正文", { timeout: 30_000 });
    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).toContain("尾丁");
    expect(readFileSync(file, "utf8")).toContain("前缀甲乙丙");
  } finally {
    await close();
  }
});
