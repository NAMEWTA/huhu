# W18 首页、通知、健康中心与设置

## W18.1 首页

- 目标：首页总览/今日安排/最近活动，指标、我的任务、最近笔记、专注计时、习惯、收件箱卡片，自定义卡片。
- 依据：[workbench](../modules/workbench.md) §2 首页、§3 首页数据；ACC-WB-05、06。
- 前置：W08.2、W05.1、W10.1、W13.1。
- 位置：`packages/workbench/src/pages/home/`、`packages/kernel/src/capabilities/home.ts`；各插件 `src/ui/home-widgets/`。
- 复用：R-55（`Home`、`ActivityFeed`）。
- 实现要点：`home.summary` 由 kernel 聚合各插件注册的摘要查询；卡片为插件贡献；自定义对话框（显示/排序，写 `home/widgets.json`）；专注计时（Renderer 计时、持久化、到零通知）；习惯跨日清空勾选。
- 异常：某插件停用时其卡片与指标隐藏。
- 测试：ACC-WB-05、06（可控时钟）。
- 完成：两个 ACC 通过。

## W18.2 通知中心与持久提醒提示

- 目标：站内通知存储与通知中心 Popover；任务提醒的持久 toast。
- 依据：workbench §2 通知中心；[system](../modules/system.md) §2 通知。
- 前置：W03.4。
- 位置：`packages/kernel/src/notifications.ts`（存储、能力、`notify` 服务；属于 kernel，health 插件停用时通知仍可用）、`packages/workbench/src/shell/NotificationCenter.tsx`、`plugins/health/src/ui/NotificationsPage.tsx`（列表页）。
- 复用：R-55。
- 实现要点：`notifications.*` 能力（ndjson，保留 1000 条）；其他插件经 Cordis 服务 `notify({title, body, module, link})` 创建；`reminder.due` 时显示持久 toast（打开任务/知道了）；rail 与铃铛未读标记。
- 异常：通知写入失败时仍显示 toast，并在事件日志记录失败。
- 测试：通知创建、已读、清除已读保留未读。
- 完成：ACC-TK-07 中通知部分通过。

## W18.3 健康中心

- 目标：诊断（可取消）、检查项注册、修复动作跳转、事件日志、诊断包导出。
- 依据：system §2；ACC-SY-01、02、03、04。
- 前置：W04.5、W12.1、W13.3、W15.1、W11.1、W17.4。
- 位置：`plugins/health/{huhu-plugin.json,src/engine/{checks,diagnostics-export,events}.ts,src/ui/}`；各插件 `src/engine/health-checks.ts`。
- 复用：R-55（`Health`）。
- 实现要点：插件经 `ctx.huhu.registerHealthCheck` 注册检查；运行时并行执行带超时（每项 10 秒）；结果带 `checkedAt` 与证据；取消使结果失效；诊断包内容与脱敏（security §3）；事件日志查询。
- 异常：单项检查抛错 → 该项“检查失败”，不影响其他项。
- 测试：ACC-SY-01–04。
- 完成：四个 ACC 通过。

## W18.4 设置页

- 目标：外观、当前 Vault、编辑器、日期与时间、快捷键、关于与来源设置页。
- 依据：system §3；ACC-SY-05、06。
- 前置：W02.1、W06.1。
- 位置：`packages/workbench/src/pages/settings/`、`packages/kernel/src/capabilities/settings.ts`。
- 复用：R-55（`Preferences`）。
- 实现要点：设置即时生效与回滚；主题缩略预览；时区列表（`Intl.supportedValuesOf('timeZone')`）；三个日期组件示例；快捷键表同源；关于页读取 `build-info.json` 与 `THIRD_PARTY_NOTICES.md`。
- 异常：写入失败回滚并提示。
- 测试：ACC-SY-05、06。
- 完成：两个 ACC 通过。

## W18.5 数据与存储页

- 目标：文件结构浏览、索引状态与重建、导出数据包、存储规则表、未完成操作处理。
- 依据：system §4；ACC-SY-07、08。
- 前置：W04.5、W04.6、W11.2。
- 位置：`packages/workbench/src/pages/settings/data/`。
- 复用：R-55（`VaultStorageView`、`BackupActionDialog`）。
- 实现要点：按 kind 列出受管文件与原文预览；重建进度与取消；导出对话框（附件勾选、大小、结果哈希）；关闭前备份提示开关。
- 异常：导出失败删除半成品。
- 测试：ACC-SY-07、08。
- 完成：两个 ACC 通过。
