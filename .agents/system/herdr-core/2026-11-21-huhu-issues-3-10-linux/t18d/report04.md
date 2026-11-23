# 页面收包迟到与 Chromium 输入调度对照 · t18d/task04

Lead t3p，integration。**两轮都在持续输入时收到终端数据，但页面收到完整尾标都要等到停键之后。** t18q 关闭夹具的 Playwright WebSocket 订阅后，bridge 在 +1.260 s 完成尾帧写回调，页面直到 +10.257 s 才收到尾标。这个约 9.0 s 的间隔已把该轮问题定位在服务端写完成至页面 message 交付的路径上。单靠最后一次 xterm 绘制或夹具订阅无法解释它。没有直接观察到 Chromium 内部具体哪条队列在等待。

## Lead 运行命令

两条命令在 integration 根目录串行执行。第一条为同夹具对照，第二条只向 Electron 的 Chromium 禁用列表追加 `DeferRendererTasksAfterInput`。两臂都采用 t18q 的页面接收模式、原生 10 秒 XTEST 回放、固定应用及原有阈值。

```bash
PAGE_RECEIVE_ONLY=1 HUHU_INPUT_DEFERRAL=default bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
PAGE_RECEIVE_ONLY=1 HUHU_INPUT_DEFERRAL=disabled bash temp/final-audit/t18d-xtest/run.sh 9350f32bbe014243e4c81546b0ac1aa5afa9e226
```

启动参数从现有 `[root, "--no-sandbox", USER_DATA_ARG]` 生成。对照臂原样传给 electron.launch。处理臂如已有有效的 `--disable-features`，在该值末尾合并目标项，保留已有功能、参数及顺序；原来没有该开关时才新增一个。夹具在 gate 前从 Electron 主进程读取实际 enable-features、disable-features 值与版本，检查指定项的状态。日志和 stages 附件的 `inputDeferral` 记录 `explicitDisable`、`explicitEnable`、`otherDisabled`、`otherEnabled`。核对两臂前者依次为 false / true，后者 explicitEnable 均为 false，两组其他功能列表和 Chromium 版本分别相同。两臂仍由 Playwright 按原路径启用 Network。[runner](t18d-xtest/run.sh) · [参数合并](t18d-xtest/launch-args.ts) · [实际启动及核对](t18d-xtest/native.spec.ts)

**判读依据是尾标何时到达页面。** 若默认臂在 +10 s 停键后才收到尾标，而禁用臂在同样的窗内实收键密度下提前收到，原尾标通知主动结束派键（stopReason 为 tail），则该策略对延迟有因果贡献。提前收尾时按双方共同发键时段比较键密度，同时复核 10 MiB 命令、正确字节/尾标、有效输入、p95 和清理。若两臂仍都在停键后收尾，则这项开关在该条件下未解除瓶颈。若默认臂未复现、其他 feature 列表不同、实际键显著减载或附件不完整，该对照不能归因。开关读数证明启动配置，不能替代逐任务调度轨迹，也不构成生产全局改开关的依据。

## t18p、t18q 的实际证据

均为单次运行。时间从各自 gate 放行起算。已将两份 result.json 内嵌附件与独立 JSON 逐一比对，四份附件均相符。两例通过，Electron 关闭、Core 停止与目录删除均成功。[t18p 结果](native-10000-both-9350f32bbe014243e4c81546b0ac1aa5afa9e226.QEryTT/result.json) · [t18q 结果](native-10000-page-only-9350f32bbe014243e4c81546b0ac1aa5afa9e226.BHBV6N/result.json)

| 指标 | t18p 页面 + 夹具 WS 订阅 | t18q 仅页面探针 |
| --- | ---: | ---: |
| 成功派发并在搜索框收到的键 / 相邻键间隔中位数 | 1,461 / 6.4 ms | 1,461 / 6.4 ms |
| 最后可信 keydown | +9,999.3 ms | +9,999.3 ms |
| bridge 收到尾标 / 尾帧写完成 | +8,543 / +8,543 ms | +378 / +1,260 ms |
| 峰值 bufferedAmount / CREDIT 判定失败 | 4,455,158 B / 34,719 | 1,441,980 B / 0 |
| 页面收到首段洪流 / 完整尾标 | +16.8 / +10,407.6 ms | +22.6 / +10,256.6 ms |
| DOM 尾标 / 相对页面尾标迟到 | +10,415.5 / 7.9 ms | +10,272.7 / 16.1 ms |
| 页面二进制消息数 / 总字节 | 5,031 / 11,103,049 B | 7,092 / 11,103,049 B |
| 平均每条消息 / 有效键的双 rAF p95 | 2,206.9 B / 33.3 ms | 1,565.6 B / 34.7 ms |

