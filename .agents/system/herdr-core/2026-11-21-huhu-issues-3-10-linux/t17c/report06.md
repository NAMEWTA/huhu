# t17c task06 · 查询合并与终端夹具返工复核

查询侧上一轮两项发现可以关闭。终端清理的目标限定在本次隔离 Core，测量口径沿用原样。发现一项清理时限缺口，终端夹具在测试总超时附近仍可能留下 Core 或缺失清理附件。

范围为 integration 的 `5fefa5077eb24f5bbf7a5cf667ac071b0a8d4938` 到未提交 diff。复核 blob 为 `query.ts=3820ef3282407cbf8057e5c07d045ca3cc5717b6`、`react.tsx=7ae6b708d8dc38f3f818ade3ea64fba13e0a57ae`、`engine-client.test.ts=a3044d3ef1d460caaf23db2bcc5ab747eed3269b`、`perf.spec.ts=50e13a7a5f19a0c57123640dcfcc1850b2307ca7`。 [前轮审查](t17c-report05.md) · [查询返工](t178-report04.md) · [夹具返工](t176-report06.md)

## 发现

**中 · 挂起或较慢的用例可耗尽 Core 清理和留证共用的测试时限。** 终端用例仍使用 Playwright 默认 60 秒，且 `withFixtureCleanup` 在测试函数内部先等待 `run()`。接近总时限才结束测量或抛错时，Electron 关闭可占 12 秒，Core RPC 和退出轮询再各占最多 8 秒。若测试体先达到总超时，Playwright 会进入独立的 After Hooks 阶段，当前清理没有注册到该阶段。即使清理已开始，等待余量也可能不足以发出 `server.stop` 或完成清理附件。正常抛错时 helper 逐步尝试清理并保留原异常，以上缺口只指全局超时或清理跨越该时限。建议用独立的挂载夹具/After Hooks 时限执行清理，或明确为测量和清理预留各自时限，保留 20 秒测量窗。该结论来自配置与已安装 runner 源码，未做真实超时或进程注入。 [终端用例](../../tests/e2e/perf.spec.ts#L331) · [测试配置](../../playwright.config.ts#L3) · [Core 时限](../../tests/e2e/perf.spec.ts#L306) · [测试体内清理](../../tests/e2e/perf.spec.ts#L473) · [清理 helper](../../tests/e2e/helpers/candidate-desktop.ts#L29)

## 查询修复已核对

- 工具策略事件的 `gateway.get`、`capabilities.list` 与插件事件的 `plugins.*`、`capabilities.*` 恢复走立即失效。有缓存的旧请求同步获得取消信号，替代请求已启动才放行旧夹具。新测试覆盖上述两个真实事件与五个查询键组合，并同时验证 `home.summary`、`health.run` 的在途查询继续合并。冷读沿用原 TanStack 行为。Safe 锁定仍同步清理当前 Vault 敏感缓存。 [事件分流](../../packages/workbench/src/engine-client/query.ts#L93) · [权限与汇总测试](../../packages/workbench/test/engine-client.test.ts#L126)
- 首轮和后继轮均以独立等待 Promise 对作用域中止回应。单独中止只结束等待，查询的 HTTP 信号与观察者继续有效。待补刷记录合并所有提出请求的作用域，重入时只考虑仍有效的作用域，并检查缓存对象身份。两个作用域的用例已验证其中一个中止后仍完成另一方的末次刷新。千事件仍只发两次并读到版本 1,000。 [等待结算和补刷](../../packages/workbench/src/engine-client/query.ts#L27) · [首轮与后继轮测试](../../packages/workbench/test/engine-client.test.ts#L168) · [独立作用域和千事件测试](../../packages/workbench/test/engine-client.test.ts#L202)
- `EngineProvider` 收到 `engine.closing` 仍另行取消 Vault 查询，重连 `connected` 会重新建作用域并刷新。同端点恢复仍只有源码证据。现有测试分别驱动 QueryObserver 和带假 WebSocket 的 EventStream，实际 Provider 挂载、事件到 HTTP 中止链、两窗口撤销与新候选千行退出尚无本轮 E2E 结果。 [Provider 生命周期](../../packages/workbench/src/engine-client/react.tsx#L55) · [EventStream 测试](../../packages/workbench/test/engine-client.test.ts#L78)

## 终端夹具核对

- 短路径 `mkdtemp` 为本次创建 Vault 与私有 runtime。桌面只给这次 Electron 设置 `XDG_RUNTIME_DIR`，Engine 继承该变量。Agent Core 按 Vault 和机器 ID 生成原 socket basename。停止步骤明确把 basename 放回本次专用目录，核对文件确为当前用户的 socket，Linux 再核对 Core 可执行文件。唯一改变 Core 状态的操作是该连接的 `server.stop`。其余 PID 检查只测存活，未发现跨实例停止路径。 [夹具启动](../../tests/e2e/perf.spec.ts#L292) · [Engine 环境继承](../../apps/desktop/src/main/engine-supervisor.ts#L133) · [Core endpoint](../../packages/herdr-client/src/herdr-core.ts#L34)
- 在当前测试函数获得足够剩余时间、`run()` 正常返回或抛错时，先尝试关闭 Electron，再停止本次 Core。要求停止回执、状态记录的 Core/holder PID 与对应 socket 都消失。清理失败仍尝试后续步骤，未同时确认关闭和停止时保留目录，并以附件记录失败阶段。测量附件在阈值断言前写入，排出的日志与失败 trace 可独立留存。20 秒窗、10 MiB 尾标、可信键入与值变化、≥10 样本及 p95 ≤100 ms 条件保留。 [停止与核对](../../tests/e2e/perf.spec.ts#L300) · [测量证据及判定](../../tests/e2e/perf.spec.ts#L455) · [失败留证](../../tests/e2e/helpers/candidate-desktop.ts#L29)

本会话独立运行 `pnpm exec vitest run packages/workbench/test/engine-client.test.ts`，29/29 通过（2.52 秒），定向 `git diff --check` 通过。未运行 E2E、构建或全仓验证。实际 Core/holder 停止及失败后的目录和附件须由 Lead 在候选 E2E 验证。仅写入本报告。

### Modern Web Guidance

沿用本批检索与获取的 `js` 指南，核对作用域等待与 HTTP 请求各自的 AbortSignal。
