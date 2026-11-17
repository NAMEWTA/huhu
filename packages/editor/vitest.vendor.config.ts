// 上游（Open Knowledge）测试：迁入 vendor 目录后在这里单独运行（G04 / OP-D16）。
// 首版只含 core 的测试（node 环境）；app 的 dom 测试依赖上游 tests/dom/jsdom-preload.ts 与 test-support，尚未迁入。
import babel from "@rolldown/plugin-babel";
import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { okAliases } from "./build/aliases.mjs";

export default defineConfig({
  // 与应用构建相同的 Lingui 宏管线（t`…` 在 store / ThreadCard 等 app 源码里）
  plugins: [react(), babel({ plugins: ["@lingui/babel-plugin-lingui-macro"], presets: [] } as never), lingui()],
  resolve: { alias: okAliases(import.meta.dirname) },
  test: {
    include: ["src/vendor/open-knowledge/core/src/**/*.test.ts", "src/vendor/open-knowledge/app/src/comments/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./test/vendor-setup.ts"],
    testTimeout: 30_000,
    reporters: ["default", "json"],
    outputFile: { json: "test-results/vendor.json" },
  },
});
