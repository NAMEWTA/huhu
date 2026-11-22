import { fetchExternalLinkPreview } from "@huhu/editor/link-preview-main";
import { readFile } from "node:fs/promises";
import { app, BrowserWindow, clipboard, dialog, ipcMain, net, powerMonitor, protocol, shell } from "electron";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import iconPath from "../../../../assets/brand/huhu-icon-512.png?asset";
import { exitSaveMessage, isExitSaveOutcome, type ExitPhase, type ExitSaveOutcome, type ExitSaveReceipt, type ExitSaveSummary } from "../exit-ipc.js";
import { installAppMenu } from "./app-menu.js";
import { cliInstall, cliStatus, cliUninstall, type CliDeps } from "./cli-install.js";
import { confirmExternalLink, externalHttpUrl } from "./external-link.js";
import { EngineSupervisor } from "./engine-supervisor.js";
import { acknowledgeExitSaveFeedback, readExitSaveFeedback, showExitSaveFeedback } from "./exit-feedback.js";
import { registerMailAttachmentPicker } from "./mail-attachment-picker.js";
import { handleVaultMediaRequest } from "./preview-protocol.js";
import { hardenWindowForPreview, previewSchemePrivileges, registerPreviewHandlers, type PreviewController } from "./preview-session.js";
import { checkEmptyTarget, checkOpenable, copyDemoVault, importPackageTo, remember, type OpenResult, type RecentVault, type VaultState } from "./vault-session.js";
import { installWindowChrome, nativeTitleOptions } from "./window-chrome.js";
import { windowErrorPage } from "./window-error-page.js";

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

// registerSchemesAsPrivileged 只能调用一次：工作台协议与 HTML 预览协议在这里合并注册
protocol.registerSchemesAsPrivileged([{ scheme: "huhu-app", privileges: { standard: true, secure: true, supportFetchAPI: true } }, previewSchemePrivileges]);

/** HTML 预览的主进程控制器（whenReady 之后创建）；窗口创建时用它做硬化与拦截计数。 */
let preview: PreviewController | null = null;

const recoveryPages = new WeakMap<BrowserWindow, string>();
const showingRecovery = (win: BrowserWindow) => !win.isDestroyed() && recoveryPages.get(win) === win.webContents.getURL();

/** 完整来源匹配：`huhu-app://workbench` 本身或其路径，开发服务器同理（不接受仅前缀相同的其他主机/端口）。 */
function isTrustedUrl(url: string | undefined): boolean {
  if (!url) return false;
  const origins = [APP_ORIGIN, process.env["ELECTRON_RENDERER_URL"]?.replace(/\/$/, "")].filter((o): o is string => Boolean(o));
  return origins.some((o) => url === o || url.startsWith(`${o}/`) || url.startsWith(`${o}?`) || url.startsWith(`${o}#`));
}

function assertTrusted(url: string | undefined): void {
  if (!isTrustedUrl(url)) throw new Error("untrusted sender");
}

type FlushResult = ExitSaveOutcome | "failed" | "timeout" | "stay" | "unavailable";
let flushRequestId = 0;

interface WindowExit {
  decision: Promise<boolean>;
  signal: AbortSignal;
  readonly saved: ExitSaveSummary | undefined;
  release(): void;
}

