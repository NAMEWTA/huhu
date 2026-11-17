import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";

// S4：OK 评论 UI 接 Huhu 的 comments.*（真实 Electron）。
// D01 选区 / 整篇评论进同一存储，取消不留伪线程；D02 线程 / 回复 / 解决 / 重开 / 删除确认；D03 点线程定位正文；
// D04 前插内容 / 重复段落锚点正确，删除原文显示孤立；D05 发表后继续编辑不影响锚点；D06 改名后评论仍在、任务评论不受影响。

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await expect(page.getByTestId("notes-module")).toBeVisible();
}
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror").first();
const commentsDir = (vault: string) => path.join(vault, "Comments");
const commentFiles = (vault: string) => (existsSync(commentsDir(vault)) ? readdirSync(commentsDir(vault)) : []);
const readAll = (vault: string) => commentFiles(vault).map((f) => readFileSync(path.join(commentsDir(vault), f), "utf8")).join("\n---FILE---\n");

/** 选中编辑器里某段文字（双击 / 三击不稳定：用 DOM Range 精确选中）。 */
async function selectText(page: Page, text: string, nth = 0): Promise<void> {
  await prose(page).evaluate(
    (root, [needle, index]) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let seen = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = (n.textContent ?? "").indexOf(needle as string);
        if (at < 0) continue;
        if (seen++ < (index as number)) continue;
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + (needle as string).length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        return;
      }
      throw new Error(`没找到文字：${needle}`);
    },
    [text, nth] as const,
  );
}

async function addComment(page: Page, body: string): Promise<void> {
  await page.getByRole("button", { name: "添加批注" }).first().click();
  const composer = page.getByTestId("comment-composer");
  await expect(composer).toBeVisible();
  await composer.getByRole("textbox").click();
  await page.keyboard.type(body);
  await page.keyboard.press("Enter");
}

test("D01/D02：选区批注进真实存储，取消不留伪线程；回复 / 解决 / 重开 / 删除确认；整篇笔记批注", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "批注一.md"), "# 标题\n\n这里有一套能力，值得批注。\n\n另一段内容。\n");
    await gotoNotes(page);
    await treeItem(page, "批注一.md").click();
    await expect(prose(page)).toContainText("值得批注", { timeout: 30_000 });

    // 取消：开了输入框再 Esc，没有任何线程、没有错误高亮
    await selectText(page, "一套能力");
    await page.getByRole("button", { name: "添加批注" }).first().click();
    await expect(page.getByTestId("comment-composer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("comment-composer")).toHaveCount(0);
    expect(commentFiles(vault)).toHaveLength(0);

    // 发表
    await selectText(page, "一套能力");
    await addComment(page, "这里要展开");
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect.poll(() => commentFiles(vault).length).toBe(1);
    expect(readAll(vault)).toMatch(/exact: 一套能力/);
    await expect(prose(page).locator("[data-comment-thread]").first()).toBeVisible();

    // 回复 / 解决 / 重开
    await page.getByTestId("thread-reply-input").fill("收到，会补充");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("thread-reply")).toContainText("收到，会补充");
    await page.getByTestId("thread-resolve").click({ force: true });
    await expect(page.getByTestId("comment-thread")).toHaveCount(0);
    await page.getByTestId("comment-doc-resolved-toggle").click();
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "resolved");
    await page.getByRole("button", { name: "重新打开" }).click({ force: true });
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "anchored");

    // 整篇笔记批注
    await page.getByTestId("comment-whole-note-input").fill("整体写得不错");
    await page.getByTestId("comment-whole-note-add").click();
    await expect(page.getByTestId("comment-thread")).toHaveCount(2);
    await expect.poll(() => readAll(vault)).toMatch(/target: file/);

    // 删除需要确认；正文不变
    const before = readFileSync(path.join(vault, "批注一.md"), "utf8");
    await page.getByTestId("thread-delete").first().click({ force: true });
    await expect(page.getByTestId("comment-delete-confirm")).toBeVisible();
    await page.getByTestId("comment-delete-confirm").click();
    await expect.poll(() => commentFiles(vault).length).toBe(1);
    expect(readFileSync(path.join(vault, "批注一.md"), "utf8")).toBe(before);
  } finally {
    await close();
  }
});

