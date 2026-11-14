import { wcagLuminance } from "culori";
import { alpha, contrast, hex, mix, readable } from "./color.js";
import type { ModeTokens, ThemeDefinition, ThemeOverride } from "./schema.js";

export type ModeName = "light" | "dark";
/** CSS 变量表：键是去掉 `--` 的变量名。 */
export type VarMap = Record<string, string>;

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const STATUS = ["success", "warning", "danger", "info"] as const;

/** 解析 `extends`：按链条深合并，数组（tags）整体替换。 */
export function resolveTheme(def: ThemeDefinition | ThemeOverride, registry: Record<string, ThemeDefinition>, depth = 0): ThemeDefinition {
  if (!("extends" in def)) return def;
  if (depth > 8) throw new Error(`主题 ${def.id} 的 extends 链过长或循环`);
  const parent = registry[def.extends];
  if (!parent) throw new Error(`主题 ${def.id} 扩展的主题不存在：${def.extends}`);
  const base = resolveTheme(parent, registry, depth + 1);
  const merge = <T>(a: T, b: unknown): T => {
    if (b === undefined) return a;
    if (Array.isArray(b) || typeof b !== "object" || b === null || typeof a !== "object" || a === null || Array.isArray(a)) return b as T;
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) out[k] = merge(out[k], v);
    return out as T;
  };
  return {
    ...base,
    id: def.id,
    name: def.name,
    description: def.description ?? base.description,
    fonts: merge(base.fonts, def.fonts),
    type: merge(base.type, def.type),
    shape: merge(base.shape, def.shape),
    modes: { light: merge(base.modes.light, def.modes?.light), dark: merge(base.modes.dark, def.modes?.dark) },
  };
}

/** 一种模式下的全部颜色变量：核心色 + 按规则派生的颜色 + 覆盖。 */
export function modeVars(m: ModeTokens, mode: ModeName): VarMap {
  const c = m.core;
  const dark = mode === "dark";
  const bg = hex(c.bg);
  const panel = hex(c.panel);
  const text = hex(c.text);
  const v: VarMap = {};
  for (const [k, val] of Object.entries(c)) if (k !== "tags") v[kebab(k)] = hex(val as string);
  c.tags.forEach((t, i) => (v[`tag-${i + 1}`] = hex(t)));

  // 实色危险按钮上的文字：白字够清楚就用白，否则用近黑（亮红底上白字对比度不足）
  v["danger-fg"] = contrast("#ffffff", hex(c.danger)) >= 4.5 ? "#ffffff" : "#111111";
  v["accent-soft"] = mix(c.accent, bg, 0.14);
  v["accent-text"] = readable(c.accent, text, [bg, panel]);
  v["accent-pressed"] = mix(c.accentStrong, text, 0.85);
  v["selection"] = mix(c.accent, bg, 0.22);
  v["chrome-glass"] = alpha(c.chrome, 0.8);
  const soften = (name: string, color: string) => {
    const given = m.overrides?.[`${name}-bg`]; // 主题指定的底色（例如 Notion 的 card-tint）优先，文字色再按它搜索
    const soft = given ? hex(given) : mix(color, bg, dark ? 0.22 : 0.14);
    v[`${name}-bg`] = soft;
    v[`${name}-text`] = readable(color, text, [soft, bg]);
  };
  for (const s of STATUS) soften(s, c[s]);
  c.tags.forEach((t, i) => soften(`tag-${i + 1}`, t));
  v["overlay-scrim"] = dark ? alpha("#000000", 0.6) : alpha(text, 0.4);

  // 终端与 ANSI 色板
  const [darker, lighter] = (wcagLuminance(text) <= wcagLuminance(bg) ? [text, bg] : [bg, text]) as [string, string];
  v["term-bg"] = dark ? mix("#000000", bg, 0.04) : panel;
  v["term-fg"] = text;
  v["term-cursor"] = hex(c.accent);
  v["term-selection"] = v["selection"]!;
  const chroma = [c.danger, c.success, c.warning, c.link, c.tags[3], c.tags[6]];
  const ansi = [darker, ...chroma, lighter, c.faint, ...chroma.map((x) => mix(x, lighter, 0.75)), mix(lighter, bg, 0.9)];
  ansi.forEach((x, i) => (v[`term-ansi-${i}`] = hex(x)));

  // 语法高亮
  v["syntax-keyword"] = v["accent-text"]!;
  v["syntax-string"] = v["tag-3-text"]!;
  v["syntax-number"] = v["tag-1-text"]!;
  v["syntax-comment"] = hex(c.faint);
  v["syntax-function"] = hex(c.link);
  v["syntax-type"] = v["tag-4-text"]!;
  v["syntax-variable"] = text;
  v["syntax-punctuation"] = hex(c.muted);
  v["syntax-heading"] = text;

  // diff：行底色与词级强调两级
  v["diff-add-bg"] = mix(c.success, bg, dark ? 0.18 : 0.12);
  v["diff-add-emph"] = mix(c.success, bg, dark ? 0.36 : 0.28);
  v["diff-del-bg"] = mix(c.danger, bg, dark ? 0.18 : 0.12);
  v["diff-del-emph"] = mix(c.danger, bg, dark ? 0.36 : 0.28);

  for (const [k, val] of Object.entries(m.overrides ?? {})) v[k] = hex(val);
  return v;
}

