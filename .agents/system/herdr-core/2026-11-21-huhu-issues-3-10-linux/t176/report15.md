# t176/task15 · XTEST 页面 WebSocket 接收取证

Lead `t3p`，worker `t176`，integration。临时 XTEST 夹具已就绪。t18n 发出与实收均为 1,461 键，最后一次回放结束约在 gate 后 10.008 秒，DOM 尾标在 +10.510 秒。样本密度与原参考接近，支持继续检查共同的页面收包、服务端写入和 Playwright 观测路径。 [t18n 运行日志](native-keys-recheck.log#L112) · [t18n 结果](native-10000-9350f32bbe014243e4c81546b0ac1aa5afa9e226.VZJgeg/result.json)

## Lead 串行执行

沿用已构建的 `9350f32bbe014243e4c81546b0ac1aa5afa9e226`。从 integration 根目录先跑双观测，再按需跑页面观测对照。

```bash
bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
PAGE_RECEIVE_ONLY=1 bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
```

runner 通过 `env -i` 显式透传开关，每次使用独立的 `mktemp` 证据目录，名称分别带 `both` 或 `page-only`，记录 `run.log`、`result.json` 和运行附件。双观测同时收页面 `message` 与旧 Playwright WS 事件。页面观测模式移除本夹具的 `page.on("websocket")` 订阅，保留 bridge、DOM、Core 读取、按键和清理观测。锁定的 Playwright 1.65 仍会为页面会话发送 `Network.enable`，所以此对照只衡量移除夹具订阅的影响。 [runner](t18d-xtest/run.sh) · [Playwright 的 Network 注册](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L37750)

## 新附件字段

`terminal-flood-stages.json` 的 `pageReceive.sockets` 按当前会话保存各 terminal WS 的 renderer 真实二进制消息统计。临时构造器代理转发原参数和 `newTarget`，沿用原型与静态常量，构造后独立添加监听。只匹配 `/ws/terminal/<sessionId>`，沿用业务设置的 `binaryType`，业务监听和消息原样运行。 [页面探针](t18d-xtest/page-receive.ts#L20)

- `firstAt` 为首个二进制 `message` 时刻，可能早于 gate。 `firstFloodAt` 需要匹配两行连续生产者内容，可区分提前的命令回显。 `tailAt` 为完整尾标的到达时刻。首段和尾标均支持跨消息匹配。
- `seconds` 按 renderer 的绝对时间向下取整到秒统计消息数和字节数，附带 `releasedAt`、`deadline` 以对齐 bridge 和 Playwright。这些秒桶包含可能的放行前输出，跨截止边界的秒桶无法给出精确截止字节数。 `blobFrames` 标出未按当前产品配置送为 ArrayBuffer 的消息，计其大小，跳过标记匹配。
- 只在内存暂存有限长度的二进制后缀，不逐帧跨 IPC。结束时复用原页面快照调用一次取出聚合，解除诊断监听并恢复原构造器。 `playwrightWebSocketObserved` 标注两种模式。原 10 MiB、XTEST 回放节奏、20 秒尾标判据及所有断言保留。 [快照与附件](t18d-xtest/native.spec.ts#L367)

## t18n 清理失败单列

t18n 的测试本体达到尾标与延迟判据，夹具随后将整例标记失败。原附件为 `desktopClosed:false`、`coreStopped:true`、`directoryRemoved:false`，汇总将失败定位到 Electron 关闭步骤。Lead 已确认 Electron 进程退出，既有结果没有保留底层关闭错误供进一步归因。临时夹具现在另记 `desktopCloseResult` 及 Electron 子进程退出码、退出信号，可区分关闭调用被拒绝、仍待结算及已成功返回。原异常仍传播，目录仍要求 desktop 和 Core 关停均确认后才删除。 [t18n 清理附件](native-10000-9350f32bbe014243e4c81546b0ac1aa5afa9e226.VZJgeg/terminal-flood-cleanup.json) · [临时清理代码](t18d-xtest/native.spec.ts#L120)

## 实际验证与未运行项

以下定向类型和语法检查通过。未启动 Electron、Xvfb、XTEST、Core、E2E 或构建。页面接收及两种模式的运行时结果由 Lead 上述实跑取得。

```sh
PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule temp/final-audit/t18d-xtest/native.spec.ts temp/final-audit/t18d-xtest/native.config.ts apps/desktop/src/renderer/env.d.ts
bash -n temp/final-audit/t18d-xtest/run.sh
```

### Modern Web Guidance

- **`js`** 我按 “use `new TextEncoder().encode(str)`” 在安装时编码标记，逐消息直接比较二进制视图。 [指南原文](/tmp/mwg-guide-15-1795387274215.md#L297)
- **`performance`** 我按 “Yield to the main thread frequently” 的目的限制探针工作量。每条消息只更新计数和有限后缀，窗口结束一次读取，不排入逐帧 IPC 工作。 [指南原文](/tmp/mwg-guide-15-1795387274215.md#L483)
