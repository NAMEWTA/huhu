import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      // 工作区包是 TS 源码，必须被打进 index.js/engine.js；原生模块在 rollupOptions.external 中单独外部化
      externalizeDeps: { exclude: ["@huhu/engine", "@huhu/plugin-notes", "@huhu/kernel", "@huhu/vault", "@huhu/contracts", "@huhu/cordis", "@huhu/cosmokit", "@huhu/cordis-timer", "@huhu/plugin-tasks"] },
      outDir: "out/main",
      rollupOptions: {
        input: { index: "src/main/index.ts", engine: "../engine/src/main.ts" },
        // 原生模块不打包；其余工作区源码被打进各自入口
        external: ["electron", "@parcel/watcher", "bufferutil", "utf-8-validate"],
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: { build: { outDir: "out/preload", rollupOptions: { input: { index: "src/preload/index.ts" }, output: { format: "cjs", entryFileNames: "[name].cjs" } } } },
  renderer: { root: "src/renderer", plugins: [react()], build: { outDir: "out/renderer", rollupOptions: { input: "src/renderer/index.html" } } },
});
