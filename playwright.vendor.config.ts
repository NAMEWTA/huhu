import { defineConfig } from "@playwright/test";

// 编辑器 vendor 的真实 Electron 验证（SP-6 等）；与主 e2e 分开，避免互相影响。
export default defineConfig({
  testDir: "packages/editor/test/e2e",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