t18p 从 +907 至 +9,907 ms 的 9 个完整墙钟秒桶交付了 3,949,205 B；t18q 从 +415 至 +9,415 ms 的 9 个完整秒桶交付了 6,530,601 B。各自跨过停键时刻的桶另含 4,757,735 B 和 3,187,796 B，不能把整桶算作停键后流量。两轮仍可能存在此前 xterm 解析、搜索或观察任务与页面收包竞争的情况。t18q 消息更多却更早完成服务端写入，一轮一组且 Core DATA 切分不同，不能由这两组数据计算每消息的因果开销。[t18p 页面与 bridge](native-10000-both-9350f32bbe014243e4c81546b0ac1aa5afa9e226.QEryTT/terminal-flood-stages.json) · [t18q 页面与 bridge](native-10000-page-only-9350f32bbe014243e4c81546b0ac1aa5afa9e226.BHBV6N/terminal-flood-stages.json)

## 选择这一开关的依据

1. Chromium **152.0.7977.167** 的 Blink 源码将 `DeferRendererTasksAfterInput` 默认启用，默认策略参数为 `kAllTypes`。键盘 down、raw-down、up 属于 WebInteractionEvent。是否实际进入离散输入响应状态，还取决于输入处理后是否预期产生新帧。[锁定版本功能定义](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.167/third_party/blink/common/features.cc#L488-L516) · [输入分类](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.167/third_party/blink/public/common/input/web_input_event.h#L209-L215)
2. 在该响应状态下，主线程调度器对标记为可推迟的队列执行策略检查；处理预期产生帧的离散输入时设置等待状态，处理 compositor 主帧后可清除此状态。Blink WebSocket 的 client receiver 和读取 Mojo 管道的 watcher 使用 `kNetworking` 任务运行器。收到完整二进制消息时，代码先发出 Inspector probe，再向客户端交付。故密集可信输入、收包和 DevTools 同处一条有明确调度边界的路径。源码没有证明本次运行每条消息都被推迟，也不能把一条服务端 DATA 当作一次独立 Chromium 调度任务。[锁定版本调度判定](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.167/third_party/blink/renderer/platform/scheduler/main_thread/main_thread_scheduler_impl.cc#L1930-L1959) · [状态切换](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.167/third_party/blink/renderer/platform/scheduler/main_thread/main_thread_scheduler_impl.cc#L2586-L2600) · [接收路径](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.167/third_party/blink/renderer/modules/websockets/websocket_channel_impl.cc#L540-L558) · [消息交付](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.167/third_party/blink/renderer/modules/websockets/websocket_channel_impl.cc#L1064-L1083)
3. t18q 关掉的是测试订阅。锁定的 Playwright 仍在页面的原 Chromium 会话上执行 `Network.enable` 并监听 WS 通知。新建另一个 CDP session 并 disable 无法取消原会话的订阅。本轮对照只操作输入策略，没有改变此条件。[原会话注册](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L39399) · [Network.enable](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L37766)

## 消息粒度的候选边界

Huhu 当前按连接对每条 DATA 立即二进制 ws.send。Orca 在网络发送前按连接聚合，前台约 5 ms 定时触发或累计约 64 KiB 触发，另有约 48 KiB 的传输分片与 ACK 窗口。这提供了减少 WS 消息数的成熟参照。若后续实验证据支持合批，应保留字节顺序与跨帧编码，对低流量设置及时 flush；把暂存字节与 ws.bufferedAmount 一起计入背压，每份 DATA 的 CREDIT 只结算一次，并确保控制帧和正常 CLOSE 不越过待发字节，异常断开能取消余批。当前轮没有改帧粒度、CREDIT 或生产代码。[Huhu bridge](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L210) · [CREDIT 时机](../../packages/herdr-client/src/client.ts#L237) · [Orca batcher](/home/wta/projects/huhu/temp/sources/orca/src/main/runtime/rpc/methods/terminal/terminal-output-batcher.ts) · [Orca 传输界限](/home/wta/projects/huhu/temp/sources/orca/src/shared/terminal/stream/terminal-multiplex-flow-control.ts)

## 验证范围

只修改 temp 下的诊断启动参数、runner 与结果标记。离线检查了普通参数、既有 feature/试验参数、重复 disable 开关、空开关、已含目标项五种合并情况，以及控制臂和原数组保持原样。shell 语法、定向 TypeScript 检查、Playwright 仅列出一个目标用例。未启动 E2E、Electron、Core 或构建，策略处理臂的运行结果待 Lead 取得。
