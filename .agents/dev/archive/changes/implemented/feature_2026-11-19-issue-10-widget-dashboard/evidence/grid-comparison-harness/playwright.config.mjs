import { defineConfig } from "@playwright/test";
import { join } from "node:path";

const outputDir = process.env.HUHU_GRID_OUTPUT_DIR ?? "../grid-comparison-results/artifacts";

export default defineConfig({
  testDir: ".",
  testMatch: "comparison.spec.ts",
  outputDir,
  reporter: [["list"], ["json", { outputFile: join(outputDir, "result.json") }]],
  workers: 1,
  retries: 0,
  timeout: 35_000,
  use: {
    baseURL: "http://127.0.0.1:42710",
    browserName: "chromium",
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
    trace: "on",
    screenshot: "on",
  },
});
