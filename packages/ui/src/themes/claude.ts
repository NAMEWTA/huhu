import type { ThemeDefinition } from "./schema.js";

const CJK = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';
const UI = `"Inter Variable", ${CJK}, system-ui, sans-serif`;
const tags: ThemeDefinition["modes"]["light"]["core"]["tags"] = ["#e8a55a", "#d97a9a", "#5db872", "#8e6fc4", "#5b8fd1", "#d4a017", "#5db8a6", "#8a6a4a"];

/**
 * Claude：温暖奶油底、衬线标题、珊瑚强调色，色块优先、几乎不用阴影。
 * 取值来自 design-refs/claude/DESIGN.md；Copernicus 不可用，用开源的 Newsreader 替代（风格接近 Tiempos）。
 * 白字压在 #cc785c 上只有 3.3:1，所以按钮底色与链接改用同一份文档里的 primary-active #a9583e。
 */
export const claude: ThemeDefinition = {
  id: "claude",
  name: "Claude",
  description: "温暖奶油底、衬线标题、珊瑚强调色",
  reference: "design-refs/claude/DESIGN.md",
  fonts: { ui: UI, display: `"Newsreader Variable", ${CJK}, serif`, mono: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', label: UI },
  type: { titleWeight: 400, titleTracking: "-0.02em", bodyLeading: 1.55, strongWeight: 500, labelTransform: "none", labelTracking: "0" },
  shape: { control: "8px", card: "12px", popover: "12px", badge: "9999px", buttonPrimary: "8px", pressTransform: "none", focusHalo: "0 0 0 5px rgba(204, 120, 92, 0.15)" },
  modes: {
    light: {
      core: {
        bg: "#faf9f5",
        sidebar: "#f5f0e8",
        chrome: "#faf9f5",
        panel: "#faf9f5",
        elevated: "#faf9f5",
        mutedBg: "#efe9de",
        text: "#141413",
        muted: "#62605a",
        faint: "#696761",
        line: "#e6dfd8",
        lineStrong: "#d4cbbd",
        accent: "#cc785c",
        accentStrong: "#a9583e",
        accentFg: "#ffffff",
        link: "#a9583e",
        focus: "#cc785c",
        success: "#5db872",
        warning: "#d4a017",
        danger: "#c64545",
        info: "#5db8a6",
        tags,
      },
      elevation: { card: "none", popover: "0 1px 3px rgba(20, 20, 19, 0.08), 0 0 0 1px #e6dfd8", dialog: "0 8px 24px rgba(20, 20, 19, 0.12)" },
      chromeBackdrop: "none",
      launchBackdrop: "#faf9f5",
    },
    dark: {
      core: {
        bg: "#181715",
        sidebar: "#1f1e1b",
        chrome: "#181715",
        panel: "#1f1e1b",
        elevated: "#252320",
        mutedBg: "#252320",
        text: "#faf9f5",
        muted: "#a09d96",
        faint: "#8e8c87",
        line: "#2e2c28",
        lineStrong: "#45423c",
        accent: "#cc785c",
        accentStrong: "#cc785c",
        accentFg: "#141413",
        link: "#d99a7f",
        focus: "#cc785c",
        success: "#5db872",
        warning: "#d4a017",
        danger: "#c64545",
        info: "#5db8a6",
        tags,
      },
      elevation: { card: "none", popover: "0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px #2e2c28", dialog: "0 8px 24px rgba(0, 0, 0, 0.5)" },
      chromeBackdrop: "none",
      launchBackdrop: "#181715",
    },
  },
};
