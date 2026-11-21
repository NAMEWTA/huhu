import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openApp, rmTree, root } from "../helpers/launch.js";
import { treeFolder, treeItem, treeMenu, treeRename, treeSettled } from "../helpers/tree.js";
import { call, engineReady, holdBridgeTimers } from "./session-slow-bridge.js";

const name = "退出交付.md";
const original = "# 重新打开\n\n初始正文\n";
const first = "首";
const last = "关闭前的最后输入";
const written = original.replace("初始正文", `初始正文${first}${last}`);
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror");
async function openNote(page: Page): Promise<void> {
  if (!(await page.getByTestId("notes-module").isVisible())) await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  await page.getByTestId("notes-section-all").click();
  await treeItem(page, name).click();
  await expect(prose(page)).toContainText("初始正文");
}
async function reopenFromSearch(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "搜索模块、命令和内容" }).fill("退出交付");
  await page.getByTestId("palette-item").filter({ hasText: "退出交付" }).first().click();
  await expect(prose(page)).toContainText("初始正文");
}
async function inputWithPendingBridge(page: Page): Promise<void> {
  await prose(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  const source = await holdBridgeTimers(prose(page));
  await page.keyboard.insertText(first);
  await expect.poll(source).toContain(`初始正文${first}`);
  await page.keyboard.insertText(last);
  await expect(prose(page)).toContainText(`初始正文${first}${last}`);
  expect(await source()).not.toContain(last);
}

async function manualSave(page: Page): Promise<void> {
  await page.getByRole("button", { name: "设置", exact: true }).first().click();
  await page.getByTestId("settings-nav-editor").click();
  const autosave = page.getByRole("switch", { name: "自动保存" });
  await autosave.click();
  await expect(autosave).not.toBeChecked();
}

test("应用菜单保存当前文档，关窗先处理看板草稿再结算文档", async () => {
  test.skip(process.platform !== "win32", "Windows 自动化覆盖菜单按钮与 F10");
  const { app, page, vault, close } = await openApp();
  const file = path.join(vault, name);
  const layout = path.join(vault, ".huhu/home/widgets.json");
  try {
    writeFileSync(file, original + "\n独立段落\n".repeat(405));
    await engineReady(page);
    await openNote(page);
    await app.evaluate(({ Menu }) => {
      Menu.prototype.popup = function (options) {
        if (options?.window) Reflect.set(options.window, "__huhuTestMenu", this);
        options?.callback?.();
      };
    });
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("菜单保存");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "F10" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "F10" });
    });
    const inspectMenu = () =>
      app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]!;
        const menu = Reflect.get(win, "__huhuTestMenu");
        const file = menu?.items.find((item: { label: string }) => item.label === "文件");
        return file?.submenu?.items.map((item: { id: string; label: string; enabled: boolean }) => ({ id: item.id || "", label: item.label, enabled: item.enabled })) ?? [];
      });
    await expect.poll(inspectMenu).toContainEqual({ id: "huhu-document-save", label: "保存当前文档", enabled: true });
    await app.evaluate(({ BrowserWindow }) => Reflect.deleteProperty(BrowserWindow.getAllWindows()[0]!, "__huhuTestMenu"));
    await page.getByTestId("app-menu-button").click();
    await expect.poll(inspectMenu).toContainEqual({ id: "huhu-document-save", label: "保存当前文档", enabled: true });
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      const file = Reflect.get(win, "__huhuTestMenu").items.find((item: { label: string }) => item.label === "文件");
      file.submenu.getMenuItemById("huhu-document-save").click();
    });
    await expect.poll(() => readFileSync(file, "utf8")).toContain("菜单保存");

    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    const source = await holdBridgeTimers(prose(page));
    await page.keyboard.insertText(last);
    await expect(prose(page)).toContainText(last);
    expect(await source()).not.toContain(last);
    await page.getByRole("button", { name: "huhu workbench 首页" }).click();
    await page.getByTestId("home-customize").click();
    await page.locator('[data-instance-id="default-focus"]').getByRole("checkbox", { name: "隐藏" }).check();
    const requestClose = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await requestClose();
    const decision = page.getByRole("dialog", { name: "关闭窗口前处理看板草稿" });
    await expect(decision).toBeVisible();
    expect(existsSync(layout)).toBe(false);
    expect(readFileSync(file, "utf8")).not.toContain(last);
    await decision.getByRole("button", { name: "继续编辑" }).click();
    await expect(decision).toHaveCount(0);
    expect(existsSync(layout)).toBe(false);
    await requestClose();
    await expect(decision).toBeVisible();
    const closed = page.waitForEvent("close");
    await decision.getByTestId("home-dashboard-save-leave").click();
    await closed;
    expect(JSON.parse(readFileSync(layout, "utf8")).instances).toContainEqual(expect.objectContaining({ instanceId: "default-focus", hidden: true }));
    expect(readFileSync(file, "utf8")).toContain(last);
  } finally {
    if (!page.isClosed()) {
      await page
        .getByRole("button", { name: "继续编辑", exact: true })
        .click({ timeout: 500 })
        .catch(() => undefined);
      await page
        .getByRole("button", { name: "取消编辑", exact: true })
        .click({ timeout: 500 })
        .catch(() => undefined);
    }
    await close();
  }
});

