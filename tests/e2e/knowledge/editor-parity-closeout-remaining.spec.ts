import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeFolder, treeItem, treeSettled } from "../helpers/tree.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const editor = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror");

async function gotoNotes(page: Page): Promise<void> {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await page.getByRole("button", { name: "知识库" }).first().click();
  await treeSettled(page);
}

async function openNote(page: Page, filename: string): Promise<void> {
  await treeItem(page, filename).click();
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
}

async function reopenSavedNote(page: Page, file: string, expected: string | RegExp): Promise<string> {
  const disk = expect.poll(() => readFileSync(file, "utf8"), { timeout: 15_000 });
  if (typeof expected === "string") await disk.toBe(expected);
  else await disk.toMatch(expected);
  const saved = readFileSync(file, "utf8");
  const filename = path.basename(file);
  await page.getByRole("button", { name: `关闭 ${path.basename(file, ".md")}`, exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  await openNote(page, filename);
  expect(readFileSync(file, "utf8")).toBe(saved);
  return saved;
}

async function openSlashMenu(page: Page, paragraph: Locator, query: string): Promise<Locator> {
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(`/${query}`);
  const options = page.getByRole("listbox");
  await expect(options).toBeVisible();
  return options;
}

test("Embed 占位符可打开属性，外链不发请求，编辑后关闭重开仍显示阻止状态", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "外部嵌入.md");
  const originalUrl = "https://example.invalid/first";
  const finalUrl = "https://example.invalid/updated";
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.invalid/")) externalRequests.push(request.url());
  });

  try {
    writeFileSync(file, "起始\n");
    await gotoNotes(page);
    await openNote(page, "外部嵌入.md");
    const rich = editor(page);
    const list = await openSlashMenu(page, rich.getByText("起始", { exact: true }), "embed");
    await list
      .getByRole("option")
      .filter({ hasText: /^Embed\b/ })
      .first()
      .click();
    const embed = rich.locator('[data-component-name="Embed"]');
    const placeholder = embed.getByRole("button", { name: "Embed a URL" });
    await expect(placeholder).toBeVisible();

    const source = page.getByRole("textbox", { name: /^src$/i });
    // 新建块可能自动打开属性。关闭后再用实际占位按钮打开。
    if (await source.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(source).toBeHidden();
    }
    await placeholder.click();
    await expect(source).toBeFocused();
    await source.fill(originalUrl);
    await source.press("Enter");
    await expect(embed.getByRole("status")).toContainText(originalUrl);
    await embed.locator("button[data-jsx-gear]").click();
    await source.fill(finalUrl);
    await source.press("Enter");
    await expect(embed.getByRole("status")).toContainText(finalUrl);
    const saved = await reopenSavedNote(page, file, /<Embed src="https:\/\/example\.invalid\/updated"\s*\/>/);
    expect(saved).not.toContain(originalUrl);
    await expect(embed.getByRole("status")).toContainText(/Off — external links|关闭——外部链接只显示 URL/);
    await expect(embed.getByRole("status")).toContainText(finalUrl);
    await expect(embed.locator("iframe")).toHaveCount(0);
    expect(externalRequests).toEqual([]);
  } finally {
    await close();
  }
});

test("本地图片气泡的左、中、右按钮更新选择并逐次保存重开", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "图片对齐.md");
  try {
    writeFileSync(file, '起始\n\n<img src="./对齐.png" alt="对齐样本" />\n\n后文\n');
    writeFileSync(path.join(vault, "对齐.png"), png);
    await gotoNotes(page);
    await openNote(page, "图片对齐.md");
    const image = editor(page).locator('[data-component-name="img"]');
    for (const [align, label] of [
      ["left", /Align left|左对齐/],
      ["center", /Align center|居中对齐/],
      ["right", /Align right|右对齐/],
    ] as const) {
      const afterImage = editor(page).getByText("后文", { exact: true });
      await afterImage.click({ position: { x: 2, y: 3 } });
      await page.keyboard.press("Home");
      await expect
        .poll(() =>
          afterImage.evaluate((element) => {
            const selection = window.getSelection();
            return selection?.isCollapsed && selection.anchorOffset === 0 && element.contains(selection.anchorNode);
          }),
        )
        .toBe(true);
      await page.keyboard.press("ArrowUp");
      await expect(image).toHaveAttribute("data-selected", "true");
      const button = page.getByRole("button", { name: label });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(image).toHaveAttribute("data-align", align);
      // 中对齐是默认值，序列化可省略。
      const serialized = align === "center" ? /<img src="\.\/对齐\.png" alt="对齐样本"(?: align="center")?\s*\/>/ : new RegExp(`<img[^>]*align="${align}"`);
      const saved = await reopenSavedNote(page, file, serialized);
      expect(saved).toContain("./对齐.png");
      await expect(image).toHaveAttribute("data-align", align);
      await expect.poll(() => image.locator("img[alt=对齐样本]").evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1);
    }
  } finally {
    await close();
  }
});

