import { app, BrowserWindow, clipboard, dialog, ipcMain, net, powerMonitor, protocol, shell } from "electron";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cliInstall, cliStatus, cliUninstall, type CliDeps } from "./cli-install.js";
import { EngineSupervisor } from "./engine-supervisor.js";
import { checkEmptyTarget, checkOpenable, copyDemoVault, importPackageTo, remember, type OpenResult, type RecentVault, type VaultState } from "./vault-session.js";

let supervisor: EngineSupervisor | null = null;

/** 启动时的 Vault：只有 HUHU_VAULT（自动化测试 / 命令行启动）会跳过启动页；正常使用由用户在启动页选择。 */
const startupVault = (): string | null => {
  const v = process.env["HUHU_VAULT"];
  // 路径必须已存在：环境里残留一个写错的路径不会静默建出一个空 Vault（要新建请走启动页）
  return v && existsSync(v) ? v : null;
};

/** 构建时写入的 build-info.json（提交、构建时间）；开发态没有就为空。 */
function readBuildInfo(): { commit?: string; builtAt?: string } {
  try {
    const j = JSON.parse(readFileSync(path.join(import.meta.dirname, "../build-info.json"), "utf8")) as { commit?: unknown; builtAt?: unknown };
    return { ...(typeof j.commit === "string" ? { commit: j.commit.slice(0, 12) } : {}), ...(typeof j.builtAt === "string" ? { builtAt: j.builtAt } : {}) };
  } catch {
    return {};
  }
}

const APP_ORIGIN = "huhu-app://workbench";