test("B09：等待富文本和源码写入回执才切模式，三种视图共用属性和正文", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, name);
  const baseline = "---\ntitle: 原题\n---\n\n" + original;
  let reached = false;
  const release = Promise.withResolvers<void>();
  try {
    writeFileSync(file, baseline);
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    await inputWithPendingBridge(page);
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (request.capability === "notes.save" && request.input?.path === name) {
        reached = true;
        await release.promise;
      }
      await route.continue();
    });
    const mode = (label: string) => page.getByRole("tab", { name: label, exact: true });
    await mode("源码").click();
    await expect.poll(() => reached, { timeout: 3000 }).toBe(true);
    await expect(mode("实时预览")).toHaveAttribute("aria-selected", "true");
    expect(readFileSync(file, "utf8")).toBe(baseline);
    release.resolve();

    const source = page.getByTestId("markdown-editor").locator(".cm-content");
    await expect(source).toContainText(last);
    expect(readFileSync(file, "utf8")).toBe("---\ntitle: 原题\n---\n\n" + written);
    const updated = "---\ntitle: 新题\n---\n\n" + written.replace(last, "源码改写");
    await source.click();
    await source.press("ControlOrMeta+a");
    await page.keyboard.insertText(updated);
    await mode("阅读").click();
    await expect(page.getByTestId("notes-reading-pane")).toBeVisible();
    await expect(prose(page)).toContainText("源码改写");
    expect(readFileSync(file, "utf8")).toBe(updated);
    await mode("实时预览").click();
    await expect(page.getByTestId("editor-properties")).toBeVisible();
    await expect(prose(page)).toContainText("源码改写");
    await mode("阅读").click();
    await mode("源码").click();
    await expect(source).toContainText("title: 新题");
  } finally {
    release.resolve();
    await close();
  }
});

test("B09 / F10：关闭载入中的文件后，迟到回执不能改写另一篇或重开的同路径文档", async () => {
  const { page, vault, close } = await openApp();
  const slow = path.join(vault, "等待读取.md");
  const released = Promise.withResolvers<void>();
  let captured = false;
  let delivered = false;
  try {
    writeFileSync(slow, "# 等待读取\n\n第一次读取\n");
    writeFileSync(path.join(vault, "正在编辑.md"), "# 正在编辑\n\n第二篇\n");
    await engineReady(page);
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeSettled(page);
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (captured || request.capability !== "notes.read" || request.input?.path !== "等待读取.md") return route.continue();
      const response = await route.fetch();
      captured = true;
      await released.promise;
      await route.fulfill({ response });
      delivered = true;
    });
    await treeItem(page, "等待读取.md").click();
    await expect.poll(() => captured).toBe(true);
    await page.getByRole("button", { name: "关闭 等待读取", exact: true }).click();
    await treeItem(page, "正在编辑.md").click();
    await expect(prose(page)).toContainText("第二篇");
    await expect(prose(page)).not.toContainText("第一次读取");
    writeFileSync(slow, "# 等待读取\n\n第二次读取\n");
    await treeItem(page, "等待读取.md").click();
    await expect(prose(page)).toContainText("第二次读取");
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("当前编辑");
    released.resolve();
    await expect.poll(() => delivered).toBe(true);
    await expect(prose(page)).toContainText("第二次读取当前编辑");
    await expect(prose(page)).not.toContainText("第一次读取");
    await expect(prose(page)).toBeFocused();
    await expect.poll(() => readFileSync(slow, "utf8")).toContain("第二次读取当前编辑");
  } finally {
    released.resolve();
    await close();
  }
});

