/** Electron 主进程经 preload 暴露的宿主能力（浏览器里单独运行界面时不存在）。 */
export interface HostApi {
  appInfo(): Promise<{ name: string; version: string; commit?: string; builtAt?: string; platform: string; arch: string; electron: string; chrome: string; node: string }>;
  revealVault(): Promise<void>;
  /** 用系统应用打开 Vault 里的文件（主进程校验路径在 Vault 内并按扩展名白名单放行；其余只在文件夹中显示）。 */
  openVaultFile?(rel: string, reveal?: boolean): Promise<"opened" | "revealed" | "denied" | "missing" | "failed">;
  pickSavePath(defaultName: string): Promise<string | null>;
  pickOpenPath(kind: "zip" | "directory" | "file"): Promise<string | null>;
  /** 弹出保存对话框并写出文本（扩展命令返回 saveFile 时用）；用户取消返回 false。 */
  saveTextFile(name: string, content: string): Promise<boolean>;
  /** 复制文本；clearAfterMs 到点后若剪贴板仍是这段文本则清除（用于秘密值）。 */
  copyText(value: string, opts?: { clearAfterMs?: number }): Promise<void>;
  cliStatus(): Promise<unknown>;
  cliInstall(): Promise<unknown>;
  cliUninstall(): Promise<unknown>;
  notices(): Promise<string>;
  vault: VaultHostApi;
}

export interface VaultHostState {
  path: string | null;
  readOnly: boolean;
  recent: { path: string; name: string; at: string }[];
  error?: string;
}
export type VaultOpenResult = { ok: true } | { ok: false; code: string; message: string };
/** 启动页与“切换 Vault”用的宿主能力（Main 管理 Engine 的生命周期）。 */
export interface VaultHostApi {
  state(): Promise<VaultHostState>;
  open(target: string, opts?: { kind?: "open" | "new"; readOnly?: boolean }): Promise<VaultOpenResult>;
  openDemo(target: string): Promise<VaultOpenResult>;
  importPackage(zip: string, target: string): Promise<VaultOpenResult>;
  close(): Promise<void>;
}

export const host = (): HostApi | undefined => (globalThis as { huhuHost?: HostApi }).huhuHost;
