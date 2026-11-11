/** Electron 主进程经 preload 暴露的宿主能力（浏览器里单独运行界面时不存在）。 */
export interface HostApi {
  appInfo(): Promise<{ name: string; version: string; platform: string; arch: string; electron: string; chrome: string; node: string }>;
  revealVault(): Promise<void>;
  pickSavePath(defaultName: string): Promise<string | null>;
  pickOpenPath(kind: "zip" | "directory"): Promise<string | null>;
  notices(): Promise<string>;
}

export const host = (): HostApi | undefined => (globalThis as { huhuHost?: HostApi }).huhuHost;