test("B09：工具栏切换富文本、源码与阅读时保留当前章节", async () => {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, name);
  const text = Array.from({ length: 90 }, (_, i) => `## 章节 ${i + 1}\n\n正文段落 ${i + 1}。\n\n`).join("");
  try {
    writeFileSync(file, text);
    await engineReady(page);
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, name).click();
    const scroller = page.getByTestId("editor-scroll-container");
    const chapter = "章节 60";
    const heading = prose(page).getByRole("heading", { name: chapter, exact: true });
    await heading.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const mode = (label: string) => page.getByRole("tab", { name: label, exact: true });
    await mode("源码").click();
    await expect(mode("源码")).toHaveAttribute("aria-selected", "true");
    const source = scroller.getByText(`## ${chapter}`, { exact: true });
    await expect(source).toBeInViewport();
    await mode("阅读").click();
    await expect(page.getByTestId("notes-reading-pane")).toBeVisible();
    await expect(heading).toBeInViewport();
    await mode("实时预览").click();
    await expect(heading).toBeInViewport();
    expect(readFileSync(file, "utf8")).toBe(text);
  } finally {
    await close();
  }
});

test("A08：移父目录前结算活动 TXT，后台 Markdown 与 JSON 草稿迁至新路径", async () => {
  const { page, vault, close } = await openApp();
  const before = "待移动";
  const after = `目的地/${before}`;
  const files = { "后台.md": original, "后台.json": '{"start":true}\n', "活动.txt": "原始文本" };
  let failSave = true;
  try {
    mkdirSync(path.join(vault, before));
    for (const [filename, text] of Object.entries(files)) writeFileSync(path.join(vault, before, filename), text);
    await engineReady(page);
    await call(page, "folders.create", { path: "目的地" });
    await manualSave(page);
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeFolder(page, before).click();
    await treeSettled(page);
    const type = async (locator: ReturnType<Page["locator"]>, text: string) => {
      await locator.click();
      await locator.press("ControlOrMeta+End");
      await page.keyboard.insertText(text);
    };
    await treeItem(page, "后台.md").click();
    await type(prose(page), "Markdown末字");
    await treeItem(page, "后台.json").click();
    const plain = page.locator(".cm-content");
    await type(plain, "JSON末字");
    await treeItem(page, "活动.txt").click();
    await type(plain, "TXT末字");
    const draft = async (folder: string, filename: string) => (await call<{ text: string } | null>(page, "notes.draft.get", { path: `${folder}/${filename}` }))?.text;
    await expect.poll(() => draft(before, "后台.md")).toContain("Markdown末字");
    await expect.poll(() => draft(before, "后台.json")).toBe(files["后台.json"] + "JSON末字");
    await page.route("**/api/v1/call", (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (!failSave || request.capability !== "notes.save" || request.input?.path !== `${before}/活动.txt`) return route.continue();
      return route.fulfill({ json: { ok: false, error: { code: "INTERNAL", message: "测试：TXT 磁盘写入失败" } } });
    });
    await treeMenu(page, treeFolder(page, before), "移动到…");
    await page.getByLabel("文件夹", { exact: true }).selectOption("目的地");
    const move = page.getByRole("button", { name: "移动", exact: true });
    await move.click();
    await expect(page.getByRole("dialog", { name: "移动文件" }).getByRole("alert")).toContainText("打开的文档有未保存的修改且无法落盘");
    expect(existsSync(path.join(vault, after))).toBe(false);
    expect(readFileSync(path.join(vault, before, "活动.txt"), "utf8")).toBe(files["活动.txt"]);
    failSave = false;
    await move.click();
    await expect.poll(() => existsSync(path.join(vault, after, "活动.txt"))).toBe(true);
    expect(readFileSync(path.join(vault, after, "活动.txt"), "utf8")).toBe(files["活动.txt"] + "TXT末字");
    expect(readFileSync(path.join(vault, after, "后台.md"), "utf8")).toBe(files["后台.md"]);
    expect(readFileSync(path.join(vault, after, "后台.json"), "utf8")).toBe(files["后台.json"]);
    expect(await draft(before, "后台.md")).toBeUndefined();
    expect(await draft(before, "后台.json")).toBeUndefined();
    expect(await draft(after, "后台.json")).toBe(files["后台.json"] + "JSON末字");
    const tabs = page.getByTestId("document-tabs");
    await tabs.getByTitle(`${after}/后台.md`, { exact: true }).click();
    await page.getByTestId("note-draft-restore").click();
    await expect(prose(page)).toContainText("Markdown末字");
    await tabs.getByTitle(`${after}/后台.json`, { exact: true }).click();
    await page.getByTestId("note-draft-restore").click();
    await expect(plain).toContainText("JSON末字");
    expect(readFileSync(path.join(vault, after, "后台.json"), "utf8")).toBe(files["后台.json"]);
  } finally {
    await close();
  }
});

