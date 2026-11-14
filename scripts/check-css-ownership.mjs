#!/usr/bin/env node
// 归属检查（DSC-06）：各插件 / 外壳 / 编辑器的 CSS 里定义的类，只能被它自己的包使用；被多个包使用的类必须在共享样式（packages/ui）里。
// 历史遗留登记在 scripts/css-ownership-exceptions.json。packages/ui/src/styles 下不能再有 shared.css。
import fs from "node:fs";
import { execSync } from "node:child_process";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";

const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && fs.existsSync(f) && !f.startsWith(".agents/") && !f.startsWith("temp/") && !f.includes("node_modules"));
const errors = [];
if (files.includes("packages/ui/src/styles/shared.css")) errors.push("packages/ui/src/styles/shared.css 不应存在：共享样式按组件拆在 components/ 下");
const ownerOfCss = (f) => (f.startsWith("plugins/") ? f.split("/")[1] : f.startsWith("packages/workbench/") ? "workbench" : f.startsWith("packages/editor/") ? "editor" : f.startsWith("packages/ui/") ? "ui" : null);
const ownerOfSrc = (f) => (f.startsWith("plugins/") ? f.split("/")[1] : f.startsWith("packages/") ? f.split("/")[1] : f.startsWith("apps/") ? "workbench" : null);
const norm = (o) => (o === "agent-guide" ? "workbench" : o);
const exceptions = new Set(fs.existsSync("scripts/css-ownership-exceptions.json") ? JSON.parse(fs.readFileSync("scripts/css-ownership-exceptions.json", "utf8")).classes : []);

const defined = new Map(); // class -> Set(owner)
for (const f of files.filter((x) => x.endsWith(".css") && !x.includes("generated"))) {
  const o = ownerOfCss(f);
  if (!o) continue;
  postcss.parse(fs.readFileSync(f, "utf8")).walkRules((r) => {
    selectorParser((rt) =>
      rt.walk((n) => {
        if (n.type === "class") {
          if (!defined.has(n.value)) defined.set(n.value, new Set());
          defined.get(n.value).add(o);
        }
      }),
    ).processSync(r.selector);
  });
}
const isStr = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n);
const users = new Map(); // class -> Set(owner)
for (const f of files.filter((x) => /\.tsx?$/.test(x) && !x.endsWith(".d.ts") && !x.startsWith("tests/") && !/\/test\//.test(x) && !x.includes("/vendor/"))) {
  const o = norm(ownerOfSrc(f));
  if (!o) continue;
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const walk = (n) => {
    if (isStr(n))
      for (const t of n.text.split(/\s+/))
        if (defined.has(t)) {
          if (!users.has(t)) users.set(t, new Set());
          users.get(t).add(o);
        }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}
for (const [c, owners] of defined) {
  const cssOwners = [...owners].map(norm);
  if (cssOwners.includes("ui") || exceptions.has(c)) continue;
  const u = [...(users.get(c) ?? [])].filter((x) => x !== "ui");
  const foreign = u.filter((x) => !cssOwners.includes(x));
  if (foreign.length) errors.push(`类 .${c} 定义在 ${cssOwners.join("+")} 的样式里，却被 ${foreign.join("、")} 使用；多个包共用的类应放进 packages/ui 的共享样式（或登记到 scripts/css-ownership-exceptions.json）`);
}
if (errors.length) {
  console.error(`check-css-ownership：${errors.length} 处问题`);
  for (const e of errors.slice(0, 50)) console.error("  " + e);
  process.exit(1);
}
console.log(`check-css-ownership：通过（登记例外 ${exceptions.size} 个）`);
