import { apple } from "./apple.js";
import { claude } from "./claude.js";
import { notion } from "./notion.js";
import { THEME_IDS, ThemeDefinition, type ThemeId } from "./schema.js";
import { vercel } from "./vercel.js";

export * from "./schema.js";
export { allThemesCss, modeVars, resolveTheme, themeToCss, type ModeName } from "./generate.js";

/** 内置主题表：类型保证每个 ThemeId 都有定义。 */
export const THEMES: Record<ThemeId, ThemeDefinition> = { claude, apple, notion, vercel };
export const themeList = (): (ThemeDefinition & { id: ThemeId })[] => THEME_IDS.map((id) => ({ ...THEMES[id], id }));

/** 校验内置主题（单元测试与生成脚本都会调用）。 */
export function validateThemes(): void {
  for (const id of THEME_IDS) ThemeDefinition.parse(THEMES[id]);
}
