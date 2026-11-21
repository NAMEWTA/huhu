#!/usr/bin/env node
// 由上游 globals.css 生成 packages/editor/src/ok/ok-globals.css（decisions OP-D05）。
// 文本改写见 PATCHES.md P-WP6-01：分层导入、不加载上游主题表、
// 局部控件重置与 @source 重定向。PostCSS 构建阶段再处理选择器作用域与分层。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "packages/editor/src/vendor/open-knowledge/app/src/globals.css");
const OUT = join(ROOT, "packages/editor/src/ok/ok-globals.css");

let css = readFileSync(SRC, "utf8");
const head = `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./cmd-f.css";`;
if (!css.startsWith(head)) throw new Error("上游 globals.css 首部结构变化，请人工核对（P-S2a-css）");
css = css.slice(head.length);
const prefix = `/* 生成文件（scripts/ok-css-build.mjs），不要手改。上游：vendor/open-knowledge/app/src/globals.css */
@layer vendor.ok-theme, vendor.ok-base, vendor.ok-components, vendor.ok-utilities, vendor.ok-rules;
@import "tailwindcss/theme.css" layer(vendor.ok-theme);
@import "tailwindcss/utilities.css" layer(vendor.ok-utilities);
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "react-medium-image-zoom/dist/styles.css" layer(vendor.ok-rules);
@import "../vendor/open-knowledge/app/src/cmd-f.css" layer(vendor.ok-rules);`;
css = prefix + css;
css = css.replace(/\/\* IDE color-theme palettes[^]*?\*\/\n@import "\.\/color-themes\.generated\.css";\n/, "");
// The file-tree inline property reads --color-primary from its host mapping.
css = css.replace(/html:not\(\[data-color-theme\]\):not\(\.dark\) file-tree-container \{\n[^}]*\n\}\n\n/, "");
css = css.replace(
  "@layer base {",
  `@layer base {
  *, *::before, *::after {
    box-sizing: border-box;
  }
  :where(button, input, select, textarea) {
    font: inherit;
    color: inherit;
  }
  :where(h1, h2, h3, h4, h5, h6) {
    font: inherit;
    letter-spacing: inherit;
  }
`,
);
css = css.replace('@source "./**/*.{tsx,ts,jsx,js}";', '@source "../vendor/open-knowledge/app/src/**/*.{tsx,ts,jsx,js}";\n@source "../vendor/open-knowledge/core/src/**/*.{tsx,ts}";');
css = css.replace(/@source "\.\.\/node_modules\/streamdown[^\n]*\n/, "").replace(/@source "\.\.\/(index|uninstall)\.html";\n/g, "");
mkdirSync(join(ROOT, "packages/editor/src/ok"), { recursive: true });
writeFileSync(OUT, css);
console.log("wrote", OUT, css.split("\n").length, "lines");