test("A08：文件操作结果返回前暂停编辑，返回后输入写入新路径", async () => {
  const { page, vault, close } = await openApp();
  const renamed = "已重命名.md";
  const before = path.join(vault, name);
  const after = path.join(vault, renamed);
  const release = Promise.withResolvers<void>();
  let held = false;
  try {
    writeFileSync(before, original);
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (request.capability !== "notes.rename" || request.input?.path !== name) return route.continue();
      const response = await route.fetch();
      held = true;
      await release.promise;
      await route.fulfill({ response });
    });
    await treeRename(page, treeItem(page, name), renamed.slice(0, -3));
    await expect.poll(() => held).toBe(true);
    expect(existsSync(before)).toBe(false);
    expect(readFileSync(after, "utf8")).toBe(original);

    const editor = prose(page);
    const tabs = page.getByTestId("document-tabs");
    await expect(tabs.getByTitle(name, { exact: true })).toBeVisible();
    await expect(editor).toContainText("初始正文");
    await editor.evaluate((element) => (element as HTMLElement).focus());
    await expect(editor).not.toBeFocused();
    await page.keyboard.insertText("不应写入旧路径");
    await expect(editor).not.toContainText("不应写入旧路径");

    release.resolve();
    await expect(tabs.getByTitle(renamed, { exact: true })).toBeVisible();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("新路径的输入");
    await expect(editor).toContainText("初始正文新路径的输入");
    await page.getByTestId("note-save").click();
    await expect.poll(() => readFileSync(after, "utf8")).toBe(original.replace("初始正文", "初始正文新路径的输入"));
    expect(existsSync(before)).toBe(false);
    expect(await call(page, "notes.draft.get", { path: name })).toBeNull();
  } finally {
    release.resolve();
    await close();
  }
});

