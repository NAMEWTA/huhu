#!/usr/bin/env node
// 类名检查（DSC-07 / DSC-08）：
//  1) TS / TSX 里 class 上下文（className、cn()、classList、querySelector…）的字面量类名，必须在项目 CSS 里有定义（或属于第三方 / 状态类）；
//  2) 项目 CSS 里的类名必须符合前缀规则：hu-（共享组件）、shell-（工作台）、插件前缀、editor-，状态类白名单，第三方类放行；
//     不符合的历史类名登记在 scripts/css-class-exceptions.json（每项写明原因），新增的不符合类名会让检查失败。
import fs from "node:fs";
import { execSync } from "node:child_process";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";

const PREFIX = /^(hu-|shell-|notes-|tasks-|automations-|inbox-|safe-|ssh-|version-|agent-|editor-|is-)/;
const STATE =
  /^(active|selected|open|disabled|current|checked|expanded|collapsed|hidden|loading|dragging|on|off|error|warning|danger|success|info|ok|completed|failed|connected|today|modified|add|remove|small|grow|muted|compact|focus|hover|focused|visible|empty|primary|ghost|mono|faint|text-link)$/;
const THIRD = /^(cm-|ͼ|xterm|katex|mermaid|sonner|atomic-|lucide|radix|react-)/;
const exceptions = JSON.parse(fs.readFileSync("scripts/css-class-exceptions.json", "utf8"));
const allowed = new Set(Object.values(exceptions.classes).flat());

const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && fs.existsSync(f) && !f.startsWith(".agents/") && !f.startsWith("temp/") && !f.includes("node_modules"));
const cssFiles = files.filter((f) => f.endsWith(".css") && !f.includes("generated"));
const tsFiles = files.filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts") && !f.startsWith("tests/") && !/\/test\//.test(f) && !f.includes("/vendor/"));

const defined = new Set();
const errors = [];
for (const f of cssFiles) {
  const root = postcss.parse(fs.readFileSync(f, "utf8"), { from: f });
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    selectorParser((r) =>
      r.walk((n) => {
        if (n.type !== "class") return;
        defined.add(n.value);
        const c = n.value;
        if (THIRD.test(c) || STATE.test(c) || PREFIX.test(c) || allowed.has(c)) return;
        errors.push(`${f}:${rule.source.start.line} 类名 .${c} 不符合前缀规则（共享组件 hu-，工作台 shell-，插件用插件前缀）；历史遗留请登记到 scripts/css-class-exceptions.json`);
      }),
    ).processSync(rule.selector);
  });
}

const CALLS = new Set(["cn", "clsx", "classNames", "cx"]);
const isStr = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n);
for (const f of tsFiles) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const check = (n) => {
    if (isStr(n)) {
      for (const t of n.text.split(/\s+/)) {
        if (!t || t.endsWith("-") || !/^[A-Za-z_][\w-]*$/.test(t)) continue;
        if (defined.has(t) || THIRD.test(t) || STATE.test(t)) continue;
        // 只检查“看起来是我们的类名”的 token：带前缀者
        if (PREFIX.test(t) || allowed.has(t)) errors.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} class 上下文里的 "${t}" 在 CSS 里没有定义`);
      }
    }
    ts.forEachChild(n, check);
  };
  const callee = (e) => (ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "");
  const visit = (n) => {
    if (ts.isJsxAttribute(n) && ["className", "class"].includes(n.name.getText()) && n.initializer) check(n.initializer);
    else if (ts.isCallExpression(n) && (CALLS.has(callee(n.expression)) || /classList\.(add|remove|toggle|contains|replace)$/.test(n.expression.getText()))) n.arguments.forEach(check);
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

if (errors.length) {
  console.error(`check-css-classes：${errors.length} 处问题`);
  for (const e of errors.slice(0, 60)) console.error("  " + e);
  process.exit(1);
}
console.log(`check-css-classes：通过（项目 CSS 类 ${defined.size} 个；登记的历史例外 ${allowed.size} 个）`);
