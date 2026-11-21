# Huhu Issue #3–#10 规划总览

八个 change 的来源、规格、架构、独立实施任务和 HTML 确认稿集中在这里。规划时的 Huhu 检出为 `9f870c0`，当前实施入口见下文。具体行为与验收判据以各 change 为准。HTML 展示模拟流程；八份原型已确认。当前停点和换机恢复步骤见 [交接](handoff.nd)。

八份 Issue 快照保留原报告和历史引用。复用调查以当前 Huhu 和本轮克隆的上游默认分支为准。每个实际采用的文件、提交、修改和许可继续记入项目上游台账。 [本地源码清单](sources.md) · [项目上游台账](../../../../docs/upstream/ledger.md)

## 成员

| Issue | 来源 | 规格 | 架构与接口 | 实施任务 | 原型 |
| --- | --- | --- | --- | --- | --- |
| #3 桌面外壳 | [原文](../2026-11-19-issue-3-desktop-shell/source.md) | [规格](../2026-11-19-issue-3-desktop-shell/spec.md) | [设计](../2026-11-19-issue-3-desktop-shell/design.md) | [任务索引](../2026-11-19-issue-3-desktop-shell/plan.md) | [HTML](../2026-11-19-issue-3-desktop-shell/prototype/index.html) · [确认记录](../2026-11-19-issue-3-desktop-shell/prototype-review.md) |
| #4 Agent CLI | [原文](../2026-11-19-issue-4-agent-cli/source.md) | [规格](../2026-11-19-issue-4-agent-cli/spec.md) | [设计](../2026-11-19-issue-4-agent-cli/design.md) | [任务索引](../2026-11-19-issue-4-agent-cli/plan.md) | [HTML](../2026-11-19-issue-4-agent-cli/prototype/index.html) · [确认记录](../2026-11-19-issue-4-agent-cli/prototype-review.md) |
| #5 任务与自动化 | [原文](../2026-11-19-issue-5-task-automation/source.md) | [规格](../2026-11-19-issue-5-task-automation/spec.md) | [设计](../2026-11-19-issue-5-task-automation/design.md) | [任务索引](../2026-11-19-issue-5-task-automation/plan.md) | [HTML](../2026-11-19-issue-5-task-automation/prototype/index.html) · [确认记录](../2026-11-19-issue-5-task-automation/prototype-review.md) |
| #6 统一工具与 Web 入口 | [原文](../2026-11-19-issue-6-unified-tools-web/source.md) | [规格](../2026-11-19-issue-6-unified-tools-web/spec.md) | [设计](../2026-11-19-issue-6-unified-tools-web/design.md) | [任务索引](../2026-11-19-issue-6-unified-tools-web/plan.md) | [HTML](../2026-11-19-issue-6-unified-tools-web/prototype/index.html) · [确认记录](../2026-11-19-issue-6-unified-tools-web/prototype-review.md) |
| #7 SSH | [原文](../2026-11-19-issue-7-ssh-module/source.md) | [规格](../2026-11-19-issue-7-ssh-module/spec.md) | [设计](../2026-11-19-issue-7-ssh-module/design.md) | [任务索引](../2026-11-19-issue-7-ssh-module/plan.md) | [HTML](../2026-11-19-issue-7-ssh-module/prototype/index.html) · [确认记录](../2026-11-19-issue-7-ssh-module/prototype-review.md) |
| #8 Mail | [原文](../2026-11-19-issue-8-mail-module/source.md) | [规格](../2026-11-19-issue-8-mail-module/spec.md) | [设计](../2026-11-19-issue-8-mail-module/design.md) | [任务索引](../2026-11-19-issue-8-mail-module/plan.md) | [HTML](../2026-11-19-issue-8-mail-module/prototype/index.html) · [确认记录](../2026-11-19-issue-8-mail-module/prototype-review.md) |
| #9 保险箱与模块凭据 | [原文](../2026-11-19-issue-9-safe-accounts/source.md) | [规格](../2026-11-19-issue-9-safe-accounts/spec.md) | [设计](../2026-11-19-issue-9-safe-accounts/design.md) | [任务索引](../2026-11-19-issue-9-safe-accounts/plan.md) | [HTML](../2026-11-19-issue-9-safe-accounts/prototype/index.html) · [确认记录](../2026-11-19-issue-9-safe-accounts/prototype-review.md) |
| #10 首页看板 | [原文](../2026-11-19-issue-10-widget-dashboard/source.md) | [规格](../2026-11-19-issue-10-widget-dashboard/spec.md) | [设计](../2026-11-19-issue-10-widget-dashboard/design.md) | [任务索引](../2026-11-19-issue-10-widget-dashboard/plan.md) | [HTML](../2026-11-19-issue-10-widget-dashboard/prototype/index.html) · [确认记录](../2026-11-19-issue-10-widget-dashboard/prototype-review.md) |