for (const removal of ["移动", "删除"] as const) {
  test(`C06：正文写入失败可重试；外部${removal}后保留脏稿并可恢复`, async () => {
    const { page, vault, close } = await openApp();
    const file = path.join(vault, name);
    const moved = path.join(vault, "移走后的文件.md");
    let failSave = true;
    try {
      writeFileSync(file, original);
      await engineReady(page);
      await manualSave(page);
      await openNote(page);
      await inputWithPendingBridge(page);
      await page.route("**/api/v1/call", (route) => {
        const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
        if (!failSave || request.capability !== "notes.save" || request.input?.path !== name) return route.continue();
        return route.fulfill({ json: { ok: false, error: { code: "INTERNAL", message: "测试：正文 EIO" } } });
      });
      await page.getByTestId("note-save").click();
      await expect(page.getByText("保存失败：测试：正文 EIO")).toBeVisible();
      await expect(prose(page)).toContainText(last);
      expect(readFileSync(file, "utf8")).toBe(original);
      failSave = false;
      await page.getByTestId("note-save").click();
      await expect.poll(() => readFileSync(file, "utf8")).toBe(written);

      await prose(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText("外移前的脏稿");
      if (removal === "移动") renameSync(file, moved);
      else rmSync(file);
      await expect(page.getByText(`文件已移走或删除：${name}`, { exact: true })).toBeVisible();
      await expect.poll(async () => (await call<{ text: string } | null>(page, "notes.draft.get", { path: name }))?.text).toBe(written.replace(last, last + "外移前的脏稿"));
      expect(existsSync(file)).toBe(false);
      if (removal === "移动") expect(readFileSync(moved, "utf8")).toBe(written);
      await expect(page.getByRole("button", { name: "关闭 退出交付", exact: true })).toHaveCount(0);
      await call(page, "notes.create", { name: name.slice(0, -3) });
      const { version } = await call<{ version: string }>(page, "notes.read", { path: name });
      await call(page, "notes.save", { path: name, text: written, expectedVersion: version });
      await treeSettled(page);
      await openNote(page);
      await page.getByTestId("note-draft-restore").click();
      await expect(prose(page)).toContainText("外移前的脏稿");
      expect(readFileSync(file, "utf8")).toBe(written);
    } finally {
      await close();
    }
  });
}

for (const autosave of [true, false]) {
  test(`C06 结算待定时退出并重启（${autosave ? "自动保存" : "恢复草稿"}）`, async () => {
    const { app, page, vault, close } = await openApp();
    const file = path.join(vault, name);
    try {
      writeFileSync(file, original);
      await engineReady(page);
      if (!autosave) await manualSave(page);
      await openNote(page);
      await inputWithPendingBridge(page);
      await app.close();
      const disk = readFileSync(file, "utf8");
      expect(disk).toBe(autosave ? written : original);
      const reopened = await openApp({ HUHU_VAULT: vault });
      try {
        await engineReady(reopened.page);
        expect(await reopened.page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(vault);
        if (!autosave) expect((await call<{ text: string }>(reopened.page, "notes.draft.get", { path: name })).text).toBe(written);
        await reopenFromSearch(reopened.page);
        if (!autosave) await reopened.page.getByTestId("note-draft-restore").click();
        await expect(prose(reopened.page)).toContainText(`初始正文${first}${last}`, { timeout: 5000 });
        expect(readFileSync(file, "utf8")).toBe(disk);
      } finally {
        await reopened.close();
      }
    } finally {
      await close();
    }
  });
}

test("C06 切笔记排空待结算文本，无编辑重开保留字节和 mtime", async () => {
  const { page, vault, close } = await openApp();
  try {
    const file = path.join(vault, name);
    writeFileSync(file, original);
    writeFileSync(path.join(vault, "别篇.md"), "别篇内容\n");
    await engineReady(page);
    await openNote(page);
    await inputWithPendingBridge(page);
    await treeItem(page, "别篇.md").click();
    await expect.poll(() => readFileSync(file, "utf8")).toBe(written);
    const mtime = statSync(file).mtimeMs;
    await treeItem(page, name).click();
    await expect(prose(page)).toContainText(last);
    await page.getByRole("button", { name: "关闭 退出交付", exact: true }).click();
    await treeItem(page, name).click();
    await expect(prose(page)).toContainText(last);
    expect(readFileSync(file, "utf8")).toBe(written);
    expect(statSync(file).mtimeMs).toBe(mtime);
  } finally {
    await close();
  }
});

test("C06 切 Vault 前从尚未报告 dirty 的编辑器收集修改", async () => {
  const { app, page, vault, close } = await openApp();
  const otherVault = mkdtempSync(path.join(tmpdir(), "huhu-c06-other-"));
  try {
    const file = path.join(vault, name);
    // 401 个以上顶层块走桥原有的慢结算路径，第一次编辑即可保持源缓冲干净。
    const clean = original + "\n独立段落\n".repeat(405);
    writeFileSync(file, clean);
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    await prose(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    const source = await holdBridgeTimers(prose(page));
    await page.keyboard.insertText(last);
    await expect(prose(page)).toContainText(last);
    expect(await source()).not.toContain(last);
    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, otherVault);
    await page.getByRole("button", { name: "切换 Vault", exact: true }).click();
    await page.getByTestId("vault-open-other").click();
    await expect(page.getByTestId("svault-dirty-list")).toContainText(name);
    expect(await source()).toContain(last);
    await Promise.all([page.waitForEvent("load"), page.getByTestId("svault-switch-draft").click()]);
    await engineReady(page);
    expect(await page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(otherVault);
    expect(readFileSync(file, "utf8")).toBe(clean);
    await page.getByRole("button", { name: "切换 Vault", exact: true }).click();
    await page
      .getByTestId("vault-recent-item")
      .filter({ hasText: path.basename(vault) })
      .click();
    await Promise.all([page.waitForEvent("load"), page.getByTestId("svault-switch-confirm").click()]);
    await engineReady(page);
    expect(await page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(vault);
    const draft = await call<{ text: string }>(page, "notes.draft.get", { path: name });
    expect(draft.text).toContain(last);
    await reopenFromSearch(page);
    await page.getByTestId("note-draft-restore").click();
    await expect(prose(page)).toContainText(last);
  } finally {
    await close();
    rmTree(otherVault);
  }
});

for (const leave of ["打开设置", "切换笔记", "关闭标签"] as const) {
  test(`C06 手动保存模式：${leave}留下全文草稿，显式重开后可以恢复`, async () => {
    const { page, vault, close } = await openApp();
    const file = path.join(vault, name);
    try {
      writeFileSync(file, original);
      writeFileSync(path.join(vault, "别篇.md"), "别篇内容\n");
      await engineReady(page);
      await manualSave(page);
      await openNote(page);
      await inputWithPendingBridge(page);
      if (leave === "打开设置") {
        await page.getByRole("button", { name: "设置", exact: true }).first().click();
        await expect(page.getByTestId("notes-module")).toBeHidden();
      } else if (leave === "切换笔记") {
        await treeItem(page, "别篇.md").click();
        await expect(prose(page)).toContainText("别篇内容");
      } else {
        await page.getByRole("button", { name: "关闭 退出交付", exact: true }).click();
        await expect(prose(page)).toHaveCount(0);
      }
      await expect.poll(async () => (await call<{ text: string } | null>(page, "notes.draft.get", { path: name }))?.text).toBe(written);
      expect(readFileSync(file, "utf8")).toBe(original);

      if (leave === "打开设置") {
        await page.getByRole("button", { name: "知识库", exact: true }).first().click();
      } else {
        await openNote(page);
      }
      const restore = page.getByTestId("note-draft-restore");
      await expect(restore).toBeVisible();
      await expect(prose(page)).not.toContainText(last);
      await restore.click();
      await expect(prose(page)).toContainText(`初始正文${first}${last}`);
      expect(readFileSync(file, "utf8")).toBe(original);
    } finally {
      await close();
    }
  });
}

for (const phase of ["notes.draft.save", "notes.read"] as const) {
  test(`C06 设置返回：${phase} 在途的新输入留在编辑器和草稿`, async () => {
    const { page, vault, close } = await openApp();
    const file = path.join(vault, name);
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const fresh = "返回后的新内容";
    let pause = false;
    let writes = 0;
    try {
      writeFileSync(file, original);
      await engineReady(page);
      await manualSave(page);
      await openNote(page);
      const editor = prose(page);
      await editor.getByText("初始正文", { exact: true }).click();
      await page.keyboard.press("End");
      await page.keyboard.insertText(first);
      await expect(editor.getByText(`初始正文${first}`, { exact: true })).toBeVisible();
      await expect(page.getByTestId("save-state")).toHaveText("未保存修改");
      await page.route("**/api/v1/call", async (route) => {
        const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
        if (request.input?.path === name) {
          if (request.capability === "notes.draft.save") writes++;
          if (pause && request.capability === phase) {
            pause = false;
            reached.resolve();
            await release.promise;
          }
        }
        await route.continue();
      });
      pause = phase === "notes.draft.save";
      await page.getByRole("button", { name: "设置", exact: true }).first().click();
      if (phase === "notes.read") {
        await expect.poll(async () => (await call<{ text: string } | null>(page, "notes.draft.get", { path: name }))?.text).toContain(first);
        pause = true;
      } else {
        await reached.promise;
      }
      await page.getByRole("button", { name: "知识库", exact: true }).first().click();
      await reached.promise;
      await editor.getByText(`初始正文${first}`, { exact: true }).click();
      await page.keyboard.press("End");
      await page.keyboard.insertText(fresh);
      await expect(editor.getByText(`初始正文${first}${fresh}`, { exact: true })).toBeVisible();
      release.resolve();
      const expected = original.replace("初始正文", `初始正文${first}${fresh}`);
      await expect.poll(async () => (await call<{ text: string } | null>(page, "notes.draft.get", { path: name }))?.text).toBe(expected);
      await expect(editor).toContainText(fresh);
      expect(writes).toBe(2);
      expect(readFileSync(file, "utf8")).toBe(original);

      await page.getByRole("button", { name: "关闭 退出交付", exact: true }).click();
      await openNote(page);
      await page.getByTestId("note-draft-restore").click();
      await expect(editor).toContainText(fresh);
      expect(readFileSync(file, "utf8")).toBe(original);
    } finally {
      release.resolve();
      await page.unrouteAll({ behavior: "wait" });
      await close();
    }
  });
}

test("C06 退出前草稿写入失败时保留窗口，可再次关闭并保存草稿", async () => {
  const { app, page, vault, close } = await openApp();
  const file = path.join(vault, name);
  let failDraft = true;
  try {
    writeFileSync(file, original);
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    await inputWithPendingBridge(page);
    await app.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBox = (async () => {
        BrowserWindow.getAllWindows()[0]?.setTitle("测试：退出保存失败");
        return { response: 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
    });
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (!failDraft || request.capability !== "notes.draft.save" || request.input?.path !== name) return route.continue();
      await route.fulfill({ status: 200, json: { ok: false, error: { code: "INTERNAL", message: "测试草稿写入失败" } } });
    });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()), { timeout: 10_000 }).toBe("测试：退出保存失败");
    await expect(prose(page)).toContainText(last);
    expect(readFileSync(file, "utf8")).toBe(original);

    failDraft = false;
    await page.unrouteAll({ behavior: "wait" });
    await Promise.all([app.waitForEvent("close"), app.evaluate(({ app }) => app.quit())]);
    expect(readFileSync(file, "utf8")).toBe(original);
    const reopened = await openApp({ HUHU_VAULT: vault });
    try {
      await engineReady(reopened.page);
      expect(await reopened.page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(vault);
      expect((await call<{ text: string } | null>(reopened.page, "notes.draft.get", { path: name }))?.text).toBe(written);
    } finally {
      await reopened.close();
    }
  } finally {
    failDraft = false;
    await close();
  }
});

test("TB-14/15 关窗缺少保存回执时保留编辑和 Engine", async () => {
  const { app, page, vault, close } = await openApp();
  const file = path.join(vault, name);
  const releaseSave = Promise.withResolvers<void>();
  try {
    writeFileSync(file, original);
    await engineReady(page);
    await openNote(page);
    await app.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBox = (async () => {
        BrowserWindow.getAllWindows()[0]?.setTitle("测试：未收到保存回执");
        return { response: 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
    });
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (request.capability === "notes.save" && request.input?.path === name) await releaseSave.promise;
      await route.continue();
    });
    await inputWithPendingBridge(page);

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()), { timeout: 10_000 }).toBe("测试：未收到保存回执");
    await expect(prose(page)).toContainText(last);
    expect((await call<{ id: string }>(page, "vault.info", {})).id).toBeTruthy();
    expect(readFileSync(file, "utf8")).toBe(original);

    releaseSave.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await Promise.all([app.waitForEvent("close"), app.evaluate(({ app }) => app.quit())]);
    const reopened = await openApp({ HUHU_VAULT: vault });
    try {
      await engineReady(reopened.page);
      expect(readFileSync(file, "utf8")).toBe(written);
      await reopenFromSearch(reopened.page);
      await expect(prose(reopened.page)).toContainText(last);
    } finally {
      await reopened.close();
    }
  } finally {
    releaseSave.resolve();
    await close();
  }
});

