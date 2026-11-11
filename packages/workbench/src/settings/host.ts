/** Electron 主进程经 preload 暴露的宿主能力（浏览器里单独运行界面时不存在）。 */
export interface HostApi {
  appInfo(): Promise<{ name: string; version: string; commit?: string; builtAt?: string; platform: string; arch: string; electron: string; chrome: string; node: string }>;
  revealVault(): Promise<void>;
  pickSavePath(defaultName: string): Promise<string | null>;
  pickOpenPath(kind: "zip" | "directory" | "file"): Promise<string | null>;
  /** 复制文本；clearAfterMs 到点后若剪贴板仍是这段文本则清除（用于秘密值）。 */
  copyText(value: string, opts?: { clearAfterMs?: number }): Promise<void>;
  cliStatus(): Promise<unknown>;
  cliInstall(): Promise<unknown>;
  cliUninstall(): Promise<unknown>;
  notices(): Promise<string>;
}

export const host = (): HostApi | undefined => (globalThis as { huhuHost?: HostApi }).huhuHost;
