import { contextBridge, ipcRenderer } from "electron";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

contextBridge.exposeInMainWorld("huhuHost", {
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke("huhu:appInfo"),
});
