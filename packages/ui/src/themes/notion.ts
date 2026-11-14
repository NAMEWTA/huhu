import type { ThemeDefinition } from "./schema.js";

const CJK = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';
const UI = `"Inter Variable", ${CJK}, system-ui, sans-serif`;
const tags: ThemeDefinition["modes"]["light"]["core"]["tags"] = ["#dd5b00", "#ff64c8", "#1aae39", "#7b3ff2", "#0075de", "#f5d75e", "#2a9d99", "#523410"];

/**
 * Notion：白底暖灰、紫色主按钮、矩形按钮（不用胶囊）、彩色属性标签。
 * 取值来自 design-refs/notion/DESIGN.md；Notion Sans 基于 Inter，直接用 Inter。
 * 标签底色取 DESIGN.md 的 card-tint 系列（浅色模式）。
 */
export const notion: ThemeDefinition = {
  id: "notion",
  name: "Notion",
  description: "白底暖灰、紫色主按钮、彩色属性标签",
  reference: "design-refs/notion/DESIGN.md",
  fonts: { ui: UI, display: UI, mono: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', label: UI },
  type: { titleWeight: 600, titleTracking: "-0.01em", bodyLeading: 1.55, strongWeight: 500, labelTransform: "none", labelTracking: "0" },
  shape: { control: "8px", card: "12px", popover: "8px", badge: "4px", buttonPrimary: "8px", pressTransform: "none", focusHalo: "none" },
  modes: {
    light: {
      core: {
        bg: "#ffffff",
        sidebar: "#f6f5f4",
        chrome: "#ffffff",
        panel: "#ffffff",
        elevated: "#ffffff",
        mutedBg: "#f0eeec",
        text: "#1a1a1a",
        muted: "#5d5b54",
        faint: "#6d6b67",
        line: "#e5e3df",
        lineStrong: "#c8c4be",
        accent: "#5645d4",
        accentStrong: "#5645d4",
        accentFg: "#ffffff",
        link: "#0075de",
        focus: "#5645d4",
        success: "#1aae39",
        warning: "#dd5b00",
        danger: "#e03131",
        info: "#0075de",
        tags,
      },
      elevation: { card: "rgba(15, 15, 15, 0.04) 0 1px 2px", popover: "rgba(15, 15, 15, 0.16) 0 16px 48px -8px", dialog: "rgba(15, 15, 15, 0.16) 0 16px 48px -8px" },
      chromeBackdrop: "none",
      launchBackdrop: "#ffffff",
      overrides: {
        "tag-1-bg": "#ffe8d4",
        "tag-2-bg": "#fde0ec",
        "tag-3-bg": "#d9f3e1",
        "tag-4-bg": "#e6e0f5",
        "tag-5-bg": "#dcecfa",
        "tag-6-bg": "#fef7d6",
        "tag-7-bg": "#d9f3e1",
        "tag-8-bg": "#f8f5e8",
      },
    },
    dark: {
      core: {
        bg: "#1a1a1a",
        sidebar: "#202020",
        chrome: "#1a1a1a",
        panel: "#202020",
        elevated: "#252525",
        mutedBg: "#37352f",
        text: "#ffffff",
        muted: "#adaaa1",
        faint: "#a09f9c",
        line: "#2f2f2f",
        lineStrong: "#5d5b54",
        accent: "#7b3ff2",
        accentStrong: "#5645d4",
        accentFg: "#ffffff",
        link: "#529cca",
        focus: "#9a6bf5",
        success: "#1aae39",
        warning: "#dd5b00",
        danger: "#e03131",
        info: "#529cca",
        tags,
      },
      elevation: { card: "rgba(0, 0, 0, 0.3) 0 1px 2px", popover: "rgba(0, 0, 0, 0.5) 0 16px 48px -8px", dialog: "rgba(0, 0, 0, 0.5) 0 16px 48px -8px" },
      chromeBackdrop: "none",
      launchBackdrop: "#0a1530",
    },
  },
};
