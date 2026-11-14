#!/usr/bin/env node
// 层检查（DSC-01）：项目 CSS 要么整体在 @layer 里，要么是不分层白名单文件（只允许第三方选择器）。
// 规则见 .agents/dev/archive/changes/implemented/feature_2026-11-14-design-system-completion/spec.md §3.1–§3.2。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

/** 不分层白名单：覆盖“运行时注入的无层第三方样式”的规则，放进层里会输给它们。 */
const UNLAYERED = {
  "packages/ui/src/styles/vendor-overrides.css": "覆盖 sonner 运行时注入（__insertCSS）的样式",
  "packages/editor/src/editor-cm.css": "覆盖 CodeMirror（style-mod）运行时注入的样式",
};
/** 白名单文件里允许出现的类 / 属性：第三方（CodeMirror、sonner）与编辑器 DOM 内的装饰类。 */
const THIRD_PARTY_CLASS = /^(cm-|ͼ|atomic-editor-|atomic-cm-|huhu-md-semibold$|huhu-live-table$|huhu-live-table-scroll$|huhu-live-block-edit$)/;
const THIRD_PARTY_ATTR = /^data-(sonner|rich-colors)/;
const LAYERS = "theme, tokens, base, vendor, components, shell, modules";

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "*.css"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.startsWith(".agents/") && !f.startsWith("temp/") && !f.includes("node_modules") && fs.existsSync(f));

const posix = (p) => p.split(path.sep).join("/");
const errors = [];
const layeredImports = new Set();
for (const f of files) {
  const root = postcss.parse(fs.readFileSync(f, "utf8"), { from: f });
  root.walkAtRules("import", (r) => {
    if (/layer\(/.test(r.params)) {
      const m = r.params.match(/^["']([^"']+)["']/);
      if (m && m[1].startsWith(".")) layeredImports.add(posix(path.normalize(path.join(path.dirname(f), m[1]))));
    }
  });
}

function subjectsThirdPartyOnly(selector) {
  let ok = true;
  selectorParser((root) => {
    root.each((sel) => {
      let has = false;
      sel.walk((n) => {
        if (n.type === "class" && THIRD_PARTY_CLASS.test(n.value)) has = true;
        if (n.type === "attribute" && THIRD_PARTY_ATTR.test(n.attribute)) has = true;
      });
      if (!has) ok = false;
    });
  }).processSync(selector);
  return ok;
}

for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const root = postcss.parse(text, { from: f });
  if (f in UNLAYERED) {
    if (!/^\/\*[\s\S]*?\*\//.test(text.trim())) errors.push(`${f}：文件头必须写明不分层的原因（注释）`);
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
      if (!subjectsThirdPartyOnly(rule.selector)) errors.push(`${f}:${rule.source.start.line} 不分层白名单里只能有第三方选择器：${rule.selector.slice(0, 80)}`);
    });
    continue;
  }
  if (layeredImports.has(posix(path.normalize(f)))) continue; // 由 @import … layer(x) 整体放进层
  let sawDecl = false;
  root.each((n) => {
    if (n.type === "comment") return;
    if (n.type === "atrule" && n.name === "layer") {
      if (!n.nodes) {
        // 层声明语句：必须是完整层序（或单个层名）
        if (n.params.split(",").length > 1 && n.params.replace(/\s+/g, " ").trim() !== LAYERS) errors.push(`${f}:${n.source.start.line} 层序声明与规定不一致：${n.params}`);
        sawDecl = true;
      }
      return;
    }
    if (n.type === "atrule" && n.name === "import") {
      const target = n.params.match(/^["']([^"']+)["']/)?.[1];
      const resolved = target?.startsWith(".") ? posix(path.normalize(path.join(path.dirname(f), target))) : null;
      // 不带 layer() 的导入只允许：不分层白名单文件，以及自己在文件里声明了 @layer 的文件（themes.generated.css）
      if (!/layer\(/.test(n.params) && !(resolved && (resolved in UNLAYERED || resolved.endsWith("themes.generated.css")))) errors.push(`${f}:${n.source.start.line} @import 必须带 layer(...)：${n.params}`);
      return;
    }
    errors.push(`${f}:${n.source.start.line} 规则不在 @layer 内：${(n.selector ?? "@" + n.name + " " + n.params).slice(0, 80)}`);
  });
  void sawDecl;
}

if (errors.length) {
  console.error(`check-css-layers：${errors.length} 处问题`);
  for (const e of errors.slice(0, 60)) console.error("  " + e);
  process.exit(1);
}
console.log(`check-css-layers：${files.length} 个 CSS 文件通过（不分层白名单 ${Object.keys(UNLAYERED).length} 个）`);
