import { BrowserWindow, ipcMain, nativeTheme, type BrowserWindowConstructorOptions, type IpcMainInvokeEvent } from "electron";
import type { WindowChromeColors, WindowChromeState } from "@huhu/workbench";
import { WINDOW_CHROME_CHANGED, WINDOW_CHROME_COLORS, WINDOW_CHROME_HEIGHT, WINDOW_CHROME_STATE } from "../window-chrome-ipc.js";

// Platform and overlay structure adapted from Open Knowledge (GPL-3.0),
// b2af296a73049ddd47f6d679b36774ecbdd3d19b, packages/desktop/src/main/window-chrome.ts.
const canSetOverlay = process.platform === "win32" || process.platform === "linux";
const colorsForSystem = (): WindowChromeColors => (nativeTheme.shouldUseDarkColors ? { background: "#1f1e1b", foreground: "#faf9f5", canvas: "#181715" } : { background: "#f5f0e8", foreground: "#141413", canvas: "#faf9f5" });

function overlay({ background, foreground }: WindowChromeColors) {
  return { color: background, symbolColor: foreground, height: WINDOW_CHROME_HEIGHT };
}

export function nativeTitleOptions(): BrowserWindowConstructorOptions {
  const colors = colorsForSystem();
  return {
    titleBarStyle: "hidden",
    backgroundColor: colors.canvas,
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 14, y: 12 } } : {}),
    ...(canSetOverlay ? { titleBarOverlay: overlay(colors) } : {}),
  };
}

function validColors(value: unknown): value is WindowChromeColors {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 3) return false;
  const colors = value as Record<string, unknown>;
  return ["background", "foreground", "canvas"].every((key) => Object.hasOwn(colors, key) && typeof colors[key] === "string" && /^#[a-f\d]{6}$/i.test(colors[key]));
}

function snapshot(win: BrowserWindow): WindowChromeState {
  return { focused: win.isFocused(), maximized: win.isMaximized(), fullScreen: win.isFullScreen() };
}

export function installWindowChrome(rendererAddress: string) {
  const renderer = URL.parse(rendererAddress);
  const attached = new Map<BrowserWindow, WindowChromeColors | undefined>();
  let title = "HUHU";

  function trustedDocument(address: string | undefined) {
    const url = address && URL.parse(address);
    return !!url && !!renderer && url.protocol === renderer.protocol && url.host === renderer.host && url.pathname === renderer.pathname && !url.username && !url.password;
  }

  function senderWindow(event: IpcMainInvokeEvent) {
    if (event.sender.isDestroyed() || event.senderFrame !== event.sender.mainFrame || !trustedDocument(event.senderFrame?.url)) throw new Error("untrusted window chrome sender");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || !attached.has(win)) throw new Error("window chrome unavailable");
    return win;
  }

  function paint(win: BrowserWindow, colors: WindowChromeColors) {
    win.setBackgroundColor(colors.canvas);
    if (canSetOverlay) win.setTitleBarOverlay(overlay(colors));
  }

  ipcMain.handle(WINDOW_CHROME_STATE, (event) => snapshot(senderWindow(event)));
  ipcMain.handle(WINDOW_CHROME_COLORS, (event, colors: unknown) => {
    const win = senderWindow(event);
    if (!validColors(colors)) throw new Error("invalid window chrome colors");
    const previous = attached.get(win);
    if (previous?.background === colors.background && previous.foreground === colors.foreground && previous.canvas === colors.canvas) return;
    paint(win, colors);
    attached.set(win, colors);
  });

  nativeTheme.on("updated", () => {
    for (const [win, colors] of attached) if (!colors && !win.isDestroyed()) paint(win, colorsForSystem());
  });

  return {
    attach(win: BrowserWindow) {
      attached.set(win, undefined);
      win.setTitle(title);
      win.on("page-title-updated", (event) => event.preventDefault());
      const publish = () => {
        if (!win.isDestroyed() && !win.webContents.isDestroyed() && trustedDocument(win.webContents.mainFrame.url)) {
          win.webContents.send(WINDOW_CHROME_CHANGED, snapshot(win));
        }
      };
      win.on("focus", publish);
      win.on("blur", publish);
      win.on("maximize", publish);
      win.on("unmaximize", publish);
      win.on("minimize", publish);
      win.on("restore", publish);
      win.on("enter-full-screen", publish);
      win.on("leave-full-screen", publish);
      win.once("closed", () => attached.delete(win));
    },
    setVaultTitle(name?: string) {
      // Main supplies a display name derived from the selected vault's final path component.
      const safeName = name && !/[/\\:\p{Cc}\p{Bidi_Control}]/u.test(name) ? Array.from(name.trim()).slice(0, 120).join("") : "";
      title = safeName ? `${safeName} — HUHU` : "HUHU";
      for (const win of attached.keys()) if (!win.isDestroyed()) win.setTitle(title);
    },
    colors(win: BrowserWindow) {
      return attached.get(win) ?? colorsForSystem();
    },
    trustedDocument,
  };
}
