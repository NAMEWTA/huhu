// 上游（Open Knowledge）测试独立运行（G04 / OP-D16）。
import babel from "@rolldown/plugin-babel";
import { lingui } from "@lingui/vite-plugin";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { okAliases } from "./build/aliases.mjs";

const aliases = okAliases(import.meta.dirname);
const macroShim = fileURLToPath(new URL("./src/vendor/open-knowledge/app/tests/lingui-macro-shim.tsx", import.meta.url));
const exclude = Object.keys(JSON.parse(readFileSync(new URL("./test/vendor-not-applicable.json", import.meta.url), "utf8")));

export default defineConfig({
  test: {
    projects: [
      {
        // 与应用构建相同的 Lingui 宏管线（评论 store / ThreadCard 等）。
        plugins: [react(), babel({ plugins: ["@lingui/babel-plugin-lingui-macro"], presets: [] } as never), lingui()],
        resolve: { alias: aliases },
        test: {
          name: "ok-node",
          exclude,
          include: ["src/vendor/open-knowledge/core/src/**/*.test.ts", "src/vendor/open-knowledge/app/src/comments/**/*.test.ts"],
          environment: "node",
          setupFiles: ["./test/vendor-setup.ts"],
          testTimeout: 30_000,
        },
      },
      {
        // 上游 app 行为测试沿用 OK 的英语宏替身与 jsdom 初始化。
        plugins: [react()],
        resolve: {
          alias: [{ find: "@lingui/react/macro", replacement: macroShim }, { find: "@lingui/core/macro", replacement: macroShim }, ...aliases],
        },
        test: {
          name: "ok-app",
          exclude,
          include: ["src/vendor/open-knowledge/app/src/{editor,components}/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          environmentOptions: { jsdom: { url: "http://localhost:5173", pretendToBeVisual: true } },
          setupFiles: ["./test/vendor-setup.ts", "./test/vendor-jsdom-setup.ts"],
          testTimeout: 30_000,
        },
      },
    ],
    reporters: ["default", "json"],
    outputFile: { json: "test-results/vendor.json" },
  },
});
