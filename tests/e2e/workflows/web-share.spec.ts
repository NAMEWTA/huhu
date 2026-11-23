import { chromium, expect, test, type Browser, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openCandidateDesktop, withFixtureCleanup } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { openApp } from "../helpers/launch.js";
import { treeItem } from "../helpers/tree.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const edge = process.platform === "win32" ? path.join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe") : "";
const browserBinary = [chromium.executablePath(), edge].find((file) => file && existsSync(file));
const noteName = "桌面与 Web 联验.md";
const otherNoteName = "旁路文档.md";
const original = "# 桌面与 Web 联验\n\n桌面初始正文\n";
const otherOriginal = "# 旁路文档\n\n其他文件的原始正文\n";
const menuEdit = "经应用菜单保存的联验正文";
const browserEdit = "浏览器刷新后写入的正文";
const desktopEdit = "桌面收到后继续写入的正文";
const prose = (page: Page) => page.getByTestId("markdown-editor").locator(".ProseMirror");

const packaged = process.env["HUHU_WEB_SHARE_ACCEPTANCE"] === "1";
test.use({ trace: "off", screenshot: "off", video: "off" });
test.afterAll(disposeCandidate);

async function openSharedApp(options: Parameters<typeof openCandidateDesktop>[0]) {
  if (packaged) return openCandidateDesktop(options);
  return { ...(await openApp(options.vault ? { HUHU_VAULT: options.vault } : {}, options.prepareVault)), confirmEngine: undefined };
}

async function visitInvite(page: Page, link: string, origin: string) {
  try {
    const target = new URL(link);
    if (target.origin === "null" || target.origin !== origin) throw new Error("Web 邀请的访问来源不符");
    await page.goto(link);
  } catch {
    throw new Error("无法打开合成 Web 邀请");
  }
}

async function openNote(page: Page) {
  if (!(await page.getByTestId("notes-module").isVisible())) await page.getByRole("button", { name: "知识库", exact: true }).first().click();
  await page.getByTestId("notes-section-all").click();
  await treeItem(page, noteName).click();
}

async function openAutosaveSettings(page: Page) {
  await page.getByRole("button", { name: "设置", exact: true }).first().click();
  await page.getByTestId("settings-nav-editor").click();
  const autosave = page.getByRole("switch", { name: "自动保存" });
  await expect(autosave).toBeVisible();
  return autosave;
}

async function saveFromAppMenu(app: ElectronApplication, page: Page) {
  if (process.platform !== "darwin") {
    // Capture the real Electron menu so Playwright can activate its native item.
    await app.evaluate(({ Menu }) => {
      const popup = Menu.prototype.popup;
      Menu.prototype.popup = function (options) {
        Menu.prototype.popup = popup;
        if (options?.window) Reflect.set(options.window, "__huhuTestMenu", this);
        options?.callback?.();
      };
    });
    await page.getByTestId("app-menu-button").click();
  }
  const activate = (click: boolean) =>
    app.evaluate(({ BrowserWindow, Menu }, shouldClick) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      const menu = process.platform === "darwin" ? Menu.getApplicationMenu() : (Reflect.get(win, "__huhuTestMenu") as ReturnType<typeof Menu.getApplicationMenu>);
      const item = menu?.items.find(({ label }) => label === "文件")?.submenu?.getMenuItemById("huhu-document-save");
      if (!item || item.label !== "保存当前文档" || !item.enabled) return false;
      if (shouldClick) item.click({}, win, win.webContents);
      return true;
    }, click);
  await expect.poll(() => activate(false)).toBe(true);
  expect(await activate(true)).toBe(true);
}

