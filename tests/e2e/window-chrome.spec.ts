import { chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { openApp } from "./helpers/launch.js";
import { treeItem } from "./helpers/tree.js";
import { browserBinary, localWebLink } from "./ssh/workbench.js";

test.skip(process.platform !== "win32", "Windows native caption acceptance");

const titlebar = (page: Page) => page.getByTestId("window-titlebar");
const ready = (page: Page) => expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });

async function overlayGeometry(page: Page) {
  return titlebar(page).evaluate((header) => {
    const overlay = (navigator as Navigator & { windowControlsOverlay: { visible: boolean; getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay;
    const content = header.querySelector(".shell-window-titlebar-content") ?? header.firstElementChild!;
    const { x, y, width, height } = overlay.getTitlebarAreaRect();
    const rect = content.getBoundingClientRect();
    const buttons = [...header.querySelectorAll("button")].map((button) => {
      const { left, right, top, bottom } = button.getBoundingClientRect();
      return { name: button.getAttribute("aria-label"), left, right, top, bottom };
    });
    return { visible: overlay.visible, area: { x, y, width, height }, content: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: innerWidth, buttons };
  });
}

async function expectOverlay(page: Page) {
  await expect.poll(async () => (await overlayGeometry(page)).visible).toBe(true);
  const { area, content, viewport, buttons } = await overlayGeometry(page);
  expect(area.width).toBeGreaterThan(0);
  expect(area.x + area.width).toBeLessThan(viewport);
  expect(area.height).toBeGreaterThan(0);
  expect(content.x).toBeCloseTo(area.x, 0);
  expect(content.y).toBeCloseTo(area.y, 0);
  expect(content.width).toBeCloseTo(area.width, 0);
  for (const button of buttons) {
    expect(button.left, button.name ?? "").toBeGreaterThanOrEqual(area.x);
    expect(button.right, button.name ?? "").toBeLessThanOrEqual(area.x + area.width);
  }
  return { area, content, viewport };
}

function trackedOverlay(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    const tracked = win as Electron.BrowserWindow & { chromeTestOverlay?: Electron.TitleBarOverlayOptions };
    const set = win.setTitleBarOverlay.bind(win);
    win.setTitleBarOverlay = (options) => {
      set(options);
      tracked.chromeTestOverlay = options;
    };
    return win.id;
  });
}

async function nativeHits(app: ElectronApplication, page: Page, phase: "launch" | "workbench" | "fullscreen") {
  const handle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getNativeWindowHandle().readBigUInt64LE().toString());
  const probe = await titlebar(page).evaluate((header, mode) => {
    const middle = (name: string, element: Element) => {
      const rect = element.getBoundingClientRect();
      return { name, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    const area = (navigator as Navigator & { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect();
    const left = mode === "fullscreen" ? innerWidth - 140 : area.right;
    const span = innerWidth - left;
    return [
      middle("drag", header.querySelector(".shell-window-titlebar-drag")!),
      middle("appMenu", header.querySelector("[data-testid=app-menu-button]")!),
      ...["minimize", "maximize", "close"].map((name, index) => ({ name, x: left + ((index + 0.5) * span) / 3, y: mode === "fullscreen" ? 20 : area.y + area.height / 2 })),
    ];
  }, phase);
  const script = path.join(import.meta.dirname, "helpers", "window-chrome-native.ps1");
  const screenshot = test.info().outputPath(`window-caption-${phase}.png`);
  mkdirSync(path.dirname(screenshot), { recursive: true });
  const { stdout } = await promisify(execFile)("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-Handle",
    handle,
    "-Sample",
    Buffer.from(JSON.stringify(probe)).toString("base64"),
    "-Screenshot",
    screenshot,
  ]);
  const result = JSON.parse(stdout) as { dpi: number; hits: Record<string, number>; captured: boolean };
  if (result.captured) await test.info().attach("Windows native window", { path: screenshot, contentType: "image/png" });
  return result;
}

test("launch and workbench share one native caption at minimum size with a long Vault name", async () => {
  const { app, page, vault, close } = await openApp({ HUHU_VAULT: "" });
  const name = "窗口超长测试🪟".repeat(9);
  const target = path.join(vault, name);
  mkdirSync(target);
  try {
    await expect(page.getByTestId("vault-launch")).toBeVisible();
    await expect(titlebar(page)).toHaveCount(1);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())).toBe("HUHU");
    await app.evaluate(({ BrowserWindow, dialog }, selected) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.setContentSize(960, 600);
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [selected] })) as typeof dialog.showOpenDialog;
    }, target);
    await expectOverlay(page);
    const native = await nativeHits(app, page, "launch");
    console.log(JSON.stringify({ phase: "launch", ...native }));
    expect(native.hits).toMatchObject({ drag: 2, appMenu: 1, minimize: 8, maximize: 9, close: 20 });
    await page.getByTestId("vault-new").click();
    await ready(page);
    await expect(titlebar(page)).toHaveCount(1);
    await expectOverlay(page);
    await expect(page.getByTestId("vault-name")).toContainText(name);
    const workbench = await nativeHits(app, page, "workbench");
    console.log(JSON.stringify({ phase: "workbench", ...workbench }));
    expect(workbench.hits).toMatchObject({ drag: 2, appMenu: 1, minimize: 8, maximize: 9, close: 20 });
    expect(
      await page
        .getByTestId("vault-name")
        .locator("span")
        .evaluate((label) => label.scrollWidth > label.clientWidth),
    ).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())).toBe(`${name} — HUHU`);
    await page.evaluate(() => {
      document.title = "ignored renderer title";
    });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())).toBe(`${name} — HUHU`);
    const search = page.getByRole("button", { name: "搜索与命令", exact: true });
    await expect(search).toHaveCount(1);
    await search.click();
    await expect(page.getByRole("dialog", { name: "命令面板" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "切换 Vault", exact: true }).click();
    await expect(page.getByRole("menu", { name: "Vault 菜单" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "专注模式", exact: true }).click();
    await expectOverlay(page);
    await expect(titlebar(page).getByTestId("app-menu-button")).toBeVisible();
    await expect(search).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.5));
    try {
      await expectOverlay(page);
      await expect(search).toBeVisible();
    } finally {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1));
    }
  } finally {
    await close();
  }
});

