import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

const note = "复刻验收";
const filename = `${note}.md`;
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror");

async function openNote(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await treeSettled(page);
  await treeItem(page, filename).click();
  await expect(prose(page)).toBeVisible({ timeout: 30_000 });
}

async function reopenSavedNote(page: Page, file: string, expected: string): Promise<void> {
  await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).toBe(expected);
  await page.getByRole("button", { name: `关闭 ${note}`, exact: true }).click();
  await expect(prose(page)).toHaveCount(0);
  await treeItem(page, filename).click();
  await expect(prose(page)).toBeVisible({ timeout: 30_000 });
  expect(readFileSync(file)).toEqual(Buffer.from(expected));
}

test("查找替换快捷键打开查找栏、定位下一个匹配并一次替换保存", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, filename);
  try {
    writeFileSync(file, "alpha beta alpha\n");
    await openNote(page);
    await prose(page).getByText("alpha beta alpha", { exact: true }).click();
    await page.keyboard.press("ControlOrMeta+f");
    const bar = page.getByTestId("find-replace-bar");
    const find = bar.locator("#ok-find-input");
    await expect(find).toBeFocused();
    await find.fill("alpha");
    await expect(bar.getByRole("status")).toHaveText("1 / 2");
    await page.keyboard.press("F3");
    await expect(bar.getByRole("status")).toHaveText("2 / 2");
    await expect(prose(page).locator(".ok-find-match-active")).toHaveText("alpha");

    await page.keyboard.press("Control+h");
    const replace = bar.locator("#ok-replace-input");
    await expect(replace).toBeVisible();
    await replace.fill("gamma");
    const beforeComposition = await bar.getByRole("status").textContent();
    await replace.dispatchEvent("keydown", { key: "Enter", isComposing: true });
    await expect(bar.getByRole("status")).toHaveText(beforeComposition ?? "");
    await expect(prose(page)).toContainText("alpha beta alpha");
    await bar.getByRole("button", { name: /Replace all matches|替换所有|全部替换/ }).click();
    await expect(prose(page)).toContainText("gamma beta gamma");
    await page.keyboard.press("Escape");
    await expect(bar).toHaveCount(0);
    await reopenSavedNote(page, file, "gamma beta gamma\n");
    await expect(prose(page)).toContainText("gamma beta gamma");
    await expect(prose(page).locator(".ok-find-match")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("下划线、高亮、转义、HTML 块、行内 JSX 与未知 MDX 在富文本编辑重开后保真", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, filename);
  const original = ["起始", "", "<u>下划线</u> ==高亮== \\*转义", "", "<!DOCTYPE html>", "", '行内 <img src="./fixture.png" alt="示例" /> 图像', "", "<UnknownWidget label={expression} />", ""].join("\n");
  try {
    writeFileSync(file, original);
    writeFileSync(path.join(vault, "fixture.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+YhXYAAAAASUVORK5CYII=", "base64"));
    await openNote(page);
    await prose(page).getByText("起始", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText("修改");
    await reopenSavedNote(page, file, original.replace("起始", "起始修改"));
    await expect(prose(page).getByText("起始修改", { exact: true })).toBeVisible();
    await expect(prose(page).locator("u")).toHaveText("下划线");
    await expect(prose(page).locator("mark")).toHaveText("高亮");
    await expect(prose(page).locator("[data-escape-mark]")).toHaveText("*");
    await expect(prose(page).getByText("<!DOCTYPE html>", { exact: true })).toBeVisible();
    await expect(prose(page).locator("[data-jsx-inline][data-component-name='img']")).toBeVisible();
    await expect(prose(page).locator(".cm-content")).toContainText("UnknownWidget");
  } finally {
    await close();
  }
});

test("空文档显示占位符，Shift-Tab 保留编辑焦点，键入后持久化", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, filename);
  try {
    writeFileSync(file, "");
    await openNote(page);
    const editor = prose(page);
    const placeholder = editor.locator("[data-placeholder]");
    await expect(placeholder).toHaveAttribute("data-placeholder", /\//);
    await editor.click();
    await page.keyboard.press("Shift+Tab");
    await expect(editor).toBeFocused();
    await page.keyboard.insertText("占位符消失");
    await expect(placeholder).toHaveCount(0);
    await reopenSavedNote(page, file, "占位符消失\n");
    await expect(editor).toContainText("占位符消失");
    await expect(placeholder).toHaveCount(0);
  } finally {
    await close();
  }
});

test("# 与 [[ 候选来自当前 Vault，插入后保存并重开", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, filename);
  try {
    writeFileSync(path.join(vault, "target-note.md"), "# Vault 目标\n\n索引内容 #closeout\n");
    writeFileSync(file, "候选 ");
    await openNote(page);
    // Vault 树先于笔记索引就绪。开始操作前等待目标笔记出现在候选数据源。
    await expect.poll(async () => page.evaluate(async () => (await fetch("/api/page-headings?docName=target-note")).json()), { timeout: 15_000 }).toMatchObject({ headings: [{ level: 1, text: "Vault 目标" }] });
    const editor = prose(page);
    await editor.getByText("候选").click();
    await page.keyboard.press("End");
    // 起始 Markdown 尾随空格在富文本显示中被折叠。
    await page.keyboard.type(" #closeout");
    const tag = page.getByTestId("tag-suggestion-tag-closeout");
    await expect(tag).toBeVisible({ timeout: 10_000 });
    await tag.click();
    await expect(editor.locator("[data-tag]")).toContainText("closeout");
    await page.keyboard.press("End");
    await page.keyboard.type(" [[target-note#Vault");
    const target = page.getByRole("option").filter({ hasText: "Vault 目标" });
    await expect(target).toBeVisible({ timeout: 10_000 });
    await target.click();
    await expect(editor.locator("[data-wiki-link]")).toContainText("target-note");
    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).toMatch(/#closeout.*\[\[target-note(?:\.md)?#[^\]]+\]\]/);
    const saved = readFileSync(file, "utf8");
    await reopenSavedNote(page, file, saved);
    await expect(editor.locator("[data-tag]")).toContainText("closeout");
    await expect(editor.locator("[data-wiki-link]")).toContainText("target-note");
  } finally {
    await close();
  }
});

