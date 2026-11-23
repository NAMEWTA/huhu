# t17c task07 · 终端夹具超时清理复审

上一轮清理与测试本体共用时限的问题已修正。夹具使用独立的 45 秒预算。测试本体在超时后仍可能安排新的浏览器与终端动作，取消路径还有一项待修。

复核范围为 `a97ece844bfdbc132b2d17a83bfb127610ffdeb4` 到工作树的 `tests/e2e/perf.spec.ts`，审查 blob 为 `b356e2afd61f7a8f12ab061166a4ab2ea1bb1cd6`。 [上轮发现](t17c-report06.md) · [本轮返工](t178-report05.md) · [Core 清理依据](t176-report06.md)

## 发现

**中 · teardown 已中止信号时，原测试体仍能安排新的浏览器或 PTY 动作。** 项目安装的 Playwright 1.65.0 用 `Promise.race` 结束测试体的等待。已启动的测试函数仍可能在其 `await` 结束后继续。夹具 teardown 先 abort，再等待及关闭 Electron，而测试在若干后续动作前没有检查信号。

- 若超时发生在等待 `engine-state` 时，该等待随后成功会直接点击 Agent CLI，下一次信号检查在点击之后。若超时发生在等待 Core 状态或搜索框可见时，等待恢复后会继续注册页面绑定、聚焦 PTY、输入命令并按 Enter。此时可能在 Electron 关闭过程中启动等待门闩的 shell 命令。放行文件与每次采样按键前已有检查，因此该路径无法在 abort 后新放行 10 MiB 负载。 [页面启动](../../tests/e2e/perf.spec.ts#L418) · [发出终端命令](../../tests/e2e/perf.spec.ts#L443) · [门闩与输入](../../tests/e2e/perf.spec.ts#L500)
- 末次按键或双帧等待跨过超时时，测试还可能提交 `waitForFunction`、读取页面状态和写采样附件。建议在有异步前置等待的动作边界统一检查 teardown 信号，覆盖导航、终端命令和采样结算。已经发出的 Playwright 请求仍需由关闭阶段收敛。以上为源码时序，未在 Electron 中制造超时。 [双帧结算](../../tests/e2e/perf.spec.ts#L505) · [采样附件](../../tests/e2e/perf.spec.ts#L537)

## 已核对

- 新 fixture 先创建独立目录并 `await use(fixture)`，在 test-scoped teardown 中运行关闭、RPC、存活核对和留证。Playwright 1.65.0 在测试体超时后仍进入 After Hooks 并调用测试 fixture teardown。该 fixture 的自定义 slot 覆盖默认 slot，45 秒用于该夹具的 setup 与 teardown，测试体耗时不从中扣除。12 秒 Electron 关闭、8 秒 Core RPC、8 秒退出轮询和 2 秒附件均置于独立 slot 内。 [夹具注册](../../tests/e2e/perf.spec.ts#L338) · [清理步骤](../../tests/e2e/perf.spec.ts#L367) · [预算](../../tests/e2e/perf.spec.ts#L413)
- teardown 复用已发起的 Electron 启动 Promise。启动或关闭失败后仍尝试停止本次私有 runtime 中的 Core。仅在 Electron 与 Core 两段均确认完成时删除目录。新清理附件记录测试状态与各段结果，清理失败另记录失败阶段。原独立 socket、UID、Linux 可执行文件、停止回执和 Core/holder 退出核对保留。 [停止核验](../../tests/e2e/perf.spec.ts#L292) · [清理状态附件](../../tests/e2e/perf.spec.ts#L401)
- 对照基线，去除缩进差异和新增取消检查后，搜索框定位至 p95 断言的 119 行完全一致，20 秒采样窗、10 MiB 尾标、按键真实编辑、最少样本数和 p95 ≤ 100 ms 的判定保留。 [测量窗](../../tests/e2e/perf.spec.ts#L500) · [采样门槛](../../tests/e2e/perf.spec.ts#L541)

## 验证范围

本会话运行单文件 `node --check` 与定向 `git diff --check`，均通过。另核对本机 Playwright 的测试体、After Hooks 和 fixture slot 路径。旧 `4a54f0a9` 日志对应旧清理版本，能证明正常路径的单轮通过，且外层仍曾残留进程。当前 fixture 的实际本体超时、Core/holder 退出和清理附件尚无本轮 E2E 证据。未运行 E2E、构建或查询验证，唯一写入为本报告。 [旧轮日志](terminal-flood-cleanup-check-4a54f0a9.log#L108) · [旧轮清理记录](flood-cleanup-incident.md)

## Lead 实测补证

- t17x 以 5 秒总时限在键盘采样途中触发真正的 `timedOut`。trace 显示 After Hooks 内的 fixture 完成关闭、Core 停止回执、Core/holder 退出核对和清理附件。附件中 `desktopClosed`、`coreStarted`、`coreStopped`、`directoryRemoved` 均为 `true`，外层日志无清理未完成标记。[总超时 trace](flood-timeout-cleanup-artifacts/perf-终端吞吐：10-MiB-输出期间界面输入响应-p95-≤-100-ms/trace.zip)
- t17w 因 20 秒内无尾标而按原门槛失败。键入附件保留，四个清理标记同样为 `true`，外层日志无清理未完成标记。[尾标失败 trace](flood-isolated-cleanup-artifacts/perf-终端吞吐：10-MiB-输出期间界面输入响应-p95-≤-100-ms/trace.zip) · [尾标失败日志](flood-isolated-cleanup.log)
- t17x 最后一项测试体键盘动作早于 After Hooks，随后记录 `AbortError`。已验证在采样循环中撞上总超时时，取消检查会停止提交新按键。启动等待、终端命令准备和双帧结算的取消交错仍依据上述源码发现，两个 trace 均未注入这些位置。