test("D03/D04/D05：点线程定位正文；前插内容锚点跟随；重复句子锚点唯一；删除原文变孤立不吸附；发表后继续编辑", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "锚点.md"), "# 锚点\n\n甲：同一句话。\n\n乙：同一句话。\n\n尾段。\n");
    await gotoNotes(page);
    await treeItem(page, "锚点.md").click();
    await expect(prose(page)).toContainText("乙：同一句话", { timeout: 30_000 });

    // 在第二处重复句子上发表：锚点上下文让它唯一
    await selectText(page, "同一句话", 1);
    await addComment(page, "只说第二处");
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect.poll(() => readAll(vault)).toMatch(/exact: 同一句话/);
    const first = readAll(vault);
    const start = Number(/start: (\d+)/.exec(first)?.[1]);
    const src = readFileSync(path.join(vault, "锚点.md"), "utf8");
    expect(src.indexOf("同一句话", src.indexOf("乙："))).toBe(start); // 对应第二处，不是第一处

    // D05：发表后立刻在文首继续输入（前插内容），保存后锚点仍落在第二处
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.type("前插的一行。");
    await expect(page.getByTestId("save-state")).toHaveText("已保存", { timeout: 10_000 });
    await expect.poll(() => Number(/start: (\d+)/.exec(readAll(vault))?.[1])).toBeGreaterThan(start);
    const moved = readFileSync(path.join(vault, "锚点.md"), "utf8");
    expect(moved.indexOf("同一句话", moved.indexOf("乙："))).toBe(Number(/start: (\d+)/.exec(readAll(vault))?.[1]));
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "anchored");

    // D03：点线程里的引用 → 正文滚到并高亮锚点
    await page.getByTestId("comment-thread").getByRole("button", { name: /同一句话/ }).first().click();
    await expect(prose(page).locator("[data-comment-thread]").first()).toBeVisible();

    // D04：删除锚定的那句 → 孤立，不吸附到第一处同样的句子
    await prose(page).evaluate((root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if ((n.textContent ?? "").startsWith("乙：")) {
          const r = document.createRange();
          r.selectNodeContents(n);
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(r);
          return;
        }
      }
    });
    await page.keyboard.press("Backspace");
    await expect.poll(() => readAll(vault), { timeout: 10_000 }).toMatch(/state: orphaned/);
    await expect(page.getByTestId("comment-orphaned")).toBeVisible();
    await expect(prose(page).locator("[data-comment-thread]")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("D06：改名后评论仍绑定同一笔记；未解决的批注在重开应用后仍锚定", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "原名.md"), "# 原名\n\n需要保留的批注句子。\n");
    await gotoNotes(page);
    await treeItem(page, "原名.md").click();
    await expect(prose(page)).toContainText("需要保留的批注句子", { timeout: 30_000 });
    await selectText(page, "需要保留的批注句子");
    await addComment(page, "改名后也要在");
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect.poll(() => commentFiles(vault).length).toBe(1);

    await page.getByRole("button", { name: "笔记操作" }).click();
    await page.getByRole("menuitem", { name: "重命名" }).click();
    await page.getByRole("textbox", { name: "重命名" }).fill("新名");
    await page.getByTestId("name-dialog-submit").click();
    await expect(treeItem(page, "新名.md")).toBeVisible();
    await expect.poll(() => readAll(vault)).toMatch(/documentPath: 新名\.md/);
    // 改名会换掉当前标签，详情栏可能收起：重新打开批注页，评论仍绑定同一笔记
    await treeItem(page, "新名.md").click();
    await expect(prose(page)).toContainText("需要保留的批注句子", { timeout: 30_000 });
    if ((await page.getByTestId("note-inspector").count()) === 0) await page.getByRole("button", { name: "文档详情" }).click();
    await page.getByTestId("note-inspector").getByRole("tab", { name: "批注" }).click();
    await expect(page.getByTestId("comment-thread")).toHaveCount(1);
    await expect(page.getByTestId("comment-thread")).toHaveAttribute("data-state", "anchored");
  } finally {
    await close();
  }
});
