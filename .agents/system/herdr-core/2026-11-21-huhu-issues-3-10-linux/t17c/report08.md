# t17c task08 · 超时取消动作边界复审

report07 的取消动作发现可以关闭。对照修改后的 `tests/e2e/perf.spec.ts`，teardown 发出中止信号后，测试体从已有的异步等待恢复时会在提交下一项动作前退出。

范围为 integration `a97ece844bfdbc132b2d17a83bfb127610ffdeb4` 上的工作树文件，复核 blob `f0abccd5efaa0d97c6186f4c9e73805f28486b6e`。本轮只核对 report07 的取消动作边界。 [原发现与前序实测](t17c-report07.md) · [返工说明](t178-report06.md)

- 启动和导航均已补齐。等待 Electron 启动、首窗口、Engine 就绪、Agent CLI 导航或终端开启动作之后，下一项页面请求前都有信号检查。终端开成后先记 `coreStarted` 供清理使用，随后检查信号再查询 Core 状态。 [启动与导航](../../tests/e2e/perf.spec.ts#L418)
- Core 状态和搜索框等待恢复后，注册绑定、聚焦 PTY、发送命令、按 Enter、搜索框聚焦和安装页内探针均有检查。写放行门闩和每一次采样按键也仍受检查。 [命令和探针](../../tests/e2e/perf.spec.ts#L432) · [门闩与按键](../../tests/e2e/perf.spec.ts#L512)
- 末次按键、双帧等待、页面样本读取、采样附件和尾标 DOM 断言间的异步交界均已补齐。样本读回至发起附件写入之间只有同步整理和日志。报告前一轮指出的三类缺口均已覆盖。此前已发出的 Playwright 操作仍由 teardown 关闭收敛。 [采样结算](../../tests/e2e/perf.spec.ts#L521) · [留证与尾标](../../tests/e2e/perf.spec.ts#L537) · [teardown](../../tests/e2e/perf.spec.ts#L372)

本轮以源码复核为证据，定向 `git diff --check` 通过，没有执行测试。此前两份 trace 已验证采样中 5 秒总超时及 20 秒尾标失败后的实际清理。新增启动、命令准备和样本结算的守卫没有本轮注入证据。唯一写入为本报告。 [前序实测记录](t17c-report07.md#lead-实测补证)
