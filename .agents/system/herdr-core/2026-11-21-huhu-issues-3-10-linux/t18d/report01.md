# 终端洪流与密集按键 · t18d/task01

Lead 为 t3p。只读分析完成。固定应用与代码基线为 `9350f32bbe014243e4c81546b0ac1aa5afa9e226`。任务文件位于 [t18d/task01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t18d/task01.md)。

**已定位到服务端 WebSocket 写入积压，并经 CREDIT 向上游传播。触发积压的原因尚未定位到具体组件。** 同一连接上，bridge 已经取得并提交 7,990,925 B，其中 4,441,926 B 尚无写完成回调。随后 20 个连续进度快照均停在相同的帧数和字节数。与此同时，真实搜索输入和两次动画帧回调持续得到处理。优先检查密集输入对收包、解析与测试驱动的影响。现有证据不足以决定生产补丁。[阶段附件](flood-bridge-artifacts-9350f32b/terminal-flood-stages.json) · [按键及正式失败结果](flood-bridge-artifacts-9350f32b/result.json)

## 两条时间线

下表均以 t18c 的 gate 放行为零点。bridge 从 attach 起累计，包含放行前输出。浏览器侧 WS 字节取自 Playwright 进程收到事件时的计数。

| 相对时间 | 实际观察 |
| --- | --- |
| +94 ms / +121.4 ms | Playwright 观察到首个窗内二进制帧，随后 DOM 首次出现洪流文本。|
| +223 ms / +256 ms | 服务端已回调 1,097 帧、3,548,999 B。bridge 已收且提交 2,616 帧、7,990,925 B。差额为 1,519 帧。|
| +354 ms 至 +19,486 ms | 20 个进度点的上述三个累计值都未增加。CREDIT 拒绝次数从 622 增至 83,659，稳定段约每秒 4,380 次。说明 Engine 仍在执行定时回调。写完成计数呈平台，期间 TCP 仍可能部分发送同一批写入，附件不能给出逐秒实际网速。|
| +19,995.9 ms / +20,000 ms | 最后一次可信 keydown 到达。截止时 Playwright 计到 2,975,788 B，未见尾标。|
| +20,074 ms / +20,103 ms | 已在平台上的 2,616 帧全部完成写回调。随后 bridge 收到且提交尾标，累计 2,829 帧、11,103,049 B。尾标比最后一次 keydown 晚约 107 ms。|
| +20,840 ms / +20,996 ms | Playwright 停止观察时累计 699 帧、3,116,772 B，原 DOM 行容器仍在且未见尾标。之后 bridge 尾帧写完成，发送错误为 0。|
| +21,036 ms | 单独读取 Core 屏幕已见完整尾标。该次读取在 WS 快照后开始。|

