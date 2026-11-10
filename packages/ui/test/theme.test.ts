import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { normalizeAppearance, resolveMode } from "../src/theme.js";

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

function vars(selector: string): Record<string, string> {
  const re = new RegExp(`(?:^|\\n)${selector.replace(/[[\]'=]/g, "\\$&")}\\{([^}]*)\\}`, "g");
  const out: Record<string, string> = {};
  for (const m of css.matchAll(re)) {
    for (const part of (m[1] ?? "").split(";")) {
      const [k, v] = part.split(":");
      if (k && v && k.trim().startsWith("--")) out[k.trim()] = v.trim();
    }
  }
  return out;
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const combos: [string, string, string][] = [
  ["pearl 浅", ":root", ":root"],
  ["pearl 深", ":root[data-mode='dark']", ":root[data-mode='dark']"],
  ["suliworld 浅", ":root[data-theme='suliworld']", ":root[data-theme='suliworld']"],
  ["suliworld 深", ":root[data-theme='suliworld'][data-mode='dark']", ":root[data-theme='suliworld'][data-mode='dark']"],
  ["soft 浅", ":root[data-theme='soft']", ":root[data-theme='soft']"],
  ["soft 深", ":root[data-theme='soft'][data-mode='dark']", ":root[data-theme='soft'][data-mode='dark']"],
];

describe("主题对比度（design-system §2.1：六种组合正文与次要文字 ≥ 4.5:1）", () => {
  for (const [name, sel] of combos) {
    test(name, () => {
      const v = { ...vars(":root"), ...(sel === ":root" ? {} : vars(sel)) };
      expect(v["--bg"], `${name} 解析到 --bg`).toBeDefined();
      if (name === "pearl 深") expect(v["--bg"]).toBe("#17191c");
      if (name === "soft 浅") expect(v["--bg"]).toBe("#fbfcfe");
      if (name.includes("深")) expect(v["--bg"]).toMatch(/^#(1[0-9a-f]){1}/i); // 深色背景应当较暗
      for (const bg of ["--bg", "--panel", "--sidebar", "--chrome", "--muted-bg"]) {
        for (const fg of ["--text", "--muted", "--faint"]) {
          expect(contrast(v[fg] as string, v[bg] as string), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(v["--accent-fg"] as string, v["--accent"] as string), `${name}: accent-fg on accent`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("外观规范化", () => {
  test("非法值回退 Pearl 浅色，字号限制 12–18", () => {
    expect(normalizeAppearance({ theme: "nope", mode: "x", fontSize: 99 })).toEqual({ theme: "pearl", mode: "light", motion: "system", fontSize: 14 });
    expect(normalizeAppearance({ theme: "soft", mode: "dark", motion: "reduced", fontSize: 16 })).toEqual({ theme: "soft", mode: "dark", motion: "reduced", fontSize: 16 });
  });
  test("system 跟随系统", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
  });
});