/** 检查与许可均绑定当前主文档，直到关窗或整轮取消。 */
function requestWindowExit(win: BrowserWindow) {
  const sender = win.webContents;
  const frame = sender.mainFrame;
  const controller = new AbortController();
  const requestId = ++flushRequestId;
  let release!: () => void;
  const result = new Promise<FlushResult>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let phase: ExitPhase = "checking";
    let receivedProgress = false;
    const finish = (result: FlushResult) => {
      clearTimeout(timer);
      ipcMain.off("huhu:exit-progress", onProgress);
      ipcMain.off("huhu:flushed", onReply);
      resolve(result);
    };
    const matches = (event: Electron.IpcMainEvent, replyId: unknown) => event.sender === sender && !sender.isDestroyed() && event.senderFrame === frame && replyId === requestId && isTrustedUrl(event.senderFrame?.url);
    const setDeadline = () => {
      clearTimeout(timer);
      if (phase !== "waiting") timer = setTimeout(() => finish(phase === "flushing" ? "timeout" : receivedProgress ? "stay" : "unavailable"), 3000);
    };
    const onProgress = (event: Electron.IpcMainEvent, replyId: unknown, next: unknown) => {
      if (!matches(event, replyId) || phase === "flushing") return;
      if (next !== "checking" && next !== "waiting" && next !== "flushing") return;
      receivedProgress = true;
      phase = next;
      setDeadline();
    };
    const onReply = (event: Electron.IpcMainEvent, replyId: unknown, reply: unknown) => {
      if (!matches(event, replyId)) return;
      if (reply === "stay") finish("stay");
      if (reply === false) finish(phase === "flushing" ? "failed" : "stay");
      if (phase === "flushing" && isExitSaveOutcome(reply)) finish(reply);
    };
    const onNavigation = ({ isMainFrame, isSameDocument }: Electron.WebContentsDidStartNavigationEventParams) => {
      if (isMainFrame && !isSameDocument) release();
    };
    const invalidate = (result: FlushResult) => {
      if (controller.signal.aborted) return;
      controller.abort();
      finish(result);
      sender.off("did-start-navigation", onNavigation);
      sender.off("render-process-gone", onRendererGone);
      sender.off("destroyed", release);
      if (!sender.isDestroyed() && sender.mainFrame === frame && isTrustedUrl(frame.url)) {
        try {
          sender.send("huhu:exit-release", requestId);
        } catch {
          // 文档可能在发送前退出。
        }
      }
    };
    release = () => invalidate("stay");
    const onRendererGone = () => invalidate("unavailable");
    setDeadline();
    ipcMain.on("huhu:exit-progress", onProgress);
    ipcMain.on("huhu:flushed", onReply);
    sender.on("did-start-navigation", onNavigation);
    sender.once("render-process-gone", onRendererGone);
    sender.once("destroyed", release);
    try {
      if (showingRecovery(win)) finish("unavailable");
      else sender.send("huhu:flush", requestId);
    } catch {
      onRendererGone();
    }
  });
  return { result, signal: controller.signal, release };
}

function rendererAddress(): string {
  return process.env["ELECTRON_RENDERER_URL"] ?? `${APP_ORIGIN}/index.html`;
}

async function recoverUnresponsiveWindow(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false;
  const recovery = showingRecovery(win);
  const answer = await dialog.showMessageBox(win, {
    type: "warning",
    title: "无法确认退出",
    message: "工作台没有响应关闭请求",
    detail: recovery ? "可重新加载以检查可恢复内容，或在无法确认保存结果的情况下关闭。" : "可以保留窗口，或重新加载工作台后再检查未处理的内容。",
    buttons: recovery ? ["保留窗口", "重新加载工作台", "未确认保存，仍关闭"] : ["保留窗口", "重新加载工作台"],
    defaultId: 0,
    cancelId: 0,
  });
  if (answer.response === 1 && !win.isDestroyed()) await win.loadURL(rendererAddress());
  return recovery && answer.response === 2 && showingRecovery(win);
}