test("TB-15 顶层重载结束旧一轮关窗检查", async () => {
  const { app, page, close } = await openApp();
  try {
    await engineReady(page);
    const result = await app.evaluate(async ({ BrowserWindow, dialog, ipcMain }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      const sender = win.webContents;
      const send = sender.send;
      const showMessageBox = dialog.showMessageBox;
      let prompts = 0;
      dialog.showMessageBox = (async () => {
        prompts++;
        return { response: 0, checkboxChecked: false };
      }) as typeof showMessageBox;
      sender.send = (channel, ...args) => {
        if (channel !== "huhu:flush") send.call(sender, channel, ...args);
      };
      const before = ipcMain.listenerCount("huhu:flushed");
      const navigation = new Promise<void>((resolve) => sender.once("did-start-navigation", () => resolve()));
      try {
        win.close();
        const pending = ipcMain.listenerCount("huhu:flushed");
        sender.reload();
        await navigation;
        await Promise.resolve();
        return { pending: pending - before, remaining: ipcMain.listenerCount("huhu:flushed") - before, prompts, closed: win.isDestroyed() };
      } finally {
        sender.send = send;
        dialog.showMessageBox = showMessageBox;
      }
    });
    expect(result).toEqual({ pending: 1, remaining: 0, prompts: 0, closed: false });
    await engineReady(page);
    expect((await call<{ id: string }>(page, "vault.info", {})).id).toBeTruthy();
  } finally {
    await close();
  }
});

