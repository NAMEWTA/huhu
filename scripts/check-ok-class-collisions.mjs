#!/usr/bin/env node
// OK（Tailwind）样式与 Huhu 样式的碰撞守护（design §12，三类检查）：
//  A. OK 产出 CSS 的类名 ∩ Huhu 自有 CSS 的类名（两边都有规则 → 互相污染）
//  B. OK 产出 CSS 的类名 ∩ Huhu TSX / HTML 里“没有任何 CSS 规则”的类 token（如 hidden / truncate：
//     Huhu 依赖浏览器默认或别处，OK 的 Tailwind 工具类一出现就会改变它们）
//  C. OK 的选择器目标必须位于 .ok-root 或其后代
// 用法：node scripts/check-ok-class-collisions.mjs <built-ok.css> 或 --desktop [assets-dir]
// 退出码 1 = 有未登记的 A/B 交集或作用域违规
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const ROOT = resolve(import.meta.dirname, "..");
const builtPath = process.argv[2];
const desktop = builtPath === "--desktop";
if (!builtPath) {
  console.error("用法：node scripts/check-ok-class-collisions.mjs <built-ok.css> 或 --desktop [assets-dir]");
  process.exit(2);
}

const classIntersections = new Map([
  ["ProseMirror", "Huhu 的 editor.css 定制 OK 正文，双方规则均限定到编辑器"],
  ["cm-content", "OK 源码/代码块与 Huhu PlainTextEditor 都使用 CodeMirror，OK 规则受根限制"],
  ["cm-editor", "共享 CodeMirror 类，OK 规则仅影响其自己的根"],
  ["cm-searchMatch", "共享 CodeMirror 搜索标记，OK 规则仅影响其自己的根"],
  ["cm-searchMatch-selected", "共享 CodeMirror 当前搜索命中，OK 规则仅影响其自己的根"],
  ["cm-selectionLayer", "共享 CodeMirror 选区层，OK 规则仅影响其自己的根"],
  ["cm-selectionMatch", "共享 CodeMirror 选区命中，OK 规则仅影响其自己的根"],
  ["grow", "宿主用组件层的 flex 简写，OK 的 flex-grow 工具仅在 OK 根内生效"],
  ["is-active", "宿主引用菜单和 OK 表格控件各自搭配专用类"],
  ["tiptap-editor", "Huhu 的 editor.css 定制根内 OK 编辑器的容器"],
  ["border-t", "宿主批注输入和只读提示刻意使用根内工具"],
  ["flex", "宿主批注面板刻意使用根内工具"],
  ["flex-1", "宿主批注列表刻意使用根内工具"],
  ["flex-col", "宿主批注面板刻意使用根内工具"],
  ["h-full", "宿主批注面板刻意使用根内工具"],
  ["min-h-0", "宿主批注面板与列表刻意使用根内工具"],
  ["ok-root", "OK 的宿主根和 portal 局部样式需要共享该作用域标记"],
  ["overflow-y-auto", "宿主批注列表刻意使用根内工具"],
  ["p-2", "宿主批注输入和只读提示刻意使用根内工具"],
  ["text-link", "宿主启动页按钮在 OK 根外，OK 的颜色工具仅在根内生效"],
  ["text-muted-foreground", "宿主只读批注提示刻意使用根内工具"],
  ["text-xs", "宿主只读批注提示刻意使用根内工具"],
]);

