# task13 · 终端桥诊断与隔离直连独审

审查时指定改动已固定在 `9350f32bbe014243e4c81546b0ac1aa5afa9e226`，以 `5f51af24` 为比较基准，只核对任务指定的五个文件。**关闭诊断时未发现终端行为回归。开启诊断可用于分段取证，有一项日志净化低项。** [直连交接](t176-report11.md) · [桥接交接](t176-report12.md)

## 发现

- **低项，直连异常路径存在自由文本日志。** 探针保留 Core stderr 末尾 4 KiB，清理记录原样输出 `serveStderr`／`serveError`，读与 stop 的异常也写入 `String(error)`。因此“只记录统计”在错误路径上尚未落实。此次隔离环境仅有合成终端输入，t188 的 stderr 实际为空，未见正文或 token。若保留探针，把日志改为错误码及 stderr 字节数或存在标志。桥接生产端发出的诊断 JSON 本身只含标识和聚合统计，E2E 收集端应按相同字段投影后再入附件，当前只检查四个字段便保留整个 JSON。 [stderr 采集](../../packages/herdr-client/test/attach.live.test.ts#L61) · [RPC 与清理日志](../../packages/herdr-client/test/attach.live.test.ts#L141) · [清理记录](../../packages/herdr-client/test/attach.live.test.ts#L193) · [桥接字段](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L44) · [转发 JSON 收集](../../tests/e2e/helpers/perf-diagnostics.ts#L65)

## 默认行为与取消边界

- **正式口径保持。** `HUHU_PERF_DIAGNOSTICS=1` 才创建 bridge 统计、连接 ID、发送完成回调及 stderr 观察。开关关闭后仍以原二进制 `ws.send` 转发；同一个 `bufferedAmount < 4 MiB` 谓词控制原 50 ms CREDIT 重试。WS 认证、控制者选定、观察者输入/resize 隔离及关闭路径沿用。E2E 的 10 MiB 满速命令、交替真实按键、20 秒 DOM 尾标、窗内样本与 p95 ≤100 ms 都保持。诊断开启时会增加扫描、回调和 stderr 写入负担。 [流入口](../../packages/kernel/src/server/ws-workbench.ts#L32) · [控制权限](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L114) · [CREDIT 与发送](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L183) · [原 CREDIT 合同](../../packages/herdr-client/src/client.ts#L237) · [洪流生产](../../tests/e2e/perf.spec.ts#L486) · [正式断言](../../tests/e2e/perf.spec.ts#L636)
- **取消与清理。** Bridge 的 abort／close 新增日志在原关闭动作之后，末批发送回调结算只更新统计。E2E 清理仍先取消并关闭桌面、停止 Core、确认后删目录，最后摘除 stderr 监听并给诊断附件 2 秒等待上限。Core 尾读后的 signal 守卫和附件错误结算保留。直连探针用固定二进制哈希、PID、`/proc/<pid>/exe` 和版本核对私有 Core，再走正常 stop；兜底只收回重复确认仍带该私有 HOME 的进程。t188 到达的是正常清理路径，整例总超时与强制回收未实测。 [关闭逻辑](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L169) · [E2E 清理](../../tests/e2e/perf.spec.ts#L385) · [读后取消](../../tests/e2e/perf.spec.ts#L590) · [直连身份](../../packages/herdr-client/test/attach.live.test.ts#L95) · [直连清理](../../packages/herdr-client/test/attach.live.test.ts#L163)

## 统计可支持的结论

| 观察 | 读法 |
| --- | --- |
| `core` → `sent` → `completed` | 分别在 bridge 的 attach DATA 回调、调用二进制 `ws.send` 前及该次发送成功回调记账。尾标支持同连接跨帧；已知失败发送覆盖尾标起始时，不记尾标发送完成。成功回调表示服务端写完成，浏览器何时收到继续看 Playwright 的 WS 事件，DOM 是否可见继续看原终端探针。 [记录与尾标](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L10) · [发送结算](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L62) · [浏览器探针](../../tests/e2e/helpers/perf-diagnostics.ts#L18) |
| CREDIT、快照与缺记录 | `blocked` 是判定失败次数，含同笔重试；`maxBufferedAmount` 是判定时观察值。Bridge 自 attach 起累计，包括放行前输出，且日志约每秒一次并为尾标等单列。比较时按事件自身时间和 `releasedAt`／`deadline` 对齐。浏览器停止观察后才独立读 Core，附件里的 bridge 快照更晚。stderr 解析失败行会被跳过，`dropped` 只计 64 条上限淘汰。若同一会话重连或有多个 socket，服务端连接 ID 未传到浏览器，逐阶段对应关系需先核实。 [回报与重试](../../packages/herdr-client/src/client.ts#L237) · [stderr 收集](../../tests/e2e/helpers/perf-diagnostics.ts#L57) · [快照顺序](../../tests/e2e/perf.spec.ts#L590) |
| `namesOnly` | 仅对命中的能力发现 GET 检查查询参数是否为 `view=names`，保存布尔值。它证明请求选择了视图，返回体积仍看网络元数据。 [请求观察](../../tests/e2e/helpers/plugin-perf-diagnostics.ts#L32) |

t188 在隔离直连路径上，放行后首 DATA 为 15.6 ms，300.4 ms 收到完整尾标，至快照共 5,658 帧／11,102,595 B，CAN 计数 0；独立 Core 读取在约 303 ms 也见尾标。Core 返回 stop 成功并退出 0，强制回收 PID、残留进程和 socket 均为空。这证明被锁定 Core 的直连 attach 在该次隔离环境完成了同源洪流。经 Engine／WS 的候选运行需要自己的分段数据与正式可见尾标。 [t188 实际日志](direct-attach-lead-probe.log)

复核期间，`9350f32b` 固定应用的两组实际附件已落盘。

- **洪流仍失败。** 仅一条匹配会话的 bridge 连接及浏览器 WS。以 gate 为零点，bridge 收到并发起尾标发送在 +20.103 s，成功回调在 +20.996 s，累计 11,103,049 B、发送错误 0。浏览器 20 s 内观察到 2,975,788 B，+20.840 s 停止观察时已累计 3,116,772 B，仍缺尾标。服务器完成回调晚于浏览器快照，快照无法说明之后是否收到。DOM 原容器仍在，独立 Core 读取 +21.036 s 有尾标。最高观测发送缓冲 4,447,404 B，CREDIT 判定失败 86,286 次含重试。该轮证实 bridge 尾标到达已越过正式截止，且服务端发送处有背压。现有观测无法定位浏览器消费、桥接或 Core 重绘各自的耗时。关停附件收到 abort／close，正式清理四项为 true。 [洪流阶段](flood-bridge-artifacts-9350f32b/terminal-flood-stages.json) · [关停阶段](flood-bridge-artifacts-9350f32b/terminal-flood-bridge.json) · [实际结果和清理证据](flood-bridge-artifacts-9350f32b/result.json)
- **插件诊断通过。** 启用 30 ms。两条已完成目录请求均为 `namesOnly=true`、HTTP 200，记录 14,342 B 和 14,150 B。另有一条 names 请求在采集停止时仍 pending。该轮证实真实桌面使用名称视图并收到小目录，性能阈值的正式结果仍按关闭诊断运行归档。 [插件请求附件](plugin-bridge-artifacts-9350f32b/plugin-perf-network.json) · [插件实际结果](plugin-bridge-artifacts-9350f32b/result.json)

本次完成静态审查、提交范围内 `git diff --check` 和既有证据读取。未重跑直连、Bridge E2E、构建或其他重型验证。
