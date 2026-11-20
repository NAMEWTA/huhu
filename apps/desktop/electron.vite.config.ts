import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { resolve } from "node:path";
import { okAliases } from "../../packages/editor/build/aliases.mjs";
import okScopePlugin from "../../packages/editor/build/ok-scope-plugin.mjs";
import { createPdfjsViewerAssetsPlugin } from "./scripts/pdfjs-viewer-assets";

const EDITOR_ROOT = resolve(import.meta.dirname, "../../packages/editor");
// Lingui 的 CLI / vite 插件 / babel 宏都从环境变量或 cwd 找配置；渲染进程构建的 cwd 是 apps/desktop，所以显式指向编辑器包的配置
process.env.LINGUI_CONFIG ??= resolve(EDITOR_ROOT, "lingui.config.ts");

export default defineConfig({
  main: {
    build: {
      // 工作区包是 TS 源码，必须被打进 index.js/engine.js；原生模块在 rollupOptions.external 中单独外部化
      externalizeDeps: {
        exclude: [
          "@huhu/engine",
          "@huhu/plugin-mail",
          "@huhu/plugin-notes",
          "@huhu/plugin-ssh",
          "@huhu/plugin-versioning",
          "@huhu/plugin-automations",
          "@huhu/plugin-agent-cli",
          "@huhu/plugin-agent-guide",
          "@huhu/plugin-safe",
          "@huhu/plugin-inbox",
          "@huhu/kernel",
          "@huhu/vault",
          "@huhu/contracts",
          "@huhu/cordis",
          "@huhu/cosmokit",
          "@huhu/cordis-timer",
          "@huhu/plugin-tasks",
        ],
      },
      outDir: "out/main",
      rollupOptions: {
        input: { index: "src/main/index.ts", engine: "../engine/src/main.ts" },
        // 原生模块不打包；其余工作区源码被打进各自入口
        external: ["electron", "@napi-rs/keyring", "@parcel/watcher", "bufferutil", "utf-8-validate", "cpu-features", "ssh2", "imapflow"],
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: { build: { outDir: "out/preload", rollupOptions: { input: { index: "src/preload/index.ts" }, output: { format: "cjs", entryFileNames: "[name].cjs" } } } },
  renderer: {
    root: "src/renderer",
    // OK 编辑器 vendor（decisions OP-D05 / D06）：Lingui 宏（babel）、.po 目录、Tailwind v4。
    // Tailwind 只处理含 tailwind 指令的 CSS（packages/editor/src/ok/ok-globals.css），其余 Huhu CSS 不受影响；
    // okScopePlugin 把该文件的产出限定到 .ok-root 并放进 vendor.ok-* 子层。
    plugins: [react(), createPdfjsViewerAssetsPlugin(), babel({ plugins: ["@lingui/babel-plugin-lingui-macro"], presets: [] } as never), lingui({ configPath: resolve(EDITOR_ROOT, "lingui.config.ts") }), tailwindcss()],
    css: { postcss: { plugins: [okScopePlugin()] } },
    resolve: { alias: okAliases(EDITOR_ROOT) },
    build: { outDir: "out/renderer", rollupOptions: { input: "src/renderer/index.html" } },
  },
});