test("文件块气泡下载按笔记相对路径读取真实文件并保留下载名", async () => {
  const { app, page, vault, close } = await openApp();
  const folder = path.join(vault, "附件目录");
  const file = path.join(folder, "附件笔记.md");
  const original = '起始\n\n<File src="./载荷.txt" />\n';
  const stored = Buffer.concat([Buffer.alloc(4 * 1024 * 1024, 0x31), Buffer.alloc(4 * 1024 * 1024, 0x32), Buffer.alloc(3 * 1024 * 1024, 0x33), Buffer.from("附件尾部\n")]);
  const out = path.join(vault, ".download");
  try {
    mkdirSync(folder);
    mkdirSync(out);
    writeFileSync(file, original);
    writeFileSync(path.join(folder, "载荷.txt"), stored);
    await app.evaluate(({ BrowserWindow }, output) => {
      BrowserWindow.getAllWindows()[0]?.webContents.session.once("will-download", (_event, item) => {
        item.setSavePath(`${output}/${item.getFilename()}`);
      });
    }, out);
    await gotoNotes(page);
    await treeFolder(page, "附件目录").click();
    await openNote(page, "附件笔记.md");
    await reopenSavedNote(page, file, original);
    const chunk = editor(page).locator('[data-component-name="File"]');
    await editor(page).getByText("起始", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    await expect(chunk).toHaveAttribute("data-selected", "true");
    const download = page.getByRole("button", { name: /Download file|下载文件/ });
    await download.click();
    const target = path.join(out, "载荷.txt");
    await expect.poll(() => existsSync(target) && readFileSync(target).equals(stored), { timeout: 25_000 }).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(original);
  } finally {
    await close();
  }
});

test("格式气泡显示下划线和高亮快捷键，真实按键持久化两种标记", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "格式快捷键.md");
  try {
    writeFileSync(file, "起始\n\n下划线样本\n\n高亮样本\n");
    await gotoNotes(page);
    await openNote(page, "格式快捷键.md");
    const rich = editor(page);
    for (const [text, button, key, accessible, selector] of [
      ["下划线样本", "underline", "ControlOrMeta+u", /Control U|Command U/i, "u"],
      ["高亮样本", "highlight", "ControlOrMeta+Shift+h", /Control Shift H|Command Shift H|Shift Command H/i, "mark"],
    ] as const) {
      await rich.getByText(text, { exact: true }).click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+End");
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
      await page.mouse.move(0, 0);
      const trigger = page.getByRole("button", { name: button, exact: true });
      await trigger.hover();
      const hint = page.getByRole("tooltip").locator("kbd");
      await expect(hint).toHaveAttribute("aria-label", accessible);
      await page.keyboard.press(key);
      await expect(rich.locator(selector)).toHaveText(text);
    }
    await reopenSavedNote(page, file, /<u>下划线样本<\/u>[\s\S]*==高亮样本==/);
    await expect(rich.locator("u")).toHaveText("下划线样本");
    await expect(rich.locator("mark")).toHaveText("高亮样本");
  } finally {
    await close();
  }
});

