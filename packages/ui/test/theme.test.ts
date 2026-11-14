import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { fontsCss, themesCss } from "../scripts/gen-themes.js";
import { applyAppearance, normalizeAppearance, resolveMode } from "../src/theme.js";
import { contrast } from "../src/themes/color.js";
import { THEMES, THEME_IDS, ThemeDefinition, modeVars, resolveTheme, themeToCss, validateThemes, type ModeName, type ThemeOverride } from "../src/themes/index.js";

const styles = path.resolve(import.meta.dirname, "../src/styles");
const MODES: ModeName[] = ["light", "dark"];

describe("主题定义", () => {
  test("DS-03 schema 校验通过；THEME_IDS 与 THEMES 一一对应", () => {
    validateThemes();
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
    for (const id of THEME_IDS) expect(THEMES[id].id).toBe(id);
  });
  test("schema 拒绝不合法的颜色与缺项", () => {
    const bad = structuredClone(THEMES.claude);
    bad.modes.light.core.bg = "not-a-color";
    expect(ThemeDefinition.safeParse(bad).success).toBe(false);
    const missing = structuredClone(THEMES.claude) as unknown as { modes: { dark: { core: Record<string, unknown> } } };
    delete missing.modes.dark.core["accent"];
    expect(ThemeDefinition.safeParse(missing).success).toBe(false);
  });
});

/** 配对与最低对比度：design-system.md §5。 */
describe.each(THEME_IDS.flatMap((id) => MODES.map((mode) => [id, mode] as const)))("DS-03 对比度 %s · %s", (id, mode) => {
  const v = modeVars(THEMES[id].modes[mode], mode);
  const on = (fg: string, bgs: string[], min: number) => {
    for (const bg of bgs) expect(contrast(v[fg]!, v[bg]!), `${fg} 在 ${bg} 上`).toBeGreaterThanOrEqual(min);
  };
  test("正文与次要文字", () => {
    on("text", ["bg", "panel", "sidebar", "elevated"], 7);
    on("muted", ["bg", "panel", "sidebar", "muted-bg"], 4.5);
    on("faint", ["bg", "panel", "sidebar", "muted-bg"], 4.5);
  });
  test("按钮、链接与强调文字", () => {
    on("accent-fg", ["accent-strong"], 4.5);
    on("danger-fg", ["danger"], 4.5);
    on("link", ["bg", "panel"], 4.5);
    on("accent-text", ["bg", "panel"], 4.5);
  });
  test("焦点环实线与输入框边框可辨", () => {
    on("focus", ["bg", "panel"], 3);
    on("line-strong", ["panel"], 1.5);
  });
  test("状态与标签的文字色在各自底色上", () => {
    for (const name of ["success", "warning", "danger", "info", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `tag-${n}`)]) on(`${name}-text`, [`${name}-bg`], 4.5);
  });
});

describe("生成与漂移（DS-04）", () => {
  test("提交的 themes.generated.css / fonts.generated.css 与重新生成的一致", () => {
    expect(readFileSync(path.join(styles, "themes.generated.css"), "utf8")).toBe(themesCss());
    expect(readFileSync(path.join(styles, "fonts.generated.css"), "utf8")).toBe(fontsCss());
  });
  test("每套主题的每种模式都有 §4 列出的公开 token", () => {
    const css = themesCss();
    for (const id of THEME_IDS)
      for (const mode of MODES) {
        const block = css.split(`[data-theme="${id}"][data-mode="${mode}"] {`)[1]!.split("\n}")[0]!;
        for (const name of [
          "bg",
          "sidebar",
          "chrome",
          "panel",
          "elevated",
          "muted-bg",
          "text",
          "muted",
          "faint",
          "line",
          "line-strong",
          "accent",
          "accent-strong",
          "accent-fg",
          "accent-text",
          "accent-soft",
          "link",
          "focus",
          "success-text",
          "danger-bg",
          "info",
          "tag-1",
          "tag-8-bg",
          "overlay-scrim",
          "term-bg",
          "term-ansi-15",
          "syntax-keyword",
          "diff-add-emph",
          "shadow-popover",
          "chrome-backdrop",
          "launch-backdrop",
        ])
          expect(block, `${id}/${mode} 缺少 --${name}`).toContain(`--${name}:`);
      }
  });
  test("兜底：没有 data-theme 时也有默认主题的完整 token，并跟随系统明暗", () => {
    const css = themesCss();
    expect(css).toContain(":root:not([data-theme]) {");
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s+:root:not\(\[data-theme\]\)/);
  });
  test("CSS 里没有 Pearl / SuliWorld / Soft 的残留", () => {
    expect(themesCss()).not.toMatch(/pearl|suliworld|data-theme="soft"/i);
  });
});

describe("DS-05 扩展：自定义主题只覆盖部分字段", () => {
  const fixture: ThemeOverride = { id: "fixture", name: "夹具", extends: "notion", modes: { light: { core: { accent: "#0d7a5f", accentStrong: "#0d7a5f", link: "#0d7a5f", focus: "#0d7a5f" } } } };
  test("只有 accent 相关颜色不同，其余与 notion 相同，且仍通过对比度门槛", () => {
    const resolved = resolveTheme(fixture, THEMES);
    expect(resolved.id).toBe("fixture");
    const base = modeVars(THEMES.notion.modes.light, "light");
    const custom = modeVars(resolved.modes.light, "light");
    const changed = Object.keys(base).filter((k) => base[k] !== custom[k]);
    expect(changed.every((k) => /^(accent|link|focus|selection|syntax-keyword|syntax-function|term-cursor|term-selection|term-ansi-)/.test(k))).toBe(true);
    expect(changed).toContain("accent");
    expect(contrast(custom["accent-fg"]!, custom["accent-strong"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(custom["accent-text"]!, custom["bg"]!)).toBeGreaterThanOrEqual(4.5);
    expect(modeVars(resolved.modes.dark, "dark")).toEqual(modeVars(THEMES.notion.modes.dark, "dark")); // 深色没改
    expect(themeToCss(fixture, THEMES)).toContain('[data-theme="fixture"][data-mode="light"]');
  });
  test("extends 的主题不存在 / 循环时报错", () => {
    expect(() => resolveTheme({ id: "x", name: "x", extends: "nope" }, THEMES)).toThrow(/不存在/);
  });
});

describe("外观应用", () => {
  test("非法值回退到默认主题与跟随系统", () => {
    expect(normalizeAppearance({ theme: "pearl", mode: "x", fontSize: 99, density: "tight" })).toMatchObject({ theme: "claude", mode: "system", fontSize: 14, density: "comfortable", motion: "system" });
    expect(normalizeAppearance({ theme: "vercel", mode: "dark", fontSize: 16, density: "compact", motion: "reduced" })).toMatchObject({ theme: "vercel", mode: "dark", fontSize: 16, density: "compact", motion: "reduced" });
  });
  test("system 按系统偏好解析", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
  });
  test("applyAppearance 写 data-* 与 CSS 变量；navWidth 非法回退 220", () => {
    const attrs: Record<string, string> = {};
    const vars: Record<string, string> = {};
    const root = { dataset: attrs, style: { setProperty: (k: string, v: string) => (vars[k] = v) } } as unknown as HTMLElement;
    applyAppearance(root, { theme: "apple", mode: "system", fontSize: 15, navWidth: 999, density: "compact" }, true);
    expect(attrs).toMatchObject({ theme: "apple", mode: "dark", motion: "system", density: "compact" });
    expect(vars).toMatchObject({ "--font-size": "15px", "--sidebar-w": "220px" });
  });
});
