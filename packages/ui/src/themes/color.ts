import { formatHex, formatHex8, interpolate, parse, wcagContrast, converter } from "culori";

const toRgb = converter("rgb");

export function hex(c: string): string {
  const p = parse(c);
  if (!p) throw new Error(`不是合法的颜色：${c}`);
  const rgb = toRgb(p);
  return rgb && (rgb.alpha ?? 1) < 1 ? formatHex8(rgb) : formatHex(rgb);
}

/** 在 OKLab 空间混色：返回 `pct` 份 a + `(1 - pct)` 份 b（不透明，十六进制）。 */
export function mix(a: string, b: string, pct: number): string {
  return formatHex(interpolate([b, a], "oklab")(pct));
}

/** 给颜色加透明度（0–1），返回 8 位十六进制。 */
export function alpha(c: string, a: number): string {
  const rgb = toRgb(parse(c));
  return formatHex8({ ...rgb!, alpha: a });
}

/** WCAG 对比度（前景在背景上）。 */
export function contrast(fg: string, bg: string): number {
  return wcagContrast(fg, bg);
}

/**
 * 从 `from` 向 `toward` 逐级混合，返回在所有 `on` 背景上都达到 `min` 对比度的第一个颜色；
 * 混到 `toward` 仍不够时返回 `toward`。
 */
export function readable(from: string, toward: string, on: string[], min = 4.5): string {
  for (let i = 0; i <= 20; i++) {
    const c = mix(toward, from, i / 20);
    if (on.every((bg) => contrast(c, bg) >= min)) return c;
  }
  return hex(toward);
}
