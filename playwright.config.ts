import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: ["packaged/**"],
  timeout: 60_000,
  retries: 0,
  workers: 1, // Electron 的单实例锁与共享用户数据目录：多个 worker 同时启动会互相冲突（ETXTBSY / 被锁）
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
