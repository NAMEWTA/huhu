#!/usr/bin/env node
// 无用样式报告（DSC-11）：对构建产物 CSS 运行 PurgeCSS，content = 全部 TS / TSX / HTML 源码。
// 只报告、不改文件：结果写入 .visual/purge/rejected.json（不进 git）。第三方类与状态类放行（safelist，出处见下）。
// 用法：pnpm build && node scripts/css-purge.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { PurgeCSS } from "purgecss";

const out = "apps/desktop/out/renderer/assets";
const css = fs
  .readdirSync(out)
  .filter((f) => f.endsWith(".css"))
  .map((f) => `${out}/${f}`);
if (!css.length) {
  console.error("没有构建产物：先运行 pnpm build");
  process.exit(2);
}
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "*.ts", "*.tsx", "*.html"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && fs.existsSync(f) && !f.startsWith(".agents/") && !f.startsWith("temp/") && !f.startsWith("tests/") && !f.endsWith(".d.ts"));
// safelist 及出处：第三方生成的类（CodeMirror、xterm、katex、mermaid、sonner、Radix、lucide）与由数据值拼出来的状态类
const safelist = { standard: [/^cm-/, /^ͼ/, /^xterm/, /^katex/, /^mermaid/, /data-sonner/, /^lucide/, /^radix/, /^react-/], deep: [/^xterm/, /^katex/, /^cm-/, /^ͼ/, /^mermaid/], greedy: [/^is-/] };
const result = await new PurgeCSS().purge({ content: files, css: css.map((raw) => ({ raw: fs.readFileSync(raw, "utf8") })), rejected: true, safelist, variables: false, keyframes: false, fontFace: false });
const rejected = result.flatMap((r) => r.rejected ?? []);
fs.mkdirSync(".visual/purge", { recursive: true });
fs.writeFileSync(".visual/purge/rejected.json", JSON.stringify(rejected, null, 1));
console.log(`PurgeCSS：rejected ${rejected.length} 条（content ${files.length} 个源文件）→ .visual/purge/rejected.json`);
for (const r of rejected.slice(0, 40)) console.log("  " + r);
