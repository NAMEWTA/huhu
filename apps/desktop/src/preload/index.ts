import { contextBridge, ipcRenderer } from "electron";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

type EngineState = "starting" | "ready" | "stopped" | "crashed";

contextBridge.exposeInMainWorld("huhuHost", {
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke("huhu:appInfo"),
  engine: (): Promise<{ baseUrl: string; token: string; vaultId: string }> => ipcRenderer.invoke("huhu:engine"),
  engineState: (): Promise<EngineState> => ipcRenderer.invoke("huhu:engineState"),
  restartEngine: (): Promise<void> => ipcRenderer.invoke("huhu:restartEngine"),
  onEngineState: (cb: (s: EngineState) => void): (() => void) => {
    const handler = (_e: unknown, s: EngineState) => cb(s);
    ipcRenderer.on("huhu:engineState", handler);
    return () => ipcRenderer.removeListener("huhu:engineState", handler);
  },
});
