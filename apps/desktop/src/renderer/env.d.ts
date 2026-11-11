export {};
type EngineState = "starting" | "ready" | "stopped" | "crashed";
declare global {
  interface Window {
    huhuHost: {
      appInfo(): Promise<{ name: string; version: string; platform: string; arch: string; electron: string; chrome: string; node: string }>;
      revealVault(): Promise<void>;
      notices(): Promise<string>;
      engine(): Promise<{ baseUrl: string; token: string; vaultId: string }>;
      engineState(): Promise<EngineState>;
      restartEngine(): Promise<void>;
      onEngineState(cb: (s: EngineState) => void): () => void;
    };
  }
}
