# t17c task03 · 运行结果加载反馈复核

上轮加载反馈低项可以关闭。自动化运行抽屉补上首次读取状态，两个入口都能在刷新结束后退出加载提示。未发现禁用观察者引起额外请求、重复缓存或阻止原查询刷新的问题。

范围为 integration 基线 `4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73` 到未提交的两个 UI 文件。复核 blob 为 `TaskDispatchPanel.tsx=41c51d96c93259e1d7945f6c8234c7596bbf2b72`、`RunsPanel.tsx=02a8f0b570fafee2f6906437133910ab88aa5618`。 [上轮发现](t17c-report02.md) · [返工记录](t176-report04.md)

## 加载反馈

- 自动化运行抽屉按所选运行携带的原任务 ID 发起 `tasks.read`。冷缓存期间，`isPending` 直接在抽屉显示「正在读取原任务…」，首次查询失败可见原错误。已有任务数据时，当前请求的 `isFetching` 传给结果区，因此旧 DTO 中暂缺评论时有刷新反馈。 [运行选择](../../plugins/automations/src/ui/RunsPanel.tsx#L75) · [任务读取及反馈](../../plugins/automations/src/ui/RunsPanel.tsx#L84)
- 任务详情的 DTO 来自已挂载的 `TasksModule` 列表查询。模块按任务 ID 取出 DTO，经 `TaskDetail` 传入派遣面板。面板观察来源查询的刷新状态。核对了 `TaskRunDetails` 的两个调用处，均传入相应 DTO 来源的状态。 [列表来源](../../plugins/tasks/src/ui/TasksModule.tsx#L18) · [选中任务](../../plugins/tasks/src/ui/TasksModule.tsx#L222) · [派遣面板入口](../../plugins/tasks/src/ui/TaskDetail.tsx#L296) · [结果区调用](../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L187)
- 已投递但缺少原 runId 对应结果评论时，刷新中显示正在读取，刷新结束后给出正文缺失反馈。若评论随后出现，同一条件退出提示并渲染正文。选择条件仍是原 runId 与 `result/failed`。无正文结束、投递待核对和缺少原任务沿用各自的反馈。 [状态与评论匹配](../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L258) · [正文渲染](../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L294)

## 禁用观察者

- 列表与派遣面板使用同一 Vault、同一 `tasks.list` 能力和同一 `{ category: "all" }` 参数。两处都经 Workbench 的同一 QueryClient 及键生成器。筛选、看板和日历的过滤在列表结果上本地执行，切换这些入口也继续读该键。禁用观察者随任务详情挂载，父列表同时有启用观察者。两个 queryFn 调用同一客户端、能力及输入。任务或运行事件仍经现有失效规则刷新活跃查询。 [列表来源](../../plugins/tasks/src/ui/TasksModule.tsx#L18) · [禁用观察者](../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L64) · [共享客户端和查询键](../../packages/workbench/src/engine-client/react.tsx#L50) · [事件失效](../../packages/workbench/src/engine-client/query.ts#L27)
- 本会话用仓库实际安装的 `@tanstack/react-query 5.107.1` 运行内存探针。启用观察者加载一次，挂载同键的禁用观察者后缓存仍只有一条且调用累计仍为一次。使查询失效后只增加一次调用，禁用观察者观察到 `isFetching` 依次为 `true`、`false`，并与启用观察者读到同一更新对象。卸载启用观察者后再失效，调用仍累计两次，更新数据仍在缓存。探针覆盖查询库行为，界面分支由源码核对。

## 验证范围

本会话定向 `git diff --check` 通过，完成上述无文件写入的查询探针，仅在工作树内写入本报告。t176/report04 记录两个文件的定向类型、格式和 lint 通过。本会话未重跑这些门禁、Vitest、Electron/Playwright、构建或打包。新组合上首次打开、后台刷新及正文缺失的实际渲染仍待候选验证。 [返工验证](t176-report04.md)

### Modern Web Guidance

本轮沿用 Lead 已检索获取的 `js` 指南。我核对了两处入口使用现有查询状态和状态反馈，复核过程中仅生成报告。