test("表格光标显示行列句柄，拖拽移动数据行并保存重开", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, filename);
  try {
    writeFileSync(file, "| 名称 | 数字 |\n| --- | --- |\n| 第一行 | 一 |\n| 第二行 | 二 |\n| 第三行 | 三 |\n");
    await openNote(page);
    const editor = prose(page);
    const rows = editor.getByRole("row");
    const second = editor.getByRole("cell", { name: "第二行", exact: true });
    const last = editor.getByRole("cell", { name: "第三行", exact: true });
    await second.getByText("第二行", { exact: true }).click();
    await expect(page.getByTestId("table-cell-handle")).toHaveCount(2);
    const rowHandle = page.getByRole("button", { name: /Row options|行选项/ });
    const from = await rowHandle.boundingBox();
    const to = await last.boundingBox();
    if (!from || !to) throw new Error("行句柄或目标行缺少布局坐标");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 5, to.y + to.height - 1, { steps: 10 });
    await page.mouse.up();

    await expect(rows).toHaveText([/名称.*数字/, /第一行.*一/, /第三行.*三/, /第二行.*二/]);
    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).toMatch(/第一行[^\n]*\n[^\n]*第三行[^\n]*\n[^\n]*第二行/);
    await reopenSavedNote(page, file, readFileSync(file, "utf8"));
    await expect(rows).toHaveText([/名称.*数字/, /第一行.*一/, /第三行.*三/, /第二行.*二/]);
  } finally {
    await close();
  }
});

test("TXT 与 JSON 纯文本编辑各自保存后关闭重开，保留原格式", async () => {
  const { page, vault, close } = await openApp();
  try {
    const text = "纯文本.txt";
    const json = "结构.json";
    writeFileSync(path.join(vault, text), "first\r\n");
    writeFileSync(path.join(vault, json), '{ "amount": 1 }\n');
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "知识库" }).first().click();
    await treeSettled(page);

    const editor = page.getByTestId("plain-text-editor").locator(".cm-content");
    for (const fixture of [
      { name: text, originalText: "first", inserted: "second", atEnd: true, expected: "first\r\nsecond" },
      { name: json, originalText: "amount", inserted: ' "extra": 2,', atEnd: false, expected: '{ "extra": 2, "amount": 1 }\n' },
    ]) {
      await treeItem(page, fixture.name).click();
      await expect(editor).toContainText(fixture.originalText);
      await editor.click();
      await expect(editor).toBeFocused();
      if (fixture.atEnd) {
        await page.keyboard.press("ControlOrMeta+End");
      } else {
        await page.keyboard.press("ControlOrMeta+Home");
        await page.keyboard.press("ArrowRight");
      }
      await page.keyboard.insertText(fixture.inserted);
      await expect(editor).toContainText(fixture.inserted.trim());
      const file = path.join(vault, fixture.name);
      await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).toBe(fixture.expected);
      await page.getByRole("button", { name: `关闭 ${fixture.name}`, exact: true }).click();
      await expect(page.getByTestId("document-tab").filter({ hasText: fixture.name })).toHaveCount(0);
      await treeItem(page, fixture.name).click();
      await expect(editor).toContainText(fixture.inserted.trim());
      expect(readFileSync(file)).toEqual(Buffer.from(fixture.expected));
    }
  } finally {
    await close();
  }
});

test("复制与剪切分离公开文本和评论原文，粘回后保存重开", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, filename);
  const original = "公开内容 %%仅内部评论%% 尾部\n";
  try {
    writeFileSync(file, original);
    await openNote(page);
    const editor = prose(page);
    await expect(editor.locator("[data-comment-mark]")).toHaveText("仅内部评论");
    await editor.focus();
    await page.keyboard.press("ControlOrMeta+a");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain("仅内部评论");

    const copy = await editor.evaluate((element) => {
      const data = new DataTransfer();
      element.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data }));
      return { plain: data.getData("text/plain"), html: data.getData("text/html"), internal: data.getData("application/x-openknowledge-markdown") };
    });
    expect(copy.plain).toContain("公开内容");
    expect(copy.plain).not.toContain("仅内部评论");
    expect(copy.html).not.toContain("仅内部评论");
    expect(copy.internal).toContain("%%仅内部评论%%");
    await expect(editor.locator("[data-comment-mark]")).toHaveCount(1);

    const cut = await editor.evaluate((element) => {
      const data = new DataTransfer();
      element.dispatchEvent(new ClipboardEvent("cut", { bubbles: true, cancelable: true, clipboardData: data }));
      return data.getData("application/x-openknowledge-markdown");
    });
    expect(cut).toBe(copy.internal);
    await expect(editor).not.toContainText("公开内容");
    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 10_000 }).not.toContain("公开内容");

    await editor.evaluate((element, originalClipboard) => {
      const data = new DataTransfer();
      data.setData("text/plain", originalClipboard.plain);
      data.setData("text/html", originalClipboard.html);
      data.setData("application/x-openknowledge-markdown", originalClipboard.internal);
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    }, copy);
    await expect(editor.locator("[data-comment-mark]")).toHaveText("仅内部评论");
    await reopenSavedNote(page, file, original);
    await expect(editor.locator("[data-comment-mark]")).toHaveText("仅内部评论");
  } finally {
    await close();
  }
});
