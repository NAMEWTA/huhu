import { resolve } from "node:path";
import { defineConfig } from "vite";
import { workbenchViteOptions } from "./scripts/workbench-vite-options";

export default defineConfig({
  ...workbenchViteOptions(resolve(import.meta.dirname, "../../packages/editor")),
  root: resolve(import.meta.dirname, "src/web"),
  // 深链使用相同 HTML，静态资源仍从分享服务的根路径加载。
  base: "/",
  build: { outDir: resolve(import.meta.dirname, "out/web"), emptyOutDir: true },
});