解析 `result.json` 内嵌附件，核对两份 bridge/stages JSON 与独立文件内容一致。共发 2,982 键，10 键在首段 DOM 洪流之前，2,972 个窗内样本全部有真实 input 和预期的值变化。相邻 keydown 间隔中位数 6.2 ms、p95 10.0 ms、最大 85.3 ms。按用例同一 nearest-rank 算法复算，窗内 keydown 到第二个 rAF 的 p95 为 **32.7 ms**。该指标从已送达页面的 keydown 开始，正式用例先在 20 s 可见尾标断言失败；本次复算不能记为用例通过。历史较早的构建也有在密集输入下于约 5.54 s 达到尾标的样本，版本、环境及输入密度不同。[实际结果](flood-bridge-artifacts-9350f32b/result.json) · [正式判据](../../tests/e2e/perf.spec.ts#L635) · [历史样本](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/followup-flood-4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73.sqtD8H/run.log)

t188 是另一运行。相同锁定 Core 0.1.19 的直连 attach 用 300.4 ms 收到尾标，共 5,658 帧、11,102,595 B，CAN 计数 0，正常 stop 并确认无残留。它证明该 Core 与生产管道具备吞吐能力。Electron 运行的 `core.tailAt` 记录的是 bridge 收到 attach DATA 的时刻，不能据此推定 PTY 直到 +20.103 s 才生成尾标。t18c 没有独立的窗内 PTY 尾标时间或 CAN 计数。[直连结果](direct-attach-lead-probe.log) · [bridge 记录点](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L210)

## 代码如何解释积压

- **bridge 与 Herdr。** 每个 DATA 立即发一条二进制 WS 消息；随后检查 `bufferedAmount < 4 MiB` 并逐 DATA 回报 CREDIT。检查失败，保留该笔字节，50 ms 后再试。ws 8.22.2 的 `bufferedAmount` 是 Node writable 长度加 sender 已缓冲字节；发送回调来自底层 socket 写。测得峰值 4,447,404 B，超过门槛 253,100 B，与本地 0.1.19 参考实现的 256 KiB 初始 CREDIT 窗口量级吻合。86,286 是累计拒绝检查次数，同一笔可重复计数。合并计时器可能减少 CPU 开销，却不能解释下游为何持续消耗这么慢，尤其当既有写入还在等回调时。[bridge](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L183) · [逐 DATA CREDIT](../../packages/herdr-client/src/client.ts#L237) · [ws 缓冲](../../node_modules/.pnpm/ws@8.22.2/node_modules/ws/lib/websocket.js#L134) · [ws 写回调](../../node_modules/.pnpm/ws@8.22.2/node_modules/ws/lib/sender.js#L565) · [Core 窗口](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/wire.rs#L26)
- **产品收包与显示。** TerminalView 直接将每条 ArrayBuffer 交给 xterm 6.0.0 的 `write`，未向 bridge 回报解析进度。xterm 自带写队列，以约 12 ms 为预算在块间切片，用定时器续跑，刷新由 rAF 合并。快速输入的同步首写路径由 xterm 自身的输入事件触发，本例连续按键落在会话搜索框。浏览器 WS 派发、xterm 解析与 DOM 更新均缺少逐阶段累计量。单纯的 DOM 尾标观察遗漏无法解释服务端尾标也越过截止。[TerminalView](../../packages/ui/src/components/TerminalView.tsx#L100) · [xterm 写队列](../../node_modules/.pnpm/@xterm+xterm@6.0.0/node_modules/@xterm/xterm/src/common/input/WriteBuffer.ts#L104) · [rAF 刷新](../../node_modules/.pnpm/@xterm+xterm@6.0.0/node_modules/@xterm/xterm/src/browser/RenderDebouncer.ts#L35)
- **按键所走的业务路径。** 搜索框每次 input 更新本地 query 和页码相关状态，query 参与 `agent.history.list` 查询键。这会有 React 和查询观察者工作。两种值交替复用，客户端默认新鲜期 5 s，而且读取传入 AbortSignal。当前附件没有 HTTP 完成和取消次数，无法将 2,982 次按键等同于同量的 Engine 请求。[历史搜索](../../plugins/agent-cli/src/ui/history/HistoryPanel.tsx#L78) · [输入处理](../../plugins/agent-cli/src/ui/history/HistoryPanel.tsx#L162) · [查询客户端](../../packages/workbench/src/engine-client/react.tsx#L50)
- **驱动与 Chromium。** 用例串行地尽快 press，无节拍等待；每键包含 CDP keydown 和 keyup。WS 探针经同一页的 CDP Network 事件，在测试进程用 Date.now() 记时。2.98 MB 不能直接当作页面 onmessage 或 xterm 已解析字节。仓库锁定 Electron 44.9.1 / Chromium 152，窗口使用普通 BrowserWindow 配置，夹具在 Xvfb 运行。上游 Blink 的 WebSocket 可读 watcher 使用 networking 任务队列，这使得输入活跃时不同队列的进展差异值得测量；此次附件没有调度轨迹。项目配置 retain-on-failure；较早 da645ee8 同夹具保留的 trace 只有测试步骤，不能据此归因于每键 DOM 截图。[按键循环](../../tests/e2e/perf.spec.ts#L570) · [WS 观察时钟](../../tests/e2e/helpers/perf-diagnostics.ts#L23) · [Playwright 输入](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L37535) · [CDP Network](../../node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js#L37753) · [窗口](../../apps/desktop/src/main/index.ts#L215) · [Blink 接收实现](https://chromium.googlesource.com/chromium/src/+/a6d6dcf1f5c24bdf1e94949ac63d5aeb6d9d377b/third_party/blink/renderer/modules/websockets/websocket_channel_impl.cc)
- **参考实现。** 本地 Herdr 原生 attach 在交付输出后按字节回 CREDIT，Core 给每条 stream 各自计账。Orca 对远端输出按待确认字节和单计时器累计 ACK，另有窗口和关闭合同。这些实现可供定位到信用回报或解析积压后的设计对照，单凭此次平台不足以移植协议。[Herdr attach](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/attach.rs#L245) · [Orca ACK](/home/wta/projects/huhu/temp/sources/orca/src/renderer/src/runtime/hosted-terminals/streams/flow-control/remote-runtime-terminal-flow-controller.ts#L106)

## Lead 可执行的最小证伪实验

**先移动停键时刻。** 同一构建、同一夹具及诊断设置下，单独做一次诊断变体。按原循环密集交替输入至 gate +5 s，记录最后一次 keydown 后停止发键；复用现有尾标通知，继续等到原 +20 s 截止。在这段安静期不要用密集 page.evaluate 或 locator 轮询。保持洪流命令、搜索框焦点、DOM 观察、WS/bridge 观察和清理路径一致。这个变体只判断停键与排空的因果关系，正式用例仍按原循环、原截止与原 p95 判定。

- 若 +5 s 前已出现同样的平台，停键后很快恢复写完成并取得 bridge/DOM 尾标，且恢复点从 +20 s 移到 +5 s 附近，就支持“持续输入或派键活动在维持积压”。原运行最后按键到 bridge 尾标约 107 ms，可作参照。若平台跨过停键继续维持多秒，则削弱该解释，应查出站 TCP 窗口/队列、实际接收进度。若未形成平台或尾标先于 +5 s，到手的是自然变异样本，不能推断停键效果。单次鲜明差异可用另一预定停键点复核。
- 若恢复确实跟随停键，下一次只换**按键来源**。同一 Xvfb 上用 XTEST 对原搜索框回放已有 keydown 间隔，保留 Playwright 网络观察及全部产品处理。按实际可信 input、值变化、焦点和各秒键密度核对共同负载时段；密度明显不符就不作 A/B 归因。本机有 libXtst。只有 CDP 逐键驱动出现平台时，优先查驱动/观测竞争。两种真实输入都出现平台时，再在两臂等量采集页面内 WS 消息累计字节、xterm write 完成累计字节、首次/尾标时刻及 DOM 尾标。可按秒在内存分桶，窗口结束一次取走，不逐帧跨进程回报。
- 页面 WS 到达持续领先而 write 完成落后，应查 xterm 解析/渲染争用。页面本身收包已慢且 bridge 写回调也滞后，应先查网络/renderer 交付调度。若页面已收到尾帧但 Playwright 晚报，才可量化 CDP 观察滞后。若怀疑搜索业务另有开销，补同窗内 `agent.history.list` 开始、结束、取消次数。后续任何产品修复均须回到原 10 MiB、原密集输入、20 s DOM 尾标、有效窗内样本至少 10、严格 p95 ≤100 ms 及正常清理。

## 未运行的验证

本轮只读取固定版本源码和既有聚合，对附件做离线复算，写入本报告。未运行 Electron、Core、E2E、构建、打包或测试套件。上述反事实实验均待 Lead 执行。Modern Web Guidance 已离线检索并读取 performance、break-up-long-tasks、schedule-tasks-by-priority；已有数据无法指定应调整的浏览器任务，本轮没有应用调度改动。
