# t178 / task05 终端性能测试超时清理

Lead t3p，工作树 integration。已处理 [独审的清理时限缺口](t17c-report06.md)。本轮代码改动只在 [perf.spec.ts](../../tests/e2e/perf.spec.ts) 的终端吞吐用例。

- 复用仓库现有的 `test.extend`、`withFixtureCleanup` 和 `withFixtureDeadline`。终端专用夹具用 `await use` 注册 teardown，并使用独立的 45 秒夹具预算。准备阶段只创建隔离目录，Electron 启动仍在原 60 秒测试本体内。Playwright 即使将测试标为超时也进入 After Hooks 阶段执行已注册的夹具清理。[Playwright 时限说明](https://playwright.dev/docs/test-timeouts#fixture-timeout)
- teardown 先停止安排新操作，等待已发起的 Electron 启动并在 12 秒内尝试关闭。随后继续尝试隔离 Core 停止和退出核对，沿用 t176 的私有 runtime、socket 类型与 UID、Linux 可执行文件、停止回执和 Core／holder 检查。只有确认两段完成才删除本次目录。启动或关闭无法确认时保留目录。
- `terminal-flood-cleanup.json` 记录测试状态和各阶段结果，清理失败时现有 helper 另附 `fixture-cleanup-errors`。20 秒采样窗、10 MiB 完整尾标、可信输入与值变化、至少 10 个窗内样本和 p95 ≤ 100 ms 的判定继续使用原条件。

## 验证

- 对 `perf.spec.ts` 执行定向 TypeScript 语法与语义检查，加载仓库基础配置、renderer 环境声明和本机 Electron 类型，零诊断。
- 单文件 `node --check`、`oxlint`、`oxfmt --check` 和定向 `git diff --check` 通过。对照了本机 Playwright 1.65.0 的 After Hooks 和夹具时限实现。
- 未运行 Electron／Playwright E2E、Vitest、构建、打包或全仓检查。真实本体总超时后的附件与进程退出结果待 Lead 在隔离候选验证。
