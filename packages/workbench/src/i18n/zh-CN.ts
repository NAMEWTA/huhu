export const t = {
  loading: "加载中…",
  settings: {
    title: "设置", appearance: "外观", theme: "主题", mode: "明暗模式", modeSystem: "跟随系统", modeLight: "浅色", modeDark: "深色", fontSize: "界面字号", reset: "恢复默认外观",
    motion: "动效", motionSystem: "跟随系统", motionStandard: "标准", motionReduced: "减少", compact: "紧凑布局", navWidth: "导航栏宽度",
    editor: "编辑器", editorFontSize: "正文字号", editorLineHeight: "行高", editorWidth: "正文宽度", widthFull: "全宽", autosave: "自动保存", autosaveNote: "关闭后只在按 Mod+S 或点“保存”时写入文件", lineNumbers: "显示行号", spellcheck: "拼写检查", resetEditor: "恢复默认编辑器设置",
    vault: {
      title: "当前 Vault", name: "名称", description: "描述", save: "保存", saved: "已保存", readOnly: "此 Vault 以只读方式打开，不能修改名称和描述。",
      root: "根目录", reveal: "在文件管理器中显示", id: "标识", copy: "复制", copied: "已复制标识", copyFailed: "复制失败，请手动选择文本复制", overview: "概况", indexing: "正在建立索引",
      counts: (files: number, notes: number, tasks: number, inbox: number) => `${files} 个文件 · ${notes} 篇笔记 · ${tasks} 个未完成任务 · ${inbox} 条待整理`,
    },
    shortcuts: { title: "快捷键", keys: "按键", action: "操作", scope: "范围", note: "这里只列出已经可用的快捷键，之后新增的会自动出现在这个列表里。" },
    about: { title: "关于与来源", app: "应用", platform: "系统", coreUnavailable: "未启动或不可用", notices: "开源声明", showNotices: "展开查看全部开源声明", noNotices: "没有找到开源声明文件", hostOnly: "版本信息只在桌面应用里可用" },
    dateTime: "日期与时间", zone: "时区", zoneNote: "“今天”、日记和任务的今日视图按这个时区计算", zoneInvalid: "不是有效的时区", todayIn: (d: string) => `现在这个时区的日期：${d}`, resetZone: "恢复为系统时区",
  },
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
  focus: { title: "专注计时", start: "开始", pause: "暂停", reset: "重置", completedToday: (n: number) => `今日完成 ${n} 次` },
  habits: { title: "习惯", empty: "还没有习惯，在下面添加一个", newLabel: "新习惯", add: "添加", remove: (t: string) => `删除习惯：${t}` },
  customize: { open: "自定义", title: "首页卡片", cards: { focus: "专注计时", habits: "习惯", tasks: "任务", inbox: "收件箱", recent: "最近笔记" } as Record<string, string> },
  health: { title: "健康中心", run: "重新检查", overall: { ok: "一切正常", warning: "有需要留意的项目", error: "有需要处理的问题" } },
} as const;

export const tGateway = {
  title: "能力网关",
  mcp: "MCP 服务",
  mcpEnabled: "启用 MCP 服务",
  transport: "传输方式",
  stdio: "stdio（huhu mcp）",
  http: "HTTP（POST /mcp）",
  tokens: "HTTP 服务令牌",
  tokenName: "令牌名称",
  createToken: "创建令牌",
  revoke: "撤销",
  tokenOnce: "令牌只显示这一次，请立即复制保存：",
  noTokens: "还没有令牌",
  capabilities: "能力开放",
  filter: "筛选能力",
  exposed: "已开放",
  closed: "未开放",
  never: "不可开放",
  bench: "测试台",
  benchHint: "输入能力名，检查以 CLI / MCP / HTTP 身份调用现在是否会被允许（不会真的调用）",
  check: "检查",
  allowed: "允许",
  denied: "拒绝",
  notFound: "没有这个能力",
  scope: { read: "读", write: "写", execute: "执行", admin: "管理" },
} as const;
