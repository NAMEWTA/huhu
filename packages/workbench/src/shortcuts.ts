/** 已实现的快捷键（设置页「快捷键」与实际行为同源：新增快捷键时在这里登记，页面自动显示）。 */
export interface Shortcut {
  keys: string;
  action: string;
  scope: string;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: "Mod+K", action: "打开 / 关闭命令面板", scope: "全局" },
  { keys: "Mod+Shift+N", action: "快速捕获到收件箱", scope: "全局" },
  { keys: "F6", action: "在功能栏、侧栏、内容、详情之间切换焦点（Shift+F6 反向）", scope: "全局" },
  { keys: "Esc", action: "关闭命令面板", scope: "命令面板" },
  { keys: "Mod+S", action: "立即保存当前笔记", scope: "笔记编辑器" },
];

/** Mod 在 macOS 上是 ⌘，其他平台是 Ctrl。 */
export function displayKeys(keys: string, platform: string): string {
  return keys.replace("Mod", platform === "darwin" ? "⌘" : "Ctrl");
}
