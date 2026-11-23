# t17c task04 · 终端洪流采样独审

本轮通过记录可信。原 `4a54f0a9` 桌面构建的一次严格诊断覆盖从终端首批输出到完整尾标。独立重算得到 1,311 个窗内按键，p95 32.4 ms，最大 44.0 ms。尾标在放行后 10,532.3 ms 出现。该结果可作为该构建的基线，最终包仍需单独验证。 [运行日志](terminal-flood-window-check-4a54f0a9.log#L110) · [Playwright 原始报告](../../../../issue-evidence/huhu-2026-11-22/followup-flood-4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73.ZILUl8/result.json)

## 版本和原始证据

- 审查时工作树 HEAD 为 `5aeac32ee00e0f3d5cfd2faf4e27f1840762865c`。查验 `perf.spec.ts` blob `462e478a1c043ed3685fa7bf177c5279c737eb50` 和新 helper blob `0de215c5c5bb3307860db2bdaefc6c6a20f3afeb`。诊断包装核对桌面构建的 build-info commit，固定为 `4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73`，并设置 `HUHU_PERF_STRICT=1`，原 ≥10 样本、p95 ≤100 ms 和 20 秒尾标条件均保留。helper 的请求、退出和 CPU 探针仅从任务滚动用例进入，终端用例不启用这些探针。 [运行包装](run-perf-diagnostic.sh#L7) · [阈值](../../tests/e2e/perf.spec.ts#L16) · [滚动诊断入口](../../tests/e2e/perf.spec.ts#L188) · [诊断 helper](../../tests/e2e/helpers/perf-diagnostics.ts#L7)
- 工作树内通过产物只保留 `.last-run.json`，配置为失败时保留 trace。原始 Playwright JSON 自带内嵌的 `terminal-flood-keys.json`，解码后 SHA-256 为 `1e5bccab7c6359b49ee47a917415e8eb9f6ad4903a394e86ff4b756b1c756f53`。运行记录为一项通过、retry 0、无跳过或 flaky，逐键附件与工作树日志摘要一致。复制日志另含包装的前置校验和退出清理提示，`CLEANUP_INCOMPLETE` 单列。 [通过记录](terminal-flood-window-artifacts-4a54f0a9/.last-run.json) · [trace 设置](../../playwright.config.ts#L10) · [日志及退出](terminal-flood-window-check-4a54f0a9.log#L110)

## 计时及输入复算

- Shell 先等临时门闩，焦点和 DOM 观察器就绪后才放行。原 shell 管道满速将 `yes` 的内容截为 10,485,760 字节，经 `tee /dev/tty` 送入真实 PTY，通过 `wc -c` 取并行管道的计数。命令回显只含一份负载字符串及尾标的算术和变量表达式，无法达到首批输出所需的三份重复或形成完整 `FLOOD-DONE-42-10485760`。日志有首批与尾标两个相隔 10,372.2 ms 的独立时间点，且 Playwright 另断言尾标仍在终端 DOM。计数覆盖生产端管道副本，未计量 renderer 收到的每个字节。 [真实终端和 Shell](../../tests/e2e/perf.spec.ts#L288) · [DOM 观察](../../tests/e2e/perf.spec.ts#L320) · [尾标断言](../../tests/e2e/perf.spec.ts#L407)
- 键盘循环逐键等待 Playwright 的真实 `a` 和 Backspace 输入，退出只取决于尾标通知或 20 秒上限。Renderer 在通知 Node 前先记尾标时间，通过断言使用该时间。原 400 键版本在原始附件中止于 395 个窗内样本且尾标为空，实际失败；通过版本发出 1,319 键，焦点先于放行，8 个窗前键、1,311 个窗内键、0 个窗后键。以原始时间戳独立按首批至尾标重划窗口，样本和三个等宽时间段的 372、431、508 均一致。最终一键在尾标前 2.3 ms。全部 1,319 个按键交替正确且都收到对应的原生 `input` 事件，输入值长度分别增减 1。 [采样和截止](../../tests/e2e/perf.spec.ts#L337) · [前一轮失败](terminal-flood-diagnostic-4a54f0a9.log#L110) · [修复交接](t176-report05.md)
- 以 `keydown` 发生时归窗，退出后等窗内样本完成双 rAF，逐键延迟全部为有限值，`pending=0`。其中 3 个窗内样本在尾标以后才结束计时，均参与重算。按源码最近秩法取第 1,246 个有序样本得 32.4 ms，最大值 44.0 ms。该指标从 renderer 的 keydown 处理开始到第二个 rAF，覆盖进入计时的慢样本。Playwright 派发到 keydown 的排队与真实帧呈现时间没有在这条指标内测量。 [双帧采样](../../tests/e2e/perf.spec.ts#L337) · [等待结算](../../tests/e2e/perf.spec.ts#L375) · [原始逐键附件](../../../../issue-evidence/huhu-2026-11-22/followup-flood-4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73.ZILUl8/result.json)

## 低优先级发现

当前门禁只要求焦点内可信 keydown 和双帧结算，`inputAt` 与前后值长度只记入附件。如果以后搜索框仍能聚焦并收键但禁止实际编辑，样本数与 p95 仍可能达标。本轮逐键复算已确认实际编辑，故这项缺口不影响此次结果。可在后续门禁对窗内键补充实际输入事件和值变化断言。 [采样字段](../../tests/e2e/perf.spec.ts#L337) · [通过条件](../../tests/e2e/perf.spec.ts#L407)

## 实际验证和未验证

只读核对了两轮原始 JSON、日志、通过产物、代码与构建元数据，独立重算窗口与分位，定向 diff 空白检查通过。未运行 E2E、构建或安装包验证。报告是本会话唯一产物。 [初始诊断交接](t178-report01.md) · [探针类型复核](t178-report02.md)

### Modern Web Guidance

沿用本批已检索和获取的交互计时指南。我据此核对本测试的双帧指标边界和原生输入记录。