// Tailwind's @property fallback may initialize these values on a bare backdrop.
const backdropDefaults = new Set(
  `
translate-x:0
translate-y:0
translate-z:0
rotate-x:initial
rotate-y:initial
rotate-z:initial
skew-x:initial
skew-y:initial
space-y-reverse:0
space-x-reverse:0
divide-y-reverse:0
border-style:solid
leading:initial
font-weight:initial
tracking:initial
ordinal:initial
slashed-zero:initial
numeric-figure:initial
numeric-spacing:initial
numeric-fraction:initial
shadow:0 0 #0000
shadow-color:initial
shadow-alpha:100%
inset-shadow:0 0 #0000
inset-shadow-color:initial
inset-shadow-alpha:100%
ring-color:initial
ring-shadow:0 0 #0000
inset-ring-color:initial
inset-ring-shadow:0 0 #0000
ring-inset:initial
ring-offset-width:0px
ring-offset-color:#fff
ring-offset-shadow:0 0 #0000
outline-style:solid
blur:initial
brightness:initial
contrast:initial
grayscale:initial
hue-rotate:initial
invert:initial
opacity:initial
saturate:initial
sepia:initial
drop-shadow:initial
drop-shadow-color:initial
drop-shadow-alpha:100%
drop-shadow-size:initial
backdrop-blur:initial
backdrop-brightness:initial
backdrop-contrast:initial
backdrop-grayscale:initial
backdrop-hue-rotate:initial
backdrop-invert:initial
backdrop-opacity:initial
backdrop-saturate:initial
backdrop-sepia:initial
duration:initial
ease:initial
content:""
scale-x:1
scale-y:1
scale-z:1
animation-delay:0s
animation-direction:normal
animation-duration:initial
animation-fill-mode:none
animation-iteration-count:1
enter-blur:0
enter-opacity:1
enter-rotate:0
enter-scale:1
enter-translate-x:0
enter-translate-y:0
exit-blur:0
exit-opacity:1
exit-rotate:0
exit-scale:1
exit-translate-x:0
exit-translate-y:0
scrollbar-thumb:#0000
scrollbar-track:#0000
`
    .trim()
    .split("\n"),
);

function isKeyframe(rule) {
  return rule.parent?.type === "atrule" && rule.parent.name.endsWith("keyframes");
}

function addClasses(selector, out) {
  selector.walkClasses((node) => out.add(node.value));
}

function classesIn(root) {
  const out = new Set();
  root.walkRules((rule) => {
    if (!isKeyframe(rule)) addClasses(selectorParser().astSync(rule.selector), out);
  });
  return out;
}

function walk(dir, exts, acc = []) {
  for (const n of readdirSync(dir)) {
    if (["node_modules", "dist", "out", "vendor", "harness-dist", ".git", "temp", "test-results"].includes(n)) continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, exts, acc);
    else if (exts.some((e) => n.endsWith(e))) acc.push(p);
  }
  return acc;
}

const parseCss = (file) => postcss.parse(readFileSync(file, "utf8"), { from: file });
const assets = resolve(process.argv[3] ?? join(ROOT, "apps/desktop/out/renderer/assets"));
const inputs = desktop
  ? readdirSync(assets)
      .filter((name) => name.endsWith(".css"))
      .sort()
      .map((name) => join(assets, name))
  : [resolve(builtPath)];
// The PostCSS plugin marks OK output with explicit layer names. Every asset is
// scanned because the bundler can extract these layers into any chunk.
function isOkLayer(node) {
  return node.type === "atrule" && node.name === "layer" && /^(?:vendor\.ok-[\w-]+|[\w.-]+\.huhu-ok)$/.test(node.params);
}

function belongsToOk(rule) {
  for (let ancestor = rule.parent; ancestor; ancestor = ancestor.parent) {
    if (isOkLayer(ancestor)) return true;
  }
  return false;
}

function isScopeAttribute(node) {
  return node.attribute === "class" && node.operator === "~=" && node.value === "ok-root" && !node.insensitive && node.namespace === undefined;
}

const OUTSIDE = 0;
const IN_SCOPE = 1;
const DESCENDANT = 2;

