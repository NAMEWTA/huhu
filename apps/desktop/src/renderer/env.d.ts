export {};
type EngineState = "starting" | "ready" | "stopped" | "crashed";
declare global {
  interface Window {
    huhuHost: {
      appInfo(): Promise<{ name: string; version: string; platform: string }>;
      engine(): Promise<{ baseUrl: string; token: string; vaultId: string }>;
      engineState(): Promise<EngineState>;
      restartEngine(): Promise<void>;
      onEngineState(cb: (s: EngineState) => void): () => void;
    };
  }
}
