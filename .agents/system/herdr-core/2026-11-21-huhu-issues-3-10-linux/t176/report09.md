# t176/task09 · 终端洪流阶段取证

夹具已就绪。Lead 可沿用 da645ee8 的应用、隔离 PATH 和原有运行参数，在原命令上设置 `HUHU_PERF_DIAGNOSTICS=1`，定向实跑 `tests/e2e/perf.spec.ts` 的「终端吞吐」用例。阶段证据保存在测试附件 `terminal-flood-stages.json`。上轮 da645ee8 在 20 秒内有 2,956 个完整的窗内按键样本，原探针仍缺尾标。 [task08 证据](t176-report08.md#da645ee8-复现)

## 附件记录

| 阶段 | 记录和读法 |
| --- | --- |
| WebSocket 接收 | 从 gate 放行开始，按实际会话 ID 和连接记录 Playwright 收到的二进制帧数、截至原截止时间和截至快照的字节数、首末帧及尾标时刻。尾标匹配覆盖同一连接跨帧边界。时间指测试进程收到 Playwright 事件，字节包含同一连接在该段内的其他终端输出。 [观察代码](../../tests/e2e/helpers/perf-diagnostics.ts#L18) |
| 页面终端行 | 记录初始 `.xterm-rows` 首次脱离和同会话行容器首次替换的时间、观察到的替换次数，以及快照时当前容器是否仍是初始节点、其文本是否有完整尾标。原尾标探针仍跟踪初始容器，替换记录可解释它为何漏看后续节点。 [观察代码](../../tests/e2e/perf.spec.ts#L467) |
| Core 屏幕和尾部 | 窗口结束并结算双帧后、原断言和清理前，通过 `window.huhuHost.engine()` 调用同会话的 `agent.sessions.output`，独立读取 Core 最后 40 行。附件保存读取时段、状态、`complete`、字符数、尾标及其前缀、跨换行匹配和最后一行是否像提示符。提示符为行尾字符启发式。 `complete` 属于此读取调用。 [读取代码](../../tests/e2e/helpers/perf-diagnostics.ts#L57) · [能力实现](../../plugins/agent-cli/src/engine/sessions.ts#L1367) |

Core 读取发生在 WebSocket 快照之后。若 Core 见到尾标而 WS 尚未见到，先结合读取时段和截止时间判断尾标是否可能晚到。若同一会话的 WS 已见完整尾标而原 DOM 探针未见，可用替换记录和当前容器内容缩小 renderer 内的范围。各阶段均缺尾标时，现有数据仍无法确认生产者完成时间和退出状态。

## 运行边界

仅两个测试文件有变更。原 20 秒上限、真实键盘节奏、10 MiB 生产命令与速率、采样口径、断言、指标和 Core 清理沿用原实现。开关开启时，Playwright 转发帧和 Node 扫描标记、页面观察 DOM 子节点变化会增加采样负担。诊断轮用于定位阶段，性能验收使用关闭诊断的结果。Node 每条连接只保留计数和最多 `尾标字节数 − 1` 的跨帧后缀。Core 请求在页面只提取布尔值和计数，阶段附件不写入洪流载荷或屏幕全文。Core HTTP 请求限 3 秒，外层最多等 4 秒。 [附件写入](../../tests/e2e/perf.spec.ts#L555)

## 定向检查

以下命令均退出 0。pnpm 命令使用 `PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH`。

```sh
pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule tests/e2e/perf.spec.ts tests/e2e/helpers/perf-diagnostics.ts apps/desktop/src/renderer/env.d.ts
pnpm exec oxfmt --check tests/e2e/perf.spec.ts tests/e2e/helpers/perf-diagnostics.ts
pnpm exec oxlint -c oxlint.json tests/e2e/perf.spec.ts tests/e2e/helpers/perf-diagnostics.ts
git diff --check -- tests/e2e/perf.spec.ts tests/e2e/helpers/perf-diagnostics.ts
```

## 未运行的验证

未运行 E2E、Vitest、构建、打包或全仓类型检查。附件的实际生成及本次缺标阶段由 Lead 实跑确认。

### Modern Web Guidance

沿用 Lead 已检索并取回的 JavaScript 指南，将 `AbortSignal.timeout(3_000)` 直接传给诊断 `fetch`，用于采样结束后的 Core 读取。 [已检索指南](/tmp/mwg-guide-742470-1795376192756.md#L187)
