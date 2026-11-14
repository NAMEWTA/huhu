import type { CDPSession, Page } from "@playwright/test";

/**
 * 计算样式快照：对页面上每个可见元素记录一组关键计算样式，键为“标签 + 结构序号 + role / aria”路径（不含类名与 testid，
 * 这样改名、加 testid 都不会让键失配）。状态矩阵对可交互元素强制 hover / focus-visible / active，重新读取它的整棵子树与祖先链，只保存与默认状态不同的部分。
 */

export type Snap = Record<string, string>;
export type StateDelta = Record<string, Snap>;

const PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "float",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "align-items",
  "align-self",
  "justify-content",
  "align-content",
  "gap",
  "order",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column-start",
  "grid-column-end",
  "grid-row-start",
  "grid-row-end",
  "overflow-x",
  "overflow-y",
  "text-overflow",
  "white-space",
  "word-break",
  "overflow-wrap",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration-line",
  "text-indent",
  "font-variant-numeric",
  "color",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "outline-style",
  "outline-width",
  "outline-color",
  "outline-offset",
  "box-shadow",
  "opacity",
  "fill",
  "stroke",
  "stroke-width",
  "cursor",
  "pointer-events",
  "user-select",
  "visibility",
  "transform",
  "transition-property",
  "transition-duration",
  "animation-name",
  "animation-duration",
  "backdrop-filter",
  "filter",
  "mix-blend-mode",
  "scrollbar-width",
  "scrollbar-color",
  "accent-color",
  "caret-color",
  "list-style-type",
  "vertical-align",
  "object-fit",
];
const PSEUDOS = ["::before", "::after", "::placeholder", "::selection", "::-webkit-scrollbar", "::-webkit-scrollbar-thumb"];

/** 注入页面的采集器：挂在 window.__vq 上，保存键表与默认状态快照。 */
const INSTALL = `(() => {
  const PROPS = ${JSON.stringify(PROPS)};
  const PSEUDOS = ${JSON.stringify(PSEUDOS)};
  const isVisible = (el, cs) => {
    if (cs.display === "none" || cs.visibility === "hidden" && cs.position !== "fixed") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0 || cs.position === "fixed";
  };
  const segment = (el) => {
    const p = el.parentElement;
    const idx = p ? Array.prototype.indexOf.call(p.children, el) : 0;
    const role = el.getAttribute("role");
    return el.tagName.toLowerCase() + (role ? "[" + role + "]" : "") + ":" + idx;
  };
  const props = (el) => {
    const cs = getComputedStyle(el);
    let out = "";
    for (const p of PROPS) out += p + ":" + cs.getPropertyValue(p) + ";";
    for (const ps of PSEUDOS) {
      const c = getComputedStyle(el, ps);
      const content = c.getPropertyValue("content");
      if (ps === "::before" || ps === "::after") { if (content === "none" || content === "normal") continue; }
      else if (ps === "::-webkit-scrollbar" || ps === "::-webkit-scrollbar-thumb") { if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) continue; }
      out += ps + "{";
      for (const p of PROPS) out += p + ":" + c.getPropertyValue(p) + ";";
      out += "content:" + content + "}";
    }
    return out;
  };
  const vq = { keys: new Map(), base: {}, props, isVisible };
  window.__vq = vq;
  const walk = (el, path) => {
    const cs = getComputedStyle(el);
    if (!isVisible(el, cs)) return;
    const key = path + "/" + segment(el);
    vq.keys.set(el, key);
    vq.base[key] = props(el);
    for (const c of el.children) if (!["SCRIPT","STYLE","NOSCRIPT"].includes(c.tagName)) walk(c, key);
  };
  walk(document.body, "");
  // 文本节点不进快照；可交互元素打临时标记，供状态矩阵使用
  const sel = "button,a[href],input,select,textarea,summary,[role=tab],[role=menuitem],[role=option],[role=switch],[role=checkbox],[role=row],[role=button],[tabindex]";
  let n = 0;
  for (const el of document.querySelectorAll(sel)) { if (vq.keys.has(el)) { el.setAttribute("data-vq-i", String(n++)); } }
  return { count: Object.keys(vq.base).length, interactive: n };
})()`;

