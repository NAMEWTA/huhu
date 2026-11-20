import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import type { AppMenuAction } from "@huhu/workbench";

const mac = process.platform === "darwin";
const empty = { workspace: false, document: null as string | null, documentVisible: false, writable: false };
const contexts = new WeakMap<BrowserWindow, typeof empty>();
const activeMenus = new WeakMap<BrowserWindow, Menu>();

export function installAppMenu(trustedUrl: (url: string | undefined) => boolean, buildInfo: () => { commit?: string }) {
  const menuFor = (win: BrowserWindow | null) => {
    const context = win ? (contexts.get(win) ?? empty) : empty;
    const frame = win?.webContents.mainFrame;
    const send = (action: AppMenuAction) => {
      if (win && !win.isDestroyed() && win.webContents.mainFrame === frame && trustedUrl(frame?.url)) win.webContents.send("huhu:app-menu-action", action);
    };
    const about = () => {
      const commit = buildInfo().commit;
      const info = { title: "关于 HUHU", message: `HUHU ${app.getVersion()}`, detail: commit ? `构建 ${commit}` : "HUHU 工作台" };
      if (win && !win.isDestroyed()) void dialog.showMessageBox(win, info);
      else void dialog.showMessageBox(info);
    };
    const document = context.documentVisible ? context.document : null;
    const workspace = context.workspace;
    const groups: MenuItemConstructorOptions[] = [
      {
        label: "HUHU",
        submenu: [
          { label: "关于 HUHU", click: about },
          ...(mac ? ([{ type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }] as const) : []),
          { label: "退出 HUHU", role: "quit" },
        ],
      },
      {
        label: "文件",
        submenu: [
          { label: workspace ? "切换 Vault" : "打开 Vault", enabled: Boolean(win), click: () => send({ kind: "vault" }) },
          {
            id: "huhu-document-save",
            label: "保存当前文档",
            accelerator: "CommandOrControl+S",
            enabled: workspace && context.writable && document !== null,
            click: () => {
              if (document) send({ kind: "save", document });
            },
          },
          {
            label: "关闭文档",
            enabled: workspace && document !== null,
            click: () => {
              if (document) send({ kind: "close-document", document });
            },
          },
        ],
      },
      {
        label: "编辑",
        submenu: [
          { role: "undo", label: "撤销" },
          { role: "redo", label: "重做" },
          { type: "separator" },
          { role: "cut", label: "剪切" },
          { role: "copy", label: "复制" },
          { role: "paste", label: "粘贴" },
          { role: "selectAll", label: "全选" },
        ],
      },
      {
        label: "视图",
        submenu: [
          { label: "搜索与命令", enabled: workspace, click: () => send({ kind: "palette" }) },
          { label: "切换专注模式", enabled: workspace, click: () => send({ kind: "focus" }) },
          { role: "togglefullscreen", label: "切换全屏", enabled: Boolean(win) },
        ],
      },
      {
        label: "窗口",
        submenu: [
          { role: "minimize", label: "最小化窗口", enabled: Boolean(win) },
          {
            label: "最大化或还原",
            enabled: Boolean(win),
            click: () => {
              if (win && !win.isDestroyed()) {
                if (win.isMaximized()) win.unmaximize();
                else win.maximize();
              }
            },
          },
          { role: "close", label: "关闭窗口", enabled: Boolean(win) },
        ],
      },
      {
        label: "帮助",
        submenu: [
          {
            label: "HUHU 使用说明",
            click: () => {
              void shell.openExternal("https://github.com/NAMEWTA/huhu");
            },
          },
        ],
      },
    ];
    return Menu.buildFromTemplate(groups);
  };
  const refresh = (win: BrowserWindow | null) => {
    if (mac) Menu.setApplicationMenu(menuFor(win));
  };
  const popup = (win: BrowserWindow, anchor?: { x: number; y: number }) => {
    if (mac || activeMenus.has(win) || !trustedUrl(win.webContents.mainFrame.url)) return;
    const menu = menuFor(win);
    activeMenus.set(win, menu);
    menu.popup({ window: win, ...anchor, callback: () => activeMenus.delete(win) });
  };
  function menuWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
    if (event.senderFrame !== event.sender.mainFrame || !trustedUrl(event.senderFrame?.url)) return null;
    return BrowserWindow.fromWebContents(event.sender);
  }
  ipcMain.handle("huhu:app-menu-open", (event, x: unknown, y: unknown) => {
    const win = menuWindow(event);
    if (!win) return;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const { width, height } = win.getContentBounds();
    popup(win, { x: Math.max(0, Math.min(width - 1, Math.round(x))), y: Math.max(0, Math.min(height - 1, Math.round(y))) });
  });
  ipcMain.handle("huhu:app-menu-context", (event, workspace: unknown, documentVisible: unknown, writable: unknown) => {
    const win = menuWindow(event);
    if (!win) return;
    contexts.set(win, { ...(contexts.get(win) ?? empty), workspace: workspace === true, documentVisible: documentVisible === true, writable: writable === true });
    if (win.isFocused()) refresh(win);
  });
  ipcMain.handle("huhu:app-menu-document", (event, document: unknown) => {
    const win = menuWindow(event);
    if (!win) return;
    contexts.set(win, { ...(contexts.get(win) ?? empty), document: typeof document === "string" && /^[0-9a-f-]{32,36}$/i.test(document) ? document : null });
    if (win.isFocused()) refresh(win);
  });
  if (mac) refresh(null);
  else Menu.setApplicationMenu(null);

  return (win: BrowserWindow) => {
    win.on("focus", () => refresh(win));
    win.on("closed", () => refresh(BrowserWindow.getFocusedWindow()));
    win.webContents.on("did-start-navigation", ({ isMainFrame, isSameDocument }) => {
      if (isMainFrame && !isSameDocument) {
        activeMenus.get(win)?.closePopup(win);
        contexts.delete(win);
        if (win.isFocused()) refresh(win);
      }
    });
    if (mac) return;
    let altOnly = false;
    win.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        altOnly = input.key === "Alt" && !input.control && !input.meta && !input.shift && (!input.isAutoRepeat || altOnly);
        if (input.key === "F10" && !input.alt && !input.control && !input.meta && !input.shift) {
          event.preventDefault();
          if (!input.isAutoRepeat) popup(win, { x: 8, y: 38 });
        }
      } else if (input.type === "keyUp" && input.key === "Alt" && altOnly) {
        altOnly = false;
        event.preventDefault();
        popup(win, { x: 8, y: 38 });
      }
    });
    win.on("blur", () => {
      altOnly = false;
    });
  };
}
