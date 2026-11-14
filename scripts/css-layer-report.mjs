#!/usr/bin/env node
// 层叠冲突报告：把一组 CSS 文件“原来的不分层顺序”与“新的层归属”比较，列出输赢发生翻转的规则对。
// 用法：node scripts/css-layer-report.mjs <config.json> [--json] [--max N]
// config.json：{ "order": [ { "file": "路径", "layer": null | "components" | … } ], "layers": ["theme","tokens","base","vendor","components","shell","modules"], "thirdParty": ["\\.cm-","data-sonner","\\.xterm"] }
//   order 的先后就是原来的加载顺序；oldLayer 是现状所在的层、layer 是目标层（null = 不分层）。
// 局限：静态分析。只比较“最右侧复合选择器共享至少一个类 / id / 标签 / 属性条件”的规则对，会有误报也可能漏掉
//   两个互不相关的类恰好叠在同一元素上的情况——所以它只用来提前发现问题，渲染等价性以 `pnpm visual:compare` 为准。
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const [cfgPath, ...flags] = process.argv.slice(2);
if (!cfgPath) {
  console.error("用法：css-layer-report.mjs <config.json> [--json] [--max N]");
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const LAYERS = cfg.layers;
const maxIdx = flags.indexOf("--max");
const MAX = maxIdx >= 0 ? Number(flags[maxIdx + 1]) : 200;

/** 选择器 → { specificity:[a,b,c], tokens:Set（最右复合选择器里的 .class / #id / tag / [attr]） } */
function analyse(selector) {
  const out = [];
  selectorParser((root) => {
    root.each((sel) => {
      let a = 0,
        b = 0,
        c = 0;
      const lastTokens = new Set();
      let compound = new Set();
      sel.walk((n) => {
        if (n.type === "id") a++;
        else if (n.type === "class" || n.type === "attribute") b++;
        else if (n.type === "pseudo") {
          if (n.value.startsWith("::") || [":before", ":after", ":first-line", ":first-letter"].includes(n.value)) c++;
          else if (n.value === ":where") {
            /* 0 */
          } else if ([":is", ":not", ":has"].includes(n.value)) {
            // 取参数中最大的特异性，这里近似为 +1 个类
            b++;
          } else b++;
        } else if (n.type === "tag") c++;
      });
      for (const n of sel.nodes) {
        if (n.type === "combinator") compound = new Set();
        else if (n.type === "class") compound.add("." + n.value);
        else if (n.type === "id") compound.add("#" + n.value);
        else if (n.type === "tag") compound.add(n.value.toLowerCase());
        else if (n.type === "attribute") compound.add("[" + n.attribute + "]");
        else if (n.type === "pseudo" && (n.value.startsWith("::") || [":before", ":after"].includes(n.value))) compound.add(n.value);
      }
      for (const t of compound) lastTokens.add(t);
      out.push({ text: String(sel).trim(), spec: [a, b, c], tokens: lastTokens });
    });
  }).processSync(selector);
  return out;
}

const entries = []; // { file, order, selector, spec, tokens, prop, important, layerNew, ctx }
let order = 0;
for (const f of cfg.order) {
  const css = fs.readFileSync(f.file, "utf8");
  const root = postcss.parse(css, { from: f.file });
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    const ctx = [];
    for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
      if (p.type === "atrule" && p.name !== "layer") ctx.unshift(`@${p.name} ${p.params}`);
    }
    let sels;
    try {
      sels = analyse(rule.selector);
    } catch {
      return;
    }
    order++;
    rule.walkDecls((d) => {
      if (d.parent !== rule) return;
      for (const s of sels) {
        entries.push({
          file: path.relative(process.cwd(), f.file),
          line: rule.source?.start?.line ?? 0,
          order,
          selector: s.text,
          spec: s.spec,
          tokens: s.tokens,
          prop: d.prop.replace(/^-(webkit|moz)-/, ""),
          important: d.important === true,
          layerNew: f.layer ?? null,
          layerOld: f.oldLayer ?? null,
          ctx: ctx.join(" | "),
        });
      }
    });
  });
}

