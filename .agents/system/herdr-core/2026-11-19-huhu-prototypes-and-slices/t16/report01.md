# task01 执行报告 · Agent CLI 与任务自动化

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices
- terminal_address — t16
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t16/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t16/report01.md
- Core 与模型 — 本机 wta，346bd5608735e3fcb27f9d01f5c8008e，GPT-6.2-astra，xhigh
- 工作目录 — D:/Document/code/huhu，feature/issue-fix@9f870c0fad0c
- 执行结果 — done

## 交付

两份 plan 改为切片与依赖索引。每个任务有独立正文，指向行为规格、现有代码与验证入口，说明需要的前置产物、原型场景、待确认范围和正常/失败判据。业务产物为 51 份 task 和两组各三份 plan、spec、design，共 57 份 Markdown。

| Change | 交付及覆盖关系 | 入口 |
| --- | --- | --- |
| #4 Agent CLI | W0–W8 共 26 个子项。覆盖目标冻结、三工作区切换、四向分栏、移动和缩放、真实启动/对账、断线或只读、历史查阅/定位/恢复、任务执行与回执、工作区工具、新格式恢复及整合。 | [计划](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/plan.md) · [任务目录](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks) · [规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/spec.md) · [设计](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/design.md) |
| #5 任务与自动化 | T0–T7 共 25 个子项。覆盖创建、受理、取消、同快照重试、真实 CLI 与停止、问题/补充/结果、规则时区与窗口、模板、跟进、容量与恢复；提醒与终端规则各有验收。 | [计划](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/plan.md) · [任务目录](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks) · [规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/spec.md) · [设计](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/design.md) |

#5 将停用/删除规则写成确定行为。只停止未来触发，已入队未发送的任务仍可领取，用户可在原任务单独取消。停用和删除分别验证，包含重启、竞争和取消其中一项后另一项仍可领取的用例。[规则操作](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T5.2-manage-rule.md) · [单项取消](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T1.3-cancel-pending.md)

联验采用 #6 的确定约定。干净安装 MCP/CLI 工具默认全关，逐项或明确批量开启。撤销 LAN 邀请时旧链接立即失效，经该邀请建立的浏览器会话断开，独立授权的会话和内部收取执行回执的能力按各自来源保留。#10 的布局与离场规则归该 change。新格式备份恢复在空白测试 Vault 取证。[共享终端观察](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W4.3-viewer.md) · [工具与调用方切换](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T7.1-cutover.md) · [派发后的用户决定](../topic.md)

## 已执行验证

| 验收要求 | 实际检查与结果 |
| --- | --- |
| 派工身份 | HC_TERMINAL_ID=t16，hc get t16 的地址、工作目录、模型与推理强度符合 task/topic；hc server status 的 wta ID 一致，manifest 指向 t16 / task01.md / active。 |
| 来源与版本 | 用配置的 gh issue view 只读取得 #4、#5 正文和评论。统一换行后分别与各自 source.md 的正文一致，均为零评论。核对本地 HEAD、origin/HEAD 及[批次源码清单](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/sources.md)，herdr-app master@317e673f1f15、herdr-core master@c7517808d64f、ORCA main@8bc232f5ed8b、agent-autoloop main@d1ec2d8e48de 均一致。Huhu 的 Core 产物锁是 0.1.19，派工用 hc 为 0.1.21。 |
| 编号、覆盖与依赖 | 按 source.md 的验收复选项取 ID，与任务正文及 plan 索引逐行比对。#4 为 51/51，#5 为 43/43。每个任务只在本计划索引出现一次。按索引提取依赖并展开父编号范围，51 个节点可拓扑排序，两项跨 Issue 整合共用运行证据。 |
| 路径、场景与用户确认 | 逐份解析 plan、spec、design、tasks 的相对链接，检查现有文件及 Markdown/HTML 锚点。两组索引、51 份任务、代码/测试和原型场景均可定位，各有 53 个带片段的链接通过检查。发布时另组确认记录的文件状态为#4 待 t15 发布、#5 待 t15 发布。用户确认仍待实际版本走查。 |
| 实施与验证边界 | 本轮为规划及静态核对。检索并取回 tabs、accessibility、forms、coordinate-global-events 指南以核对界面验收。真实 CLI、Core 故障注入、安装包、备份恢复与跨端旅程均列在各任务的未来验收。原型与浏览器走查由 t15 负责。 |

## 待决与接续

- #4 的四向落点、可找回原进程和当前视图不抢焦点均已明确。用户仍需选择目标消失后如何收纳进程，以及数据包是否包括纯布局快照。分别影响 W2.2 的展示与 W8.1 的布局备份边界。
- #5 尚需确定保存已启用规则的编辑后是否保持启用，以及 DST 缺口/重叠的墙钟输入如何处理。影响 T5.5 的提交提示、T4.1/T5.5 的输入和预览。停用/删除的队列语义已可据规格实施。
- 截至发布，用户尚未确认 HTML 版本。Lead 可据本报告验收 t16 的 Markdown 规划，按 t15 的报告核对原型、资源指纹与实际浏览器证据。

## Lead 验收

由外部 Lead 验收后追加。

- Lead 验收通过。核对 #4、#5 的任务与计划、两条原型记录及队列规则。追加的回执与恢复合同切片已纳入索引。复查全批 238 份任务和 408 条显式前置链接无环。
