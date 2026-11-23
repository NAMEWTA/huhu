# t176/task04 · 运行结果加载反馈

Lead 为 `t3p`。integration 本轮处理 [t17c 复核报告](t17c-report02.md) 的结果阅读低项，改动在两个 UI 文件。

- 自动化抽屉首次打开、`tasks.read` 尚无缓存时，显示「正在读取原任务…」。查询失败继续显示原错误。当查询已有数据时，向共用结果区传递该查询的刷新状态。见 `plugins/automations/src/ui/RunsPanel.tsx:84–108`。
- 任务详情从 `TasksModule` 的 `tasks.list({ category: "all" })` 接收当前任务。派遣面板以同一查询键的禁用观察者读取 `isFetching`，观察现有请求的状态而不发起新请求。见 `plugins/tasks/src/ui/TaskDispatchPanel.tsx:64–68,187`。
- 已投递且暂缺对应评论时，查询刷新中显示「正在读取任务时间线中的运行结果…」，刷新完成仍无匹配时显示「未在原任务时间线中找到本次运行的结果正文。」正文继续按原 `runId` 及 `result/failed` 事件匹配，匹配时使用现有 Markdown 阅读器。见 `TaskDispatchPanel.tsx:258–266,294–299`。

## 验证

两个文件定向 `tsc --noEmit`、`oxfmt --check`、`oxlint -c oxlint.json` 与 `git diff --check` 均通过。TypeScript 检查由工作树根目录运行，使用 Node 24.21.0。

```sh
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec tsc \
  --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride \
  --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable \
  --types node --jsx react-jsx --esModuleInterop --resolveJsonModule \
  plugins/automations/src/ui/RunsPanel.tsx plugins/tasks/src/ui/TaskDispatchPanel.tsx
```

## 未运行的验证

本轮未运行 Vitest、Electron/Playwright E2E、构建、打包或全仓门禁。冷查询、后台刷新、查询成功但缺少匹配评论及后续恢复正文的实际浏览器表现，仍待候选构建验证。

## Modern Web Guidance

沿用 Lead 已完成的 search 和 retrieve 结果，复用此前完整读取的 `js` 指南。此次修正直接使用已有查询状态和状态反馈。
