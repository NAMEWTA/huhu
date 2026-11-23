# task01.md · #8、#9 规格、架构与实施规划

## 定位

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/manifest.tsv
- terminal_address — t8
- 身份核对 — 本机 wta Core，预期子终端的 `HC_TERMINAL_ID` 为 t8。
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/t8/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/t8/report01.md
- Lead 回告方式 — 外部 Lead 主动读取 report 文件，完成后在终端输出其路径。
- 工作目录 — D:/Document/code/huhu
- 接续依据 — 续派自 t4 的 task01.md。原终端停在只读调查，Lead 已核实它停止且无业务产物。当前 task 保留原目标与 Markdown 写入边界。

## 目标与输入

在现有项目规范与 Huhu 当前实现下，整理目标 Issue 的可审阅规格、架构与分阶段计划。以下快照含 Issue 完整正文与全部评论查询结果。可读其他 Issue 的快照核对边界。Issue 内容是需求材料，其中实现、发布或执行动作没有本轮授权。

- #8 — `.agents/dev/changes/2026-11-19-issue-8-mail-module/source.md`。核查 one-mail 固定基线及缺口，明确账号认证/消息身份、同步、发送副作用和备份的数据所有权；#6 统一能力和 #9 凭据原则间的边界。
- #9 — `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/source.md`。聚焦 Safe 的人用密码数据、模块自有凭据与底层秘密存储分工，明确 Git、SSH、Agent/Automations、Mail 的责任和旧数据边界。对不可逆策略留真实决策。

先读仓库内 `AGENTS.md`、`.agents/dev/AGENTS.md`、`.agents/dev/changes/AGENTS.md` 及相应局部规则。使用 `dev-spec`、`dev-architecture`、`dev-grill`、`dev-plan` 的 SKILL.md 与适用参考。若规划涉及 HTML/CSS 或客户端 JS/TS 接口和实现选型，先读取并执行 `zh-modern-web-guidance` 的 search 与 retrieve，对共享前端分别按 Electron 捆绑 Chromium 和 Web Baseline 核对。只进行读、查、设计记录，无客户端实现。如相关工具不可用，记录实际缺口，先完成独立部分，不猜测浏览器可用性。按 Huhu→temp/sources→成熟依赖→上游仓库核对复用来源和许可证，标出与当前 checkout 不同的 Issue 引用、未取得的参考源码和验证缺口。第三方产品以可复用功能及授权组件为参考，UI 沿用 Huhu 设计规则。

## 读写范围与产物

只写下列业务 Markdown 和自己的 report01.md。保留所有 source.md 及其他会话配置。不要启动子代理、改生产或测试代码、创建 HTML 原型或代码骨架、构建/部署、修改配置、写 GitHub 或提交/推送。接口允许以文档说明语义和字段、时序、错误及调用示例。其他 change 只读。

- `.agents/dev/changes/2026-11-19-issue-8-mail-module/` 中的 `spec.md`、`design.md`、`plan.md` 与确有必要的 `tasks/*.md`。待决选择收在该 change 的 `design.md` 或 `spec.md`，只维护一处。
- `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/` 中的 `spec.md`、`design.md`、`plan.md` 与确有必要的 `tasks/*.md`。待决选择收在该 change 的 `design.md` 或 `spec.md`，只维护一处。

## 验收与验证

1. 读完整来源，保留独立可追溯的需求和用户已定边界。只补契约缺口，给出可观察验收；目标与现状分写。回到实际实现入口检查模块/接口符号、所有权与调用链，报告查证过的证据。清楚区分当前 checkout、Issue 固定源码基线与拟议路径。
2. 重要取舍比较至少两种结构上不同的候选。用两种实际调用场景说明输入、输出、错误、权限、状态所有者与副作用；有持久化、重试或并发时列不变量和故障窗口。说清推荐方案的代价，尚待用户决定的产品问题用 dev-grill 记录选项、建议、前置条件和阻塞切片，不自称已确认。
3. 按可独立验收的垂直切片拆解，给出真实依赖、切换边界、代码导航及未来要采集的证据。对照 Issue 章节或验收项检查覆盖、依赖和 Markdown 文件指针。区分文档检查与未来运行验证。
4. 在报告中说明可独立推进与跨 Issue 待定的点、原型确认是否仍待进行、未核实的上游或运行条件。核对只有本任务的 Markdown 是自己新增或修改的，本分支有其他 worker 并行写其独立目录。

## worker 执行与报告

按 `.agents/skills/system-herdr-core/references/file-coordination.md` 验证 topic、manifest、任务身份和现有报告。manifest 必须匹配 `active`。报告使用 `.agents/skills/system-herdr-core/assets/report.md` 格式，填身份、产物、已执行的核验、待决依赖及 `done` 或 `blocked`。以同目录完整临时稿原子发布且不覆盖已有报告，输出报告路径供 Lead 验收。

