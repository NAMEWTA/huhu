# t17c task05 · 查询洪流合并独审

普通数据查询的串行合并成立。**在途权限查询的即时刷新仍需修正后再验收。** 单纯中止事件作用域的 Promise 行为也有缺口，当前生产调用链未见因此阻塞退出。终端真实输入断言低项已关闭。

复核基线为 `5aeac32ee00e0f3d5cfd2faf4e27f1840762865c` 的未提交版本。审查 blob 为 `query.ts=a7f1fc08dd10e0ae933c0f8263255e99368a4f96`、`react.tsx=7ae6b708d8dc38f3f818ade3ea64fba13e0a57ae`、`engine-client.test.ts=f61d2671a324f9c67866820eb4fb643859a02292`、`perf.spec.ts=096a407aab1d64fa6ff3f407cb6549f0d54229c1`。 [返工说明](t178-report03.md)

## 发现

**中 · 权限和插件状态撤销等待旧查询结算。** 当前两个事件走普通合并，在同键已有缓存和在途请求时，保留旧请求及其响应，等它完成才重新查询。用当前实现和锁定的 TanStack Query 5.107.1 受控复现，四个真实查询键结果一致。原 `invalidateQueries` 在事件到达时已发出第 2 个请求并中止第 1 个。当前实现此时只有第 1 个且信号未中止。放行第 1 个可先观察到旧缓存写入，之后才有第 2 个。首页确实使用 `plugins.list` 与 `capabilities.discovered` 判断插件卡片能否出现和操作。网关使用 `gateway.get` 与 `capabilities.list` 展示工具策略，保存动作本窗口另有即时刷新，互通窗口仍走被延后的事件路径。Engine 自身仍按当前插件与策略授权新调用。 [事件分流](../../packages/workbench/src/engine-client/query.ts#L85) · [首页门控](../../packages/workbench/src/home/HomeModule.tsx#L27) · [网关读数](../../packages/workbench/src/gateway/GatewayModule.tsx#L50) · [网关本地保存](../../packages/workbench/src/gateway/ToolPolicyCatalog.tsx#L111) · [Engine 授权](../../packages/kernel/src/dispatcher.ts#L277)

- `entity.changed` 且 `kind=tool-access` 时，`gateway.get` 与 `capabilities.list` 应保持事件到达时立即取消旧刷新并重查。
- `plugin.stateChanged` 时，插件状态与能力目录应保持同样语义，至少包括 `plugins.list`、`capabilities.discovered`、`capabilities.list`。保留既有 `plugins.*` 和 `capabilities.*` 的事件作用范围。
- 同一事件派生的 `home.*`、`health.*` 汇总以及文件、目录、任务等一般业务数据继续合并。Safe 锁定保留同步移除当前 Vault 敏感缓存和原状态刷新。Safe 界面本身也仍直接消费锁定事件。已核对从中止作用域收到锁定时，缓存移除仍生效。 [Safe 清缓存](../../packages/workbench/src/engine-client/query.ts#L77) · [锁屏订阅](../../plugins/safe/src/ui/SafeModule.tsx#L63)

**低 · 单独中止刷新作用域只结算尚未启动的补刷。** 受控探针分别阻塞第一轮和已经启动的后继轮，调用 `scope.abort()` 后两种情况下返回 Promise 仍未结算，HTTP 查询信号也未中止。显式调用 `cancelQueries` 后两者正常结算。生产 `EngineProvider` 对事件刷新使用 `void`，`engine.closing` 还显式取消当前 Vault 查询，故这项缺口属于调用方取消语义和组件清理范围。只因 effect 换代而清理作用域、仍有观察者时，已启动请求可继续，等待该 Promise 的调用方要等请求自身结算。最后一个观察者卸载会经 TanStack 中止已消耗的请求信号。 [后继结算](../../packages/workbench/src/engine-client/query.ts#L30) · [当前请求等待](../../packages/workbench/src/engine-client/query.ts#L52) · [生产关闭与清理](../../packages/workbench/src/engine-client/react.tsx#L55) · [HTTP 信号传递](../../packages/workbench/src/engine-client/client.ts#L53)

## 有效覆盖

- 本会话独立执行 `pnpm exec vitest run packages/workbench/test/engine-client.test.ts`，24/24 通过，1.97 秒。1,000 事件用真实 QueryClient/QueryObserver 和可控响应，首个请求在途时保持一次，随后补刷一次并读到版本 1,000。单文件覆盖冷读、停用保留失效、移除和同键重建、错误或主动取消、补刷在途再到件、不同查询输入与 Vault，以及 Safe 同步清理。安装版本中，查询处理器先订阅 retryer Promise，结算时先更新查询状态。补刷再标记失效，可应对成功或取消回滚覆盖失效位。实际缓存条目身份检查防止旧补刷刷新同键替身。额外探针确认初始离线暂停的刷新调用能结算。 [主回归](../../packages/workbench/test/engine-client.test.ts#L126) · [错误与取消](../../packages/workbench/test/engine-client.test.ts#L225) · [查询与 Vault 隔离](../../packages/workbench/test/engine-client.test.ts#L253)
- 现有「退出」测试手工组合中止作用域与 `cancelQueries`，「卸载」只停止 QueryObserver。EventStream 测试独立注入假 WebSocket，验证 lastSeq/epoch 和 resync 回调。它没有挂载真实 `EngineProvider`，也没有走 `engine.closing → onState(connected)` 的同端点恢复，或观察真实 HTTP 中止。上述生产入口是源码推断。应以候选应用上的一轮关闭与同端点重连验证补足。插件测试只断言缓存失效位，本轮权限复现覆盖的是受控旧请求，未运行实际两窗口撤销。 [组合与卸载测试](../../packages/workbench/test/engine-client.test.ts#L289) · [事件流测试](../../packages/workbench/test/engine-client.test.ts#L78) · [插件失效测试](../../packages/workbench/test/engine-client.test.ts#L378)
- 旧 `4a54f0a9` 桌面日志复算得到 1,000 个文件事件与 1,002 个 `tasks.list` 发送，约在 `before-quit` 后 3.003 秒出现「无法确认退出前的保存结果」。这是旧构建请求洪流和退出表现的观测。新代码的两请求结果来自受控测试，本轮没有候选桌面请求数、滚动或退出结果。 [旧构建请求摘要](task-scroll-diagnostic-4a54f0a9.log#L111) · [退出确认](task-scroll-diagnostic-4a54f0a9.log#L130)

## 终端采样低项

逐字取当前 `during.every` 断言，应用到上轮通过的原始逐键附件，1,311/1,311 满足，所有窗内 Backspace 的起始长度均大于零。额外检查无 `inputAt` 和长度未变的两个反例均被拒绝。只新增实际编辑断言，20 秒窗、尾标、最少样本及 p95 判定沿用。按任务约定沿用原 `4a54f0a9` 基线运行记录，没有重跑 E2E。 [断言](../../tests/e2e/perf.spec.ts#L411) · [原始采样核对](t17c-report04.md)

本会话仅写入本报告，定向 diff 空白检查通过。未运行 Electron、Playwright、构建、打包或全仓检查。

### Modern Web Guidance

沿用本批已检索获取的 `js` 指南，复核时检查了现有 AbortSignal 从观察者到 HTTP 的传递及作用域终止。