test("TB-15 应用退出接管在途关窗，另一窗口取消时保留已确认窗口", async () => {
  const { app, page, vault, close } = await openApp();
  const file = path.join(vault, name);
  try {
    writeFileSync(file, original);
    await engineReady(page);
    const result = await app.evaluate(
      async ({ app: nativeApp, BrowserWindow, ipcMain }, preload) => {
        const first = BrowserWindow.getAllWindows()[0]!;
        const origin = first.webContents;
        const fixture = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true } });
        await fixture.loadURL(origin.getURL());
        const originalSend = origin.send;
        const awaitingChoice = Promise.withResolvers<number>();
        const acknowledged = Promise.withResolvers<boolean>();
        const onReply = (event: Electron.IpcMainEvent, _id: number, saved: boolean) => {
          if (event.sender === origin) acknowledged.resolve(saved);
        };
        let requests = 0;
        origin.send = (channel, ...args) => {
          if (channel === "huhu:flush") requests++;
          originalSend.call(origin, channel, ...args);
        };
        const other = fixture.webContents;
        const otherSend = other.send;
        const reply = { sender: other, senderFrame: other.mainFrame };
        other.send = (channel, ...args) => {
          if (channel !== "huhu:flush") {
            otherSend.call(other, channel, ...args);
            return;
          }
          const id = args[0] as number;
          ipcMain.emit("huhu:exit-progress", reply, id, "waiting");
          awaitingChoice.resolve(id);
        };
        ipcMain.on("huhu:flushed", onReply);
        try {
          first.close();
          nativeApp.quit();
          const id = await awaitingChoice.promise;
          const saved = await acknowledged.promise;
          const during = !first.isDestroyed() && !fixture.isDestroyed();
          const frozen = (await origin.executeJavaScript("document.body.inert")) as boolean;
          ipcMain.emit("huhu:flushed", reply, id, "stay");
          await new Promise<void>((resolve) => setImmediate(resolve));
          return { saved, requests, during, frozen, after: !first.isDestroyed() && !fixture.isDestroyed() };
        } finally {
          ipcMain.off("huhu:flushed", onReply);
          if (!first.isDestroyed()) origin.send = originalSend;
          fixture.destroy();
        }
      },
      path.join(root, "out/preload/index.cjs"),
    );
    expect(result).toEqual({ saved: true, requests: 1, during: true, frozen: true, after: true });
    await expect.poll(() => page.evaluate(() => document.body.inert)).toBe(false);
    expect((await call<{ id: string }>(page, "vault.info", {})).id).toBeTruthy();
    await openNote(page);
    await inputWithPendingBridge(page);
    await Promise.all([app.waitForEvent("close"), app.evaluate(({ app }) => app.quit())]);
    expect(readFileSync(file, "utf8")).toBe(written);
  } finally {
    await close();
  }
});