const cmpSpec = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
/** 返回 >0 表示 a 赢 b。layerKey 取 "layerOld"（现状）或 "layerNew"（目标）；null = 不分层。 */
function wins(a, b, layerKey) {
  const li = (e) => (e[layerKey] === null ? Infinity : LAYERS.indexOf(e[layerKey]));
  if (a.important !== b.important) return a.important ? 1 : -1;
  const la = li(a),
    lb = li(b);
  if (la !== lb) return a.important ? lb - la : la - lb; // 普通声明：不分层最强、层越靠后越强；!important 反转
  return cmpSpec(a.spec, b.spec) || a.order - b.order;
}
const oldWins = (a, b) => wins(a, b, "layerOld");
const newWins = (a, b) => wins(a, b, "layerNew");
const shares = (a, b) => {
  for (const t of a.tokens) if (b.tokens.has(t)) return true;
  return false;
};

const byProp = new Map();
for (const e of entries) {
  if (!byProp.has(e.prop)) byProp.set(e.prop, []);
  byProp.get(e.prop).push(e);
}
const flips = new Map();
for (const [prop, list] of byProp) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i],
        b = list[j];
      if (a.ctx !== b.ctx && (a.ctx || b.ctx) && !(a.ctx && b.ctx)) {
        // 一个在媒体查询里、一个不在：仍可能叠加，保留比较
      }
      if (a.layerNew === b.layerNew && a.layerOld === b.layerOld && a.file === b.file) continue; // 同文件同层：新旧顺序一致
      if (!shares(a, b)) continue;
      const o = oldWins(a, b);
      const n = newWins(a, b);
      if (o === 0 || n === 0 || Math.sign(o) === Math.sign(n)) continue;
      const key = `${a.selector}  vs  ${b.selector}`;
      const f = flips.get(key) ?? { a, b, props: new Set(), oldWinner: o > 0 ? "a" : "b", newWinner: n > 0 ? "a" : "b" };
      f.props.add(prop);
      flips.set(key, f);
    }
  }
}

const third = (cfg.thirdParty ?? []).map((s) => new RegExp(s));
const thirdPartyRules = new Map();
for (const e of entries) {
  if (e.layerNew !== null && third.some((r) => r.test(e.selector))) {
    const k = `${e.file} :: ${e.selector}`;
    thirdPartyRules.set(k, (thirdPartyRules.get(k) ?? 0) + 1);
  }
}

const list = [...flips.values()];
const label = (e) => `${e.selector}  [${e.file}:${e.line}${e.ctx ? " " + e.ctx : ""}] 层=${e.layerOld ?? "无"}→${e.layerNew ?? "无"} 特异性=${e.spec.join(",")}${e.important ? " !important" : ""}`;
if (flags.includes("--json")) {
  console.log(JSON.stringify({ flips: list.map((f) => ({ a: label(f.a), b: label(f.b), props: [...f.props], oldWinner: f.oldWinner, newWinner: f.newWinner })), thirdPartyRules: [...thirdPartyRules.keys()] }, null, 2));
} else {
  console.log(`扫描 ${entries.length} 条声明；输赢翻转的规则对 ${list.length} 组；位于层内但选择器命中第三方运行时样式的规则 ${thirdPartyRules.size} 条（应进不分层白名单）\n`);
  for (const f of list.slice(0, MAX)) {
    console.log(`● ${[...f.props].slice(0, 6).join(", ")}${f.props.size > 6 ? " …" : ""}`);
    console.log(`   旧赢家：${f.oldWinner === "a" ? "A" : "B"}   新赢家：${f.newWinner === "a" ? "A" : "B"}`);
    console.log(`   A ${label(f.a)}`);
    console.log(`   B ${label(f.b)}`);
  }
  if (list.length > MAX) console.log(`… 另有 ${list.length - MAX} 组未显示（--max 调整）`);
  if (thirdPartyRules.size) {
    console.log("\n第三方运行时样式的覆盖规则（前 40 条）：");
    for (const k of [...thirdPartyRules.keys()].slice(0, 40)) console.log("  " + k);
  }
}
process.exit(list.length ? 1 : 0);
