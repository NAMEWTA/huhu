import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const APP_ORIGIN = "huhu-app://workbench";

protocol.registerSchemesAsPrivileged([
  { scheme: "huhu-app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** 渲染器加载失败时显示的内置错误页，包含日志路径。 */
function errorPage(detail: string): string {
  const logs = app.getPath("logs");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><title>HUHU</title><body style="font-family:sans-serif;padding:2rem"><h1>HUHU 无法加载界面</h1><p>${esc(detail)}</p><p>日志目录：${esc(logs)}</p></body>`,
  )}`;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "HUHU",
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_ORIGIN) && !(process.env["ELECTRON_RENDERER_URL"] && url.startsWith(process.env["ELECTRON_RENDERER_URL"]))) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    void win.loadURL(errorPage(`${desc} (${code})`));
  });
  win.once("ready-to-show", () => win.show());
  const dev = process.env["ELECTRON_RENDERER_URL"];
  void win.loadURL(dev ?? `${APP_ORIGIN}/index.html`);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    const root = path.join(import.meta.dirname, "../renderer");
    protocol.handle("huhu-app", (request) => {
      const url = new URL(request.url);
      const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      const file = path.join(root, rel || "index.html");
      if (!file.startsWith(root)) return new Response("forbidden", { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
    ipcMain.handle("huhu:appInfo", (event) => {
      const url = event.senderFrame?.url ?? "";
      const dev = process.env["ELECTRON_RENDERER_URL"];
      if (!url.startsWith(APP_ORIGIN) && !(dev && url.startsWith(dev))) throw new Error("untrusted sender");
      return { name: "HUHU", version: app.getVersion(), platform: process.platform };
    });
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
