import { defineConfig } from "@playwright/test";

/** 样式等价性验证（tests/visual）：与默认 e2e 分开，只通过 `pnpm visual:*` 运行。基线按名字保存在 .visual/<name>/（不进 git）。 */
const name = process.env["VISUAL_NAME"] ?? "scratch";

export default defineConfig({
  testDir: "tests/visual",
  timeout: 20 * 60_000,
  retries: 0,
  workers: 1, // Electron 单实例锁
  reporter: [["list"]],
  snapshotPathTemplate: `.visual/${name}/shots/{arg}{ext}`,
  use: { trace: "off" },
});
