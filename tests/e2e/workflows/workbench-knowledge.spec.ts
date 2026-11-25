import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/launch.js";
import { treeItem, treeSettled } from "../helpers/tree.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const navigate = (page: Page, name: string) => page.locator('[data-region="rail"]').getByRole("button", { name, exact: true }).click();

async function openEditorSettings(page: Page) {
  await navigate(page, "设置");
  await page.getByTestId("settings-nav-editor").click();
}

async function openKnowledge(page: Page, filename: string) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  await navigate(page, "知识库");
  await treeSettled(page);
  await treeItem(page, filename).click();
  await expect(page.getByTestId("markdown-editor")).toBeVisible();
}

test("UX01：混合 Markdown 三种模式铺满知识库编辑区并保留焦点", async () => {
  const filename = "编辑排版.md";
  const markdown = "# 排版验收\n\n中文正文与选择范围。\n\n> 引用内容\n\n- 普通列表\n- [x] 已完成清单\n\n```text\n原始代码\n```\n\n![[进度记录]]\n\n末段。\n";
  const { app, page, vault, close } = await openApp({}, (root) => {
    writeFileSync(path.join(root, filename), markdown);
    writeFileSync(path.join(root, "进度记录.md"), "## 进度记录\n\n已整理 7 / 10。\n");
  });
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1600, 960));
    await openKnowledge(page, filename);
    const editor = page.getByTestId("markdown-editor");
    const rich = editor.locator(".tiptap-editor-portal-content > .ProseMirror").first();
    await expect(rich.getByRole("heading", { name: "排版验收" })).toBeVisible();
    await rich.getByText("中文正文与选择范围。").click();
    await page.keyboard.press("Shift+End");
    await expect(rich).toBeFocused();
    await expect.poll(() => rich.evaluate((element) => {
      const pane = element.closest("[data-testid=markdown-editor]")!;
      return { outline: getComputedStyle(element).outlineStyle, fillsPane: element.getBoundingClientRect().width >= pane.getBoundingClientRect().width * 0.8 };
    })).toEqual({ outline: "none", fillsPane: true });
    await expect.poll(() => editor.evaluate((element) => getComputedStyle(element, "::before").borderBlockStartWidth)).toBe("2px");

    const toolbar = page.getByTestId("note-toolbar");
    await toolbar.getByRole("tab", { name: "源码" }).click();
    await expect(editor.locator(".cm-content")).toContainText("![[进度记录]]");
    await toolbar.getByRole("tab", { name: "阅读" }).click();
    const reading = page.getByTestId("notes-reading-pane");
    await expect(reading.getByRole("heading", { name: "排版验收" })).toBeVisible();
    await expect(reading.locator("blockquote")).toContainText("引用内容");
    await expect(reading.locator("pre")).toContainText("原始代码");
    await toolbar.getByRole("tab", { name: "实时预览" }).click();
    await expect(rich.getByText("末段。")).toBeVisible();
    expect(readFileSync(path.join(vault, filename), "utf8")).toBe(markdown);
  } finally {
    await close();
  }
});

test("UX02：区分保存失败和未确认，保留中文输入并核实原保存", async () => {
  const filename = "保存回执.md";
  const initial = "原正文\n";
  const { page, vault, close } = await openApp({}, (root) => writeFileSync(path.join(root, filename), initial));
  const disk = () => readFileSync(path.join(vault, filename), "utf8");
  try {
    await engineReady(page);
    await openEditorSettings(page);
    const autosave = page.getByRole("switch", { name: "自动保存" });
    if (await autosave.isChecked()) await autosave.click();
    await expect(autosave).not.toBeChecked();
    await openKnowledge(page, filename);
    await page.getByTestId("note-toolbar").getByRole("tab", { name: "源码" }).click();
    const editor = page.getByTestId("markdown-editor").locator(".cm-content");
    let saves = 0;
    await page.route("**/api/v1/call", async (route) => {
      if (route.request().postDataJSON()?.capability !== "notes.save") return route.continue();
      saves++;
      if (saves === 1) {
        return route.fulfill({ status: 200, json: { ok: false, error: { code: "INTERNAL", message: "合成的保存失败" } } });
      }
      if (saves === 3) {
        const response = await route.fetch();
        expect(await response.json()).toMatchObject({ ok: true });
        return route.abort();
      }
      return route.continue();
    });
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("中文连续输入");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("note-save-failed")).toContainText("合成的保存失败");
    await expect(editor).toContainText("中文连续输入");
    expect(disk()).toBe(initial);
    await page.getByTestId("note-retry-save").click();
    await expect.poll(disk).toContain("中文连续输入");

    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("再输入一段");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("save-state")).toHaveText("保存结果待核实");
    await expect(editor).toContainText("再输入一段");
    await page.getByTestId("note-verify-save").click();
    await expect(page.getByTestId("note-save-conflict")).toBeHidden();
    expect(disk()).toContain("再输入一段");
    expect(saves).toBe(3);
  } finally {
    await close();
  }
});

