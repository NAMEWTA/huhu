# t17c task02 · 回执延后唤醒和运行结果阅读复核

上一轮 ACK 同步扫描低项可以关闭。结果阅读继续匹配原运行，普通段落和富文本沿用现有阅读逻辑。加载反馈仍有一项低优先级缺口，见下。

基线为 `integration` 的 `4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73`。本轮复核未提交的六个文件。扫描器 `d10daece`、收件能力 `a7788a60`、Engine 测试 `49669893`、运行面板 `894e1cbe`、阅读封装 `5af932fc`、验收夹具 `37204c39`。 [上轮报告](t17c-report01.md) · [结果交付规格](../../.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T3.3-deliver.md)

## ACK 路径及轮次

- 终态回执持久回读后，能力仅设置待检查位并按需登记一个 `setImmediate`，当前内部调用可返回 ACK。同步枚举和解析收件箱从后续检查进入。新增断言用 60 秒正常检查间隔隔离定时器，并在生产能力返回 ACK 时确认 `replay` 零次，随后确认原评论送达。 [收件能力](../../plugins/tasks/src/engine/index.ts#L466) · [调度](../../plugins/tasks/src/engine/dispatch.ts#L753) · [回归](../../plugins/tasks/test/persistence-http.test.ts#L595)
- 任何有效 `check` 都会在第一次让出前取得检查标记、清除待检查位并开始读收件箱。若定时或其他入口先开始，已登记的回调会跳过已消费的唤醒。若异步检查期间又有收件，待检查位置为真。如果旧回调这时先执行，`check` 因检查在途返回，保留该位，由该轮 `finally` 再排。若当前轮先结束，已有回调负责消费该位。异常也经过 `finally`，错误本身无法置位。没有发现丢唤醒或自激忙循环。 [调度及检查入口](../../plugins/tasks/src/engine/dispatch.ts#L753) · [退出补排](../../plugins/tasks/src/engine/dispatch.ts#L803) · [在途检查回归](../../plugins/tasks/test/persistence-http.test.ts#L620)
- 关闭同步置 abort 并取消回调。迟到唤醒和在途轮次的 `finally` 都受 abort 守卫约束，重开继续按持久收件箱恢复。现有检查若在等另一任务，后续唤醒仍等该轮退出，符合本次范围。 [关闭](../../plugins/tasks/src/engine/dispatch.ts#L195) · [启动恢复](../../plugins/tasks/src/engine/index.ts#L573)

## 结果阅读

- 任务详情和自动化抽屉共用 `TaskRunDetails`。评论继续按原 `runId` 和 `result/failed` 事件取自对应任务，原会话定位仍取自同一派遣。自动化抽屉按选中的 runId 获取最新行并以该 ID 挂载，评论也以持久消息 ID 为键。任务和运行事件都使当前 Vault 的 Tasks 查询失效，正常到件后旧 DTO 中的加载文案会替换为正文。 [抽屉选择](../../plugins/automations/src/ui/RunsPanel.tsx#L49) · [结果匹配](../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L235) · [正文与键](../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L281) · [查询刷新](../../packages/workbench/src/engine-client/query.ts#L27)
- `@huhu/editor/reading` 同步呈现通过普通段落判定的文本。React 文本节点和剪贴板的 `textContent` 保留转义，选区复制沿用已有序列化并在卸载时清理监听。链接、代码、表格和 HTML 等走原只读富文本组件，传递同一引用索引，异步读取时有独立状态。没有看到内容安全或记录选择路径的回退。实际浏览器选区及窄窗未重测。 [阅读封装](../../plugins/tasks/src/ui/compact.tsx#L18) · [段落判定](../../packages/editor/src/reading/paragraphs.ts#L1) · [选区与转义](../../packages/editor/src/reading/index.tsx#L8) · [原富文本阅读器](../../packages/editor/src/rich/compact.tsx#L64)
- **低 · 正文加载提示尚未覆盖完整的查询状态。** 首次从自动化打开已投递运行时，若 `tasks.read` 还没有缓存，`ManagedRun` 跳过整个 `TaskRunDetails`，请求结束前只有运行状态和打开原任务入口。已有 DTO 且还没评论时，新提示可见；若外部编辑删去对应评论、最新 DTO 已读取但持久回执仍为 `delivered`，同一提示会一直称「正在读取」，因为条件只看评论数组且 replay 跳过已投递记录。建议在调用端给首次查询显示反馈，并用现有查询状态区分刷新中与读取完成但正文缺失。条件和结果来自源码，未跑浏览器复现。 [抽屉查询与挂载](../../plugins/automations/src/ui/RunsPanel.tsx#L84) · [新提示条件](../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L242) · [从 Markdown 读取评论](../../plugins/tasks/src/engine/service.ts#L85) · [重放筛选](../../plugins/tasks/src/engine/receipt-inbox.ts#L209)

## 夹具复核与验证

- 权限夹具仍发出真实认证 GET，仅改写对应成功能力目录响应的 `json()`，并检查原始与交付条目。任务卡验证写入口原先可用、过滤后禁用、尝试点击零写请求且原任务仍可读取。Agent 卡验证单卡降级。Agent 设置用隔离 Vault 停用启动探测，再核实手动刷新前零次、两次刷新各出一次对应版本。Lead t17d 以原 `4a54f0a9` 应用搭配这些新夹具，3 项通过（19.4 秒）。运行结果正文用例在 `shell.spec.ts`，此次夹具日志未执行它。 [权限夹具](../../tests/e2e/workflows/acceptance.spec.ts#L31) · [任务卡](../../tests/e2e/workflows/acceptance.spec.ts#L154) · [Agent 卡](../../tests/e2e/workflows/acceptance.spec.ts#L314) · [设置夹具](../../tests/e2e/workflows/acceptance.spec.ts#L1541) · [夹具日志](ui-fixture-diagnostic-4a54f0a9.log) · [结果 E2E](../../tests/e2e/shell.spec.ts#L2705)
- 本会话定向 `git diff --check` 通过。`pnpm exec vitest run packages/editor/test/reading-parity.test.ts` 3/3 通过（2.07 秒），覆盖 1,200 组普通段落与原解析器的结构一致性、复杂文档回退判定及部分选区的纯文本序列化。另核对 Lead t17f 的 Engine 日志，延后唤醒两条回归 2/2 通过（38 过滤，5.38 秒）。 [阅读测试](../../packages/editor/test/reading-parity.test.ts) · [Engine 日志](task-receipt-defer-check.log)

## 未运行的验证

本会话未重跑 Engine 回环用例或 E2E，未构建、打包或运行全仓门禁。当前组合的结果正文 E2E、加载反馈及浏览器剪贴板交互没有本轮实测。仅写入本报告。

### Modern Web Guidance

本轮沿用 Lead 已检索并获取的 `js` 指南。我核对了夹具保留原生认证 fetch 和 AbortSignal，以及正文按文本节点渲染并使用现有富文本回退。
