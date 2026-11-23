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

async function setAutosave(page: Page, enabled: boolean): Promise<void> {
  await page.getByRole("button", { name: "设置", exact: true }).first().click();
  await page.getByTestId("settings-nav-editor").click();
  const autosave = page.getByRole("switch", { name: "自动保存" });
  if ((await autosave.isChecked()) !== enabled) await autosave.click();
  await expect(autosave).toBeChecked({ checked: enabled });
}

const manualSave = (page: Page) => setAutosave(page, false);

async function checkManualSaveReceipt(saveWhileFirstInFlight: boolean): Promise<void> {
  const { page, vault, close } = await openApp();
  const file = path.join(vault, name);
  const firstWrite = original.replace("初始正文", `初始正文${first}`);
  const later = "保存期间的输入";
  const secondWrite = original.replace("初始正文", `初始正文${first}${later}`);
  const latest = "第二次保存后的输入";
  const thirdWrite = secondWrite.replace(later, later + latest);
  try {
    writeFileSync(file, original);
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    const gate = await page.evaluateHandle((notePath) => {
      const fetch = window.fetch;
      const release = Promise.withResolvers<void>();
      const writes: string[] = [];
      let held = false;
      let receiptsRead = 0;
      window.fetch = async (input, init) => {
        if (typeof input !== "string" || !input.endsWith("/api/v1/call") || typeof init?.body !== "string") return fetch.call(window, input, init);
        const request = JSON.parse(init.body) as { capability: string; input?: { path?: string; text?: string } };
        if (request.capability !== "notes.save" || request.input?.path !== notePath || typeof request.input.text !== "string") return fetch.call(window, input, init);
        writes.push(request.input.text);
        const firstRequest = writes.length === 1;
        const response = await fetch.call(window, input, init);
        const readJson = response.json.bind(response);
        response.json = async () => {
          const body: unknown = await readJson();
          // 让当前渲染器任务先处理真实回执及随后的保存微任务。
          requestAnimationFrame(() => {
            receiptsRead++;
          });
          return body;
        };
        if (firstRequest) {
          held = true;
          await release.promise;
        }
        return response;
      };
      return {
        snapshot: () => ({ held, receiptsRead, writes }),
        release: release.resolve,
        restore: () => {
          window.fetch = fetch;
          release.resolve();
        },
      };
    }, name);
    try {
      const editor = prose(page);
      const save = page.getByTestId("note-save");
      const state = page.getByTestId("save-state");
      const currentSave = () => gate.evaluate((gate) => gate.snapshot());
      await editor.getByText("初始正文", { exact: true }).click();
      await page.keyboard.press("End");
      await page.keyboard.insertText(first);
      await save.click();
      await expect.poll(currentSave).toEqual({ held: true, receiptsRead: 0, writes: [firstWrite] });
      await expect(state).toHaveText("保存中…");
      expect(readFileSync(file, "utf8")).toBe(firstWrite);

      await editor.getByText(`初始正文${first}`, { exact: true }).click();
      await page.keyboard.press("End");
      await page.keyboard.insertText(later);
      await expect(editor).toContainText(`初始正文${first}${later}`);
      await expect(state).toHaveText("未保存修改");
      if (saveWhileFirstInFlight) {
        await save.click();
        await editor.getByText(`初始正文${first}${later}`, { exact: true }).click();
        await page.keyboard.press("End");
        await page.keyboard.insertText(latest);
        // 状态栏按会话正文计数，等第三段输入从编辑器交给会话。
        await expect(page.getByText(`${thirdWrite.replace(/\s/g, "").length} 字`, { exact: true })).toBeVisible();
        expect((await currentSave()).writes).toEqual([firstWrite]);
      }
      await gate.evaluate((gate) => gate.release());
      await expect.poll(async () => (await currentSave()).receiptsRead).toBe(saveWhileFirstInFlight ? 2 : 1);
      const acknowledgedWrites = saveWhileFirstInFlight ? [firstWrite, secondWrite] : [firstWrite];
      expect((await currentSave()).writes).toEqual(acknowledgedWrites);
      await expect(state).toHaveText("未保存修改");
      expect(readFileSync(file, "utf8")).toBe(acknowledgedWrites.at(-1));

      await save.click();
      await expect(state).toHaveText("已保存");
      const finalWrite = saveWhileFirstInFlight ? thirdWrite : secondWrite;
      expect((await currentSave()).writes).toEqual([...acknowledgedWrites, finalWrite]);
      expect(readFileSync(file, "utf8")).toBe(finalWrite);
    } finally {
      await gate.evaluate((gate) => gate.restore());
      await gate.dispose();
    }
  } finally {
    await close();
  }
}

