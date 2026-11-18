// `next-themes` 的 Huhu 替身（经 tsconfig.vendor.json 的 paths / okAliases 落到这里）。
// vendor 只用 `useTheme().resolvedTheme` 来选 CodeMirror / mermaid 的明暗主题；真正的主题由 Huhu 的
// html[data-mode] 决定。真实的 next-themes 会往 DOM 里注入 <script>、写 html.class 与 localStorage，
// 这些都不能出现在笔记阅读区里（ACC-KN-09：阅读区不得有 <script>），所以这里只提供上下文。
import { createContext, type ReactNode, use, useMemo } from "react";

type Resolved = "light" | "dark";

interface ThemeContextValue {
  theme: Resolved;
  resolvedTheme: Resolved;
  systemTheme: Resolved;
  themes: Resolved[];
  setTheme: (theme: string) => void;
}

const noop = (): void => {};
const DEFAULT: ThemeContextValue = { theme: "light", resolvedTheme: "light", systemTheme: "light", themes: ["light", "dark"], setTheme: noop };
const ThemeContext = createContext<ThemeContextValue>(DEFAULT);

export function ThemeProvider({ children, forcedTheme }: { children: ReactNode; forcedTheme?: Resolved; [prop: string]: unknown }) {
  const value = useMemo<ThemeContextValue>(() => {
    const t = forcedTheme ?? "light";
    return { theme: t, resolvedTheme: t, systemTheme: t, themes: ["light", "dark"], setTheme: noop };
  }, [forcedTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  return use(ThemeContext);
}
