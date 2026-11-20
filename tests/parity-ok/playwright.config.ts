import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "compare.spec.ts",
  outputDir: "../../test-results/parity-ok",
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 10_000 },
  reporter: "list",
});
