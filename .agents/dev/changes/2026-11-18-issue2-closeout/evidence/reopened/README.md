# Issue #2 重新打开后的验收

`ce913d2` 的台账记录当时的验收结果，不代表重新打开的问题已经解决。`main` 上的交付为 `f16f614`；本轮集成候选是 `d6a4663`（`closeout2/final`）。原主工作树的本地修改未动。

| 项 | 本轮代码 / 证据 | 范围 |
| --- | --- | --- |
| H02 | `5074745`；[实现报告](h02-agent-report.md)，[集成产物守护](d6a4663-h02-build.txt) | A/B 均无登记例外，C 无违规。迁入 `modules.huhu-ok` 的规则仅针对编辑器内部，仍受 C 的选择器约束。七个非知识库屏幕的[计算样式比较](seven-screens-diff.json)以 `f16f614` 为基准，不冒充 rc.4 的完整视觉矩阵。 |
| H02 浮层 | [`::backdrop` 产物](backdrop-output.log)、[四主题计算样式](portal-computed.json) | 实际图片缩放对话框，亮暗模式；桌面禁用的 lint 服务使用同结构夹具核对样式。 |
| B06 | `ed092e4`；[实现报告](b06-agent-report.md)、[基线复现](red3.log)、[修复专项](focus-clean.log) | Linux Electron，真实 Home / Ctrl+Home 事件；无导航的浏览器复位为夹具模拟。专项记录属于独立修复提交。 |
| G07 | `8270026`；集成产物 [build-info](d6a4663-build-info.json) | 首页 `home.summary` 数字卡片，任务与收件箱使用新进程、新 profile、尽早点击真实导航按钮并等待夹具内容。rc.4 与候选入口都硬编码先打开首页，不把此测量称作直接启动到模块。保留同帧与 locator 两种读数；正式 A/B 与 A/A 各 40 对。 |

集成候选通过 `format:check`、`lint`、`typecheck`、`knip`、`build`、`notices`、`test`（1006/1 跳过）、`test:vendor`（6427/4 跳过），见[静态门禁与测试摘要](d6a4663-static.txt)。这不是全量 E2E 或独立审查的结果。

现役限制：Windows/macOS 实机、真实输入法和硬件鼠标未验证。重新打开后的独立审查需覆盖实际候选；本会话没有 `HERDR_ENV=1`，不能通过 Herdr 派遣，不沿用旧候选的独立审查作为本轮审查结果。
