#!/usr/bin/env node
// 界面代码不允许硬编码颜色：颜色只来自主题生成的 token（packages/ui/src/themes → themes.generated.css）。
// 例外都写在 ALLOW 里并注明原因；CSS 另由 stylelint（.stylelintrc.json）检查。
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ALLOW = [
  [/^packages\/ui\/src\/themes\//, "主题数据本身"],
  [/^packages\/ui\/src\/styles\/(themes|fonts)\.generated\.css$/, "生成文件"],
  [/^packages\/ui\/src\/styles\/tokens\.css$/, "与主题无关的中性墨色 --shadow-ink / --on-solid"],
  [/^apps\/desktop\/src\/main\/index\.ts$/, "窗口底色：渲染进程加载前的首帧，按 nativeTheme 取值"],
  [/^plugins\/agent-cli\/src\/ui\/AgentIcon\.tsx$/, "第三方智能体的品牌色"],
  [/^packages\/editor\/src\/vendor\//, "引入的第三方编辑器源码（只读）"],
  [/\.(test|spec)\.tsx?$/, "测试夹具"],
  [/^(tests|scripts|temp|\.agents|\.claude)\//, "非界面代码"],
];
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "*.css", "*.ts", "*.tsx"], { encoding: "utf8" }).split("\n").filter(Boolean);
const HEX = /(?<![\w&#/-])#[0-9a-fA-F]{3,8}\b/g;
const FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const bad = [];
for (const f of files) {
  if (ALLOW.some(([re]) => re.test(f))) continue;
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const isCss = f.endsWith(".css");
  text.split("\n").forEach((line, i) => {
    const code = isCss ? line : line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    // TS/TSX 里只看字符串里的十六进制颜色；URL 片段（#anchor）不是颜色
    const hex = isCss ? code.match(HEX) : code.match(/["'`]#[0-9a-fA-F]{3,8}["'`]/g);
    const fn = code.match(FN);
    if (hex || fn) bad.push(`${f}:${i + 1}: ${(hex ?? fn).join(" ")}`);
  });
}
if (bad.length) {
  console.error(`界面代码里有 ${bad.length} 处硬编码颜色（请改用 token；确需例外就登记到 scripts/check-ui-colors.mjs 的 ALLOW）：\n${bad.slice(0, 40).join("\n")}`);
  process.exit(1);
}
console.log("界面颜色检查：OK（没有硬编码颜色）");
