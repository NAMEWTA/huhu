import { contextBridge, ipcRenderer } from "electron";

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
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke("huhu:appInfo"),
  engine: (): Promise<{ baseUrl: string; token: string; vaultId: string }> => ipcRenderer.invoke("huhu:engine"),
  engineState: (): Promise<EngineState> => ipcRenderer.invoke("huhu:engineState"),
  revealVault: (): Promise<void> => ipcRenderer.invoke("huhu:revealVault"),
  pickSavePath: (defaultName: string): Promise<string | null> => ipcRenderer.invoke("huhu:pickSavePath", defaultName),
  pickOpenPath: (kind: "zip" | "directory" | "file"): Promise<string | null> => ipcRenderer.invoke("huhu:pickOpenPath", kind),
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
  /** 应用退出前主进程会请求界面把未落盘的编辑写出去；回调完成后回 ack。 */
  onFlush: (cb: () => Promise<void>): void => {
    ipcRenderer.on("huhu:flush", () => {
      void cb()
        .catch(() => undefined)
        .finally(() => ipcRenderer.send("huhu:flushed"));
    });
  },
  onEngineState: (cb: (s: EngineState) => void): (() => void) => {
    const handler = (_e: unknown, s: EngineState) => cb(s);
    ipcRenderer.on("huhu:engineState", handler);
    return () => ipcRenderer.removeListener("huhu:engineState", handler);
  },
});
