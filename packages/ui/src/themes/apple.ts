import type { ThemeDefinition } from "./schema.js";

const CJK = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';
const UI = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", ${CJK}, sans-serif`;

/**
 * Apple：克制的画廊式界面，单一蓝色强调、胶囊主按钮、吸顶元素用毛玻璃，界面元素不加阴影。
 * 取值来自 design-refs/apple/DESIGN.md；macOS 上字体就是真正的 SF Pro，其他平台用 Inter 并收紧字距。
 * DESIGN.md 没有语义色与标签色，这里取 Apple 系统色（带 ★ 的值在主题表中已说明）。
 */
export const apple: ThemeDefinition = {
  id: "apple",
  name: "Apple",
  description: "克制的画廊式界面、单一蓝色、胶囊主按钮",
  reference: "design-refs/apple/DESIGN.md",
  fonts: { ui: UI, display: UI, mono: 'ui-monospace, "SF Mono", "JetBrains Mono Variable", Menlo, Consolas, monospace', label: UI },
  type: { titleWeight: 600, titleTracking: "-0.022em", bodyLeading: 1.47, strongWeight: 600, labelTransform: "none", labelTracking: "0" },
  shape: { control: "8px", card: "18px", popover: "12px", badge: "9999px", buttonPrimary: "9999px", pressTransform: "scale(0.95)", focusHalo: "none" },
  modes: {
    light: {
      core: {
        bg: "#ffffff",
        sidebar: "#f5f5f7",
        chrome: "#f5f5f7",
        panel: "#ffffff",
        elevated: "#fafafc",
        mutedBg: "#f0f0f0",
        text: "#1d1d1f",
        muted: "#626267",
        faint: "#6b6b6b",
        line: "#e0e0e0",
        lineStrong: "#d2d2d7",
        accent: "#0066cc",
        accentStrong: "#0066cc",
        accentFg: "#ffffff",
        link: "#0066cc",
        focus: "#0071e3",
        success: "#248a3d",
        warning: "#b25000",
        danger: "#d70015",
        info: "#0066cc",
        tags: ["#ff9500", "#ff2d55", "#34c759", "#af52de", "#007aff", "#ffcc00", "#5ac8fa", "#a2845e"],
      },
      elevation: { card: "none", popover: "0 8px 30px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08)", dialog: "0 12px 40px rgba(0, 0, 0, 0.18)" },
      chromeBackdrop: "saturate(180%) blur(20px)",
      launchBackdrop: "#f5f5f7",
    },
    dark: {
      core: {
        bg: "#252527",
        sidebar: "#272729",
        chrome: "#000000",
        panel: "#2a2a2c",
        elevated: "#2a2a2c",
        mutedBg: "#333336",
        text: "#ffffff",
        muted: "#cccccc",
        faint: "#9d9d9d",
        line: "#3a3a3c",
        lineStrong: "#48484a",
        accent: "#2997ff",
        accentStrong: "#0071e3",
        accentFg: "#ffffff",
        link: "#2997ff",
        focus: "#2997ff",
        success: "#30d158",
        warning: "#ff9f0a",
        danger: "#ff453a",
        info: "#2997ff",
        tags: ["#ff9f0a", "#ff375f", "#30d158", "#bf5af2", "#0a84ff", "#ffd60a", "#64d2ff", "#ac8e68"],
      },
      elevation: { card: "none", popover: "0 8px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px #3a3a3c", dialog: "0 12px 40px rgba(0, 0, 0, 0.6)" },
      chromeBackdrop: "saturate(180%) blur(20px)",
      launchBackdrop: "#000000",
    },
  },
};
