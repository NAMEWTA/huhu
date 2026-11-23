# t176/task06 · 终端性能夹具 Core 清理

Lead 为 `t3p`。integration 基线为 `5fefa5077eb24f5bbf7a5cf667ac071b0a8d4938`。本轮只修改 `tests/e2e/perf.spec.ts` 的终端吞吐用例。

## 证据与改动

- 旧夹具在 `app.close()` 后直接删除 Vault。Agent 插件退出时关闭自己的连接，独立 Core 仍可保留会话。上次同一负载得到 1,311 个窗内样本和 p95 32.4 ms，随后外层 runner 仍报清理未完成。见 [采样和清理日志](terminal-flood-window-check-4a54f0a9.log) 与 [首次诊断](terminal-flood-diagnostic-4a54f0a9.log)。
- 新夹具在短路径的独立测试目录创建 Vault 和私有 runtime，只给本次 Electron 指定 `XDG_RUNTIME_DIR`。退出后读取该 Vault 的 ID，利用现有 `HerdrCore.endpoint` 推导 socket 名，再限定到本次专用 runtime。已打开终端但找不到其 socket 时报告无法确认，保留现场。见 `tests/e2e/perf.spec.ts:292–351`。
- 停止步骤沿用 shell 自动化夹具的直连 RPC。检查 socket 类型和 UID，通过 `server.status` 记录当前 Core 与 holder PID，Linux 额外核对 Core 可执行文件。收到 `server.stop` 的 `stopped: true` 之后，复用现有进程存活探针等待这些 PID 和对应 socket 退出。见 `perf.spec.ts:300–330`。
- 复用候选桌面夹具的 `withFixtureCleanup` 和 `withFixtureDeadline`。即使测量或关闭 Electron 失败，也会尝试停止本次 Core。任一步骤失败时报告清理阶段和夹具目录，保留 Vault 和 runtime。测量本体先结束，清理步骤随后执行。见 `perf.spec.ts:467–496`。

## 验证

`perf.spec.ts` 和 renderer 环境声明通过定向 `tsc --noEmit`。该 spec 的 `oxfmt --check`、`oxlint -c oxlint.json` 和 `git diff --check` 通过。旧残留进程未被本会话操作。

## 未运行的验证

本轮未运行 Vitest、Electron/Playwright、构建、打包或全仓检查。新夹具收到真实停止回执、Core 与 holder 退出，以及成功或失败时目录的清理结果，均待 Lead 在隔离环境中复验。