test("UX03：右栏收起时正文铺满，锚定批注可提交、编辑、定位和删除", async () => {
  const filename = "批注侧栏.md";
  const markdown = "---\ntitle: 批注侧栏\n---\n\n# 批注\n\n选中这一句话。\n";
  const { app, page, vault, close } = await openApp({}, (root) => writeFileSync(path.join(root, filename), markdown));
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(940, 670));
    await openKnowledge(page, filename);
    const inspector = page.getByTestId("note-inspector");
    await expect(inspector).toHaveCount(0);
    await expect(page.getByTestId("editor-properties")).toHaveCount(0);
    const toolbar = page.getByTestId("note-toolbar");
    const toggle = toolbar.getByRole("button", { name: "文档详情", exact: true });
    await toggle.click();
    await expect(page.getByTestId("inspector-properties")).toContainText("title");
    await expect(inspector.getByTestId("note-inspector-close")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(inspector).toHaveCount(0);
    await expect(toggle).toBeFocused();

    const rich = page.getByTestId("markdown-editor").locator(".tiptap-editor-portal-content > .ProseMirror").first();
    const passage = rich.getByText("选中这一句话。");
    await passage.click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await toolbar.getByRole("button", { name: "添加批注", exact: true }).click();
    const composer = page.getByTestId("comment-composer");
    await composer.getByRole("textbox").fill("待补上的说明");
    await composer.getByRole("button", { name: "添加评论（Enter）" }).click();
    const comment = inspector.getByTestId("comment-thread");
    await expect(comment).toHaveAttribute("data-state", "anchored");
    await expect(comment.getByTestId("thread-reply-input")).toHaveCount(0);
    await expect(inspector.getByTestId("comment-doc-resolved-toggle")).toHaveCount(0);
    await comment.hover();
    await comment.getByTestId("comment-edit").click();
    await comment.getByRole("textbox", { name: "编辑这条评论" }).fill("本条批注已更新");
    await comment.getByTestId("comment-edit-save").click();
    await expect(comment.getByTestId("thread-comment-body")).toHaveText("本条批注已更新");
    await comment.getByRole("button", { name: /选中这一句话/ }).click();
    await expect(rich.locator("[data-comment-thread]")).toBeInViewport();
    await comment.hover();
    await comment.getByTestId("thread-delete").click();
    await comment.getByTestId("comment-delete-confirm").click();
    await expect(comment).toHaveCount(0);
    expect(readFileSync(path.join(vault, filename), "utf8")).toBe(markdown);
  } finally {
    await close();
  }
});

test("UX04：常驻月历按时区与语言显示，键盘选日且空日仅创建一次", async () => {
  const past = "2026-11-05";
  const today = "2026-11-06";
  const existing = `${past} · 每日笔记.md`;
  const created = `${today} · 每日笔记.md`;
  const { page, vault, close } = await openApp({}, (root) => {
    const folder = path.join(root, "日记");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, existing), "# 已有日记\n");
  });
  const files = () => readdirSync(path.join(vault, "日记")).sort();
  try {
    await engineReady(page);
    await call(page, "settings.update", { patch: { dateTime: { zone: "America/Los_Angeles", weekStartsOn: 0 } } });
    await page.reload();
    await page.clock.setFixedTime(new Date("2026-11-07T03:00:00Z"));
    await engineReady(page);
    await navigate(page, "知识库");
    await page.getByRole("tab", { name: "日记", exact: true }).click();
    const calendar = page.getByRole("grid");
    const date = (value: string) => calendar.locator(`button[data-date="${value}"]`);
    await expect(calendar).toHaveAccessibleName("2026年11月");
    await expect(date(today)).toHaveAttribute("aria-current", "date");
    await expect(date(past)).toHaveAttribute("data-has-note", "true");
    await page.getByRole("button", { name: "下个月" }).click();
    await expect(calendar).toHaveAccessibleName("2026年12月");
    await page.getByRole("button", { name: "上个月" }).click();
    expect(files()).toEqual([existing]);

    await openEditorSettings(page);
    const language = page.getByLabel("知识库编辑器语言", { exact: true });
    await language.selectOption("en");
    await expect(language).toHaveValue("en");
    await navigate(page, "知识库");
    await page.getByRole("tab", { name: "日记", exact: true }).click();
    await expect(calendar).toHaveAccessibleName("November 2026");
    await expect(calendar.getByRole("columnheader").first()).toHaveText("Sun");
    await date(today).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(date(past)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("markdown-editor").getByRole("heading", { name: "已有日记" })).toBeVisible();

    await date(today).click();
    const dialog = page.getByRole("dialog", { name: "Create daily note" });
    await expect(dialog).toContainText(today);
    expect(files()).toEqual([existing]);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(files).toEqual([existing, created]);
    await expect(date(today)).toHaveAttribute("data-has-note", "true");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(files()).toEqual([existing, created]);
  } finally {
    await close();
  }
});
