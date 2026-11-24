# Issue #2 重新打开后的验收

当前归档结论见[交付验收](../../evidence.md)。下文记录当时的进展、候选和验证范围。

**当时结论：保持开放，待后续交付补齐。** `ce913d2` 的台账记录当时的验收结果，不代表重新打开的问题已经解决。`main` 上的交付为 `f16f614`；本轮集成候选是 `d6a4663`（`closeout2/final`）。原主工作树的本地修改未动。

| 项 | 本轮代码 / 证据 | 范围 |
| --- | --- | --- |
| H02 | `5074745`；[实现报告](h02-agent-report.md)，集成产物守护（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/d6a4663-h02-build.txt`） | 构建按当前守护口径得到 A/B/C=0，但 A 排除了 `modules.huhu-ok`。映射仍属 `modules` 子层，不能据此认定严格 OP-D05 空交集；映射仍受 C 约束。七个非知识库屏幕的计算样式比较（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/seven-screens-diff.json`）以 `f16f614` 为基准，不冒充 rc.4 的完整视觉矩阵。 |
| H02 浮层 | `::backdrop` 产物（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/backdrop-output.log`）、四主题计算样式（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/portal-computed.json`） | 实际图片缩放对话框，亮暗模式；桌面禁用的 lint 服务使用同结构夹具核对样式。 |
| B06 | `ed092e4`；[实现报告](b06-agent-report.md)、基线复现（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/red3.log`）、修复专项（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/focus-clean.log`） | Linux Electron，真实 Home / Ctrl+Home 事件；无导航的浏览器复位为夹具模拟。独立修复提交的专项日志见左；在集成产物复跑同文件零重试 10/10（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/d6a4663-b06-integrated.txt`）。该复跑中 A/A 进程未在首次终止后立刻退出，存在负载重叠；本轮不把这次 E2E 当性能证据。 |
| G07 | `8270026`；集成产物 build-info（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/d6a4663-build-info.json`） | 首页 `home.summary` 数字卡片，任务与收件箱使用新进程、新 profile、尽早点击真实导航按钮并等待夹具内容。rc.4 与候选入口都硬编码先打开首页，不把此测量称作直接启动到模块。保留同帧与 locator 两种读数，见下方实测；正文端点补测发现回退。 |

集成候选通过 `format:check`、`lint`、`typecheck`、`knip`、`build`、`notices`、`test`（1006/1 跳过）、`test:vendor`（6427/4 跳过），见静态门禁与测试摘要（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/d6a4663-static.txt`）。这不是全量 E2E 或独立审查的结果。

现役限制：Windows/macOS 实机、真实输入法和硬件鼠标未验证（Q7）。本会话没有 `HERDR_ENV=1`，改用独立的只读 Codex `gpt-6.2-sol` / `xhigh` 审查 [集成候选及补测初稿](independent-review.md)，未恢复或改动原会话。审查所指出的 G07 正文证据缺口已用下方实验补齐；其余发现不标记为已修复。

## G07：区别探针延迟、内容标题与正文可见

基线 `9132640` (`v0.0.1-rc.4`)，候选构建 `d6a4663`。同机 Linux x64，Electron 44.9.1，Xvfb。每次新进程、新 profile、新 Vault（2,001 篇笔记；任务和收件场景分别再写入一条夹具），每对交替首发版本。不是系统重启或清页缓存。下表为候选减基线的配对差中位，括号内为 bootstrap 95% 区间，单位 ms。

| 批次 | 结果 | 原始数据 |
| --- | --- | --- |
| 原始驱动，40 对 | 首页外壳 −9.7 [−21.2, 1.4]，数字卡片 −15.7 [−25.9, −1.8]；任务列表 +77.3 [24.2, 215.8]，收件标题 +50.8 [22.8, 104.6]；首篇笔记 +394.6 [390.6, 398.2]（Q9 要求记录）。无收件夹具的首页 / 收件箱不解析编辑器命名块，打开笔记后才解析。 | A/B，`--pairs 40 --trace-modules`（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/g07-ab.jsonl`） |
| 原始驱动，追加实际点击时间戳，10 对 | 点击到任务行 −5.6 [−7.5, −0.3]，点击到收件标题 +3.5 [−4.4, 14.1]；旧驱动端到端差值不能归因于模块数据加载。 | 诊断，`--nav-only --pairs 10`（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/g07-nav-ab.jsonl`） |
| 首个可命中帧驱动，16 对 | 真正指针点击，任务行 −25.2 [−51.9, 22.4]，收件标题 +23.0 [−37.4, 53.2]。这两个样本不能证明无回退，也未复现旧驱动的稳定差值。 | 诊断，`--nav-only --frame-click --pairs 16`（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/g07-frame-ab.jsonl`） |
| 首个可命中帧驱动，加入正文，10 对 | **收件正文 +782.0 [765.8, 880.4]，10/10 对更慢**。正文 p50/p95 从 1485.7/1566.9 到 2282.6/2463.7。收件标题差 +11.1 [−12.7, 102.7]；差异发生在标题出现之后。 | 正文，`--nav-only --frame-click --pairs 10`（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/g07-body-ab.jsonl`） |

原始 A/B 启动负载 7.25/6.88/3.56，正文批次等的负载见起止时序（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/g07-run-windows.txt`）。A/A 40 对和全量 E2E 队列在正文明确回退后停止；A/A 起始片段（本机原件 `temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/reopened/g07-aa.jsonl`）仅保留终止前的三次成功观测，不可作为统计结论。旧版正文与标题同批渲染，候选在 `InboxModule.tsx` 的 `Suspense` 中才加载 `CompactView`。证据表明落后的端点在此路径，不把整段差值无剖析地归因于某一个 chunk 或 React。下轮需保留同一 OK 阅读语义，隔离 compact 只读闭包并复测正文、任务和首屏，不能只复测标题。H02 应纠正交集口径和实际浮层覆盖，再做当前候选对 rc.4 的视觉比对。
