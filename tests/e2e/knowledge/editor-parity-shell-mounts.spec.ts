import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";

async function goToNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await treeSettled(page);
}

const editor = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror");

async function openEmojiPicker(page: Page, paragraph: Locator): Promise<Locator> {
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" /");
  const menu = page.getByRole("listbox", { name: /斜杠命令|Slash commands/ });
  await menu.getByRole("option", { name: "表情符号", exact: true }).click();
  const picker = page.getByTestId("emoji-picker-popover");
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("searchbox")).toBeFocused();
  return picker;
}

test("表情选择器离线可用，键盘与鼠标插入后保存重开，Escape 归还编辑焦点", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "表情.md");
  const expected = "键盘 🎉\n\n鼠标 🚀\n";
  try {
    writeFileSync(file, "键盘\n\n鼠标\n");
    await goToNotes(page);
    await treeItem(page, "表情.md").click();
    const rich = editor(page);
    await expect(rich).toBeVisible();
    const requests: string[] = [];
    const recordRequest = (request: { url(): string }) => {
      const url = new URL(request.url());
      // Vault operations use the local engine IPC endpoint independently of the picker.
      if (url.hostname === "127.0.0.1" && url.pathname === "/api/v1/call") return;
      requests.push(request.url());
    };
    page.on("request", recordRequest);

    let picker = await openEmojiPicker(page, rich.getByText("键盘", { exact: true }));
    let search = picker.getByRole("searchbox");
    await search.fill("party popper");
    await expect(picker.getByRole("gridcell", { name: "Party popper", exact: true })).toBeVisible();
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(picker).toBeHidden();
    await expect(rich).toBeFocused();
    await expect(rich.locator("p").first()).toHaveText("键盘 🎉");

    picker = await openEmojiPicker(page, rich.getByText("鼠标", { exact: true }));
    search = picker.getByRole("searchbox");
    await search.fill("rocket");
    await picker.getByRole("gridcell", { name: "Rocket", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(rich).toBeFocused();
    await expect(rich.locator("p").last()).toHaveText("鼠标 🚀");
    expect(requests).toEqual([]);
    page.off("request", recordRequest);

    await expect.poll(() => readFileSync(file, "utf8"), { timeout: 15_000 }).toBe(expected);
    await page.getByRole("button", { name: "关闭 表情", exact: true }).click();
    await expect(rich).toHaveCount(0);
    await treeItem(page, "表情.md").click();
    await expect(rich.locator("p")).toHaveText(["键盘 🎉", "鼠标 🚀"]);
    expect(readFileSync(file, "utf8")).toBe(expected);

    requests.length = 0;
    page.on("request", recordRequest);
    picker = await openEmojiPicker(page, rich.getByText("鼠标 🚀", { exact: true }));
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(rich).toBeFocused();
    await expect(rich.locator("p")).toHaveText(["键盘 🎉", "鼠标 🚀"]);
    expect(requests).toEqual([]);
  } finally {
    await close();
  }
});

test("正文标签弹窗列出匹配笔记并能跳转", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "标签入口.md"), "跳转 #project\n");
    writeFileSync(path.join(vault, "标签目标.md"), "标签层级命中 #project/child\n");
    writeFileSync(path.join(vault, "其他笔记.md"), "不相关 #projectx\n");
    await goToNotes(page);
    await treeItem(page, "标签入口.md").click();
    const tag = editor(page).locator("a[data-tag='project']");
    await tag.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const row = dialog.getByTestId("tag-dialog-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("标签目标");
    await expect(row).toContainText("#project/child");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(tag).toBeFocused();
    await tag.click();
    await row.click();
    await expect(dialog).toBeHidden();
    await expect(editor(page)).toContainText("标签层级命中");
  } finally {
    await close();
  }
});

test("富文本选区的源码入口保留定位与磁盘内容", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "源码定位.md");
  const initial = "# 起点\n\n前一段\n\n**目标片段**\n";
  try {
    writeFileSync(file, initial);
    await goToNotes(page);
    await treeItem(page, "源码定位.md").click();
    await editor(page).getByText("目标片段", { exact: true }).dblclick();
    const button = page.getByTestId("view-in-source-bubble-button");
    await expect(button).toBeVisible();
    await button.click();
    const expectSourceLanding = async (line: string) => {
      const source = page.getByTestId("markdown-editor").locator(".cm-content");
      await expect(source).toBeVisible();
      await expect(source).toBeFocused();
      await expect
        .poll(() =>
          source.evaluate((node) => {
            const selection = node.ownerDocument.getSelection();
            return selection?.anchorNode?.parentElement?.closest(".cm-line")?.textContent;
          }),
        )
        .toBe(line);
    };
    await expectSourceLanding("**目标片段**");

    await page.getByRole("tab", { name: "实时预览" }).click();
    await editor(page).getByText("前一段", { exact: true }).click();
    await page.keyboard.press("Control+Alt+e");
    await expectSourceLanding("前一段");
    expect(readFileSync(file, "utf8")).toBe(initial);
  } finally {
    await close();
  }
});

test("上传被拒绝时可见编辑器提示且不插入附件", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "附件提示.md");
  const initial = "保留正文\n";
  try {
    writeFileSync(file, initial);
    await goToNotes(page);
    await treeItem(page, "附件提示.md").click();
    await editor(page).locator("p").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    const menu = page.getByRole("listbox", { name: /斜杠命令|Slash commands/ });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), menu.getByRole("option", { name: "文件", exact: true }).click()]);
    await chooser.setFiles({ name: "拒绝.exe", mimeType: "application/octet-stream", buffer: Buffer.from("fixture") });
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "不支持的附件类型：拒绝.exe" })).toBeVisible();
    await expect(editor(page).locator("a, [data-type='file']")).toHaveCount(0);
    expect(readFileSync(file, "utf8").trim()).toBe(initial.trim());
  } finally {
    await close();
  }
});

test("源码模式的属性图标仍能使用离线表情并保存", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "属性图标.md");
  try {
    writeFileSync(file, "---\nicon: 📝\n---\n\n保留正文\n");
    await goToNotes(page);
    await treeItem(page, "属性图标.md").click();
    await editor(page).waitFor();
    await page.getByRole("tab", { name: "源码", exact: true }).click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content")).toBeVisible();
    await page.getByTestId("page-icon-preview").click();
    const picker = page.getByRole("dialog");
    await picker.getByRole("searchbox").fill("rocket");
    await picker.getByRole("gridcell", { name: "Rocket", exact: true }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByTestId("page-icon-widget")).toHaveValue("🚀");
    await expect.poll(() => readFileSync(file, "utf8")).toMatch(/icon: .*🚀.*\n---\n\n保留正文\n$/);
  } finally {
    await close();
  }
});
