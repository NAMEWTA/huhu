import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: { build: { outDir: "out/main", rollupOptions: { input: { index: "src/main/index.ts" } } } },
  preload: { build: { outDir: "out/preload", rollupOptions: { input: { index: "src/preload/index.ts" }, output: { format: "cjs", entryFileNames: "[name].cjs" } } } },
  renderer: { root: "src/renderer", plugins: [react()], build: { outDir: "out/renderer", rollupOptions: { input: "src/renderer/index.html" } } },
});
