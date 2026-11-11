import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EngineSupervisor } from "./engine-supervisor.js";

let supervisor: EngineSupervisor | null = null;

/** 过渡方案：启动页（W04.1）完成前，用 HUHU_VAULT 或「文档/HUHU Vault」。 */
function defaultVaultPath(): string {
  return process.env["HUHU_VAULT"] ?? path.join(app.getPath("documents"), "HUHU Vault");
}

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

/** 完整来源匹配：`huhu-app://workbench` 本身或其路径，开发服务器同理（不接受仅前缀相同的其他主机/端口）。 */
function isTrustedUrl(url: string | undefined): boolean {
  if (!url) return false;
  const origins = [APP_ORIGIN, process.env["ELECTRON_RENDERER_URL"]?.replace(/\/$/, "")].filter((o): o is string => Boolean(o));
  return origins.some((o) => url === o || url.startsWith(`${o}/`) || url.startsWith(`${o}?`) || url.startsWith(`${o}#`));
}

function assertTrusted(url: string | undefined): void {
  if (!isTrustedUrl(url)) throw new Error("untrusted sender");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "HUHU",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    void win.loadURL(errorPage(`${desc} (${code})`));
  });
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
    supervisor = new EngineSupervisor(defaultVaultPath(), (state) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send("huhu:engineState", state);
    });
    supervisor.start();
    ipcMain.handle("huhu:engine", async (event) => {
      assertTrusted(event.senderFrame?.url);
      return supervisor!.whenReady();
    });
    ipcMain.handle("huhu:engineState", (event) => {
      assertTrusted(event.senderFrame?.url);
      return supervisor!.current;
    });
    ipcMain.handle("huhu:restartEngine", (event) => {
      assertTrusted(event.senderFrame?.url);
      supervisor!.restart();
    });
    ipcMain.handle("huhu:appInfo", (event) => {
      assertTrusted(event.senderFrame?.url);
      return { name: "HUHU", version: app.getVersion(), platform: process.platform, arch: process.arch, electron: process.versions.electron ?? "", chrome: process.versions.chrome ?? "", node: process.versions.node };
    });
    ipcMain.handle("huhu:revealVault", (event) => {
      assertTrusted(event.senderFrame?.url);
      shell.showItemInFolder(defaultVaultPath());
    });
    ipcMain.handle("huhu:notices", (event) => {
      assertTrusted(event.senderFrame?.url);
      // 打包后在 resources/；开发时在仓库根
      const f = app.isPackaged ? path.join(process.resourcesPath, "THIRD_PARTY_NOTICES.md") : path.join(app.getAppPath(), "..", "..", "THIRD_PARTY_NOTICES.md"); // 开发时 appPath 是 apps/desktop
      if (!existsSync(f) || statSync(f).size > 4 * 1024 * 1024) return "";
      return readFileSync(f, "utf8");
    });
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  let quitting = false;
  app.on("before-quit", (e) => {
    if (quitting || !supervisor) return;
    e.preventDefault();
    quitting = true;
    void supervisor.stop().finally(() => app.quit());
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
