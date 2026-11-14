#!/usr/bin/env node
// 重复选择器检查（DSC-09）：同一个文件（packages/ui/src/styles/components/*.css 视为同一个文件，它们在同一层、按顺序拼接）、同一个 at-rule 上下文里，相同的选择器不应出现多次。
// 历史遗留（合并会改变同特异性规则的覆盖顺序）登记在 scripts/css-duplicates-baseline.json；新增的重复、或已登记的重复变多，检查失败。
// 用法：node scripts/check-css-duplicates.mjs [--write]   --write 重新生成登记表（只在确认合并无法进行时使用）
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import postcss from "postcss";

const norm = (x) =>
  x
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~,])\s*/g, "$1")
    .trim();
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "*.css"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && fs.existsSync(f) && !f.startsWith(".agents/") && !f.includes("generated"));
const found = {};
const groupOf = (f) => (f.startsWith("packages/ui/src/styles/components/") ? "packages/ui/src/styles/components/*" : f);
const counts = new Map();
for (const f of files) {
  const root = postcss.parse(fs.readFileSync(f, "utf8"));
  const containers = [root];
  root.walkAtRules((a) => {
    if (a.nodes && !a.name.endsWith("keyframes")) containers.push(a);
  });
  for (const c of containers) {
    const ctx = c.type === "root" ? "" : `@${c.name} ${c.params}`;
    c.each((n) => {
      if (n.type === "rule") {
        const k = `${groupOf(f)}|${ctx}|${norm(n.selector)}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    });
  }
}
for (const [k, n] of counts) if (n > 1) found[k] = n;
const basePath = "scripts/css-duplicates-baseline.json";
if (process.argv.includes("--write")) {
  fs.writeFileSync(
    basePath,
    JSON.stringify(
      { 说明: "历史遗留的重复选择器（文件|at-rule 上下文|选择器 → 出现次数）。合并这些重复会改变同特异性规则的覆盖顺序，需要逐条用 pnpm visual:compare 验证；新增的重复会让 scripts/check-css-duplicates.mjs 失败。", duplicates: found },
      null,
      1,
    ),
  );
  console.log(`已写入 ${Object.keys(found).length} 条`);
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(basePath, "utf8")).duplicates;
const errors = [];
for (const [k, n] of Object.entries(found)) if ((base[k] ?? 1) < n) errors.push(`${k.split("|")[0]}：选择器 ${k.split("|")[2].slice(0, 80)} 重复 ${n} 次（登记 ${base[k] ?? 1} 次）`);
if (errors.length) {
  console.error(`check-css-duplicates：${errors.length} 处新增重复`);
  for (const e of errors.slice(0, 40)) console.error("  " + e);
  process.exit(1);
}
console.log(`check-css-duplicates：通过（登记的历史重复 ${Object.keys(base).length} 条，当前 ${Object.keys(found).length} 条）`);
