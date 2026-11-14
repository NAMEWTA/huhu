import { parse } from "culori";
import { z } from "zod";

export { THEME_IDS, DEFAULT_THEME, type ThemeId } from "@huhu/contracts";

const Color = z.string().refine((v) => parse(v) !== undefined, "不是合法的 CSS 颜色");
const Css = z.string().min(1);
const Tags = z.tuple([Color, Color, Color, Color, Color, Color, Color, Color]);

/** 每种模式必填的核心色（见 .agents/dev/archive/changes/implemented/feature_2026-11-13-brand-and-windows-installer/design-system.md §4.1）。 */
export const CorePalette = z.object({
  bg: Color,
  sidebar: Color,
  chrome: Color,
  panel: Color,
  elevated: Color,
  mutedBg: Color,
  text: Color,
  muted: Color,
  faint: Color,
  line: Color,
  lineStrong: Color,
  accent: Color,
  accentStrong: Color,
  accentFg: Color,
  link: Color,
  focus: Color,
  success: Color,
  warning: Color,
  danger: Color,
  info: Color,
  tags: Tags,
});
export type CorePalette = z.infer<typeof CorePalette>;

/** 派生色：生成器按规则计算，主题可以逐项覆盖。键名即 CSS 变量名（去掉 `--`）。 */
export const DerivedOverrides = z.record(z.string(), Color);

export const ModeTokens = z.object({
  core: CorePalette,
  /** 完整 box-shadow 值，可为 "none"。 */
  elevation: z.object({ card: Css, popover: Css, dialog: Css }),
  /** 吸顶元素的毛玻璃，例如 "saturate(180%) blur(20px)"；不用时为 "none"。 */
  chromeBackdrop: Css,
  /** 启动页背景（CSS background 值）。 */
  launchBackdrop: Css,
  /** 覆盖派生色（例如 Notion 的标签底色取 card-tint）。 */
  overrides: DerivedOverrides.optional(),
});
export type ModeTokens = z.infer<typeof ModeTokens>;

export const ThemeDefinition = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  /** 对应的设计参考，便于追溯。 */
  reference: z.string().min(1),
  fonts: z.object({ ui: Css, display: Css, mono: Css, label: Css }),
  type: z.object({
    titleWeight: z.number(),
    titleTracking: Css,
    bodyLeading: z.number(),
    strongWeight: z.number(),
    labelTransform: z.enum(["none", "uppercase"]),
    labelTracking: Css,
  }),
  shape: z.object({
    control: Css,
    card: Css,
    popover: Css,
    badge: Css,
    buttonPrimary: Css,
    /** 按下效果：Apple 为 "scale(.95)"，其余为 "none"。 */
    pressTransform: Css,
    /** 焦点环外的柔光（box-shadow 片段），可以为 "none"。 */
    focusHalo: Css,
  }),
  modes: z.object({ light: ModeTokens, dark: ModeTokens }),
});
export type ThemeDefinition = z.infer<typeof ThemeDefinition>;

/** 用户自定义主题：`extends` 一个已有主题，只覆盖部分字段（深合并）。 */
export type ThemeOverride = {
  id: string;
  name: string;
  description?: string;
  extends: string;
  fonts?: Partial<ThemeDefinition["fonts"]>;
  type?: Partial<ThemeDefinition["type"]>;
  shape?: Partial<ThemeDefinition["shape"]>;
  modes?: { light?: DeepPartial<ModeTokens>; dark?: DeepPartial<ModeTokens> };
};
type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