test("C06 手动保存回执在途时继续输入，下一次点击才写入新内容", () => checkManualSaveReceipt(false));
test("C06 两次手动保存重叠时，各自只写入触发时的正文", () => checkManualSaveReceipt(true));

test("C06 停放恢复读盘在途时保留富文本组合输入，条件保存仍保护磁盘新版", async () => {
  const { page, vault, close } = await openApp({}, (vault) => writeFileSync(path.join(vault, name), original));
  const file = path.join(vault, name);
  const outside = "外部写入的新正文";
  const diskText = original.replace("初始正文", outside);
  const preedit = "nihao";
  const committed = "你好";
  try {
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    const { version } = await call<{ version: string }>(page, "notes.read", { path: name });
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await expect(page.getByTestId("notes-module")).toHaveCount(0);
    await call(page, "notes.save", { path: name, text: diskText, expectedVersion: version });
    expect(readFileSync(file, "utf8")).toBe(diskText);

    const gate = await page.evaluateHandle(
      ({ notePath, diskText }) => {
        const fetch = window.fetch;
        const release = Promise.withResolvers<void>();
        const returned = Promise.withResolvers<void>();
        let held = false;
        window.fetch = async (input, init) => {
          const response = await fetch.call(window, input, init);
          if (typeof input !== "string" || !input.endsWith("/api/v1/call") || typeof init?.body !== "string") return response;
          const request = JSON.parse(init.body) as { capability: string; input?: { path?: string } };
          if (request.capability !== "notes.read" || request.input?.path !== notePath) return response;
          const readJson = response.json.bind(response);
          response.json = async () => {
            const result = (await readJson()) as { ok: boolean; data?: { text?: string } };
            if (result.ok && result.data?.text === diskText) {
              held = true;
              await release.promise;
              // 让调用方的微任务与随后的渲染提交先处理正文回执。
              requestAnimationFrame(() => requestAnimationFrame(() => returned.resolve()));
            }
            return result;
          };
          return response;
        };
        return {
          held: () => held,
          release: () => {
            release.resolve();
            return returned.promise;
          },
          restore: () => {
            window.fetch = fetch;
            release.resolve();
          },
        };
      },
      { notePath: name, diskText },
    );

    try {
      await openNote(page);
      await expect.poll(() => gate.evaluate((gate) => gate.held())).toBe(true);
      const editor = prose(page);
      const state = page.getByTestId("save-state");
      await editor.getByText("初始正文", { exact: true }).click();
      await page.keyboard.press("End");
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send("Input.imeSetComposition", { text: preedit, selectionStart: preedit.length, selectionEnd: preedit.length });
        await expect(editor).toContainText(`初始正文${preedit}`);
        await expect.poll(() => editor.evaluate((element: HTMLElement & { editor?: { state: { doc: { textContent: string } } } }) => element.editor?.state.doc.textContent)).toContain(preedit);
        await expect(state).toHaveText("已保存");
        await gate.evaluate((gate) => gate.release());
        await expect(editor).toContainText(`初始正文${preedit}`);
        await cdp.send("Input.insertText", { text: committed });
      } finally {
        await cdp.detach();
      }

      await expect(editor).toContainText(`初始正文${committed}`);
      await expect(editor).not.toContainText(preedit);
      await expect(state).toHaveText(/未保存修改|文件已被外部修改/);
      if ((await state.textContent()) === "未保存修改") await page.getByTestId("note-save").click();
      await expect(state).toHaveText("文件已被外部修改");
      expect(readFileSync(file, "utf8")).toBe(diskText);
      await page.getByTestId("note-keep-mine").click();
      await page.getByTestId("note-save").click();
      await expect(state).toHaveText("已保存");
      expect(readFileSync(file, "utf8")).toBe(original.replace("初始正文", `初始正文${committed}`));
    } finally {
      await gate.evaluate((gate) => gate.restore());
      await gate.dispose();
    }
  } finally {
    await close();
  }
});

