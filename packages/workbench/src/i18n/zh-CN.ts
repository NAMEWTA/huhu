export const t = {
  loading: "加载中…",
  settings: { title: "设置", appearance: "外观", theme: "主题", mode: "明暗模式", modeSystem: "跟随系统", modeLight: "浅色", modeDark: "深色", fontSize: "界面字号", reset: "恢复默认外观" },
  notifications: { title: "通知", empty: "没有通知", markAll: "全部标为已读", clearRead: "清除已读", unread: (n: number) => `${n} 条未读` },
} as const;