const exitDecisions = new WeakMap<BrowserWindow, WindowExit>();
function canCloseWindow(win: BrowserWindow): WindowExit {
  const pending = exitDecisions.get(win);
  if (pending) return pending;
  const request = requestWindowExit(win);
  let saved: ExitSaveSummary | undefined;
  const decision = (async () => {
    const result = await request.result;
    if (result === "unavailable") {
      return recoverUnresponsiveWindow(win);
    }
    if (request.signal.aborted || result === "stay") return false;
    if (result === "timeout") console.warn("退出前保存未在 3 秒内回执");
    if (typeof result === "object" && !result.failed) {
      saved = result;
      return true;
    }
    const unconfirmed = result === "timeout";
    const completed = typeof result === "object" ? exitSaveMessage(result) : "";
    const answer = await dialog.showMessageBox(win, {
      type: "warning",
      title: unconfirmed ? "无法确认退出前的保存结果" : "退出前保存失败",
      message: unconfirmed ? "保存请求没有回执" : "仍有未保存内容",
      detail: unconfirmed ? "可以保留窗口，核对文档后重试保存。" : `${completed}${completed ? "\n" : ""}可以保留窗口并重试保存，或放弃未保存内容并退出。`,
      buttons: ["保留窗口", unconfirmed ? "未确认保存，仍退出" : "放弃并退出"],
      defaultId: 0,
      cancelId: 0,
      signal: request.signal,
    });
    return !request.signal.aborted && answer.response === 1;
  })().catch((error: unknown) => {
    console.error("退出前确认失败", error);
    return false;
  });
  const exit: WindowExit = {
    decision,
    signal: request.signal,
    get saved() {
      return saved;
    },
    release: () => {
      if (exitDecisions.get(win) === exit) exitDecisions.delete(win);
      request.release();
    },
  };
  exitDecisions.set(win, exit);
  return exit;
}
let flushedForQuit = false;
let quitting = false;
let attachAppMenu: ((win: BrowserWindow) => void) | undefined;

