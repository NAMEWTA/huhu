/**
 * 生成 packages/ui/src/styles/ 下的两个文件（提交进仓库，漂移测试会重新生成并比较）：
 * - themes.generated.css：全部内置主题（来自 src/themes/）
 * - fonts.generated.css：随包字体的 @font-face，只取 Fontsource 包里的 latin 与 latin-ext 子集（中文用系统字体）
 * 用法：pnpm gen:themes
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_THEME, THEMES, allThemesCss, validateThemes } from "../src/themes/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const styles = path.join(root, "src/styles");

export const FONT_PACKAGES = ["inter", "newsreader", "geist", "geist-mono", "jetbrains-mono"] as const;

export function themesCss(): string {
  validateThemes();
  return allThemesCss(THEMES, DEFAULT_THEME);
}

export function fontsCss(): string {
  const out = ["/* 由 `pnpm gen:themes` 生成，不要手改。随包字体（SIL OFL 1.1），许可见根目录 THIRD_PARTY_NOTICES.md 的“随包字体”一节。 */"];
  for (const pkg of FONT_PACKAGES) {
    const css = readFileSync(path.join(root, "node_modules/@fontsource-variable", pkg, "wght.css"), "utf8");
    for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)) {
      if (!/-latin(-ext)?-wght-normal$/.test(m[1]!)) continue;
      out.push(m[2]!.replace(/url\(\.\/files\/([^)]+)\)/, `url("../../node_modules/@fontsource-variable/${pkg}/files/$1")`));
    }
  }
  return out.join("\n\n") + "\n";
}

export function writeGenerated(): void {
  writeFileSync(path.join(styles, "themes.generated.css"), themesCss());
  writeFileSync(path.join(styles, "fonts.generated.css"), fontsCss());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeGenerated();
