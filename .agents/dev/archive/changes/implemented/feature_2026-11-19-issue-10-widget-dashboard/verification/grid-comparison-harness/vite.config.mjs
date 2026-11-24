import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { homarrSource } from "./homarr-source.mjs";

export default defineConfig({
  plugins: [homarrSource(fileURLToPath(new URL("../../sources/homarr/apps/nextjs/src/components/board/layout/", import.meta.url)))],
  resolve: {
    dedupe: ["react", "react-dom"],
    // The browser dev server loads barrel re-exports eagerly, including Node-only ID helpers.
    alias: [{ find: /^@huhu\/contracts$/, replacement: fileURLToPath(new URL("./browser-contracts.ts", import.meta.url)) }],
  },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { entries: ["index.html"], include: ["react-grid-layout", "react-grid-layout/core", "gridstack"] },
  server: {
    fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] },
    watch: { ignored: ["**/artifacts*", "**/artifacts*/**"] },
  },
});