function createWindow(chrome: ReturnType<typeof installWindowChrome>): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "HUHU",
    ...nativeTitleOptions(),
    icon: iconPath,
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  chrome.attach(win);
  attachAppMenu?.(win);
  // 点窗口 X：窗口销毁后 before-quit 已经没有可通知的界面了，所以在这里先落盘再关
  let closing = false;
  win.on("close", (event) => {
    if (flushedForQuit || (!supervisor && !quitting)) return;
    event.preventDefault();
    if (closing || quitting) return;
    closing = true;
    const engine = supervisor;
    const exit = canCloseWindow(win);
    void exit.decision.then((allowed) => {
      closing = false;
      // 应用退出已接管本窗口的在途检查；其余窗口取消时也保留此窗。
      if (quitting || flushedForQuit) return;
      if (allowed && !exit.signal.aborted && !win.isDestroyed() && engine === supervisor) {
        if (exit.saved && engine) showExitSaveFeedback(engine.vaultRoot, exit.saved);
        win.destroy();
      }
      exit.release();
    });
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  hardenWindowForPreview(
    win.webContents,
    (nonce) => preview?.blocked(nonce),
    (nonce) => preview?.grants.get(nonce) !== undefined,
  );
  let workbenchDocument = false;
  win.webContents.on("did-navigate", (_event, url) => {
    workbenchDocument = chrome.trustedDocument(url);
  });
  const showRecovery = (detail: string) => {
    if (win.isDestroyed() || quitting || flushedForQuit) return;
    const address = windowErrorPage(detail, app.getPath("logs"), rendererAddress(), chrome.colors(win));
    recoveryPages.set(win, address);
    void win.loadURL(address).catch(() => undefined);
  };
  // 只为工作台主框架的实际失败显示错误页。新导航取消旧加载时会报告 ERR_ABORTED。
  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isTrustedUrl(url)) return;
    showRecovery(`${desc} (${code})`);
  });
  win.webContents.on("render-process-gone", (_event, { reason }) => {
    if (reason !== "clean-exit" && workbenchDocument) setImmediate(() => showRecovery(`工作台进程已退出（${reason}）`));
  });
  void win.loadURL(rendererAddress()).catch(() => undefined);
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
    const chrome = installWindowChrome(rendererAddress());
    attachAppMenu = installAppMenu(isTrustedUrl, readBuildInfo);
    // macOS 开发模式没有 .app 包，Dock 图标需要手动设置；打包后由 icns 提供
    if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(iconPath);
    const root = path.join(import.meta.dirname, "../renderer");
    protocol.handle("huhu-app", async (request) => {
      const url = new URL(request.url);
      const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      const file = path.join(root, rel || "index.html");
      if (!file.startsWith(root)) return new Response("forbidden", { status: 403 });
      // 渲染器资源里没有的子资源请求（笔记里的 <img src="docs/attachments/a.png">）→ 当作 Vault 相对路径读取（路径守卫同 HTML 预览）
      if (!existsSync(file)) {
        const media = await handleVaultMediaRequest({ url: request.url, method: request.method, accept: request.headers.get("accept"), range: request.headers.get("range") }, current?.path ?? null);
        if (media) return media;
      }
      return net.fetch(pathToFileURL(file).toString());
    });
    const broadcast = (state: string) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send("huhu:engineState", state);
    };
    let current: { path: string; readOnly: boolean } | null = null;
    preview = registerPreviewHandlers({ vaultRoot: () => current?.path ?? null, frameAncestors: () => process.env["ELECTRON_RENDERER_URL"]?.replace(/\/$/, "") ?? APP_ORIGIN, assertTrusted });
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
      preview?.revokeAll(); // 旧 Vault 的预览授权立即失效
      if (supervisor) await supervisor.stop();
      supervisor = null;
      current = null;
      chrome.setVaultTitle();
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
      chrome.setVaultTitle(path.basename(target));
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
    ipcMain.handle("huhu:openExternal", async (event, value: unknown) => {
      const frame = event.senderFrame;
      assertTrusted(frame?.url);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!frame || frame.parent || !win) return false;
      const documentUrl = frame.url;
      const webUrl = externalHttpUrl(value);
      if (webUrl) return confirmExternalLink(win, webUrl, () => !frame.isDestroyed() && frame.url === documentUrl);
      const url = typeof value === "string" ? URL.parse(value) : null;
      if (!url || !["mailto:", "tel:"].includes(url.protocol)) throw new Error("unsupported external URL");
      await shell.openExternal(url.href);
      return true;
    });

    ipcMain.handle("huhu:externalLinkPreview", async (event, url: unknown) => {
      assertTrusted(event.senderFrame?.url);
      const vault = current;
      if (!vault) return { ok: false, reason: "disabled" };
      try {
        const settings = JSON.parse(await readFile(path.join(vault.path, ".huhu", "settings.json"), "utf8")) as { editor?: { linkPreviews?: unknown } };
        if (current !== vault || settings?.editor?.linkPreviews !== true) return { ok: false, reason: "disabled" };
        return await fetchExternalLinkPreview(url);
      } catch (error) {
        const missing = (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
        return { ok: false, reason: missing ? "disabled" : "unavailable" };
      }
    });
    ipcMain.handle("huhu:vault:state", async (event): Promise<VaultState> => {
      assertTrusted(event.senderFrame?.url);
      await startup; // 命令行 / 测试指定的 Vault 先打开完，界面再判断是否显示启动页
      return { path: current?.path ?? null, readOnly: current?.readOnly ?? false, recent, ...(startupError ? { error: startupError } : {}) };
    });
    const exitFeedbackRoot = (event: Electron.IpcMainInvokeEvent, expectedPath: unknown) => {
      assertTrusted(event.senderFrame?.url);
      return current && event.senderFrame === event.sender.mainFrame && current.path === expectedPath ? current.path : null;
    };
    ipcMain.handle("huhu:vault:exit-save", (event, expectedPath: unknown): ExitSaveReceipt | null => {
      const root = exitFeedbackRoot(event, expectedPath);
      return root ? readExitSaveFeedback(root) : null;
    });
    ipcMain.handle("huhu:vault:ack-exit-save", (event, expectedPath: unknown, id: unknown) => {
      const root = exitFeedbackRoot(event, expectedPath);
      if (root && typeof id === "string") acknowledgeExitSaveFeedback(root, id);
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
        preview?.revokeAll();
        if (supervisor) await supervisor.stop();
        supervisor = null;
        current = null;
        chrome.setVaultTitle();
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
    // 用系统应用打开 Vault 里的文件：路径必须在当前 Vault 内（真实路径），且只放行文档 / 图片 / 压缩包等类型——
    // 可执行文件、脚本、快捷方式绝不交给系统去运行，只在文件夹里显示它
    const OPENABLE = new Set([
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".txt",
      ".csv",
      ".json",
      ".yaml",
      ".yml",
      ".docx",
      ".xlsx",
      ".pptx",
      ".doc",
      ".xls",
      ".ppt",
      ".odt",
      ".ods",
      ".odp",
      ".rtf",
      ".mp3",
      ".mp4",
      ".mov",
      ".wav",
      ".zip",
    ]);
    ipcMain.handle("huhu:openVaultFile", async (event, rel: unknown, reveal?: unknown) => {
      assertTrusted(event.senderFrame?.url);
      if (!current || typeof rel !== "string" || rel.length === 0 || rel.length > 1000) return "denied";
      const root = realpathSync(current.path);
      let abs: string;
      try {
        abs = realpathSync(path.resolve(root, rel));
      } catch {
        return "missing";
      }
      if (abs !== root && !abs.startsWith(root + path.sep)) return "denied";
      if (reveal === true || !OPENABLE.has(path.extname(abs).toLowerCase())) {
        shell.showItemInFolder(abs);
        return "revealed";
      }
      const err = await shell.openPath(abs);
      return err ? "failed" : "opened";
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
    const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
    const rendererOrigin = rendererUrl ? URL.parse(rendererUrl)?.origin : undefined;
    registerMailAttachmentPicker(
      () => supervisor,
      (origin) => origin !== "null" && (origin === APP_ORIGIN || origin === rendererOrigin),
    );
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
    createWindow(chrome);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(chrome);
    });
  });
  app.on("before-quit", (e) => {
    if (flushedForQuit) return;
    if (quitting) {
      e.preventDefault();
      return;
    }
    // 没有打开 Vault 时让启动页正常关闭。
    const engine = supervisor;
    if (!engine) {
      flushedForQuit = true;
      return;
    }
    e.preventDefault();
    quitting = true;
    const exits = BrowserWindow.getAllWindows().map(canCloseWindow);
    const cancel = () => {
      for (const exit of exits) exit.signal.removeEventListener("abort", cancel);
      for (const exit of exits) exit.release();
    };
    for (const exit of exits) exit.signal.addEventListener("abort", cancel, { once: true });
    void Promise.all(
      exits.map(async (exit) => {
        const allowed = await exit.decision;
        if (!allowed) cancel();
        return allowed && !exit.signal.aborted;
      }),
    ).then(async (allowed) => {
      if (!allowed.every(Boolean) || exits.some((exit) => exit.signal.aborted) || supervisor !== engine) {
        cancel();
        quitting = false;
        return;
      }
      const resume = engine.current === "ready" || engine.current === "starting";
      let stopGeneration: number | undefined;
      try {
        stopGeneration = await engine.stop();
      } catch (error) {
        console.error("退出时停止引擎失败", error);
      }
      if (supervisor !== engine || exits.some((exit) => exit.signal.aborted)) {
        cancel();
        quitting = false;
        if (resume && supervisor === engine && stopGeneration !== undefined) engine.restartAfterStop(stopGeneration);
        return;
      }
      for (const exit of exits) exit.signal.removeEventListener("abort", cancel);
      const summary = { files: 0, drafts: 0 };
      for (const exit of exits) {
        if (!exit.saved) continue;
        summary.files += exit.saved.files;
        summary.drafts += exit.saved.drafts;
      }
      showExitSaveFeedback(engine.vaultRoot, summary);
      flushedForQuit = true;
      app.quit();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
