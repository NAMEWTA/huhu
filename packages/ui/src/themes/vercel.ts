import type { ThemeDefinition } from "./schema.js";

const CJK = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';
const UI = `"Geist Variable", ${CJK}, system-ui, sans-serif`;
const MONO = '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const tags: ThemeDefinition["modes"]["light"]["core"]["tags"] = ["#f5a623", "#ff0080", "#29bc9b", "#7928ca", "#0070f3", "#f9cb28", "#50e3c2", "#ab570a"];

/**
 * Vercel：黑白分明的工程感，墨黑主按钮（深色模式反转为近白），叠层阴影加内描边，小标签用等宽字体。
 * 取值来自 design-refs/vercel/DESIGN.md；链接用 link-deep #0761d1（#0070f3 在 #fafafa 上只有 4.36:1）。
 * 工作台里主按钮用 6px 方形（DESIGN.md：同一屏幕不要混用 100px 胶囊与 6px）。
 */
export const vercel: ThemeDefinition = {
  id: "vercel",
  name: "Vercel",
  description: "黑白分明、Geist 字体、等宽小标签",
  reference: "design-refs/vercel/DESIGN.md",
  fonts: { ui: UI, display: UI, mono: MONO, label: MONO },
  type: { titleWeight: 600, titleTracking: "-0.04em", bodyLeading: 1.5, strongWeight: 500, labelTransform: "none", labelTracking: "0" },
  shape: { control: "6px", card: "8px", popover: "8px", badge: "9999px", buttonPrimary: "6px", pressTransform: "none", focusHalo: "none" },
  modes: {
    light: {
      core: {
        bg: "#fafafa",
        sidebar: "#fafafa",
        chrome: "#ffffff",
        panel: "#ffffff",
        elevated: "#ffffff",
        mutedBg: "#f5f5f5",
        text: "#171717",
        muted: "#4d4d4d",
        faint: "#6f6f6f",
        line: "#ebebeb",
        lineStrong: "#a1a1a1",
        accent: "#171717",
        accentStrong: "#171717",
        accentFg: "#ffffff",
        link: "#0761d1",
        focus: "#0070f3",
        success: "#29bc9b",
        warning: "#f5a623",
        danger: "#ee0000",
        info: "#0070f3",
        tags,
      },
      elevation: {
        card: "0 0 0 1px #00000014, 0 1px 1px #00000005, 0 2px 2px #0000000a",
        popover: "0 0 0 1px #00000014, 0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f",
        dialog: "0 0 0 1px #00000014, 0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f",
      },
      chromeBackdrop: "none",
      launchBackdrop:
        "radial-gradient(60% 50% at 20% 10%, rgba(0, 124, 240, 0.18), transparent), radial-gradient(50% 50% at 80% 20%, rgba(121, 40, 202, 0.16), transparent), radial-gradient(60% 50% at 50% 100%, rgba(255, 77, 77, 0.14), transparent), #fafafa",
    },
    dark: {
      core: {
        bg: "#0a0a0a",
        sidebar: "#0a0a0a",
        chrome: "#0a0a0a",
        panel: "#171717",
        elevated: "#171717",
        mutedBg: "#1f1f1f",
        text: "#ededed",
        muted: "#a1a1a1",
        faint: "#888888",
        line: "#2e2e2e",
        lineStrong: "#454545",
        accent: "#ededed",
        accentStrong: "#ededed",
        accentFg: "#0a0a0a",
        link: "#3291ff",
        focus: "#3291ff",
        success: "#50e3c2",
        warning: "#f5a623",
        danger: "#ff4d4d",
        info: "#3291ff",
        tags,
      },
      elevation: {
        card: "0 0 0 1px #ffffff1a",
        popover: "0 0 0 1px #ffffff1a, 0 8px 16px -4px #00000066",
        dialog: "0 0 0 1px #ffffff1a, 0 24px 32px -8px #00000099",
      },
      chromeBackdrop: "none",
      launchBackdrop:
        "radial-gradient(60% 50% at 20% 10%, rgba(0, 124, 240, 0.22), transparent), radial-gradient(50% 50% at 80% 20%, rgba(121, 40, 202, 0.2), transparent), radial-gradient(60% 50% at 50% 100%, rgba(255, 77, 77, 0.16), transparent), #0a0a0a",
    },
  },
};