test("four themes and system mode send root colors to the native caption and canvas", async () => {
  const { app, page, close } = await openApp();
  try {
    await ready(page);
    const windowId = await trackedOverlay(app);
    const currentColors = () =>
      page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return { color: css.getPropertyValue("--sidebar").trim(), symbolColor: css.getPropertyValue("--text").trim(), canvas: css.getPropertyValue("--bg").trim(), height: window.huhuHost.windowChrome!.height };
      });
    const nativeColors = () =>
      app.evaluate(({ BrowserWindow }, id) => {
        const win = BrowserWindow.fromId(id)! as Electron.BrowserWindow & { chromeTestOverlay?: Electron.TitleBarOverlayOptions };
        return win.chromeTestOverlay ? { ...win.chromeTestOverlay, canvas: win.getBackgroundColor().toLowerCase() } : null;
      }, windowId);
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    await page.getByTestId("settings-nav-appearance").click();
    for (const theme of ["claude", "apple", "notion", "vercel"]) {
      await page.getByTestId(`theme-${theme}`).click();
      for (const [label, mode] of [
        ["深色", "dark"],
        ["浅色", "light"],
      ]) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
        const colors = await currentColors();
        await expect.poll(nativeColors).toEqual(colors);
        const sidebar = await titlebar(page).evaluate((element) => {
          const style = getComputedStyle(element).backgroundColor;
          const nums = style.match(/\d+/g)!.map(Number);
          return (
            "#" +
            nums
              .slice(0, 3)
              .map((value) => value.toString(16).padStart(2, "0"))
              .join("")
          );
        });
        expect(sidebar).toBe(colors.color);
      }
    }
    await page.getByRole("tablist", { name: "明暗模式", exact: true }).getByRole("tab", { name: "跟随系统", exact: true }).click();
    for (const mode of ["dark", "light"] as const) {
      await page.emulateMedia({ colorScheme: mode });
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      await expect.poll(nativeColors).toEqual(await currentColors());
    }
    const before = await nativeColors();
    const error = await page.evaluate(async () => {
      try {
        await window.huhuHost.windowChrome?.setColors({ background: "transparent", foreground: "#000000", canvas: "#ffffff" });
        return "";
      } catch (error) {
        return String(error);
      }
    });
    expect(error).toContain("invalid window chrome colors");
    expect(await nativeColors()).toEqual(before);
    await page.emulateMedia({ colorScheme: null });
    await page.reload();
    await ready(page);
    await expect.poll(nativeColors).toEqual(await currentColors());
  } finally {
    await close();
  }
});

