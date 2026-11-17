#!/usr/bin/env node
// 由上游 globals.css 生成 packages/editor/src/ok/ok-globals.css（decisions OP-D05）。
// 只做可重放的文本改写（每条都写进 PATCHES.md 的 P-S2a-css）：
//  1. 首部 `@import "tailwindcss"`（含全局 preflight）替换成分层、不带 preflight 的导入；
//  2. `@source` 路径改成相对本文件的位置；
//  3. 其余原样保留。选择器作用域化与分层包装在构建期由 build/ok-scope-plugin.mjs（PostCSS）完成。
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
@layer vendor.ok-theme, vendor.ok-base, vendor.ok-utilities, vendor.ok-rules;
@import "tailwindcss/theme.css" layer(vendor.ok-theme);
@import "tailwindcss/utilities.css" layer(vendor.ok-utilities);
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "../vendor/open-knowledge/app/src/cmd-f.css" layer(vendor.ok-rules);`;
css = prefix + css;
css = css.replace('@import "./color-themes.generated.css";', '@import "../vendor/open-knowledge/app/src/color-themes.generated.css" layer(vendor.ok-rules);');
css = css.replace('@source "./**/*.{tsx,ts,jsx,js}";', '@source "../vendor/open-knowledge/app/src/**/*.{tsx,ts,jsx,js}";\n@source "../vendor/open-knowledge/core/src/**/*.{tsx,ts}";');
css = css.replace(/@source "\.\.\/node_modules\/streamdown[^\n]*\n/, "").replace(/@source "\.\.\/(index|uninstall)\.html";\n/g, "");
mkdirSync(join(ROOT, "packages/editor/src/ok"), { recursive: true });
writeFileSync(OUT, css);
console.log("wrote", OUT, css.split("\n").length, "lines");
