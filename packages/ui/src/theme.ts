import { DEFAULT_THEME, THEME_IDS, type ThemeId } from "./themes/schema.js";

export const MODES = ["light", "dark", "system"] as const;
export type Mode = (typeof MODES)[number];
export type Motion = "system" | "standard" | "reduced";
export type Density = "comfortable" | "compact";

export interface Appearance {
  theme: ThemeId;
  mode: Mode;
  motion: Motion;
  fontSize: number;
  density: Density;
  /** 导航栏宽度（176–300）。 */
  navWidth: number;
}

type Raw = Partial<Record<keyof Appearance, unknown>>;

/** 非法值回退到默认主题（Claude）与跟随系统；旧值（例如已删除的主题 id）同样按非法处理，不做迁移。 */
export function normalizeAppearance(a: Raw): Appearance {
  return {
    theme: THEME_IDS.includes(a.theme as ThemeId) ? (a.theme as ThemeId) : DEFAULT_THEME,
    mode: MODES.includes(a.mode as Mode) ? (a.mode as Mode) : "system",
    motion: a.motion === "standard" || a.motion === "reduced" ? a.motion : "system",
    fontSize: typeof a.fontSize === "number" && a.fontSize >= 12 && a.fontSize <= 18 ? Math.round(a.fontSize) : 14,
    density: a.density === "compact" ? "compact" : "comfortable",
    navWidth: typeof a.navWidth === "number" && a.navWidth >= 176 && a.navWidth <= 300 ? Math.round(a.navWidth) : 220,
  };
}

/** mode=system 时解析为 light/dark。 */
export function resolveMode(mode: Mode, prefersDark: boolean): "light" | "dark" {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

export function applyAppearance(root: HTMLElement, a: Raw, prefersDark: boolean): Appearance {
  const n = normalizeAppearance(a);
  root.dataset["theme"] = n.theme;
  root.dataset["mode"] = resolveMode(n.mode, prefersDark);
  root.dataset["motion"] = n.motion;
  root.dataset["density"] = n.density;
  root.style.setProperty("--font-size", `${n.fontSize}px`);
  root.style.setProperty("--sidebar-w", `${n.navWidth}px`);
  return n;
}

/** 外观应用后派发：终端、Mermaid 等不能只靠 CSS 变量的部分订阅它来更新。 */
export const APPEARANCE_CHANGED = "huhu:appearance-changed";
const CACHE_KEY = "huhu.appearance";

/** 首帧缓存：启动页没有 Vault，读不到设置，只在这里显示最近一次应用的外观；真值仍是 Vault 的 .huhu/settings.json。 */
export function readCachedAppearance(): Appearance | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalizeAppearance(JSON.parse(raw) as Raw) : null;
  } catch {
    return null;
  }
}

/**
 * 外观状态的唯一所有者：所有地方（启动、设置页、顶栏明暗切换）都经过它；
 * 只安装一个 matchMedia 监听，mode=system 时系统明暗变化会实时生效。
 */
export class AppearanceController {
  private current: Appearance;
  private readonly media: MediaQueryList | null;
  constructor(
    private readonly root: HTMLElement = document.documentElement,
    win: Pick<Window, "matchMedia" | "dispatchEvent"> = window,
  ) {
    this.media = typeof win.matchMedia === "function" ? win.matchMedia("(prefers-color-scheme: dark)") : null;
    this.current = readCachedAppearance() ?? normalizeAppearance({});
    this.media?.addEventListener("change", () => this.current.mode === "system" && this.apply());
    this.win = win;
  }
  private readonly win: Pick<Window, "dispatchEvent">;
  private apply(): void {
    this.current = applyAppearance(this.root, this.current, this.media?.matches === true);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.current));
    } catch {
      /* 缓存只用于首帧，存不了就算了 */
    }
    this.win.dispatchEvent(new CustomEvent(APPEARANCE_CHANGED, { detail: this.current }));
  }
  /** 按当前状态（首帧缓存或默认值）重新应用一次：应用启动时调用，避免首帧没有主题。 */
  refresh(): void {
    this.apply();
  }
  /** 应用一份外观（设置页保存后、读到 Vault 设置后调用）。 */
  set(a: Raw): void {
    this.current = normalizeAppearance(a);
    this.apply();
  }
  get(): Appearance {
    return this.current;
  }
}

let controller: AppearanceController | null = null;
export const appearanceController = (): AppearanceController => (controller ??= new AppearanceController());