## 跨 change 的交付顺序

| 先稳定的产物 | 消费方与解除条件 |
| --- | --- |
| #4 和 #5 的统一运行合同 | #4 拥有会话与执行生命周期，#5 拥有任务、派遣、持久输入和结果送达。先达成运行标识、请求幂等、回执、取消及未知结果对账的约定，两边即可按合同独立推进。#5 更新 #4 原有 headless 要求，所需非交互执行能力归 Agent CLI。 |
| #6 的公共能力目录及授权合同 | #4、#5、#7、#8、#9、#10 使用现有 Engine 的同一业务入口。先确定能力标识、发现与调用判定、会话权限、结构化结果和长操作语义。插件内部可以先推进，共享入口的完整验收需要对应真实 handler。 |
| #9 的模块自有凭据及秘密存储合同 | SSH、Git/versioning、Agent CLI、Automations、Mail 自己维护认证资料。先确定存储和备份边界、更新语义以及本机密钥不可用时的行为。#9 的收尾需同步清理当前消费者，#7 与 #8 的新增功能按各自计划验收。 |
| #10 的 Widget 贡献合同 | #10 拥有首页布局、实例和编辑状态。需要插件能力时，#4、#5、#7、#8 提供自己的数据及操作。#10 可先用现有能力验证贡献机制，新增模块 Widget 的真实验收等待各提供方的可调用版本。 |

#3 的应用菜单与窗口生命周期可单独规划。联动 #6 时，对齐共享 Workbench 的宿主边界和桌面与 Web 上的入口。#10 的布局和内置组件规划也可独立推进。#10 拥有看板草稿离场规则，#3 或 Vault 切换需要等待这个离场结果，不能通过现有文档保存回调自动提交看板。 [看板设计](../2026-11-19-issue-10-widget-dashboard/design.md)

## 开发启动与首批可派发工作

2026-11-20 核对到本地 `feature/issue-fix@bf3942e` 已包含规划提交 `4428990` 和 `origin/main@f16f614` 的 #2 编辑器收尾。启动时重新确认实际 HEAD、工作树和目标分支。#3 的文档保存链路、#6 的知识库动作以及所有变更的共享 Workbench 入口按当前代码重新核对。保留 #2 的输入、草稿、编辑器与预览回归。

