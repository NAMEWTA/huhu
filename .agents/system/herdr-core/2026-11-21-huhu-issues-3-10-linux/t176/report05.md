# t176/task05 · 终端洪流采样提前停止

Lead 为 `t3p`。integration 本轮只改 `tests/e2e/perf.spec.ts` 的终端洪流用例。

## 证据与修复

- 在原 `4a54f0a9` 构建上，测试放行后约 66.1 ms 看到首批实际输出。第 400 键在放行后 3,495.6 ms 到达，比 20 秒采样时限早。trace 附件 `25492365d6439d404b1e15535b48851a4ac41de2` 记录 5 个窗前键、395 个窗内键、窗内延迟均已收齐及 `tailAt: null`。失败发生在尾标完整性检查，当前产物无法判定完整负载的 p95。见 [失败日志](terminal-flood-diagnostic-4a54f0a9.log) 与 [原始产物](terminal-flood-diagnostic-artifacts-4a54f0a9/)。
- `tests/e2e/perf.spec.ts:368–377` 取消 400 键上限。采样仍串行发送真实的 `a` 和 Backspace，等尾标通知或从放行开始的 20 秒时限。循环结束后先等已有窗内按键的双帧回调完成，再读取测量结果。
- `perf.spec.ts:328–335,403–415` 使用 renderer 看到真实尾标时先记录的时间判定 20 秒边界。随后到达 Node 的通知只负责停止继续打键。通知迟到时，以 renderer 已记录的尾标为准。时限内没有尾标，或尾标只在时限后等待双帧时出现，均会失败。尾标之后的按键仍归为窗外样本。
- 保留实际终端 DOM 尾标、满速 10 MiB 输出和字节计数、至少 10 个窗内样本，以及严格测量时的 p95 ≤ 100 ms 门槛。生产者仍只在开始前等待放行。

## 验证

定向 `tsc --noEmit`、`oxfmt --check`、`oxlint -c oxlint.json` 和 `git diff --check` 通过。定向类型检查以 `tests/e2e/perf.spec.ts` 与 `apps/desktop/src/renderer/env.d.ts` 为入口，使用 Node 24.21.0 与现有 ES2023、DOM、ES2024.Promise 类型库。

## 未运行的验证

本轮未运行 Electron/Playwright E2E、构建、打包或全仓检查。尚无取消键数上限后的实测尾标时间、样本数或 p95。Lead 可在同一隔离配置下串行重跑本用例，检验完整采样窗口。

## Modern Web Guidance

沿用已完成的 search 和 retrieve 结果。本轮复用现有真实键盘派发、DOM 尾标观察与双帧结算。
