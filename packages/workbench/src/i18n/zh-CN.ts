export const t = {
  loading: "加载中…",
  settings: { title: "设置", appearance: "外观", theme: "主题", mode: "明暗模式", modeSystem: "跟随系统", modeLight: "浅色", modeDark: "深色", fontSize: "界面字号", reset: "恢复默认外观" },
  plugins: {
    title: "插件中心", enable: "启用", disable: "停用", cancel: "取消", confirmTitle: "同时停用依赖它的插件",
    states: { active: "已启用", disabled: "已停用", failed: "启动失败" },
    confirmBody: (ids: string[]) => `停用后，以下插件也会被一起停用：${ids.join("、")}`,
  },
  notifications: { title: "通知", empty: "没有通知", markAll: "全部标为已读", clearRead: "清除已读", unread: (n: number) => `${n} 条未读` },
} as const;

export const tHome = {
  title: "工作台",
  tasksToday: "今日任务", tasksOpen: "未完成任务", inboxPending: "待处理收件", notes: "笔记", recent: "最近笔记", noRecent: "还没有笔记",
  health: { title: "健康中心", run: "重新检查", overall: { ok: "一切正常", warning: "有需要留意的项目", error: "有需要处理的问题" } },
} as const;
