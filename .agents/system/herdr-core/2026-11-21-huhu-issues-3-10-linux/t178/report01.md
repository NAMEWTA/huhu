# t178 / task01 性能诊断交接

Lead t3p，worker t178，integration HEAD `4a54f0a9`。诊断代码已写好，待 Lead 串行实测。改动在 [perf.spec.ts](../../tests/e2e/perf.spec.ts) 和 [perf-diagnostics.ts](../../tests/e2e/helpers/perf-diagnostics.ts)。

## 先跑千行任务退出

沿用 `run-followup-source.sh` 的隔离环境和重型任务锁。在隔离环境内执行单项。

```sh
HUHU_PERF_STRICT=1 HUHU_PERF_DIAGNOSTICS=1 pnpm exec playwright test tests/e2e/perf.spec.ts:188 --workers=1 --retries=0 --output=/tmp/t178-task-scroll
```

- `[huhu-task-quit]` 从 Electron 主进程 stderr 转发。看第一轮 `before-quit` 后有没有 `huhu:exit-progress`，是否收到同 requestId 的 `huhu:flushed`，原生 `dialog-shown` 是否有真实返回。若退出已放行，再看 `engine.closing`、端点描述清理、Engine PID 消失、`will-quit` 和 Electron 子进程退出。对话框仍由 Electron 处理，探针返回原 Promise。
- `[perf-diagnostics]` 在关闭前输出分阶段计数摘要，关闭期间逐条输出关注的请求状态。JSON 附件包含写入起止、首行可见、滚动起止与实测 scrollTop，以及 `tasks.list`、`home.focus.get` 等请求。在原事件连接旁路收集 `vault.fileChanged` 和 `engine.closing` 类型与到达时间。记录字段只取时间、允许的事件或能力名、requestId、状态和必要的 PID／滚动数据。
- `engine.closing` 表示 Engine 已进入 shutdown，PID 消失从系统观察，100 ms 采样并在退出回调补一次检查。WebSocket 事件缺失时，仅凭缺失无法判断 Engine 是否收到 shutdown。请求计数取浏览器已发送和完成的 HTTP 请求，尚无法推算 Engine 扫描次数。
- 第一轮可以只开诊断。需要 renderer CPU 时再加 `HUHU_PERF_PROFILE=1`，生成独立 `task-scroll-renderer.cpuprofile` 附件。正式计时关闭两个诊断开关。千行写完后仍在首行可见时开始原有滚动流程，保留 120 ms 正对照和 91 个滚动帧间隔。

## 再跑满速终端洪流

```sh
HUHU_PERF_STRICT=1 pnpm exec playwright test tests/e2e/perf.spec.ts:284 --workers=1 --retries=0 --output=/tmp/t178-terminal-flood
```

终端 shell 先等待临时文件信号。驱动聚焦真实搜索输入框并核对 `activeElement` 后释放信号，随后逐次等待 `page.keyboard.press`，交替按 a 和 Backspace。生产者沿用原始满速 10 MiB 管道。页内在实际输出开始后收可信 keydown，看到完整尾标只发一次停止信号，窗内已收按键全部等双帧回调。驱动保留一次运行至少 10 个窗内样本和严格 p95 ≤ 100 ms。日志和 `terminal-flood-keys.json` 含释放、焦点、首段输出、尾标和停止信号时间、窗前／窗内／窗后样本数及窗口三等分分布。原管道的尾标字节数来自 `wc -c`，这个值仍量的是 tee 的管道副本。

编辑器分段数组为空时输出“未采到（n=0）”，实际编辑输入 p95 仍按原探针计算。

## 验证

- 通过两个改动文件的 Node 语法检查、定向 oxfmt 检查和 `git diff --check`。
- 未运行 Playwright E2E、Vitest、类型检查、构建或打包。没有可对应的单个 Vitest 文件。窗口覆盖、p95、关闭日志与 CDP 附件等待 Lead 实测。
- 使用缓存的 `modern-web-guidance` 对输入延迟和 DOM 观察执行 search 与 retrieve。沿用页内高精度时间和双 rAF，移除逐键跨进程轮询。将会影响时序的 CPU profile 放入单独的一轮。
