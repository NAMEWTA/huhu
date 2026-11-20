import { okAliases } from "./build/aliases.mjs";
import { configDefaults, defineConfig } from "vitest/config";

// 默认测试（pnpm test）只跑 Huhu 自有测试；上游迁入的测试在 vitest.vendor.config.ts（pnpm test:vendor），e2e 走 playwright.vendor.config.ts
export default defineConfig({
  resolve: { alias: okAliases(import.meta.dirname) },
  test: { exclude: [...configDefaults.exclude, "src/vendor/**", "test/e2e/**", "harness-dist/**"] },
});