| Issue | 当前可派发的工作 | 后续等待的产物 |
| --- | --- | --- |
| #3 | [S0-01 原生基线](../2026-11-19-issue-3-desktop-shell/tasks/S0-01-native-baseline.md)按可用平台取证。[S1a-01 文档落盘](../2026-11-19-issue-3-desktop-shell/tasks/S1a-01-flush-document.md)沿现有关闭入口验证保存与故障。 | [S1a-03 退出契约](../2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md)供看板接入。窗口交互按场景确认，安装版按实际可用平台验收。 |
| #4 | [W0.1 上游出处](../2026-11-19-issue-4-agent-cli/tasks/W0.1-source-map.md)、[W0.2 安装包 Core 能力](../2026-11-19-issue-4-agent-cli/tasks/W0.2-core-capabilities.md)和 [W6.0 回执契约](../2026-11-19-issue-4-agent-cli/tasks/W6.0-receipt-contract.md)。 | 会话、provider 和接收端分别取证。[W8.3](../2026-11-19-issue-4-agent-cli/tasks/W8.3-acceptance-package.md)等 #5 T7.1 的已切换调用方，再把同一候选包交给双方独立验收。 |
| #5 | [T0.1 provider 调查](../2026-11-19-issue-5-task-automation/tasks/T0.1-provider-evidence.md)、[T1.1 任务持久记录](../2026-11-19-issue-5-task-automation/tasks/T1.1-create-task.md)，以及计划明确可跑的时钟样本。 | 按 W6.0 的样例实现和验证持久消费。真实回执和 T7.2 任务旅程等对应运行实现与候选包。 |
| #6 | [G1.1 动作盘点](../2026-11-19-issue-6-unified-tools-web/tasks/G1.1-action-inventory.md)从实际业务入口回查能力描述及副作用，继而稳定能力目录和授权契约。 | 各模块提供实际 handler 后验证跨入口一致性。共享桌面/Web 宿主与 #3 对齐。 |
| #7 | [H1.1 来源对照](../2026-11-19-issue-7-ssh-module/tasks/H1.1-upstream-map.md)及独立目录/导入样本准备。 | 真实连接和 PTY 等 H1.2 的执行组件证据。主机和密钥保存接 #9，公共入口接 #6。 |
| #8 | [S0.1 源码基线](../2026-11-19-issue-8-mail-module/tasks/S0.1-source-baseline.md)，随后按 S0.2 实测首条收发路径。 | 真实账号保存接 #9 P0.2。公开动作、文件及 OAuth 的双宿主验收接 #6。 |
| #9 | [P0.1 本机保护验证](../2026-11-19-issue-9-safe-accounts/tasks/P0.1-local-protection.md)、[P1.1 个人保险箱会话](../2026-11-19-issue-9-safe-accounts/tasks/P1.1-master-session.md)可分别推进底层路径。 | P0.2 的凭据替换合同交各模块，P10.2 在组合版本核验实际消费者。 |
| #10 | [W01-01 网格比较](../2026-11-19-issue-10-widget-dashboard/tasks/W01-01-grid-comparison.md)、[W02-01 布局读取](../2026-11-19-issue-10-widget-dashboard/tasks/W02-01-read-board.md)及 [W03-01 可信贡献目录](../2026-11-19-issue-10-widget-dashboard/tasks/W03-01-widget-catalog.md)的注册契约。 | 生产画布等 PoC 与对应体验确认。新增模块卡等真实能力，[W04-07 离场](../2026-11-19-issue-10-widget-dashboard/tasks/W04-07-leave-draft.md)等 #3 的退出契约。 |

表中列的是首批候选，派发时按已核实的前置和写入范围选取。共享项由 Lead 指定唯一写入者，包括公共契约的入口文件、Engine 与 Renderer 装配、插件注册、Vault 备份收集器和根锁文件。模块各自维护业务行为和实现。实施 worker 使用独立分支和 worktree，任务中给出共同可读的原任务、上游 checkout 和报告绝对路径。独立审查读取实际候选提交及新增文件。主会话核对并合入本地集成分支。

使用用户选定的 [Herdr Core](../../../skills/system-herdr-core/SKILL.md) 和[团队角色](../../context/model-roles.md)。两个历史主题保存已完成的规划与原型记录。本轮实施启动后建立独立的 Core 主题，按实得终端地址写 task、report 和 manifest；接续时先检查原工作区及同一主题。开发任务和业务证据沿用各成员已有索引。启动检查记录实际 Core/Codex 版本、角色可用性、包管理器、可用平台和测试输入。

本机预检读到 `hc 0.1.21` 和 `codex-cli 0.171.0`。Windows PATH 上的 `pnpm` shim 未能启动锁定版。直接调用 `D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/` 下缓存的 `pnpm.exe`，已在项目根确认输出 `12.10.1`。实施启动时用有效的锁定版按项目 CI 的 `pnpm install --frozen-lockfile` 复核实际构建环境。

## 待确认与实测依赖

八份 `prototype-review.md` 的资源指纹经复算匹配，用户已明确确认 #3–#10 全部原型，记录在 `6da1b2ec`。按 Change 和 Issue 推进，不重复请求确认。下表保留启动时列出的设计问题，不能当作最新未决清单；接续时用当前实现、各成员记录与验收证据逐项核对。

