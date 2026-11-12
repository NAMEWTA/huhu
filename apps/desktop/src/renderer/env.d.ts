export {};
type EngineState = "starting" | "ready" | "stopped" | "crashed";
declare global {
  interface Window {
    huhuHost: {
      appInfo(): Promise<{ name: string; version: string; platform: string; arch: string; electron: string; chrome: string; node: string }>;
      revealVault(): Promise<void>;
      openVaultFile(rel: string): Promise<"opened" | "revealed" | "denied" | "missing" | "failed">;
      pickSavePath(defaultName: string): Promise<string | null>;
      pickOpenPath(kind: "zip" | "directory" | "file"): Promise<string | null>;
      cliStatus(): Promise<unknown>;
      cliInstall(): Promise<unknown>;
      cliUninstall(): Promise<unknown>;
      notices(): Promise<string>;
      vault: import("@huhu/workbench").VaultHostApi;
      engine(): Promise<{ baseUrl: string; token: string; vaultId: string }>;
      engineState(): Promise<EngineState>;
      restartEngine(): Promise<void>;
      onFlush(cb: () => Promise<void>): void;
      onEngineState(cb: (s: EngineState) => void): () => void;
    };
  }
}