test("Huhu 笔记工具栏显示路径并切换编辑模式，DocTab 可聚焦和关闭，资源菜单可复制路径", async () => {
  const { app, page, vault, close } = await openApp();
  const folder = path.join(vault, "资料", "子目录");
  const local = "---\ntitle: 属性甲\n---\n\n# 第一份\n";
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 800);
      window?.webContents.setZoomFactor(1);
    });
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(vault, "资料", "目录说明.md"), "目录说明");
    writeFileSync(path.join(folder, "第一份.md"), local);
    writeFileSync(path.join(folder, "第二份.md"), "# 第二份\n");
    writeFileSync(path.join(folder, "资源.txt"), "资源字节");
    await gotoNotes(page);
    await treeFolder(page, "资料").click();
    await treeFolder(page, "子目录").click();
    await openNote(page, "第一份.md");

    const toolbar = page.getByTestId("note-toolbar");
    await expect(toolbar.getByText("资料/子目录", { exact: true })).toBeVisible();
    await expect(toolbar.getByText("第一份.md", { exact: true })).toBeVisible();
    const panel = page.getByTestId("editor-properties");
    await expect(panel.getByText("title", { exact: true })).toBeVisible();
    await expect(panel.getByText("属性甲", { exact: true })).toBeVisible();
    await toolbar.getByRole("tab", { name: "源码" }).click();
    await expect(page.getByTestId("markdown-editor").locator(".cm-content").first()).toContainText("# 第一份");
    await toolbar.getByRole("tab", { name: "实时预览" }).click();
    await expect(editor(page).getByRole("heading", { name: "第一份" })).toBeVisible();

    const tabs = page.getByTestId("document-tabs");
    await openNote(page, "第二份.md");
    await expect(editor(page).getByRole("heading", { name: "第二份" })).toBeVisible();
    await tabs.getByRole("button", { name: "第一份", exact: true }).click();
    await expect(editor(page).getByRole("heading", { name: "第一份" })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "第一份", exact: true })).toHaveAttribute("aria-current", "true");
    await tabs.getByRole("button", { name: "关闭 第二份", exact: true }).click();
    await expect(tabs.getByRole("button", { name: "第二份", exact: true })).toHaveCount(0);
    await expect(editor(page).getByRole("heading", { name: "第一份" })).toBeVisible();

    const resource = treeItem(page, "资源.txt");
    await resource.click({ button: "right" });
    await page.getByRole("menuitem", { name: "复制路径", exact: true }).hover();
    await page.getByRole("menuitem", { name: "相对路径", exact: true }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe("资料/子目录/资源.txt");
    await resource.click();
    await expect(page.getByRole("button", { name: "资源.txt", exact: true })).toHaveAttribute("aria-current", "true");
    expect(readFileSync(path.join(folder, "资源.txt"), "utf8")).toBe("资源字节");
    expect(readFileSync(path.join(folder, "第一份.md"), "utf8")).toBe(local);
  } finally {
    await close();
  }
});

test("从文件树拖到正文打开 DocTab，外部图片拖入仍保存为附件", async () => {
  const { page, vault, close } = await openApp();
  const before = "拖放起点\n";
  const first = path.join(vault, "拖放起点.md");
  const second = path.join(vault, "拖放目标.md");
  try {
    writeFileSync(first, before);
    writeFileSync(second, "# 拖放目标\n\n正文\n");
    await gotoNotes(page);
    await openNote(page, "拖放起点.md");

    const rich = editor(page);
    await treeItem(page, "拖放目标.md").dragTo(rich.getByText("拖放起点", { exact: true }));
    await expect(rich.getByRole("heading", { name: "拖放目标" })).toBeVisible();
    const tabs = page.getByTestId("document-tabs");
    await expect(tabs.getByRole("button", { name: "拖放目标", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(tabs.getByRole("button", { name: "拖放起点", exact: true })).toBeVisible();
    expect(readFileSync(first, "utf8")).toBe(before);

    const body = rich.getByText("正文", { exact: true });
    await body.click();
    await body.evaluate((element, bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "拖入.png", { type: "image/png" }));
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }));
    }, Array.from(png));
    await reopenSavedNote(page, second, /attachments\/拖入\.png/);
    await expect.poll(() => rich.locator("img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1);
    expect(readFileSync(path.join(vault, "attachments", "拖入.png"))).toEqual(png);
  } finally {
    await close();
  }
});