test("TB-15 参与者失败或超时保留窗口，旧许可不能结束当前检查", async () => {
  const { app, page, close } = await openApp();
  try {
    await engineReady(page);
    const outcomes = await app.evaluate(async ({ BrowserWindow, ipcMain, dialog }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      const sender = win.webContents;
      const frame = { sender, senderFrame: sender.mainFrame };
      const originalSend = sender.send;
      const originalDialog = dialog.showMessageBox;
      const outcomes: string[] = [];
      let prompts = 0;
      let previous: number | undefined;
      dialog.showMessageBox = (async () => {
        prompts++;
        return { response: 0, checkboxChecked: false };
      }) as typeof originalDialog;
      try {
        for (const mode of ["stay", "failure", "timeout"]) {
          const released = Promise.withResolvers<number>();
          sender.send = (channel, ...args) => {
            const id = args[0] as number;
            if (channel === "huhu:exit-release") {
              released.resolve(id);
              return;
            }
            if (channel !== "huhu:flush") {
              originalSend.call(sender, channel, ...args);
              return;
            }
            if (previous !== undefined) {
              ipcMain.emit("huhu:exit-progress", frame, previous, "flushing");
              ipcMain.emit("huhu:flushed", frame, previous, true);
            }
            ipcMain.emit("huhu:exit-progress", frame, id, "checking");
            if (mode !== "timeout") ipcMain.emit("huhu:flushed", frame, id, mode === "stay" ? "stay" : false);
          };
          win.close();
          previous = await released.promise;
          if (!win.isDestroyed()) outcomes.push(mode);
        }
        return { outcomes, prompts };
      } finally {
        sender.send = originalSend;
        dialog.showMessageBox = originalDialog;
      }
    });
    expect(outcomes).toEqual({ outcomes: ["stay", "failure", "timeout"], prompts: 0 });
    expect((await call<{ id: string }>(page, "vault.info", {})).id).toBeTruthy();
  } finally {
    await close();
  }
});

test("TB-15 工作台失联时可重新加载，仍保留窗口和 Vault", async () => {
  const { app, page, close } = await openApp();
  try {
    await engineReady(page);
    await app.evaluate(({ BrowserWindow, dialog }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      const sender = win.webContents;
      const send = sender.send;
      const prompt = dialog.showMessageBox;
      sender.send = (channel, ...args) => {
        if (channel !== "huhu:flush") send.call(sender, channel, ...args);
      };
      dialog.showMessageBox = (async (_win: Electron.BrowserWindow, options: Electron.MessageBoxOptions) => {
        sender.send = send;
        dialog.showMessageBox = prompt;
        if (options.title !== "无法确认退出") throw new Error(`Unexpected dialog: ${options.title}`);
        return { response: 1, checkboxChecked: false };
      }) as typeof prompt;
      win.close();
    });
    await page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
    await engineReady(page);
    expect((await call<{ id: string }>(page, "vault.info", {})).id).toBeTruthy();
  } finally {
    await close();
  }
});

test("TB-15 启动页资源加载失败且无 Vault 时可关闭", async () => {
  const { app, page, close } = await openApp({ HUHU_VAULT: "" });
  try {
    await expect(page.getByTestId("vault-launch")).toBeVisible();
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      await win.loadURL("data:text/html,Startup%20failure%20fixture");
    });
    await Promise.all([app.waitForEvent("close"), app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())]);
  } finally {
    await close();
  }
});
