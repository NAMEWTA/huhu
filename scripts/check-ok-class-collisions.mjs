#!/usr/bin/env node
// OK（Tailwind）样式与 Huhu 样式的碰撞守护（design §12，三类检查）：
//  A. OK 产出 CSS 的类名 ∩ Huhu components / shell / modules 层的类名（两边都有规则 → 互相污染）
//  B. OK 产出 CSS 的类名 ∩ Huhu TSX / HTML 里“没有任何 CSS 规则”的类 token（如 hidden / truncate：
//     Huhu 依赖浏览器默认或别处，OK 的 Tailwind 工具类一出现就会改变它们）
//  C. OK 的选择器目标必须位于 .ok-root 或其后代
// 用法：node scripts/check-ok-class-collisions.mjs <built-ok.css> 或 --desktop [assets-dir]
// 退出码 1 = 有待决的 A/B 交集或作用域违规
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import ts from "typescript";

const ROOT = resolve(import.meta.dirname, "..");
const builtPath = process.argv[2];
const desktop = builtPath === "--desktop";
if (!builtPath) {
  console.error("用法：node scripts/check-ok-class-collisions.mjs <built-ok.css> 或 --desktop [assets-dir]");
  process.exit(2);
}

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
  selector.walk((node) => {
    if (node.type === "class") out.add(node.value);
    if (node.type === "attribute" && node.attribute === "class" && ["=", "~="].includes(node.operator)) {
      for (const token of node.value.split(/\s+/)) out.add(token);
    }
  });
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
function isOkLayer(name) {
  return /^(?:vendor\.ok-[\w-]+|(?:base|components|properties)\.huhu-ok)$/.test(name);
}

function okLayerName(rule) {
  for (let ancestor = rule.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.type === "atrule" && ancestor.name === "layer" && isOkLayer(ancestor.params)) return ancestor.params;
  }
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

// A cares about the host's three UI layers, including files imported into them.
const sources = ["packages", "plugins", "apps"].flatMap((dir) => walk(join(ROOT, dir), [".css", ".tsx", ".html"]));
const hostCss = new Map(sources.filter((file) => file.endsWith(".css") && !file.includes("/ok/")).map((file) => [file, parseCss(file)]));
const uiLayers = /^(components|shell|modules)(?:\.|$)/;
const uiImports = new Set();
for (const [file, css] of hostCss) {
  css.walkAtRules("import", (rule) => {
    const match = /^(?:"([^"]+)"|'([^']+)')\s+layer\(([^)]+)\)/.exec(rule.params);
    if (match && uiLayers.test(match[3])) {
      uiImports.add(resolve(dirname(file), match[1] ?? match[2]));
    }
  });
}

function isUiRule(rule, imported) {
  if (imported) return true;
  let outerLayer;
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === "atrule" && node.name === "layer") outerLayer = node.params;
  }
  return uiLayers.test(outerLayer ?? "");
}

const hostClasses = new Set();
const hostUiClasses = new Set();
for (const [file, css] of hostCss) {
  css.walkRules((rule) => {
    if (isKeyframe(rule)) return;
    const selector = selectorParser().astSync(rule.selector);
    addClasses(selector, hostClasses);
    if (isUiRule(rule, uiImports.has(file))) addClasses(selector, hostUiClasses);
  });
}

const tokens = new Set();
function addTokens(value) {
  for (const token of value.split(/\s+/)) if (token) tokens.add(token);
}

const classHelpers = new Set(["cn", "clsx", "classNames", "cx"]);
function collectExpression(node) {
  if (ts.isStringLiteralLike(node)) addTokens(node.text);
  else if (ts.isJsxExpression(node) && node.expression) collectExpression(node.expression);
  else if (ts.isParenthesizedExpression(node)) collectExpression(node.expression);
  else if (ts.isTemplateExpression(node)) {
    const spans = node.templateSpans;
    // An interpolation touching a literal can be part of the same class.
    const parts = [node.head.text, ...spans.map((span) => span.literal.text)];
    for (const [i, part] of parts.entries()) {
      addTokens(part.replace(i > 0 ? /^\S+/ : /^$/, "").replace(i < spans.length ? /\S+$/ : /^$/, ""));
    }
    for (const [i, span] of spans.entries()) {
      if (((i === 0 && !parts[i]) || /\s$/.test(parts[i])) && ((i === spans.length - 1 && !parts[i + 1]) || /^\s/.test(parts[i + 1]))) {
        collectExpression(span.expression);
      }
    }
  } else if (ts.isConditionalExpression(node)) {
    collectExpression(node.whenTrue);
    collectExpression(node.whenFalse);
  } else if (ts.isBinaryExpression(node)) {
    if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) collectExpression(node.left);
    if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) collectExpression(node.right);
  } else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(collectExpression);
  else if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))) addTokens(property.name.text);
    }
  } else if (ts.isCallExpression(node)) {
    const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
    if (ts.isIdentifier(callee) && classHelpers.has(callee.text)) node.arguments.forEach(collectExpression);
  }
}

for (const file of sources) {
  if (file.endsWith(".tsx")) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isJsxAttribute(node) && ["className", "class"].includes(node.name.getText()) && node.initializer) collectExpression(node.initializer);
      ts.forEachChild(node, visit);
    };
    visit(source);
  } else if (file.endsWith(".html")) {
    const source = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
    for (const [, attributes] of source.matchAll(/<[a-z][\w:-]*(?=[\s/>])((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi)) {
      for (const match of attributes.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=`<>]+)))?/g)) {
        if (match[1].toLowerCase() === "class") addTokens(match[2] ?? match[3] ?? match[4] ?? "");
      }
    }
  }
}

let foundOk = false;
for (const file of inputs) {
  const root = parseCss(file);
  const okClasses = new Set();
  const violations = [];
  let foundOkRules = false;
  root.walkRules((rule) => {
    const layer = okLayerName(rule);
    if (isKeyframe(rule) || !layer) return;
    const selectors = selectorParser().astSync(rule.selector);
    foundOkRules = true;
    addClasses(selectors, okClasses);
    for (const selector of selectors.nodes) {
      if (scopeOf(selector) === OUTSIDE && !isRegisteredBackdrop(selector, rule)) {
        violations.push(`${rule.source.start.line}: ${selector.toString().trim()}`);
      }
    }
  });
  if (!foundOkRules && !violations.length) {
    if (!desktop) console.log(`${file}：无 OK 来源层规则`);
    continue;
  }
  foundOk ||= foundOkRules;
  const A = [...okClasses].filter((c) => hostUiClasses.has(c)).sort();
  const B = [...tokens].filter((t) => okClasses.has(t) && !hostClasses.has(t)).sort();
  console.log(file);
  for (const [category, collisions] of [
    ["A", A],
    ["B", B],
  ]) {
    console.log(`${category} ${collisions.length}：${collisions.join(" ")}`);
    for (const className of collisions) {
      console.log(`  待决 ${category}：${className}`);
      process.exitCode = 1;
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