/** 与模式无关的主题变量：字体、字重、字距、圆角、按下效果、焦点环。 */
export function themeVars(def: ThemeDefinition): VarMap {
  const { fonts: f, type: t, shape: s } = def;
  return {
    "font-ui": f.ui,
    "font-display": f.display,
    "font-mono": f.mono,
    "font-label": f.label,
    "title-weight": String(t.titleWeight),
    "title-tracking": t.titleTracking,
    "body-leading": String(t.bodyLeading),
    "strong-weight": String(t.strongWeight),
    "label-transform": t.labelTransform,
    "label-tracking": t.labelTracking,
    "radius-control": s.control,
    "radius-card": s.card,
    "radius-popover": s.popover,
    "radius-badge": s.badge,
    "radius-button-primary": s.buttonPrimary,
    "press-transform": s.pressTransform,
    "focus-ring": s.focusHalo === "none" ? "0 0 0 2px var(--focus)" : `0 0 0 2px var(--focus), ${s.focusHalo}`,
  };
}

/** 一种模式下的非颜色变量：阴影、毛玻璃、启动页背景。 */
export function modeExtras(m: ModeTokens): VarMap {
  return {
    "shadow-card": m.elevation.card,
    "shadow-popover": m.elevation.popover,
    "shadow-dialog": m.elevation.dialog,
    "chrome-backdrop": m.chromeBackdrop,
    "launch-backdrop": m.launchBackdrop,
  };
}

const decls = (vars: VarMap, indent = "  "): string =>
  Object.entries(vars)
    .map(([k, val]) => `${indent}--${k}: ${val};`)
    .join("\n");

const sel = (id: string, mode?: ModeName): string => (mode ? `[data-theme="${id}"][data-mode="${mode}"]` : `[data-theme="${id}"]`);

/** 一套主题的 CSS：主题级变量 + 浅色 + 深色。运行时的自定义主题与构建期生成共用这一个函数。 */
export function themeToCss(def: ThemeDefinition | ThemeOverride, registry: Record<string, ThemeDefinition> = {}): string {
  const t = resolveTheme(def, registry);
  const block = (mode: ModeName) => `${sel(t.id, mode)} {\n  color-scheme: ${mode};\n${decls({ ...modeVars(t.modes[mode], mode), ...modeExtras(t.modes[mode]) })}\n}`;
  return [`${sel(t.id)} {\n${decls(themeVars(t))}\n}`, block("light"), block("dark")].join("\n");
}

/** 全部内置主题的完整 CSS 文件内容（`styles/themes.generated.css`）。 */
export function allThemesCss(themes: Record<string, ThemeDefinition>, defaultId: string): string {
  const d = resolveTheme(themes[defaultId]!, themes);
  const fallback = (mode: ModeName, indent: string) =>
    `${indent}:root:not([data-theme]) {\n${indent}  color-scheme: ${mode};\n${decls({ ...(mode === "light" ? themeVars(d) : {}), ...modeVars(d.modes[mode], mode), ...modeExtras(d.modes[mode]) }, `${indent}  `)}\n${indent}}`;
  return [
    "/* 由 `pnpm gen:themes` 生成，不要手改；改 packages/ui/src/themes/ 下的主题定义后重新生成。 */",
    "@layer theme {",
    ...Object.values(themes).map((t) => themeToCss(t, themes)),
    "/* 兜底：JS 设置 data-theme 之前页面也有完整的 token（默认主题，跟随系统明暗） */",
    fallback("light", ""),
    "@media (prefers-color-scheme: dark) {",
    fallback("dark", "  "),
    "}",
    "}",
    "",
  ].join("\n");
}
