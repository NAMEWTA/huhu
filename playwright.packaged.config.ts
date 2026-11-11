import { defineConfig } from "@playwright/test";

/** 打包后的 E2E 子集：对 HUHU_PACKAGED_EXE 指向的可执行文件运行（release.md §5）。 */
export default defineConfig({
  testDir: "tests/e2e/packaged",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
});
