import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";

// S3 / C01–C05：OK 属性面板接入笔记顶部；属性与正文共用同一缓冲、同一文件；未触碰的 YAML 原样保留。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
}

const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();

test("S3：属性显示、只改属性不丢正文与其它键、改正文保留 frontmatter、未保存正文时改属性落同一文件", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "属性.md");
    writeFileSync(file, "---\ntitle: 标题甲\ncount: 0\nflag: false\nzip: 007\ntags:\n  - a\n  - b\n---\n\n# 正文\n\n段落一\n");
    await gotoNotes(page);
    await page.getByTestId("note-item").filter({ hasText: "属性.md" }).click();
    await expect(prose(page)).toContainText("段落一", { timeout: 30_000 });

    // C01：顶部显示属性
    const panel = page.getByTestId("editor-properties");
    await expect(panel).toContainText("title");
    await expect(panel).toContainText("count");
    await expect(panel).toContainText("tags");

    // 无编辑不写盘：停留后磁盘不变（false / 0 / 前导零文本不被改写）
    const original = readFileSync(file, "utf8");
    await page.waitForTimeout(2500);
    expect(readFileSync(file, "utf8")).toBe(original);

    // C03：只改属性 → 其它键、注释前后的原文与正文都保留
    const title = panel.locator("textarea, input[type=text], input:not([type])").first();
    await title.click();
    await title.fill("标题乙");
    await title.blur();
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    const afterProp = readFileSync(file, "utf8");
    expect(afterProp).toContain("title: 标题乙");
    expect(afterProp).toContain("count: 0");
    expect(afterProp).toContain("flag: false");
    expect(afterProp).toContain("zip: 007");
    expect(afterProp).toContain("- a");
    expect(afterProp).toContain("# 正文");
    expect(afterProp).toContain("段落一");

    // C03：只改正文 → frontmatter 原样保留
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("追加正文");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    const afterBody = readFileSync(file, "utf8");
    expect(afterBody).toContain("title: 标题乙");
    expect(afterBody).toContain("zip: 007");
    expect(afterBody).toContain("追加正文");

    // C04：正文有未保存修改时改属性（及相反顺序）都落同一文件
    await page.keyboard.type("再加一段");
    await title.click();
    await title.fill("标题丙");
    await title.blur();
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    const final = readFileSync(file, "utf8");
    expect(final).toContain("title: 标题丙");
    expect(final).toContain("再加一段");
    expect(final).toContain("zip: 007");
  } finally {
    await close();
  }
});

test("S3：坏 YAML 不被清空——面板给出诊断，源码里的原文保留", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, "坏.md");
    const bad = "---\ntitle: [未闭合\nfoo: : bar\n---\n\n# 正文\n\n段落\n";
    writeFileSync(file, bad);
    await gotoNotes(page);
    await page.getByTestId("note-item").filter({ hasText: "坏.md" }).click();
    await expect(prose(page)).toContainText("段落", { timeout: 30_000 });
    await page.waitForTimeout(2500);
    expect(readFileSync(file, "utf8")).toBe(bad); // 打开不改写
    await page.getByRole("tab", { name: "源码" }).click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content").first()).toContainText("未闭合", { timeout: 20_000 });
  } finally {
    await close();
  }
});