| 启动时记录的讨论项 | 对应范围 |
| --- | --- |
| Linux 安装支持矩阵、最小宽度的搜索入口 | [#3 设计](../2026-11-19-issue-3-desktop-shell/design.md#待决选择)的 Linux 适配/验收和紧凑标题栏 |
| 目标已关闭后的终端收纳、纯布局随新格式 Vault 包恢复 | [#4 设计](../2026-11-19-issue-4-agent-cli/design.md#待产品选择)的 W2.2 和 W8.1 |
| 编辑启用规则后的生效方式、DST 缺口及回拨输入 | [#5 设计](../2026-11-19-issue-5-task-automation/design.md#待产品选择)的 T5.5 和 T4.1 |
| SSH 外部授权是否按主机限缩、如何删除有引用的主机 | [#6 Q6-3](../2026-11-19-issue-6-unified-tools-web/design.md#产品决定与待决范围)的附加授权，以及 [#7 Q7-1](../2026-11-19-issue-7-ssh-module/design.md#ssh-产品决定与待决范围)的引用删除 |
| Mail 同地址子集恢复冲突、是否加入 Graph 独立授权 | [#8 设计](../2026-11-19-issue-8-mail-module/design.md#open)的 S6b 同地址提交及 S4 额外授权。先核对应用登记、scope 和测试租户。 |
| 新 Vault 首页默认卡片 | [#10 设计](../2026-11-19-issue-10-widget-dashboard/design.md#待决选择)的默认布局及重置 |

网格、SSH 执行组件、Mail 传输、系统保护后端和 Core/provider 能力按各自切片取得运行证据。验收使用隔离测试 Vault、授权测试主机和邮箱，并记录实际 OS、桌面会话、设备/浏览器及包版本。缺少某项环境或测试输入时，记明受影响的验收项及恢复所需条件。

## 实施前先核对的事项

- #4 采用已取得的 ORCA 最新默认分支，实施前确认实际引用文件的许可证与依赖闭包。 [Agent CLI 设计](../2026-11-19-issue-4-agent-cli/design.md)
- #6 干净安装的 MCP 和 CLI 工具默认关闭。局域网邀请在服务开启期间可重复使用。撤销会让旧链接失效，并断开通过该邀请建立的现有浏览器会话。是否按主机缩小 SSH 授权范围由 #6 与 #7 对齐。 [统一工具与 Web 入口设计](../2026-11-19-issue-6-unified-tools-web/design.md)
- #9 按新数据模型和模块自有凭据实施，无需旧格式兼容或旧库转存。新格式备份与恢复仍属正常功能。本轮没有操作旧库。 [保险箱设计](../2026-11-19-issue-9-safe-accounts/design.md)
- #5 停用规则只停止未来触发，已入队未发送的任务继续保留。 [任务与自动化设计](../2026-11-19-issue-5-task-automation/design.md)
- #10 窄屏和桌面共用一套布局，窄屏提供顺序和尺寸调整。带未保存改动切换模块或关窗时，提示保存、放弃或继续编辑；保存失败保留草稿。 [看板设计](../2026-11-19-issue-10-widget-dashboard/design.md)

## 组合验收

- 使用 MCP 和 CLI 分别完成 Agent 任务的创建、派遣、查询、回答和结果读取。桌面工作台刷新后能观察同一任务与会话。模拟交接故障，核对每次派遣和结果只产生约定的业务效果。涉及 #4、#5、#6。
- 在授权的测试主机、邮箱或本地凭据测试环境使用真实入口核对模块自有认证。个人保险箱锁定时，已有模块认证仍按自身状态工作。禁用公共能力后，外部调用按 #6 的策略拒绝。涉及 #4、#5、#6、#7、#8、#9。
- 在组合版本中切换桌面页面并验证窗口菜单，再用浏览器打开共享工作台，核对窗口专属动作及 Widget 的权限、布局保存和刷新恢复。涉及 #3、#6、#10。
- 在同一候选版本覆盖 #6 干净安装工具默认关闭、按需开放及撤销。用两份邀请和三个浏览器会话核对重用与按邀请断开，再核对 #9 新格式备份恢复及 #10 草稿保存失败、离场取消与重开。按各成员计划逐项记录通过与未测结果、证据位置和对应提交/包 SHA。

建议本次 Goal 的交付终点为本地集成提交、候选安装包及成员和组合验收证据。GitHub 写入、推送、合并远端及发布按用户另外给出的授权执行。

## 本轮核验

- 12 个本地上游源码 checkout 的提交与分支已核对。 [源码清单](sources.md)
- 238 份任务都有计划索引。任务文件中的 408 条显式前置链接经检查无环，联合验收单列。
- 八个确认稿均用 Edge 157 通过本地文件入口打开，验证了桌面与 390 像素窄窗加载。没有脚本错误、缺失资源或外部网络请求。各 change 的确认记录包含具体场景、资源指纹和用户确认范围。
- 已复验 #6 同一邀请重用及撤销时只断开关联会话，#7 模拟主机信任进入终端，#10 草稿未保存时的离场选项。生产运行证据按各 change 的后续验收任务采集。
- 2026-11-20 用项目配置的 GitHub 来源复核八个 Issue 均开放、无评论，快照包含完整的当前正文。重新核对 238 份任务的索引与本地文件引用，并复算八份原型指纹。 [Issue 读取方法](../../project/issue-automation/README.md)