function scopeOf(selector) {
  let scope = OUTSIDE;
  for (const node of selector.nodes) {
    if (node.type === "combinator") {
      const combinator = node.value.trim();
      if (combinator === "" || combinator === ">") scope = scope === OUTSIDE ? OUTSIDE : DESCENDANT;
      else if (combinator === "+" || combinator === "~") scope = scope === DESCENDANT ? DESCENDANT : OUTSIDE;
      else scope = OUTSIDE;
    } else if ((node.type === "class" && node.value === "ok-root") || (node.type === "attribute" && isScopeAttribute(node))) {
      scope = Math.max(scope, IN_SCOPE);
    } else if (node.type === "pseudo" && [":is", ":where"].includes(node.value.toLowerCase()) && node.nodes?.length) {
      // A selector list only guarantees what all its branches guarantee.
      scope = Math.max(scope, Math.min(...node.nodes.map(scopeOf)));
    }
  }
  return scope;
}

function isRegisteredBackdrop(selector, rule) {
  return (
    selector.length === 1 &&
    selector.first.type === "pseudo" &&
    selector.first.value === "::backdrop" &&
    rule.nodes.some((node) => node.type === "decl") &&
    rule.nodes.every((node) => node.type === "comment" || (node.type === "decl" && node.prop.startsWith("--tw-") && !node.important && backdropDefaults.has(`${node.prop.slice(5)}:${node.value.trim()}`)))
  );
}

// A / B
const huhuCssFiles = [...walk(join(ROOT, "packages"), [".css"]), ...walk(join(ROOT, "plugins"), [".css"]), ...walk(join(ROOT, "apps"), [".css"])].filter((f) => !f.includes("/vendor/") && !f.includes("/ok/"));
const huhuClasses = new Set();
for (const f of huhuCssFiles) {
  try {
    for (const c of classesIn(postcss.parse(readFileSync(f, "utf8")))) huhuClasses.add(c);
  } catch {}
}

const tokenRe = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;
const tokens = new Set();
for (const f of [...walk(join(ROOT, "packages"), [".tsx"]), ...walk(join(ROOT, "plugins"), [".tsx"]), ...walk(join(ROOT, "apps"), [".tsx", ".html"])]) {
  if (f.includes("/vendor/")) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(tokenRe)) for (const t of (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "").split(/\s+/)) if (/^[a-z][\w-]*$/.test(t)) tokens.add(t);
}
let foundOk = false;
for (const file of inputs) {
  const root = parseCss(file);
  const okClasses = new Set();
  const violations = [];
  let foundOkRules = false;
  root.walkRules((rule) => {
    if (isKeyframe(rule) || !belongsToOk(rule)) return;
    foundOkRules = true;
    const selectors = selectorParser().astSync(rule.selector);
    addClasses(selectors, okClasses);
    for (const selector of selectors.nodes) {
      if (scopeOf(selector) === OUTSIDE && !isRegisteredBackdrop(selector, rule)) {
        violations.push(`${rule.source.start.line}: ${selector.toString().trim()}`);
      }
    }
  });
  if (!foundOkRules) {
    if (!desktop) console.log(`${file}：无 OK 来源层规则`);
    continue;
  }
  foundOk = true;
  const A = [...okClasses].filter((c) => huhuClasses.has(c)).sort();
  const B = [...tokens].filter((t) => okClasses.has(t) && !huhuClasses.has(t)).sort();
  console.log(file);
  for (const [category, collisions] of [
    ["A", A],
    ["B", B],
  ]) {
    console.log(`${category} ${collisions.length}：${collisions.join(" ")}`);
    for (const className of collisions) {
      const reason = classIntersections.get(className);
      if (reason) console.log(`  已登记 ${className}：${reason}`);
      else {
        console.log(`  未登记 ${category}：${className}`);
        process.exitCode = 1;
      }
    }
  }
  console.log(`C ${violations.length}`);
  for (const violation of violations) console.log(`  ${violation}`);
  if (violations.length) process.exitCode = 1;
}
if (desktop && !foundOk) {
  console.error(`未找到带 OK 来源层的构建样式：${assets}`);
  process.exitCode = 2;
}