test("Web 分享：两份邀请和三个浏览器会话，单份撤销与看板保存重开", async () => {
  const testInfo = test.info();
  test.skip(!browserBinary, "当前环境未安装 Playwright Chromium 或 Microsoft Edge");
  test.setTimeout(packaged ? 180_000 : 120_000);
  const desktop = await openSharedApp({
    identityAttachment: "web-candidate-identity",
    prepareVault(directory) {
      writeFileSync(path.join(directory, noteName), original);
      writeFileSync(path.join(directory, otherNoteName), otherOriginal);
    },
  });
  const { app, page, vault, close } = desktop;
  const noteFile = path.join(vault, noteName);
  const otherNoteFile = path.join(vault, otherNoteName);
  const layoutFile = path.join(vault, ".huhu/home/widgets.json");
  let browser: Browser | undefined;
  await withFixtureCleanup(async () => {
    await engineReady(page);
    const firstEngine = await desktop.confirmEngine?.();
    let savedNote = await test.step("应用菜单只保存当前选定文档", async () => {
      const autosave = await openAutosaveSettings(page);
      const wasEnabled = await autosave.isChecked();
      if (wasEnabled) await autosave.click();
      await expect(autosave).not.toBeChecked();
      await openNote(page);
      await expect(prose(page)).toContainText("桌面初始正文");
      const beforeEdit = readFileSync(noteFile, "utf8");
      await prose(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText(menuEdit);
      await expect(prose(page)).toContainText(menuEdit);
      await expect(page.getByTestId("save-state")).toHaveText("未保存修改");
      expect(readFileSync(noteFile, "utf8")).toBe(beforeEdit);
      await saveFromAppMenu(app, page);
      await expect.poll(() => readFileSync(noteFile, "utf8")).toContain(menuEdit);
      await expect(page.getByTestId("save-state")).toHaveText("已保存");
      expect(readFileSync(otherNoteFile, "utf8")).toBe(otherOriginal);
      if (wasEnabled) {
        const restore = await openAutosaveSettings(page);
        if (!(await restore.isChecked())) await restore.click();
        await expect(restore).toBeChecked();
      }
      return readFileSync(noteFile, "utf8");
    });
    await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
    await page.getByRole("tab", { name: "服务端" }).click();
    const share = page.getByTestId("web-share-panel");
    await expect(share.getByText("已停止", { exact: true })).toBeVisible();
    const scope = share.getByRole("combobox", { name: "分享范围" });
    await expect(scope).toHaveValue("lan");
    await scope.selectOption("local");
    await share.getByRole("button", { name: "启动分享" }).click();
    await expect(share.getByText("运行中", { exact: true })).toBeVisible();
    const addresses = share.getByRole("list", { name: "访问地址" });
    const localAddress = addresses.getByRole("link", { name: /^http:\/\/127\.0\.0\.1:/u });
    await expect(localAddress).toBeVisible();
    const url = (await localAddress.getAttribute("href"))!;
    const webOrigin = new URL(url).origin;
    await test.step("分享服务从独立 Web 制品提供入口、深链和脚本", async () => {
      const output = await app.evaluate(({ app }) => {
        const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
        const out = `${app.getAppPath()}/out`;
        return {
          web: fs.readFileSync(`${out}/web/index.html`, "utf8"),
          desktop: fs.readFileSync(`${out}/renderer/index.html`, "utf8"),
        };
      });
      expect(output.web).not.toBe(output.desktop);
      for (const route of ["/", "/notes/" + encodeURIComponent(noteName)]) {
        const response = await fetch(new URL(route, webOrigin), { signal: AbortSignal.timeout(10_000) });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/^text\/html\b/u);
        expect(await response.text()).toBe(output.web);
      }
      const entry = output.web.match(/<script\b[^>]*\bsrc="([^"]+)"/u)?.[1];
      expect(entry).toMatch(/^\/assets\/.+\.js$/u);
      const script = await fetch(new URL(entry!, webOrigin), { signal: AbortSignal.timeout(10_000) });
      expect(script.status).toBe(200);
      expect(script.headers.get("content-type")).toMatch(/javascript/u);
      expect((await script.arrayBuffer()).byteLength).toBeGreaterThan(0);
    });
    if (desktop.confirmEngine !== undefined) {
      const engine = await desktop.confirmEngine();
      const status = await call(page, "web.share.status", {});
      expect(status).toMatchObject({ state: "running", addresses: [{ url }] });
      // The share listener has its own port, published by this same Engine.
      await testInfo.attach("web-candidate-listener", {
        body: JSON.stringify({ engine, webEndpoint: webOrigin }),
        contentType: "application/json",
      });
    }
    await addresses.getByRole("button", { name: `复制访问地址 ${url}` }).click();
    await expect(share.getByRole("status")).toContainText("已复制访问地址。");
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(url);
    await app.evaluate(({ dialog, shell }) => {
      const opened: string[] = [];
      Object.assign(globalThis, { webShareOpened: opened });
      const show = dialog.showMessageBox;
      const open = shell.openExternal;
      Reflect.set(globalThis, "restoreWebShareExternalLink", () => {
        dialog.showMessageBox = show;
        shell.openExternal = open;
        Reflect.deleteProperty(globalThis, "restoreWebShareExternalLink");
      });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      shell.openExternal = async (link) => {
        opened.push(link);
      };
    });
    await withFixtureCleanup(async () => {
      await localAddress.click();
      await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "webShareOpened"))).toEqual([new URL(url).href]);
    }, [["恢复桌面外部链接处理器", () => app.evaluate(() => Reflect.get(globalThis, "restoreWebShareExternalLink")?.())]]);

    const links = page.getByRole("dialog", { name: "Web 邀请链接" });
    const readLink = async () => {
      await expect(links).toBeVisible();
      const link = await links.getByRole("textbox", { name: /^邀请链接 127.0.0.1:/ }).inputValue();
      await links.getByRole("button", { name: "完成" }).click();
      return link;
    };
    await share.getByRole("button", { name: "创建邀请" }).click();
    const a = await readLink();
    const rows = share.getByTestId("web-invitation-row");
    const aId = await rows.first().getAttribute("data-invitation-id");
    const aRow = rows.and(share.locator(`[data-invitation-id="${aId}"]`));
    await aRow.getByRole("button", { name: "取回链接" }).click();
    expect((await readLink()) === a, "取回同一份邀请").toBe(true);
    await share.getByRole("button", { name: "创建邀请" }).click();
    const b = await readLink();
    expect(b !== a, "两个邀请应独立").toBe(true);
    await expect(rows).toHaveCount(2);

    browser = await chromium.launch({ executablePath: browserBinary!, headless: true });
    const browsers = await Promise.all(
      [a, a, b].map(async (link) => {
        const context = await browser!.newContext();
        const tab = await context.newPage();
        await visitInvite(tab, link, webOrigin);
        await expect(tab.getByTestId("home-dashboard")).toBeVisible();
        expect(await tab.evaluate(() => "huhuHost" in window)).toBe(false);
        const current = new URL(tab.url());
        expect(current.hash === "", "浏览器应移除邀请片段").toBe(true);
        expect(current.origin).toBe(webOrigin);
        return tab;
      }),
    );
    const [first, second, other] = browsers;
    await expect(aRow).toContainText("2 个会话");
    await expect(rows.filter({ hasText: "1 个会话" })).toHaveCount(1);
    const browserTitlebar = other!.getByTestId("window-titlebar");
    await expect(browserTitlebar.getByTestId("app-menu-button")).toHaveCount(0);
    await browserTitlebar.getByRole("button", { name: "搜索与命令", exact: true }).click();
    const palette = other!.getByRole("dialog", { name: "命令面板" });
    await expect(palette).toBeVisible();
    await other!.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);

    await test.step("Web 深链接刷新与桌面双向编辑使用同一文档", async () => {
      const link = new URL("/notes/" + encodeURIComponent(noteName), url).href;
      await other!.goto(link);
      await expect(prose(other!)).toContainText(menuEdit);
      await other!.reload();
      await expect(prose(other!)).toContainText(menuEdit);
      expect(new URL(other!.url()).pathname).toBe(new URL(link).pathname);
      await prose(other!).click();
      await other!.keyboard.press("ControlOrMeta+End");
      await other!.keyboard.insertText(browserEdit);
      await expect.poll(() => readFileSync(noteFile, "utf8")).toContain(browserEdit);
      await openNote(page);
      await expect(prose(page)).toContainText(browserEdit);
      await prose(page).click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.insertText(desktopEdit);
      await expect.poll(() => readFileSync(noteFile, "utf8")).toContain(desktopEdit);
      await expect(prose(other!)).toContainText(desktopEdit);
      await other!.reload();
      await expect(prose(other!)).toContainText(desktopEdit);
      for (const fragment of [menuEdit, browserEdit, desktopEdit]) {
        await expect(prose(other!)).toContainText(fragment);
        await expect(prose(page)).toContainText(fragment);
        expect(readFileSync(noteFile, "utf8")).toContain(fragment);
      }
      savedNote = readFileSync(noteFile, "utf8");
      await page.getByRole("button", { name: "能力网关", exact: true }).first().click();
      await page.getByRole("tab", { name: "服务端" }).click();
      await expect(aRow).toContainText("2 个会话");
      await other!.goto(url);
      await expect(other!.getByTestId("home-dashboard")).toBeVisible();
    });

    const otherBoard = other!.getByTestId("home-dashboard");
    const focus = otherBoard.locator('[data-instance-id="default-focus"]');
    await expect(focus).toBeVisible();
    const task = otherBoard.getByTestId("card-tasks");
    await expect(task.getByRole("tab", { name: "全部" })).toBeVisible();
    await task.getByRole("tab", { name: "今天" }).click();
    await expect(task.getByText("今天没有待办任务")).toBeVisible();
    await expect(otherBoard.getByTestId("card-recent").getByRole("button", { name: "全部笔记" })).toBeVisible();
    await other!.getByTestId("home-customize").click();
    await focus.getByRole("checkbox", { name: "隐藏" }).check();
    await otherBoard.getByTestId("home-dashboard-save").click();
    await expect(otherBoard.getByRole("status")).toContainText("布局已保存");
    await expect(first!.getByTestId("home-dashboard").locator('[data-instance-id="default-focus"]')).toHaveCount(0);
    const saved = readFileSync(layoutFile, "utf8");

    await aRow.getByRole("button", { name: "撤销邀请" }).click();
    const confirmation = page.getByRole("dialog", { name: "撤销这份邀请" });
    await expect(confirmation).toContainText("2 个浏览器会话");
    await confirmation.getByRole("button", { name: "确认撤销" }).click();
    await expect(rows).toHaveCount(1);
    await Promise.all([first!, second!].map((tab) => expect(tab.getByText("浏览器会话不可用", { exact: true })).toBeVisible({ timeout: 12_000 })));
    await visitInvite(first!, a, webOrigin);
    await expect(first!.getByText("浏览器会话不可用", { exact: true })).toBeVisible();
    await other!.reload();
    await expect(otherBoard).toBeVisible();
    await expect(focus).toHaveCount(0);
    expect(readFileSync(layoutFile, "utf8")).toBe(saved);

    await share.getByRole("button", { name: "停止分享" }).click();
    await page.getByRole("dialog", { name: "停止 Web 分享" }).getByRole("button", { name: "确认停止" }).click();
    await expect(share.getByText("已停止", { exact: true })).toBeVisible();
    await expect(rows).toHaveCount(0);
    await browser.close();
    browser = undefined;

    const savedLayout = await test.step("关窗时先继续编辑，再保存布局并关闭", async () => {
      await page.getByRole("button", { name: "huhu workbench 首页" }).click();
      const dashboard = page.getByTestId("home-dashboard");
      await expect(dashboard.getByTestId("card-recent")).toBeVisible();
      await expect(dashboard.locator('[data-instance-id="default-focus"]')).toHaveCount(0);
      await page.getByTestId("home-customize").click();
      const hideRecent = dashboard.locator('[data-instance-id="default-notes"]').getByRole("checkbox", { name: "隐藏" });
      await hideRecent.check();
      const decision = page.getByRole("dialog", { name: "关闭窗口前处理看板草稿" });
      const requestClose = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
      await requestClose();
      await expect(decision).toBeVisible();
      expect(readFileSync(layoutFile, "utf8")).toBe(saved);
      await decision.getByRole("button", { name: "继续编辑", exact: true }).click();
      await expect(decision).toHaveCount(0);
      await expect(hideRecent).toBeChecked();
      await expect(dashboard.getByTestId("home-dashboard-save")).toBeEnabled();
      expect(readFileSync(layoutFile, "utf8")).toBe(saved);
      expect(readFileSync(noteFile, "utf8")).toBe(savedNote);

      await requestClose();
      await expect(decision).toBeVisible();
      await Promise.all([
        app.waitForEvent("close"),
        (async () => {
          await Promise.all([page.waitForEvent("close"), decision.getByTestId("home-dashboard-save-leave").click()]);
          // Closing the last macOS window leaves the native app running.
          if (process.platform === "darwin") await app.evaluate(({ app }) => app.quit());
        })(),
      ]);
      const bytes = readFileSync(layoutFile, "utf8");
      expect(bytes).not.toBe(saved);
      expect(JSON.parse(bytes).instances).toEqual(expect.arrayContaining([expect.objectContaining({ instanceId: "default-focus", hidden: true }), expect.objectContaining({ instanceId: "default-notes", hidden: true })]));
      return bytes;
    });

    await test.step("重新启动桌面并打开同一 Vault，回读文档与两次布局修改", async () => {
      const reopened = await openSharedApp({ vault, identityAttachment: "web-reopen-candidate-identity" });
      await withFixtureCleanup(async () => {
        await engineReady(reopened.page);
        expect(await reopened.page.evaluate(async () => (await window.huhuHost.vault?.state())?.path)).toBe(vault);
        if (firstEngine && reopened.confirmEngine !== undefined) {
          const engine = await reopened.confirmEngine();
          expect(engine.vaultId).toBe(firstEngine.vaultId);
          expect(engine.startHash).not.toBe(firstEngine.startHash);
        }
        const dashboard = reopened.page.getByTestId("home-dashboard");
        await expect(dashboard.getByTestId("card-tasks")).toBeVisible();
        await expect(dashboard.locator('[data-instance-id="default-focus"]')).toHaveCount(0);
        await expect(dashboard.locator('[data-instance-id="default-notes"]')).toHaveCount(0);
        await openNote(reopened.page);
        for (const fragment of [menuEdit, browserEdit, desktopEdit]) await expect(prose(reopened.page)).toContainText(fragment);
        expect(readFileSync(noteFile, "utf8")).toBe(savedNote);
        expect(readFileSync(otherNoteFile, "utf8")).toBe(otherOriginal);
        expect(readFileSync(layoutFile, "utf8")).toBe(savedLayout);
      }, [["关闭重开的桌面夹具", reopened.close]]);
    });
  }, [
    ["关闭分享浏览器", () => browser?.close()],
    ...(["继续编辑", "取消编辑"] as const).map(
      (name) =>
        [
          `退出桌面编辑提示「${name}」`,
          async () => {
            if (page.isClosed()) return;
            const button = page.getByRole("button", { name, exact: true });
            if (await button.isVisible()) await button.click({ timeout: 500 });
          },
        ] as const,
    ),
    ["关闭最初的桌面夹具", close],
  ]);
});