test("native caption tracks focus, maximizing, minimizing and system fullscreen", async () => {
  const { app, page, close } = await openApp();
  try {
    await ready(page);
    const title = titlebar(page);
    const id = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.focus();
      return win.id;
    });
    await expect(title).toHaveAttribute("data-window-focused", "true");
    const other = await app.evaluate(({ BrowserWindow }) => {
      const win = new BrowserWindow({ width: 320, height: 220 });
      win.focus();
      return win.id;
    });
    await expect(title).toHaveAttribute("data-window-focused", "false");
    await app.evaluate(
      ({ BrowserWindow }, ids) => {
        BrowserWindow.fromId(ids.other)?.destroy();
        BrowserWindow.fromId(ids.id)?.focus();
      },
      { id, other },
    );
    await expect(title).toHaveAttribute("data-window-focused", "true");
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.maximize(), id);
    await expect(title).toHaveAttribute("data-window-maximized", "true");
    await expectOverlay(page);
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.unmaximize(), id);
    await expect(title).toHaveAttribute("data-window-maximized", "false");
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.setFullScreen(true), id);
    await expect(title).toHaveAttribute("data-window-fullscreen", "true");
    const fullscreen = await nativeHits(app, page, "fullscreen");
    console.log(JSON.stringify({ phase: "fullscreen", ...fullscreen }));
    expect(fullscreen.hits).toMatchObject({ drag: 1, appMenu: 1, minimize: 1, maximize: 1, close: 1 });
    await expect
      .poll(async () => {
        const { content, viewport } = await overlayGeometry(page);
        return Math.abs(content.width - viewport);
      })
      .toBeLessThan(1);
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.setFullScreen(false), id);
    await expect(title).toHaveAttribute("data-window-fullscreen", "false");
    await expectOverlay(page);
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.minimize(), id);
    await expect.poll(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.isMinimized(), id)).toBe(true);
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.restore(), id);
    await expect.poll(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.isMinimized(), id)).toBe(false);
    await expectOverlay(page);

    // A detached callback must stay detached across real native events.
    await page.evaluate(() => {
      const probe = document.createElement("output");
      probe.id = "chrome-unsubscribed";
      probe.value = "0";
      document.body.append(probe);
      const off = window.huhuHost.windowChrome!.onChange(() => {
        probe.value = String(Number(probe.value) + 1);
      });
      off();
    });
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.maximize(), id);
    await expect(title).toHaveAttribute("data-window-maximized", "true");
    await expect(page.locator("#chrome-unsubscribed")).toHaveText("0");
  } finally {
    await close();
  }
});

