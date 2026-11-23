# task10 · 性能诊断独立审查

基准为应用构建 `da645ee844f98f99dd2175b31b1e54f6714490e3`。审查其上的三个测试工作树文件，按顺序记录 blob 前缀 `71659b6f`（perf 用例）、`592994cf`（终端诊断）、`7ebf4c7e`（新插件诊断）。读取两组实际附件。本次未运行测试、构建或重型验证。 [性能用例](../../tests/e2e/perf.spec.ts) · [终端诊断](../../tests/e2e/helpers/perf-diagnostics.ts) · [插件诊断](../../tests/e2e/helpers/plugin-perf-diagnostics.ts)

## 审查结论

- **正式阈值、负载和授权保持。** 额外采集由 `HUHU_PERF_DIAGNOSTICS=1` 开启。冷启 3 s、插件启停 300 ms、RSS 600 MiB，洪流 20 s 内实际可见尾标、真实输入值增减、至少 10 个窗内样本、双帧 p95 100 ms 均沿用。生产者仍是满速 10 MiB 管道，搜索框仍用 Playwright 交替按 `a`／Backspace。插件观察器不改写请求。Core 额外读取发生在输入和快照结束后，走现有桌面 renderer 身份、当前终端会话的只读能力，沿用 HTTP 和能力授权。诊断开启时的帧转发、标记扫描、DOM 监听和请求观察会增加负担，正式结果以关闭诊断的运行计。 [插件计时](../../tests/e2e/perf.spec.ts#L38) · [洪流负载](../../tests/e2e/perf.spec.ts#L470) · [正式断言](../../tests/e2e/perf.spec.ts#L614) · [原有授权与读取入口](../../plugins/agent-cli/src/engine/index.ts#L391)
- **低项，诊断附件仍位于正式断言／清理的前置路径。** 洪流在 Core await 后先写附件，才检查 teardown signal，附件失败也会抢在正式尾标断言前抛出。插件的采集等待最多 1 s 且捕获附件写入异常，但 `attach()` 整体排在 `app.close()` 和删除临时 Vault 之前，写附件本身没有局部限时。范围限于开启诊断的运行。把洪流的取消检查放在读取返回后、写附件前，并让取证失败独立结算。插件附件写入单独限时，关闭和目录回收放进独立的 `finally`。此次洪流实际清理四项均为 true，此处为静态路径发现。 [洪流调用点](../../tests/e2e/perf.spec.ts#L573) · [插件清理调用点](../../tests/e2e/perf.spec.ts#L95) · [插件附件实现](../../tests/e2e/helpers/plugin-perf-diagnostics.ts#L113)
- **附件字段符合本次保密范围。** Core 原文和 renderer 凭据只在页面内用于已授权请求与尾标判断，回传聚合属性。WS 附件保存计数、时间和尾标状态。插件附件只保存白名单能力、格式校验过的请求 ID、方法、时间、状态和大小，不保存入参、完整 URL、鉴权头或正文。实际洪流归档的结构为测试 trace 和附件，未见浏览器网络归档。本报告只摘数值与布尔值。 [终端字段投影](../../tests/e2e/helpers/perf-diagnostics.ts#L57) · [插件字段投影](../../tests/e2e/helpers/plugin-perf-diagnostics.ts#L32)

## 洪流证据与时间边界

从放行计时，20.000 s 内，同一终端连接计 847,308 个二进制载荷字节。截至 21.075 s 的 WS 快照，共 161 帧、978,380 字节，最后一次帧回调在 20.269 s，未见尾标，也未记录连接关闭。DOM 原容器仍在，未观察到替换或尾标。探针将 2,805 个按键标为窗内，原可见尾标断言失败，后续样本断言未执行。四项清理证据为真。 [洪流 trace](<flood-stages-artifacts-da645ee8/perf-终端吞吐：10-MiB-输出期间界面输入响应-p95-≤-100-ms/trace.zip>) · [快照代码](../../tests/e2e/perf.spec.ts#L554)

21.075 s 停止 WS 记录后才发起独立读取，21.336 s 收到汇总。Core 的同会话最后 40 行包含完整的计数尾标。**Core 在随后读取时已有完整洪流的尾标，较早的 WS 观察和 DOM 快照仍缺尾标。** `complete:true` 表示读取提供了该次查询的可用输出，依据是尾标本身。不能从两次顺序快照反推 Core 在 20 s 前何时完成，也无法判断 WS 在 Core 读取区间是否追上。字节数和帧时间均为 Playwright 事件观察值，当前证据无法区分实际传输、桥接队列及观察端积压。 [WS 计数和停止边界](../../tests/e2e/helpers/perf-diagnostics.ts#L18) · [Core 输出语义](../../plugins/agent-cli/src/engine/sessions.ts#L1367)

## 插件请求时序

- **这轮只证明上报的诊断样本通过。** 端到端停用 38 ms、启用 279 ms，结果为 1 通过。此前 t180 的 472 ms 仍是另一轮的失败证据。 [实际结果](plugin-network-artifacts-da645ee8/result.json) · [t180 记录](query-fixed-perf-da645ee8.log)
- **启用请求的大段时间在 Chromium 记录的发送前。** 以该请求自身的 `timing.startTime` 为原点，`requestStart=220.045` ms、`responseStart=236.911` ms、`responseEnd=239.229` ms。当前安装的 Playwright Chromium 实现分别使用 CDP 的 `sendStart` 和 `receiveHeadersEnd` 填前两项。约 16.866 ms 是从开始发送到收完响应头的间隔，包含浏览器与网络路径，不能拆出 Engine handler 耗时。`queuedAt`、`headersAt`、`endedAt` 是测试进程收到 Playwright 事件的时间；`enable-start/end` 则是包含驱动往返和 JSON 解析的正式计时。 [请求附件](plugin-network-artifacts-da645ee8/plugin-perf-network.json) · [事件采集](../../tests/e2e/helpers/plugin-perf-diagnostics.ts#L55)
- **能力发现和刷新请求确有重叠，根因尚无归属。** 首轮完成的能力目录响应记录 14,184,843 字节，在启用约 101 ms 前已结束。第二轮能力发现于启用前启动、与启用重叠，收到 HTTP 200 后标为取消，大小缺失；第三轮在停止采集时仍 pending。并发的 `plugins.list`、`home.summary` 等也落在同一窗口。可据此定位重叠请求，无法把首轮响应大小归给取消请求，或把发送前约 220 ms 全归给能力发现、连接队列或插件初始化。pending 的 `startTime=0` 和各阶段 `-1` 代表时序缺失。 [请求附件](plugin-network-artifacts-da645ee8/plugin-perf-network.json) · [结束状态与大小采集](../../tests/e2e/helpers/plugin-perf-diagnostics.ts#L81)
