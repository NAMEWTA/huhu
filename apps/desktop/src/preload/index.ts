import { contextBridge, ipcRenderer } from "electron";
import type { DesktopDraftAttachmentHost } from "@huhu/plugin-mail/desktop-attachments";
import type { AppMenuAction, AppMenuHost } from "@huhu/workbench";
import type { PrepareExit, ReleaseExit } from "../exit-ipc.js";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
}

type EngineState = "starting" | "ready" | "stopped" | "crashed";

contextBridge.exposeInMainWorld("huhuHost", {
  appMenu: {
    button: process.platform !== "darwin",
    open: (x, y) => ipcRenderer.invoke("huhu:app-menu-open", x, y),
    update: (workspace, documentVisible, writable) => ipcRenderer.invoke("huhu:app-menu-context", workspace, documentVisible, writable),
    document: (id) => ipcRenderer.invoke("huhu:app-menu-document", id),
    onAction(callback) {
      const listener = (_event: unknown, action: AppMenuAction) => callback(action);
      ipcRenderer.on("huhu:app-menu-action", listener);
      return () => ipcRenderer.off("huhu:app-menu-action", listener);
    },
  } satisfies AppMenuHost,
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke("huhu:appInfo"),
  engine: (): Promise<{ baseUrl: string; token: string; vaultId: string }> => ipcRenderer.invoke("huhu:engine"),
  engineState: (): Promise<EngineState> => ipcRenderer.invoke("huhu:engineState"),
  revealVault: (): Promise<void> => ipcRenderer.invoke("huhu:revealVault"),
  openVaultFile: (rel: string, reveal?: boolean): Promise<"opened" | "revealed" | "denied" | "missing" | "failed"> => ipcRenderer.invoke("huhu:openVaultFile", rel, reveal === true),
  /** HTML 预览：为 Vault 内的文件签发一次一页的预览 URL（主进程校验路径）；标签关闭 / 换文件时撤销。 */
  previewGrant: (rel: string): Promise<{ ok: true; url: string; nonce: string } | { ok: false; reason: string }> => ipcRenderer.invoke("huhu:previewGrant", rel),
  previewRevoke: (nonce: string): Promise<void> => ipcRenderer.invoke("huhu:previewRevoke", nonce),
  onPreviewBlocked: (cb: (e: { nonce: string; count: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { nonce: string; count: number }) => cb(p);
    ipcRenderer.on("huhu:previewBlocked", handler);
    return () => ipcRenderer.removeListener("huhu:previewBlocked", handler);
  },
  pickSavePath: (defaultName: string): Promise<string | null> => ipcRenderer.invoke("huhu:pickSavePath", defaultName),
  pickOpenPath: (kind: "zip" | "directory" | "file"): Promise<string | null> => ipcRenderer.invoke("huhu:pickOpenPath", kind),
  mailDraftAttachments: {
    selectAndAdd: (input) => ipcRenderer.invoke("huhu:mail-draft-attachment:select", input),
    cancel: (operationId) => ipcRenderer.invoke("huhu:mail-draft-attachment:cancel", operationId),
  } satisfies DesktopDraftAttachmentHost,
  vault: {
    state: (): Promise<unknown> => ipcRenderer.invoke("huhu:vault:state"),
    open: (target: string, opts?: { kind?: "open" | "new"; readOnly?: boolean }): Promise<unknown> => ipcRenderer.invoke("huhu:vault:open", target, opts),
    openDemo: (target: string): Promise<unknown> => ipcRenderer.invoke("huhu:vault:demo", target),
    importPackage: (zip: string, target: string): Promise<unknown> => ipcRenderer.invoke("huhu:vault:import", zip, target),
    close: (): Promise<void> => ipcRenderer.invoke("huhu:vault:close"),
  },
  saveTextFile: (name: string, content: string): Promise<boolean> => ipcRenderer.invoke("huhu:saveTextFile", name, content),
  copyText: (value: string, opts?: { clearAfterMs?: number }): Promise<void> => ipcRenderer.invoke("huhu:copyText", value, opts?.clearAfterMs),
  cliStatus: (): Promise<unknown> => ipcRenderer.invoke("huhu:cliStatus"),
  cliInstall: (): Promise<unknown> => ipcRenderer.invoke("huhu:cliInstall"),
  cliUninstall: (): Promise<unknown> => ipcRenderer.invoke("huhu:cliUninstall"),
  notices: (): Promise<string> => ipcRenderer.invoke("huhu:notices"),
  restartEngine: (): Promise<void> => ipcRenderer.invoke("huhu:restartEngine"),
  /** 只传本次退出的 ID 与状态，Electron 事件留在 preload。 */
  onExit: (prepare: PrepareExit, release: ReleaseExit): (() => void) => {
    const onRequest = (_event: unknown, requestId: number) => {
      void Promise.resolve()
        .then(() => prepare(requestId, (phase) => ipcRenderer.send("huhu:exit-progress", requestId, phase)))
        .then(
          (result) => ipcRenderer.send("huhu:flushed", requestId, result),
          () => ipcRenderer.send("huhu:flushed", requestId, false),
        );
    };
    const onRelease = (_event: unknown, requestId: number) => release(requestId);
    ipcRenderer.on("huhu:flush", onRequest);
    ipcRenderer.on("huhu:exit-release", onRelease);
    return () => {
      ipcRenderer.off("huhu:flush", onRequest);
      ipcRenderer.off("huhu:exit-release", onRelease);
    };
  },
  onEngineState: (cb: (s: EngineState) => void): (() => void) => {
    const handler = (_e: unknown, s: EngineState) => cb(s);
    ipcRenderer.on("huhu:engineState", handler);
    return () => ipcRenderer.removeListener("huhu:engineState", handler);
  },
});
