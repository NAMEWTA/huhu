export {};
declare global {
  interface Window {
    huhuHost: { appInfo(): Promise<{ name: string; version: string; platform: string }> };
  }
}