test("failed Main load and renderer crash retain one safe title area without a window bridge", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  const address = `http://127.0.0.1:${port}/`;
  const failed = await openApp({ ELECTRON_RENDERER_URL: address });
  try {
    await expect(failed.page.getByRole("heading", { name: "HUHU 无法加载界面" })).toBeVisible({ timeout: 20_000 });
    await expect(titlebar(failed.page)).toHaveCount(1);
    await expectOverlay(failed.page);
    await expect(failed.page.getByRole("link", { name: "重新加载工作台" })).toHaveAttribute("href", address);
    expect(await failed.page.evaluate(() => !!window.huhuHost?.windowChrome)).toBe(false);
    await expect.poll(() => existsSync(path.join(failed.vault, ".huhu/vault.json"))).toBe(true);
    const close = failed.app.waitForEvent("close", { timeout: 10_000 });
    void close.catch(() => undefined);
    const buttons = await failed.app.evaluate(
      ({ BrowserWindow, dialog }) =>
        new Promise<string[]>((resolve) => {
          const showMessageBox = dialog.showMessageBox;
          dialog.showMessageBox = (async (_win: Electron.BrowserWindow, options: Electron.MessageBoxOptions) => {
            dialog.showMessageBox = showMessageBox;
            resolve(options.buttons ?? []);
            return { response: 2, checkboxChecked: false };
          }) as typeof dialog.showMessageBox;
          BrowserWindow.getAllWindows()[0]?.close();
        }),
    );
    expect(buttons).toEqual(["保留窗口", "重新加载工作台", "未确认保存，仍关闭"]);
    await close;
  } finally {
    await failed.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.destroy()).catch(() => undefined);
    await failed.close();
  }
  const active = await openApp();
  try {
    await ready(active.page);
    await active.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer());
    await expect
      .poll(
        () =>
          active.app.evaluate(({ BrowserWindow }) => {
            const sender = BrowserWindow.getAllWindows()[0]?.webContents;
            const url = sender?.getURL() ?? "";
            return { recovery: url.startsWith("data:text/html") && decodeURIComponent(url).includes("工作台进程已退出"), crashed: sender?.isCrashed(), loading: sender?.isLoading() };
          }),
        { timeout: 15_000 },
      )
      .toEqual({ recovery: true, crashed: false, loading: false });
    // A crashed Playwright Page stays marked crashed even after Electron reloads its WebContents.
    const inspect = () =>
      active.app.evaluate(async ({ BrowserWindow }) => {
        const sender = BrowserWindow.getAllWindows()[0]?.webContents;
        if (!sender || sender.isCrashed() || sender.isLoading()) return null;
        return sender.mainFrame.executeJavaScript(`({
        heading: document.querySelector("h1")?.textContent,
        bars: document.querySelectorAll("[data-testid=window-titlebar]").length,
        overlay: navigator.windowControlsOverlay.visible,
        browserBridge: !!window.huhuHost?.windowChrome,
        engine: document.querySelector("[data-testid=engine-state]")?.textContent,
      })`);
      });
    await expect.poll(inspect, { timeout: 20_000 }).toMatchObject({ heading: "HUHU 无法加载界面", bars: 1, overlay: true, browserBridge: false });
    await active.app.evaluate(({ BrowserWindow }) => {
      void BrowserWindow.getAllWindows()[0]?.webContents.mainFrame.executeJavaScript('document.querySelector("main a").click()');
    });
    await expect.poll(inspect, { timeout: 20_000 }).toMatchObject({ bars: 1, overlay: true, browserBridge: true, engine: "引擎就绪" });
  } finally {
    await active.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.destroy()).catch(() => undefined);
    await active.close();
  }
});

test("isolated preview accepts pointer and text selection without acquiring window access", async () => {
  const { page, vault, close } = await openApp();
  try {
    writeFileSync(path.join(vault, "标题栏预览.md"), '# 标题栏预览\n\n```html preview\n<textarea id="sample">预览可选文本</textarea>\n```\n');
    await ready(page);
    await page.getByRole("button", { name: "知识库", exact: true }).first().click();
    await treeItem(page, "标题栏预览.md").click();
    const editor = page.getByTestId("markdown-editor");
    await expect(editor.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
    const frame = editor.locator("iframe").contentFrame();
    const textarea = frame.locator("#sample");
    await textarea.click();
    await textarea.press("ControlOrMeta+a");
    expect(
      await textarea.evaluate((entry: HTMLTextAreaElement) => {
        let topChrome = false;
        try {
          topChrome = Boolean(parent.huhuHost?.windowChrome);
        } catch {
          /* opaque origin */
        }
        return { ownChrome: Boolean(window.huhuHost?.windowChrome), topChrome, selected: entry.value.slice(entry.selectionStart, entry.selectionEnd) };
      }),
    ).toEqual({ ownChrome: false, topChrome: false, selected: "预览可选文本" });
    await expect(titlebar(page)).toHaveCount(1);
    await expectOverlay(page);
  } finally {
    await close();
  }
});

test("loopback browser title bar keeps command search without desktop chrome", async () => {
  test.skip(!browserBinary, "A local Chromium browser is required");
  const fixture = await openApp();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await ready(fixture.page);
    const link = await localWebLink(fixture.page);
    browser = await chromium.launch({ executablePath: browserBinary });
    const page = await browser.newPage({ viewport: { width: 420, height: 720 } });
    await page.goto(link);
    await ready(page);
    const title = titlebar(page);
    await expect(title).toHaveCount(1);
    expect(await title.getAttribute("data-platform")).toBeNull();
    await expect(title.getByTestId("app-menu-button")).toHaveCount(0);
    await title.getByRole("button", { name: "搜索与命令", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "命令面板" })).toBeVisible();
  } finally {
    await browser?.close();
    await fixture.close();
  }
});