test("C06 对账无法读取且缓冲等于原文时，笔记仍可保留修改并确认重载", async () => {
  const { page, vault, close } = await openApp({}, (vault) => writeFileSync(path.join(vault, name), original));
  const file = path.join(vault, name);
  const diskAfterSave = original.replace("初始正文", `初始正文${first}`);
  const releaseSave = Promise.withResolvers<void>();
  let held = false;
  let rejectRead = false;
  try {
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (request.input?.path !== name) return route.continue();
      if (request.capability === "notes.save" && !held) {
        await route.fetch();
        held = true;
        await releaseSave.promise;
        return route.fulfill({ json: { ok: false, error: { code: "INTERNAL", message: "测试：写入后响应失败" } } });
      }
      if (request.capability === "notes.read" && rejectRead) {
        return route.fulfill({ json: { ok: false, error: { code: "INTERNAL", message: "测试：对账暂时无法读取" } } });
      }
      await route.continue();
    });

    const editor = prose(page);
    const save = page.getByTestId("note-save");
    const state = page.getByTestId("save-state");
    await editor.getByText("初始正文", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(first);
    await save.click();
    await expect.poll(() => held).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(diskAfterSave);

    await editor.getByText(`初始正文${first}`, { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await expect(editor.getByText("初始正文", { exact: true })).toBeVisible();
    await expect(page.getByText(`${original.replace(/\s/g, "").length} 字`, { exact: true })).toBeVisible();
    await expect(state).toHaveText("未保存修改");
    rejectRead = true;
    releaseSave.resolve();
    await expect.poll(() => readFileSync(file, "utf8")).toBe(diskAfterSave);
    await expect(state).toHaveText("文件已被外部修改");
    await expect(page.getByText("保存失败：测试：对账暂时无法读取", { exact: true })).toBeVisible();
    await expect(editor.getByText("初始正文", { exact: true })).toBeVisible();

    rejectRead = false;
    const keepMine = page.getByTestId("note-keep-mine");
    await expect.soft(keepMine).toBeVisible();
    await page.getByRole("button", { name: "载入最新版本", exact: true }).click();
    await expect(page.getByRole("button", { name: "放弃我的修改并载入", exact: true })).toBeVisible();
    await expect(editor.getByText("初始正文", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await keepMine.click();
    await expect(state).toHaveText("未保存修改");
    expect(readFileSync(file, "utf8")).toBe(diskAfterSave);
    await save.click();
    await expect(state).toHaveText("已保存");
    expect(readFileSync(file, "utf8")).toBe(original);
  } finally {
    rejectRead = false;
    releaseSave.resolve();
    await page.unrouteAll({ behavior: "wait" });
    await close();
  }
});

test("C06 保存新笔记正文保留未知草稿，恢复后确认放弃才删除", async () => {
  const { page, vault, close } = await openApp({}, (vault) => writeFileSync(path.join(vault, name), original));
  const file = path.join(vault, name);
  const recoveredText = original.replace("初始正文", "旧草稿恢复内容");
  const savedText = original.replace("初始正文", `初始正文${first}`);
  try {
    await engineReady(page);
    await manualSave(page);
    const { version } = await call<{ version: string }>(page, "notes.read", { path: name });
    await call(page, "notes.draft.save", { path: name, text: recoveredText, baseVersion: version, outcome: "unknown" });
    await openNote(page);
    const editor = prose(page);
    const restore = page.getByTestId("note-draft-restore");
    await expect(restore).toBeVisible();
    await editor.getByText("初始正文", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(first);
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("save-state")).toHaveText("已保存");
    expect(readFileSync(file, "utf8")).toBe(savedText);
    await expect(restore).toBeVisible();
    expect(await call(page, "notes.draft.get", { path: name })).toMatchObject({ text: recoveredText, outcome: "unknown" });

    await restore.click();
    await expect(editor).toContainText("旧草稿恢复内容");
    await page.getByRole("button", { name: "载入最新版本", exact: true }).click();
    const discardAndReload = page.getByRole("button", { name: "放弃我的修改并载入", exact: true });
    await expect(discardAndReload).toBeVisible();
    expect(await call(page, "notes.draft.get", { path: name })).toMatchObject({ text: recoveredText });
    await discardAndReload.click();
    await expect(editor).toContainText(`初始正文${first}`);
    await expect(page.getByTestId("save-state")).toHaveText("已保存");
    await expect(restore).toHaveCount(0);
    expect(await call(page, "notes.draft.get", { path: name })).toBeNull();
    expect(readFileSync(file, "utf8")).toBe(savedText);
  } finally {
    await close();
  }
});

test("C06 档案记录页可以恢复未知草稿，也可以直接丢弃", async () => {
  const { page, vault, close } = await openApp();
  const type = "草稿类型";
  const toRestore = "待恢复记录";
  const toDiscard = "待丢弃记录";
  const originalBody = "磁盘档案正文";
  const draftBody = "草稿中的档案正文";
  const archiveFile = (record: string) => `Archives/${type}/${record}/index.md`;
  try {
    await engineReady(page);
    await manualSave(page);
    await call(page, "archives.types.save", { name: type, fields: [] });
    for (const record of [toRestore, toDiscard]) {
      await call(page, "archives.create", { type, name: record, body: `${originalBody}\n` });
      const path = archiveFile(record);
      const file = await call<{ text: string; version: string }>(page, "notes.read", { path });
      await call(page, "notes.draft.save", { path, text: file.text.replace(originalBody, draftBody), baseVersion: file.version, outcome: "unknown" });
    }

    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await page.getByTestId("notes-open-archives").click();
    await page.getByTestId("archive-category-card").filter({ hasText: type }).click();
    await page.getByTestId("archive-row").filter({ hasText: toRestore }).click();
    const archive = page.getByTestId("archive-view");
    const editor = archive.getByTestId("archive-body").locator(".ProseMirror");
    await expect(editor).toContainText(originalBody);
    await archive.getByTestId("note-draft-restore").click();
    await expect(editor).toContainText(draftBody);
    expect(readFileSync(path.join(vault, archiveFile(toRestore)), "utf8")).toContain(originalBody);
    await archive.getByRole("button", { name: "载入最新版本", exact: true }).click();
    await archive.getByRole("button", { name: "放弃我的修改并载入", exact: true }).click();
    await expect(editor).toContainText(originalBody);
    expect(await call(page, "notes.draft.get", { path: archiveFile(toRestore) })).toBeNull();

    await archive.getByTestId("archive-category-link").click();
    await page.getByTestId("archive-row").filter({ hasText: toDiscard }).click();
    await expect(editor).toContainText(originalBody);
    await archive.getByRole("button", { name: "丢弃草稿", exact: true }).click();
    await expect(archive.getByTestId("note-draft-restore")).toHaveCount(0);
    await expect.poll(() => call(page, "notes.draft.get", { path: archiveFile(toDiscard) })).toBeNull();
    expect(readFileSync(path.join(vault, archiveFile(toDiscard)), "utf8")).toContain(originalBody);
  } finally {
    await close();
  }
});

test("应用菜单保存当前文档，关窗先处理看板草稿再结算文档", async () => {
  test.skip(process.platform === "darwin", "此路径覆盖 Windows 与 Linux 的菜单按钮和 F10。macOS 使用系统菜单栏。");
  const { app, page, vault, close } = await openApp();
  const file = path.join(vault, name);
  const other = path.join(vault, "其他文档.md");
  const layout = path.join(vault, ".huhu/home/widgets.json");
  try {
    writeFileSync(file, original + "\n独立段落\n".repeat(405));
    writeFileSync(other, original);
    await engineReady(page);
    await manualSave(page);
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
    await expect(prose(page)).toContainText("菜单保存");
    expect(readFileSync(file, "utf8")).not.toContain("菜单保存");
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
    expect(readFileSync(other, "utf8")).toBe(original);

    await setAutosave(page, true);
    await openNote(page);
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
    expect(readFileSync(other, "utf8")).toBe(original);
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

for (const choice of ["保存", "放弃"] as const) {
  test(`W05-W06 关闭时${choice}看板草稿，结算笔记并暂停专注`, async () => {
    const { app, page, vault, close } = await openApp();
    const filename = path.join(vault, name);
    const board = path.join(vault, ".huhu/home/widgets.json");
    try {
      writeFileSync(filename, original);
      await engineReady(page);
      await openNote(page);
      expect((await call<{ running: boolean }>(page, "home.focus.update", { action: "start" })).running).toBe(true);
      await inputWithPendingBridge(page);
      await page.getByRole("button", { name: "huhu workbench 首页" }).click();
      await page.getByTestId("home-customize").click();
      const hidden = page.locator('[data-instance-id="default-focus"]').getByRole("checkbox", { name: "隐藏" });
      await hidden.check();
      const dialog = page.getByRole("dialog", { name: "关闭窗口前处理看板草稿" });
      const requestClose = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
      await requestClose();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "继续编辑" }).click();
      await expect(dialog).toHaveCount(0);
      expect(existsSync(board)).toBe(false);
      expect(readFileSync(filename, "utf8")).not.toContain(last);

      if (choice === "保存") {
        const rejectUpdate = async (route: import("@playwright/test").Route) => {
          if (route.request().postDataJSON()?.capability === "home.dashboard.update") {
            await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, json: { ok: false, error: { code: "INVALID_INPUT", message: "写入测试失败" } } });
          } else await route.continue();
        };
        await page.route("**/api/v1/call", rejectUpdate);
        await requestClose();
        await dialog.getByTestId("home-dashboard-save-leave").click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByTestId("home-dashboard").getByRole("status")).toContainText("草稿仍在");
        await expect(hidden).toBeChecked();
        expect(existsSync(board)).toBe(false);
        expect(readFileSync(filename, "utf8")).not.toContain(last);
        expect((await call<{ running: boolean }>(page, "home.focus.get", {})).running).toBe(true);
        await page.unroute("**/api/v1/call", rejectUpdate);
      }

      await app.evaluate(({ app }) => app.quit());
      await expect(dialog).toBeVisible();
      const closed = page.waitForEvent("close");
      await dialog.getByRole("button", { name: `${choice}并离开` }).click();
      await closed;
      if (choice === "保存") {
        expect(JSON.parse(readFileSync(board, "utf8")).instances).toContainEqual(expect.objectContaining({ instanceId: "default-focus", hidden: true }));
      } else {
        expect(existsSync(board)).toBe(false);
      }
      expect(readFileSync(filename, "utf8")).toBe(written);
      expect(JSON.parse(readFileSync(path.join(vault, ".huhu/home/focus.json"), "utf8")).running).toBe(false);
    } finally {
      if (!page.isClosed()) {
        await page.unrouteAll({ behavior: "ignoreErrors" });
        const stay = page.getByRole("button", { name: "继续编辑", exact: true });
        if (await stay.isVisible()) await stay.click();
        const cancel = page.getByRole("button", { name: "取消编辑", exact: true });
        if (await cancel.isVisible()) await cancel.click();
      }
      await close();
    }
  });
}

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
      await app.evaluate(({ Notification }) => {
        Notification.isSupported = () => false;
      });
      await app.close();
      const disk = readFileSync(file, "utf8");
      expect(disk).toBe(autosave ? written : original);
      const reopened = await openApp({ HUHU_VAULT: vault });
      try {
        const saveNotice = reopened.page.getByText(autosave ? "已写入 1 份文档。" : "已保留 1 份可恢复草稿。", { exact: true });
        await expect(saveNotice).toBeVisible();
        if (!autosave) {
          await reopened.page.reload();
          await expect(saveNotice).toBeVisible();
        }
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

test("C06 两篇笔记切 Vault 时，回执待定且已撤销的笔记也保留草稿", async () => {
  const ordinaryNote = "另一篇脏稿.md";
  const ordinaryOriginal = "另一篇正文\n";
  const ordinaryEdited = `另一篇正文${last}\n`;
  const { app, page, vault, close } = await openApp({}, (vault) => {
    writeFileSync(path.join(vault, name), original);
    writeFileSync(path.join(vault, ordinaryNote), ordinaryOriginal);
  });
  const otherVault = mkdtempSync(path.join(tmpdir(), "huhu-c06-receipt-other-"));
  const file = path.join(vault, name);
  const diskAfterSave = original.replace("初始正文", `初始正文${first}`);
  const releaseParkedDraft = Promise.withResolvers<void>();
  const releaseParkedRead = Promise.withResolvers<void>();
  const releaseSwitchDraft = Promise.withResolvers<void>();
  const releaseSaveReceipt = Promise.withResolvers<void>();
  let ordinaryDrafts = 0;
  let saveReceiptHeld = false;
  try {
    await engineReady(page);
    await manualSave(page);
    await openNote(page);
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input?: { path?: string } };
      if (request.input?.path === ordinaryNote) {
        if (request.capability === "notes.draft.save") {
          ordinaryDrafts++;
          await (ordinaryDrafts === 1 ? releaseParkedDraft.promise : releaseSwitchDraft.promise);
        }
        if (request.capability === "notes.read" && ordinaryDrafts > 0) await releaseParkedRead.promise;
      }
      if (request.input?.path === name && request.capability === "notes.save" && !saveReceiptHeld) {
        const response = await route.fetch();
        saveReceiptHeld = true;
        await releaseSaveReceipt.promise;
        return route.fulfill({ response });
      }
      await route.continue();
    });

    await treeItem(page, ordinaryNote).click();
    const editor = prose(page);
    await editor.getByText("另一篇正文", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(last);
    await expect(page.getByTestId("save-state")).toHaveText("未保存修改");
    await treeItem(page, name).click();
    // 停放时的草稿写入尚未结算，普通脏稿仍在切 Vault 的参与者列表中。
    await expect.poll(() => ordinaryDrafts).toBe(1);
    await editor.getByText("初始正文", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(first);
    await page.getByTestId("note-save").click();
    await expect.poll(() => saveReceiptHeld).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(diskAfterSave);

    await editor.getByText(`初始正文${first}`, { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await expect(editor.getByText("初始正文", { exact: true })).toBeVisible();
    await expect(page.getByText(`${original.replace(/\s/g, "").length} 字`, { exact: true })).toBeVisible();

    await app.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, otherVault);
    await page.getByRole("button", { name: "切换 Vault", exact: true }).click();
    await page.getByTestId("vault-open-other").click();
    const dirtyList = page.getByTestId("svault-dirty-list");
    await expect(dirtyList).toContainText(ordinaryNote);
    await expect.soft(dirtyList).toContainText(name);
    await Promise.all([
      page.waitForEvent("load"),
      (async () => {
        await page.getByTestId("svault-switch-draft").click();
        releaseParkedDraft.resolve();
        // 第二篇的切换留稿请求已发出，说明本轮参与者筛选已经完成。
        await expect.poll(() => ordinaryDrafts).toBeGreaterThanOrEqual(2);
        releaseSaveReceipt.resolve();
        releaseParkedRead.resolve();
        releaseSwitchDraft.resolve();
      })(),
    ]);
    await page.unrouteAll({ behavior: "wait" });
    await engineReady(page);
    expect(await page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(otherVault);
    expect(readFileSync(file, "utf8")).toBe(diskAfterSave);

    await page.getByRole("button", { name: "切换 Vault", exact: true }).click();
    await page
      .getByTestId("vault-recent-item")
      .filter({ hasText: path.basename(vault) })
      .click();
    await Promise.all([page.waitForEvent("load"), page.getByTestId("svault-switch-confirm").click()]);
    await engineReady(page);
    expect(await page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(vault);
    expect(await call(page, "notes.draft.get", { path: ordinaryNote })).toMatchObject({ text: ordinaryEdited });
    expect(await call(page, "notes.draft.get", { path: name })).toMatchObject({ text: original });
    await openNote(page);
    await expect(editor.getByText(`初始正文${first}`, { exact: true })).toBeVisible();
    await page.getByTestId("note-draft-restore").click();
    await expect(editor.getByText("初始正文", { exact: true })).toBeVisible();
    expect(readFileSync(file, "utf8")).toBe(diskAfterSave);
  } finally {
    releaseParkedDraft.resolve();
    releaseParkedRead.resolve();
    releaseSwitchDraft.resolve();
    releaseSaveReceipt.resolve();
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
        const acknowledged = Promise.withResolvers<unknown>();
        const onReply = (event: Electron.IpcMainEvent, _id: number, saved: unknown) => {
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
    expect(result).toEqual({ saved: { files: 0, drafts: 0 }, requests: 1, during: true, frozen: true, after: true });
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
              ipcMain.emit("huhu:flushed", frame, previous, { files: 1, drafts: 0 });
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