test("逐项测试先将焦点移到顶层段落，离开代码块或引用后斜杠菜单可再次打开", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "斜杠焦点.md");
  const original = "起始锚点\n\n结束锚点\n";
  try {
    writeFileSync(file, original);
    await gotoNotes(page);
    await openNote(page, "斜杠焦点.md");
    const rich = editor(page);
    const start = rich.locator(":scope > p").filter({ hasText: /^起始锚点$/ });
    const end = rich.locator(":scope > p").filter({ hasText: /^结束锚点$/ });

    for (const [label, selector] of [
      ["代码块", ".ok-codeblock pre code"],
      ["引用", "blockquote p"],
    ] as const) {
      const list = await openSlashMenu(page, start, label);
      await list
        .getByRole("option")
        .filter({ hasText: new RegExp(`^${label}`) })
        .first()
        .click();
      const nested = rich.locator(selector).first();
      await expect(nested).toBeVisible();
      await nested.click();
      await page.keyboard.insertText("嵌套文字");
      await expect(nested).toContainText("嵌套文字");

      const reopened = await openSlashMenu(page, end, "表格");
      await expect(reopened.getByRole("option").filter({ hasText: /^表格/ }).first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(end).toHaveText("结束锚点");
    }
    await reopenSavedNote(page, file, /嵌套文字[\s\S]*嵌套文字/);
    await expect(rich.locator(".ok-codeblock pre code")).toContainText("嵌套文字");
    await expect(rich.locator("blockquote")).toContainText("嵌套文字");
  } finally {
    await close();
  }
});

test("代码块设置弹层和预览编辑对话框响应键盘，预览修改保存重开", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "弹层原语.md");
  const before = "<strong>弹层预览甲</strong>";
  const after = "<strong>弹层预览乙</strong>";
  const original = ["导言", "", "```html preview", before, "```", ""].join("\n");
  try {
    writeFileSync(file, original);
    await gotoNotes(page);
    await openNote(page, "弹层原语.md");
    const block = editor(page).locator(".ok-codeblock");
    await block.hover();

    const settings = block.getByRole("button", { name: /Code block settings|代码块设置/ });
    await settings.press("Enter");
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("textbox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();

    const edit = block.getByTestId("ok-codeblock-edit-btn");
    await block.hover();
    await edit.click();
    const source = popover.getByTestId("ok-code-preview-edit-modal-source").locator(".cm-content");
    await expect(source).toBeFocused();
    await source.press("ControlOrMeta+a");
    await page.keyboard.insertText(after);
    await expect(source).toHaveText(after);
    await source.press("ControlOrMeta+Enter");
    await expect(popover).toBeHidden();

    await reopenSavedNote(page, file, original.replace(before, after));
    await block.hover();
    await block.getByRole("button", { name: /Hide HTML preview|隐藏 HTML 预览/ }).click();
    await expect(block.locator("pre code")).toBeVisible();
    await expect(block.locator("pre code")).toHaveText(after);
  } finally {
    await close();
  }
});

test("Callout 属性的下拉选择、高级折叠与开关在保存重开后保留效果", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, "属性原语.md");
  const original = '导言\n\n<Callout title="提醒">\n\n属性组件正文\n\n</Callout>\n';
  try {
    writeFileSync(file, original);
    await gotoNotes(page);
    await openNote(page, "属性原语.md");
    const rich = editor(page);
    const block = rich.locator('[data-component-name="Callout"]');
    await block.hover();
    await block.getByRole("button", { name: /Callout properties|Callout 属性/ }).click();

    const panel = page.locator("[data-prop-panel]");
    await panel.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "warning" }).click();
    await panel.getByRole("button", { name: /Advanced|高级/ }).click();
    await panel.getByRole("switch", { name: "Collapsible" }).click();
    const defaultOpen = panel.getByRole("switch", { name: "Default Open" });
    await expect(defaultOpen).toHaveAttribute("aria-checked", "true");
    await defaultOpen.click();
    await expect(defaultOpen).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    const saved = await reopenSavedNote(page, file, /type="warning"[\s\S]*collapsible(?:=\{true\})?[\s\S]*defaultOpen=\{false\}|> \[!WARNING\]-/i);
    expect(saved).toContain("属性组件正文");
    const details = block.locator("details");
    const body = details.getByText("属性组件正文");
    await expect(body).toBeHidden();
    await details.locator("summary").click();
    await expect(body).toBeVisible();
  } finally {
    await close();
  }
});
