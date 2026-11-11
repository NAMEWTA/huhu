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
  pickOpenPath: (kind: "zip" | "directory"): Promise<string | null> => ipcRenderer.invoke("huhu:pickOpenPath", kind),
  notices: (): Promise<string> => ipcRenderer.invoke("huhu:notices"),
  restartEngine: (): Promise<void> => ipcRenderer.invoke("huhu:restartEngine"),
  onEngineState: (cb: (s: EngineState) => void): (() => void) => {
    const handler = (_e: unknown, s: EngineState) => cb(s);
    ipcRenderer.on("huhu:engineState", handler);
    return () => ipcRenderer.removeListener("huhu:engineState", handler);
  },
});
