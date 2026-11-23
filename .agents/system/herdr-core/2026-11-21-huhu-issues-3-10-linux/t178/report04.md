# t178 / task04 权限即时刷新与作用域等待

Lead t3p，integration。已按 [t17c 独审](t17c-report05.md) 修复两个边界。

- `tool-access` 的 `gateway.get`／`capabilities.list` 和 `plugin.stateChanged` 的 `plugins.*`／`capabilities.*` 走原 TanStack 即时失效与刷新。有缓存的在途读取会立即中止并重查。冷读取沿用 TanStack 原有行为。两个事件派生的 `home.*`／`health.*` 继续合并。Safe 锁定仍同步移除敏感查询。[query.ts](../../packages/workbench/src/engine-client/query.ts)
- 中止作用域后，即使首轮或后继轮的请求仍在途，该作用域的等待也会及时结算，已中止的作用域不再要求补刷。共享查询继续运行，其他尚有效的作用域仍可要求一轮补刷。`engine.closing` 的显式取消、同端点重新连接时恢复刷新，以及最后一个观察者卸载时向请求传递取消信号，沿用现有入口。[react.tsx](../../packages/workbench/src/engine-client/react.tsx)

## 验证

- 红灯使用单个 Vitest 文件筛选五项新用例。旧实现的两个权限事件都只启动旧请求，首轮和后继轮的中止等待均超时，独立作用域的补刷也被提前丢弃。
- 绿灯 `pnpm exec vitest run packages/workbench/test/engine-client.test.ts`，29 项通过。真实 QueryClient／QueryObserver 的受控测试确认旧权限请求收到取消信号，替代请求立即启动，派生请求保留合并。两种作用域中止都在释放受控响应前结算，共享查询的信号保持活动，另一个作用域可得到最新数据。千事件仍只产生两次请求。[engine-client.test.ts](../../packages/workbench/test/engine-client.test.ts)
- 两个改动文件的定向 oxfmt 与 `git diff --check` 通过。

## 未运行项

当前 workbench 测试包没有可直接复用的 React DOM 挂载依赖，遵照任务约定将实际 EngineProvider 同端点重连留给 Lead。已复核源代码中的 `engine.closing → connected` 恢复分支，单文件测试的 QueryObserver 和 EventStream 分别运行。真实桌面重连、两窗口权限撤销、千行滚动与退出仍待 Lead 验证。本轮未运行 E2E、其他 Vitest 文件、全仓类型检查、构建或打包。

Lead验收：t17c/task06关闭权限与scope发现；29项单测、t17t类型及格式通过。提交a97ece84，t17v远端feature回读相同。新构建行为待验，不代签整批。
