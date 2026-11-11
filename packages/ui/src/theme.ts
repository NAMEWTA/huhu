export const THEMES = ["pearl", "suliworld", "soft"] as const;
export const MODES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export type Mode = (typeof MODES)[number];
export type Motion = "system" | "standard" | "reduced";

export interface Appearance {
  theme: Theme;
  mode: Mode;
  motion?: Motion;
  fontSize?: number;
  /** 导航栏宽度（200–360）。 */
  navWidth?: number;
  compact?: boolean;
}

/** 非法值回退到 Pearl 浅色。 */
export function normalizeAppearance(a: Partial<Record<keyof Appearance, unknown>>): Required<Omit<Appearance, "navWidth" | "compact">> {
  const theme = THEMES.includes(a.theme as Theme) ? (a.theme as Theme) : "pearl";
  const mode = MODES.includes(a.mode as Mode) ? (a.mode as Mode) : "light";
  const motion = a.motion === "standard" || a.motion === "reduced" ? a.motion : "system";
  const fs = typeof a.fontSize === "number" && a.fontSize >= 12 && a.fontSize <= 18 ? Math.round(a.fontSize) : 14;
  return { theme, mode, motion, fontSize: fs };
}

/** mode=system 时解析为 light/dark。 */
export function resolveMode(mode: Mode, prefersDark: boolean): "light" | "dark" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

export function applyAppearance(root: HTMLElement, a: Partial<Record<keyof Appearance, unknown>>, prefersDark: boolean): void {
  const n = normalizeAppearance(a);
  root.dataset["theme"] = n.theme;
  root.dataset["mode"] = resolveMode(n.mode, prefersDark);
  root.dataset["motion"] = n.motion;
  root.style.setProperty("--font-size", `${n.fontSize}px`);
  const nw = typeof a.navWidth === "number" && a.navWidth >= 176 && a.navWidth <= 300 ? Math.round(a.navWidth) : 220;
  root.style.setProperty("--sidebar-w", `${nw}px`);
  root.dataset["density"] = a.compact === true ? "compact" : "comfortable";
}
