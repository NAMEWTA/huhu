# Huhu Issue #3–#10 规划总览

八个 change 的来源、规格、架构、独立实施任务和 HTML 确认稿集中在这里。规划起点为 `feature/issue-fix@9f870c0`。具体行为与验收判据以各 change 为准。八份 HTML 原型已确认，确认记录见 `6da1b2ec`。后续推进从[集成进度](#集成进度)继续。 [首批实施与换机记录](handoff.nd)

八份 Issue 快照保留原报告和历史引用。复用调查以当前 Huhu 和本轮克隆的上游默认分支为准。每个实际采用的文件、提交、修改和许可继续记入项目上游台账。 [本地源码清单](sources.md) · [项目上游台账](../../../../docs/upstream/ledger.md)

## 2026-11-22 当前范围

用户已明确暂缓 #7 SSH，继续 #3–#6、#8–#10。SSH 已有实现与未提交局部处理保存为独立分支 `impl/huhu-issues-3-10-ssh-deferred`，快照 `45b9fae3e13cab49ad3dd0d62c51a52133bfcc56`，保留完整 change 和暂停说明。旧 SSH 证据仅描述当时已测范围，不代表暂停候选已验收。恢复工作已完成，不再重复执行。

当前源码组合在 `f310e541` 的 Agent／Tasks 五项联验通过；Web 邀请一项、Mail／Safe 新格式恢复两项和真实系统钥匙串一项通过。日志位于 `temp/issue-evidence/huhu-2026-11-22/agent-tasks-combined-linux.log` 与 `web-mail-safe-combined-linux.log`。最终共同包仍待构建与实际验收。独立审查发现候选制品与运行程序绑定不足、T7.2 收件前停用及一次 ACK 丢失顺序缺证、Mail 同地址子集恢复缺显式独立账号选项，正在补齐。三项均不得以现有绿灯代签。

后续候选 `f19affac` 已补 Mail 同地址独立恢复，`outbox-engine.test.ts` 的 12 项实测通过，Mail 定向类型检查通过；日志为 `temp/issue-evidence/huhu-2026-11-22/mail-separate-restore-check.log`。包身份与回执读数复审修复在 `4e767f2e`，四个 E2E 文件的定向类型检查及两项收件回归通过。实际 UI 与最终包仍待验。

原规格核对确认 #4 Linux Agent 环境与 #5 Linux 已批准终端规则外部执行缺正向路径，并无用户批准的 Windows 专用豁免。分别由 HC `t86/task01.md` 和 `t4x/task13.md` 实施。T7.2 已改为在临时规则的固定偏移时区内跨越真实午夜，按 Engine 创建日期、次日计划时间与唯一在线发生断言；源码调度时钟测试通过，仍待最终包实跑。

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

## 集成进度

- 2026-11-22 Linux 在 `resume-linux` 保留 `cc671b5f` 与 `53e516ca` 的恢复检查点。当前实施位于 `temp/issue-worktrees/integration`。#7 候选已合为 `ade79b58`，通过合并回归。SSH 接线已有 Engine 和 Linux 本地 PTY 定向证据。桌面工作台与 CLI/MCP 的串联验收待运行。 [#7 合并与接线证据](../2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md#lead-合并与接线)
- 已核对 GitHub 的 #3–#10 正文与本地快照一致，八项仍开放且没有新评论。#7 接线候选 `690e9097` 的规格和规范审查已完成，先修复外部草稿试连、Unix 套接字权限、布局和录制。录制回放集成提交为 `67d1f008`。#7 的桌面工作台、其他新增公开能力及异常资源回收仍按成员规格验收。 [#7 当前证据](../2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md)
- #5 T7.1 已在 `690e9097` 按 HTTP Engine 复验两项，旧监督记录保留原字节，生产派遣与抽屉查询由 Tasks 处理。W8.3 安装候选和 W8.2、T7.2 的独立签收仍待共同制品。 [T7.1 复验](../2026-11-19-issue-5-task-automation/evidence/T7-cutover-linux.md#集成版本复查)
- #7 外部工作区换栏与关栏在 `f2159c2e` 通过 CLI/HTTP MCP 定向回归。Linux PTY 已分别从随包路径和 PATH 验证重挂、Web 隔离及 SSH 停用回收。快捷文本按终端模式校验并逐分栏回报。 [定向证据](../2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md#快捷文本core-路径及外部布局)
- #4/#5 已核验真实 Codex 0.170.0 的锁定指纹。在 Linux 下，原生 Core 新会话和原会话问答两项通过。定时任务的安装包 E2E 已采用独立 HOME 和回环夹具，待共同包。 [原生夹具](../2026-11-19-issue-5-task-automation/evidence/T7-cutover-linux.md#t72-原生夹具复查)
- #3/#6/#10 已核对桌面菜单、看板离场、Web 邀请和布局持久化现有入口。Web 分享界面默认局域网，服务由用户启动。`891ddd8a` 区分正文写入、恢复草稿和保存结果待确认。文档会话 35 项通过。真实菜单、三会话与关窗组合待固定候选实跑。 [#3 证据](../2026-11-19-issue-3-desktop-shell/evidence/S1a-03-quit-coalescing.md#linux-集成关窗反馈)
- #7 已用 Linux OpenSSH 验证 Ed25519 用户证书及主机 CA。主机证书握手、重协商、错误 CA 和已撤销叶钥通过定向测试。批量路由已有工作台能力、整批 CAS 和提交前取消证据。SSH 私有 Core 的回收待核对反馈、握手取消及外部布局原回执均已完成定向复查。跨窗口仍需在真实工作台验证。 [#7 后续集成复验](../2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md#后续集成复验)
- #7 工具栏与首段出站代理已合入。`31352cae` 的 SOCKS5、HTTP CONNECT 回环传输及 CLI/HTTP MCP 三跳连接通过。首段代理的工作台实际操作与其他中继合同待验证。 [#7 后续集成复验](../2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md#后续集成复验)
- #7 `feddafd8` 接通快捷文本库、搜索、分组排序与分栏预览。CLI 和 HTTP MCP 的默认关闭、逐项授权和撤销均通过，浏览器与桌面真实交互待执行。 [#7 后续集成复验](../2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md#后续集成复验)
- #6/#8/#9 在 `46987e71` 从同一合成源 Vault 分别经过 CLI 和 HTTP MCP，验证默认关闭、授权和撤销、Safe 锁定时 Mail 仍可通过 IMAP 认证，以及新格式数据包恢复。外部导出已收录所需的 Mail/SSH 可移植定义，恢复前校验 Safe 与 Mail 附件完整性。固定安装包联验待执行。 [权限与凭据复验](../2026-11-19-issue-9-safe-accounts/evidence/P3.4-P10-linux.md#同一源-vault-联验)
- #4 与 #5 以 W8.3 共同候选分别验证 W8.2 与 T7.2。#6 和 #9 在模块凭据与授权联验中汇合。#3 与 #10 在关窗和草稿离场路径汇合。
- 最终检查在固定组合提交上串行执行，全部改动合入 `main` 后运行一次全量 E2E，收尾时生成并检查候选包。逐 Issue 按实际 SHA、平台和观察结果记录通过、失败、跳过及未运行。

## 实施与验证分工

Lead 持有公共契约入口、Engine 与 Renderer 装配、插件登记、Vault 备份收集器和根锁文件。各实施者按 Herdr Core 任务所列范围修改业务代码及用例，定向验证使用单个 Vitest 文件。固定候选的重型验证、E2E 和打包由 Lead 串行运行。 [项目指令](../../../../AGENTS.md) · [角色配置](../../context/model-roles.md)

## 实施前先核对的事项

- #4 采用已取得的 ORCA 最新默认分支，实施前确认实际引用文件的许可证与依赖闭包。 [Agent CLI 设计](../2026-11-19-issue-4-agent-cli/design.md)
- #6 干净安装的 MCP 和 CLI 工具默认关闭。局域网邀请在服务开启期间可重复使用。撤销会让旧链接失效，并断开通过该邀请建立的现有浏览器会话。是否按主机缩小 SSH 授权范围由 #6 与 #7 对齐。 [统一工具与 Web 入口设计](../2026-11-19-issue-6-unified-tools-web/design.md)
- #9 按新数据模型和模块自有凭据实施，无需旧格式兼容或旧库转存。新格式备份与恢复仍属正常功能。本轮没有操作旧库。 [保险箱设计](../2026-11-19-issue-9-safe-accounts/design.md)
- #5 停用规则只停止未来触发，已入队未发送的任务继续保留。 [任务与自动化设计](../2026-11-19-issue-5-task-automation/design.md)
- #10 窄屏和桌面共用一套布局，窄屏提供顺序和尺寸调整。带未保存改动切换模块或关窗时，提示保存、放弃或继续编辑；保存失败保留草稿。 [看板设计](../2026-11-19-issue-10-widget-dashboard/design.md)

## 实施者与验证分工

实施者（Codex worker）只编写代码和对应的 E2E 用例，只跑自己改动涉及的单个 vitest 文件。E2E 用例只写不跑，打包、全量测试、全仓 typecheck/lint/knip 一律不在 worker 内执行；报告单列“未运行的验证”。这些重型验证由 Lead 在固定候选提交上串行执行（同一时刻仅一份，见 AGENTS.md「实施者职责边界」）。

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
