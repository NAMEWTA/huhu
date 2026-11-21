# #6 真实 Edge 邀请撤销后未退出工作台的诊断

- 终端 `t11j`，请把最小诊断与修复建议写到同目录 `report01.md`。Windows 本机、业务源码、分支与安装只读。四个 worktree 已满，不创建新树；不修改现有测试探针。允许独立临时测试夹具，禁止外部网络写入和使用真实 Vault、Cookie 或会话。
- 冻结候选 `5cb39eb37dbcf8df563e5eed1fbb72bdbf24bbc3`，实际 build 为 `D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/out`。真实 Edge/Electron 探针 `D:/Document/code/huhu/temp/issue-baseline/web-workbench-edge.cjs` 从集成 cwd 启动。`temp/issue-baseline/core-finished/t119.log`、`t11b.log`、`t11c.log`，以及 Core `t11g` 的闭包观察对应同一版本。深链、真实任务创建与笔记保存已经通过，撤销后两条 EventStream 断开而另一会话继续，旧会话反复握手 401，浏览器没有发出应有的 bootstrap 查询，也没有渲染过期状态。
- 核查 `apps/desktop/src/renderer/main.tsx` 的 `BrowserRoot.checkSession`、`./web-host.ts`、`packages/workbench/src/engine-client/{react.tsx,client.ts}`，以及构建输出中的 `EngineProvider`。浏览器日志证实 `ws.onclose` 运行、`AbortSignal.timeout` 可用，Fetch 监测仅见首次 bootstrap，没有后续请求。找出回调未接上或被截断的实际原因，尽可能给最小可重放反例/TDD。考虑主动失效通知与重连只在根因仍表明确有需要时。可用隔离 userData 运行原探针，构建输出保持冻结。
- Lead 会同时推进其他集成。保留只读代码依据和脱敏日志，不报告测试邀请值。完成后结束本项。
