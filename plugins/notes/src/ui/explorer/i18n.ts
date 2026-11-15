/** 资源管理器文案。 */
export const r = {
  files: (c: string) => `${c} 个文件`,
  dirs: (c: string) => `${c} 个文件夹`,
  partial: "已加载，未完整统计",
  showHidden: "显示已隐藏项目",
  hideAgain: "再次隐藏这些项目",
  manageHidden: (n: number) => `已隐藏 ${n} 项`,
  hiddenTitle: "已隐藏的项目",
  restore: "取消隐藏",
  loading: "加载文件树…",
  move: "移动到…",
  favorite: "加星标",
  unfavorite: "取消星标",
  saveVersion: "保存版本…",
} as const;
