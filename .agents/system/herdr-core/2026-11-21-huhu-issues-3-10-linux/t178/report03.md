# t178 / task03 合并事件触发的查询刷新

Lead t3p，工作树 integration。源码修复和单文件测试已完成，真实桌面复测待 Lead 执行。

## 修复依据

旧候选 `4a54f0a9` 的千行桌面诊断在关闭前记录了 1,000 个 `vault.fileChanged` 和 1,002 次 `tasks.list` 发送。滚动最大帧间隔 133 ms，有 2 次超过 66 ms。退出时 `home.focus.get` 发出后仍有多次 `tasks.list` 完成，main 在 flushing 后约 3 秒打开“无法确认退出前的保存结果”。[旧候选实测日志](task-scroll-diagnostic-4a54f0a9.log)

## 源码行为

- [query.ts](../../packages/workbench/src/engine-client/query.ts) 用 TanStack 的失效标记、在途 Promise 和活动查询刷新。每个实际查询缓存条目最多排一轮后继刷新，前一轮结算后再执行。结算时重新核对缓存条目和活动状态，已停用的观察者保留失效标记，旧条目的补刷不会刷新同键新条目。没有按事件设定延时。[TanStack QueryClient](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient)
- [react.tsx](../../packages/workbench/src/engine-client/react.tsx) 仍逐条交付领域事件。事件流收到 `engine.closing` 时取消该 Vault 的在途查询并放弃待补刷项，关闭事件流时清理待补刷项。同一端点重新连通则重建作用域并补做一次 Vault 刷新。能力查询把 TanStack 的取消信号传给现有 HTTP 客户端，最后一个观察者卸载时可中止请求。保险箱锁定在检查刷新作用域前立即清除敏感查询。[TanStack Query Cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)

## 执行验证

- 红灯 `pnpm exec vitest run packages/workbench/test/engine-client.test.ts -t '1,000 个文件事件'`。第一个响应还在挂起时，旧实现已调用查询 1,000 次，断言期望 1 次。
- 绿灯 `pnpm exec vitest run packages/workbench/test/engine-client.test.ts`，24 项通过。相同洪流总计 2 次请求，最终数据为第 1,000 个版本。覆盖冷加载、停用后重启观察者、同键缓存重建、错误与主动取消后的补刷、补刷在途时的更新、不同 Vault 和查询键、退出与卸载取消，以及保险箱立即清缓存。测试使用真实 QueryClient 和 QueryObserver，以受控 Promise 模拟 Engine 响应。
- 三个改动文件的定向 oxfmt 与 `git diff --check` 通过。

## 真实 UI 与未运行项

Lead 此前的终端洪流实测为 1,311 个样本、p95 32.4 ms，属于前序终端采样验证。此次修改后的千行滚动、退出耗时和同端点重连由 Lead 实测。worker 未运行 Electron／Playwright E2E、其他 Vitest 文件、全仓类型检查、构建或打包。