protocol.registerSchemesAsPrivileged([{ scheme: "huhu-app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/** 渲染器加载失败时显示的内置错误页，包含日志路径。 */
function errorPage(detail: string): string {
  const logs = app.getPath("logs");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><title>HUHU</title><body style="font-family:sans-serif;padding:2rem"><h1>HUHU 无法加载界面</h1><p>${esc(detail)}</p><p>日志目录：${esc(logs)}</p></body>`)}`;
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
    const broadcast = (state: string) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send("huhu:engineState", state);
    };
    let current: { path: string; readOnly: boolean } | null = null;
    let startupError: string | null = null;
    let recent: RecentVault[] = [];
    /** 打开（或切换到）一个 Vault：先有序关闭旧 Engine；失败时回到未打开状态，错误原样交给启动页显示。 */
    // 打开 / 切换串行执行：并发的两次调用不会各自启动 Engine 而留下孤儿进程
    let chain: Promise<unknown> = Promise.resolve();
    const openVault = (target: string, flags: { create: boolean; readOnly: boolean }): Promise<OpenResult> => {
      const run = chain.then(() => openVaultNow(target, flags));
      chain = run.catch(() => undefined);
      return run;
    };
    const openVaultNow = async (target: string, flags: { create: boolean; readOnly: boolean }): Promise<OpenResult> => {
      if (supervisor) await supervisor.stop();
      supervisor = null;
      current = null;
      const next = new EngineSupervisor(target, flags, broadcast);
      supervisor = next;
      next.start();
      const r = await next.whenStarted();
      if (!r.ok) {
        await next.stop().catch(() => undefined);
        if (supervisor === next) supervisor = null;
        return r;
      }
      current = { path: target, readOnly: flags.readOnly };
      startupError = null;
      recent = remember(recent, { path: target, name: path.basename(target) || target, at: new Date().toISOString() });
      return { ok: true };
    };
    const first = startupVault();
    const startup = first ? openVault(first, { create: true, readOnly: false }) : null;
    void startup?.then((r) => {
      if (!r.ok) startupError = r.message;
    });
    const demoRoot = (): string => (app.isPackaged ? path.join(process.resourcesPath, "demo-vault") : path.join(app.getAppPath(), "resources", "demo-vault"));
    ipcMain.handle("huhu:vault:state", async (event): Promise<VaultState> => {
      assertTrusted(event.senderFrame?.url);
      await startup; // 命令行 / 测试指定的 Vault 先打开完，界面再判断是否显示启动页
      return { path: current?.path ?? null, readOnly: current?.readOnly ?? false, recent, ...(startupError ? { error: startupError } : {}) };
    });
    // kind: open 打开已有文件夹（目录必须存在；非 Vault 的文件夹会被初始化为 Vault）；new 新建空白（必须空目录）
    ipcMain.handle("huhu:vault:open", async (event, target: unknown, opts: unknown): Promise<OpenResult> => {
      assertTrusted(event.senderFrame?.url);
      const o = (opts ?? {}) as { kind?: string; readOnly?: boolean };
      if (typeof target !== "string") return { ok: false, code: "INVALID_INPUT", message: "请选择一个目录" };
      const bad = o.kind === "new" ? checkEmptyTarget(target) : checkOpenable(target);
      if (bad) return bad;
      return openVault(target, { create: o.kind === "new" || !o.readOnly, readOnly: o.readOnly === true });
    });
    ipcMain.handle("huhu:vault:demo", async (event, target: unknown): Promise<OpenResult> => {
      assertTrusted(event.senderFrame?.url);
      if (typeof target !== "string") return { ok: false, code: "INVALID_INPUT", message: "请选择一个空目录" };
      const bad = copyDemoVault(demoRoot(), target);
      if (bad) return bad;
      return openVault(target, { create: true, readOnly: false });
    });
    ipcMain.handle("huhu:vault:import", async (event, zip: unknown, target: unknown): Promise<OpenResult> => {
      assertTrusted(event.senderFrame?.url);
      if (typeof zip !== "string" || typeof target !== "string") return { ok: false, code: "INVALID_INPUT", message: "请选择数据包和一个空目录" };
      const bad = importPackageTo(zip, target);
      if (bad) return bad;
      return openVault(target, { create: false, readOnly: false });
    });
    ipcMain.handle("huhu:vault:close", async (event) => {
      assertTrusted(event.senderFrame?.url);
      await (chain = chain.then(async () => {
        if (supervisor) await supervisor.stop();
        supervisor = null;
        current = null;
        startupError = null;
      }));
    });
    ipcMain.handle("huhu:engine", async (event) => {
      assertTrusted(event.senderFrame?.url);
      if (!supervisor) throw new Error("尚未打开 Vault");
      return supervisor.whenReady();
    });
    ipcMain.handle("huhu:engineState", (event) => {
      assertTrusted(event.senderFrame?.url);
      return supervisor?.current ?? "stopped";
    });
    ipcMain.handle("huhu:restartEngine", (event) => {
      assertTrusted(event.senderFrame?.url);
      supervisor?.restart();
    });
    ipcMain.handle("huhu:appInfo", (event) => {
      assertTrusted(event.senderFrame?.url);
      return { name: "HUHU", version: app.getVersion(), ...readBuildInfo(), platform: process.platform, arch: process.arch, electron: process.versions.electron ?? "", chrome: process.versions.chrome ?? "", node: process.versions.node };
    });
    ipcMain.handle("huhu:revealVault", (event) => {
      assertTrusted(event.senderFrame?.url);
      if (current) shell.showItemInFolder(current.path);
    });
    // 文件对话框：只返回用户选中的路径，真正的读写由 Engine 进程完成
    ipcMain.handle("huhu:pickSavePath", async (event, defaultName: unknown) => {
      assertTrusted(event.senderFrame?.url);
      const name = typeof defaultName === "string" ? path.basename(defaultName).slice(0, 120) : "HUHU.zip";
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts = { defaultPath: path.join(app.getPath("documents"), name), filters: [{ name: "HUHU 数据包", extensions: ["zip"] }] };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      return r.canceled || !r.filePath ? null : r.filePath;
    });
    // 复制敏感文本：到点后只在剪贴板里仍是这段文本时才清除，不动用户之后复制的内容
    let clipboardTimer: ReturnType<typeof setTimeout> | null = null;
    ipcMain.handle("huhu:copyText", (event, value: unknown, clearAfterMs: unknown) => {
      assertTrusted(event.senderFrame?.url);
      if (typeof value !== "string" || value.length > 100_000) return;
      clipboard.writeText(value);
      if (clipboardTimer) clearTimeout(clipboardTimer);
      const ms = typeof clearAfterMs === "number" && clearAfterMs > 0 ? Math.min(clearAfterMs, 600_000) : 0;
      if (ms === 0) return;
      clipboardTimer = setTimeout(() => {
        clipboardTimer = null;
        void Promise.resolve(clipboard.readText()).then((now) => {
          if (now === value) clipboard.clear();
        });
      }, ms);
      clipboardTimer.unref();
    });
    // 扩展命令返回 saveFile：由用户选保存位置，内容经本进程写出（扩展本身不拿到路径）
    ipcMain.handle("huhu:saveTextFile", async (event, name: unknown, content: unknown) => {
      assertTrusted(event.senderFrame?.url);
      if (typeof name !== "string" || typeof content !== "string" || content.length > 64 * 1024 * 1024) return false;
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts = { defaultPath: path.join(app.getPath("documents"), path.basename(name).slice(0, 120) || "HUHU.md") };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return false;
      writeFileSync(r.filePath, content);
      return true;
    });
    ipcMain.handle("huhu:pickOpenPath", async (event, kind: unknown) => {
      assertTrusted(event.senderFrame?.url);
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts =
        kind === "directory"
          ? { properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] }
          : kind === "file"
            ? { properties: ["openFile"] as "openFile"[] }
            : { properties: ["openFile"] as "openFile"[], filters: [{ name: "HUHU 数据包", extensions: ["zip"] }] };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      return r.canceled || r.filePaths.length === 0 ? null : (r.filePaths[0] ?? null);
    });
    // 命令行安装：只有打包版有启动脚本；每次都由用户在界面确认后才调用
    // AppImage 每次启动挂载到随机的临时目录，退出后符号链接就悬空：不支持，提示改用 deb / 解压版
    const appImage = process.platform === "linux" && Boolean(process.env["APPIMAGE"]);
    const cliDeps = (): CliDeps => ({
      platform: process.platform,
      home: app.getPath("home"),
      env: process.env,
      ...(appImage ? { unsupportedReason: "AppImage 每次启动都挂载在临时目录，命令行链接会失效；请使用 deb 安装版，或把 AppImage 解压（--appimage-extract）到固定位置后再安装" } : {}),
      launcher:
        !appImage && app.isPackaged && existsSync(path.join(process.resourcesPath, "bin", process.platform === "win32" ? "huhu.cmd" : "huhu"))
          ? path.join(process.resourcesPath, "bin", process.platform === "win32" ? "huhu.cmd" : "huhu")
          : null,
    });
    ipcMain.handle("huhu:cliStatus", (event) => {
      assertTrusted(event.senderFrame?.url);
      return cliStatus(cliDeps());
    });
    ipcMain.handle("huhu:cliInstall", (event) => {
      assertTrusted(event.senderFrame?.url);
      return cliInstall(cliDeps());
    });
    ipcMain.handle("huhu:cliUninstall", (event) => {
      assertTrusted(event.senderFrame?.url);
      return cliUninstall(cliDeps());
    });
    ipcMain.handle("huhu:notices", (event) => {
      assertTrusted(event.senderFrame?.url);
      // 打包后在 resources/；开发时在仓库根
      const f = app.isPackaged ? path.join(process.resourcesPath, "THIRD_PARTY_NOTICES.md") : path.join(app.getAppPath(), "..", "..", "THIRD_PARTY_NOTICES.md"); // 开发时 appPath 是 apps/desktop
      if (!existsSync(f) || statSync(f).size > 4 * 1024 * 1024) return "";
      return readFileSync(f, "utf8");
    });
    // 系统锁屏 / 休眠：立即锁定保险箱（W11.1）
    const lockSafe = () => void supervisor?.callDesktop("safe.lock");
    powerMonitor.on("lock-screen", lockSafe);
    powerMonitor.on("suspend", lockSafe);
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
    // 先让界面把还在防抖窗口里的编辑写出去（自动保存 / 草稿），再停 Engine；最多等 3 秒
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
    const flushed =
      wins.length === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 3000);
            ipcMain.once("huhu:flushed", () => {
              clearTimeout(timer);
              resolve();
            });
            for (const w of wins) w.webContents.send("huhu:flush");
          });
    void flushed.finally(() => supervisor?.stop().finally(() => app.quit()));
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