const DELTA = `function() {
  const vq = window.__vq;
  const strip = (s) => s.replace(/(transition-property|transition-duration|animation-name|animation-duration):[^;]*;/g, "");
  const out = {};
  const seen = new Set();
  const add = (el) => {
    if (seen.has(el)) return; seen.add(el);
    const key = vq.keys.get(el); if (!key) return;
    const cur = vq.props(el);
    if (strip(cur) !== strip(vq.base[key])) out[key] = cur;
  };
  let a = this; while (a && a !== document.documentElement) { add(a); a = a.parentElement; }
  const sub = this.querySelectorAll("*"); let i = 0;
  for (const d of sub) { if (i++ > 400) break; add(d); }
  return out;
}`;

export async function collectDefault(page: Page): Promise<{ snap: Snap; interactive: number }> {
  const info = (await page.evaluate(INSTALL)) as { count: number; interactive: number };
  const snap = (await page.evaluate("window.__vq.base")) as Snap;
  return { snap, interactive: info.interactive };
}

export async function collectStates(page: Page, cdp: CDPSession, interactive: number, limit = 400): Promise<StateDelta> {
  const out: StateDelta = {};
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  // 状态矩阵读取的是“稳定后的值”：读取期间关掉过渡与动画，避免读到过渡中间态（默认状态快照里仍记录真实的 transition 声明）
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none !important;animation:none !important}" }).then((h) => h.evaluate((e) => e.setAttribute("data-vq-style", "")));
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-vq-i]" });
  const step = Math.max(1, Math.ceil(nodeIds.length / limit));
  for (let i = 0; i < nodeIds.length; i += step) {
    const nodeId = nodeIds[i]!;
    const { object } = await cdp.send("DOM.resolveNode", { nodeId });
    if (!object.objectId) continue;
    const idx = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: "function(){return this.getAttribute('data-vq-i')}", returnByValue: true });
    const key = `i${idx.result.value}`;
    for (const state of ["hover", "focus-visible", "active"] as const) {
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [state] });
      const r = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: DELTA, returnByValue: true });
      const delta = r.result.value as Snap;
      if (Object.keys(delta).length) out[`${key}|${state}`] = delta;
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    }
  }
  await page.evaluate("document.querySelectorAll('style[data-vq-style]').forEach(e=>e.remove())");
  void interactive;
  return out;
}

/** 把“prop:value;…::pseudo{prop:value;…}”解析成“prop → value”；伪元素的属性加伪元素前缀，避免与元素自身的同名属性互相覆盖。 */
function parseProps(str: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rest = str.replace(/(::[^{]+)\{([^}]*)\}/g, (_m, pseudo: string, body: string) => {
    for (const d of body.split(";").filter(Boolean)) {
      const i = d.indexOf(":");
      out[`${pseudo}.${d.slice(0, i)}`] = d.slice(i + 1);
    }
    return "";
  });
  for (const d of rest.split(";").filter(Boolean)) {
    const i = d.indexOf(":");
    out[d.slice(0, i)] = d.slice(i + 1);
  }
  return out;
}

export function diffSnap(a: Snap, b: Snap, limit = 30): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (x === y) continue;
    if (x === undefined) {
      out.push(`+ 新增元素 ${k}`);
      continue;
    }
    if (y === undefined) {
      out.push(`- 缺失元素 ${k}`);
      continue;
    }
    const px = parseProps(x);
    const py = parseProps(y);
    for (const p of new Set([...Object.keys(px), ...Object.keys(py)])) if (px[p] !== py[p]) out.push(`~ ${k}  ${p}: ${px[p]} → ${py[p]}`);
  }
  return out.slice(0, limit).concat(out.length > limit ? [`… 共 ${out.length} 处差异`] : []);
}
