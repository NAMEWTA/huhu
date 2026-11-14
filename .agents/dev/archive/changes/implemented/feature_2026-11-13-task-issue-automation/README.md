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

相关 change：[档案改为文件夹笔记（待澄清）](../feature_2026-11-13-archives-as-folder-notes/brief.md)，本 change 不依赖它。

后续阶段按需追加 `progress.md`（进展）与 `evidence.md`（命令、截图索引）。截图与测量结果放在 PR 中。

本规格取代归档规格 `archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/` 中任务、评论、自动化、能力授权相关的部分（见 spec §10）。归档文件本身不修改。

## 收尾记录（dev-archive，2026-11-14）

- **结果**：implemented（约定的实现范围已完成并有证据；规格自己把 B04c 列为“待验证，不阻塞交付”）。**类型**：feature。原路径 `.agents/dev/changes/2026-11-13-task-issue-automation`，归档后路径 `.agents/dev/archive/changes/implemented/feature_2026-11-13-task-issue-automation`。
- **已交付**：任务 schema 2、评论、权限分组、自动化三种动作（agent / terminal / reminder）、`@` 引用编辑器、等人工检测（独立会话路径）与任务上的“需要你操作”；终端动作经 agent-cli 在可见的 Herdr 会话里运行并清理含秘密的会话。证据：695 个单元测试、105 个 e2e（快照 `a49dac2092bd366ae959df03dd7f434318d07314`），真实 Herdr 0.1.19 的 B04a / B07 / C07 用例。
- **未交付 / 未验证**（详见 progress.md“与规格的偏差 / 未做”）：B04c——真实 claude / codex 是否上报 OSC 7501 未实测，真实 CLI 完整闭环未验证（只用假 CLI，没有授权用用户账号）；“任务关联的会话”（非独立会话）没有创建入口，只实现了独立会话路径；终端命令动作的运行不显示“等人工”（规格要求终端命令动作不建任务）；Windows / macOS 上的终端动作未验证；`terminal.rm` 失败不重试。
- **长期知识**：`.agents/dev/notes/context/tasks-and-automations.md`。

