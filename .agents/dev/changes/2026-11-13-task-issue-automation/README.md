# Change：任务 Issue 化、三类自动化与统一能力复用

- **来源**：[GitHub Issue #1](https://github.com/NAMEWTA/huhu/issues/1)（快照：[source-issue-1.md](source-issue-1.md)）+ 2026-11-13 dev-grill 用户决定
- **状态**：**实现完成，未归档**（见文末“收尾状态”）。规格 / 计划 / 复用核对 / 八个切片见下表；进度与偏差见 [progress.md](progress.md)。
- **基线**：HEAD `8283c5c`（2026-11-13）

| 文件 | 内容 | 权威性 |
| --- | --- | --- |
| [brief.md](brief.md) | 用户目标、来源、当前代码事实、范围与非目标 | 背景 |
| [spec.md](spec.md) | 行为契约、能力变化、验收清单、决策 TD-01…TD-14 | **唯一权威** |
| [plan.md](plan.md) | 切片索引、依赖图、并行规则、规格覆盖、风险 | 执行顺序 |
| [tasks/](tasks/) | T01a–T07 单切片交接文件：规格范围、代码指针、实施要点、验收与证据 | 实施入口 |
| [s0-findings.md](s0-findings.md) | S0 核实的外部事实、仓库现状、全部使用方、与归档的关系 | 事实依据 |
| [reuse.md](reuse.md) | 各缺口的复用结论（R-T01…R-T13） | 复用证据 |
| [source-issue-1.md](source-issue-1.md) | Issue 原文快照 | 只读来源 |

相关 change：[档案改为文件夹笔记（待澄清）](../../archive/changes/implemented/feature_2026-11-13-archives-as-folder-notes/brief.md)，本 change 不依赖它。

后续阶段按需追加 `progress.md`（进展）与 `evidence.md`（命令、截图索引）。截图与测量结果放在 PR 中。

本规格取代归档规格 `archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/` 中任务、评论、自动化、能力授权相关的部分（见 spec §10）。归档文件本身不修改。

## 收尾状态（2026-11-14）

**实现完成，未归档。**任务 schema 2、自动化三种动作、等人工检测、终端动作（经 agent-cli）均已实现并通过单元 / e2e（快照 `a49dac2092bd366ae959df03dd7f434318d07314`：695 个单元测试、105 个 e2e 通过）。以下规格要求没有做到或没有验证，因此保留在 `changes/`，等用户决定“接受缩减范围后归档”或安排后续：
- B04c：真实 claude / codex 是否上报 OSC 7501 未实测；真实 CLI 的完整闭环未验证（只用假 CLI + 真实 Herdr 0.1.19）。
- “任务关联的会话”没有创建入口，只实现了独立会话路径；终端命令动作的运行不显示“等人工”。
- Windows / macOS 上的终端动作未验证。
详见 [progress.md](progress.md)“与规格的偏差 / 未做”。长期知识：`.agents/dev/notes/context/tasks-and-automations.md`。
