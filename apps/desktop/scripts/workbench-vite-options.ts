import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { UserConfig } from "vite";
import { okAliases } from "../../../packages/editor/build/aliases.mjs";
import { offlineEmojiAssets } from "../../../packages/editor/build/offline-emoji.mjs";
import okScopePlugin from "../../../packages/editor/build/ok-scope-plugin.mjs";
import { createPdfjsViewerAssetsPlugin } from "./pdfjs-viewer-assets";

export function workbenchViteOptions(editorRoot: string): Pick<UserConfig, "css" | "plugins" | "resolve"> {
  const configPath = resolve(editorRoot, "lingui.config.ts");
  // 两个入口都从 apps/desktop 构建，Babel 宏需要显式的 Lingui 配置路径。
  process.env.LINGUI_CONFIG ??= configPath;
  return {
    // OK 的 Tailwind 产出由 okScopePlugin 限定到 .ok-root 和 vendor.ok-* 子层。
    plugins: [react(), offlineEmojiAssets(), createPdfjsViewerAssetsPlugin(), babel({ plugins: ["@lingui/babel-plugin-lingui-macro"], presets: [] } as never), lingui({ configPath }), tailwindcss()],
    css: { postcss: { plugins: [okScopePlugin()] } },
    resolve: { alias: okAliases(editorRoot) },
  };
}
