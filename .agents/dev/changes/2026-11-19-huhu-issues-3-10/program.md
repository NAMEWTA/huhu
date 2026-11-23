# Huhu Issue #3–#10 规划总览

八个 change 的来源、规格、架构、独立实施任务和 HTML 确认稿集中在这里。规划起点为 `feature/issue-fix@9f870c0`。具体行为与验收判据以各 change 为准。八份 HTML 原型已确认，确认记录见 `6da1b2ec`。后续推进从[集成进度](#集成进度)继续。 [首批实施与换机记录](handoff.nd)

八份 Issue 快照保留原报告和历史引用。复用调查以当前 Huhu 和本轮克隆的上游默认分支为准。每个实际采用的文件、提交、修改和许可继续记入项目上游台账。 [本地源码清单](sources.md) · [项目上游台账](../../../../docs/upstream/ledger.md)

## 当前交付状态（2026-11-23，收尾补缺）

本节优先于下方按时间保留的历史进度。已核对远端 `main` 与 `feature/issue-fix` 同为 `5ea79f717baf81795566558f6f117f27d381aa17`。当前未提交补充为 Agent 当前标签收纳、纯布局备份恢复、Claude/Codex 历史恢复与分支，以及用户定案的 Graph 旧信回流通知规则。

- 纯布局恢复及导入副本隔离：真实 Core 单文件 6/6；启动页和另一 Vault 的设置页均生成独立身份，首次保存不影响源布局或原终端。安装包新增入口待固定组合验证。
- Graph：完整真实 Engine 回归 16/16，覆盖首扫窗口外旧信、旧信回流、部分状态更新与较早新信的跨重启分类；独审已关闭全部具体分类发现；线上邮箱仍由用户后续测试。
- Claude/Codex：官方 Codex 0.170.0 与实际 Volta 0.171.0 本地 stdio 分支及重开恢复通过；完整会话回归 60/60。独审已关闭 Volta 入口问题，Windows TOML 引号参数兼容也已独审关闭，真实 UI 待固定组合验证。
- 其他非 SSH 已验证路径沿用下方有效证据；新组合仍需串行补齐受影响联验。

#7 SSH 按用户要求暂停，已开发代码和 change 保留。跨设备、其他平台、线上账号及真实 OS 输入法由用户后续自行测试；这些未运行验证不再阻塞本轮实现交付，也不记为通过。本轮不部署、不发布、不关闭 Issue。

以下内容为历史过程记录，其中旧的“未完成”“待决定”和远端 SHA 仅描述当时状态。

## 2026-11-23 分段诊断收口

da645ee8 的任务结果显示及三项性能真实通过；插件单项诊断279ms、RSS341MiB通过但前轮472ms仍保留。能力目录约14MB、95%为重复展开schema，工作台仅用名称，正在增加实时授权的名称投影，保留完整接口。终端20秒尾标仍缺，随后Core独立读取有尾标；尚不能确认Core完成时刻或瓶颈，先做独立attach诊断。新增诊断独审通过，附件失败/取消与清理已隔离。最终共同包/main落地未完成，SSH继续暂停。

## 2026-11-23 查询洪流收口

已推送查询合并修复 `a97ece84`，29项单测、Workbench类型和独审通过。Tasks回执与结果显示修复已保存。终端性能夹具独立清理预算和取消边界已完成，真实普通失败及5秒总超时后Core/目录清理均通过；隔离HOME继承Volta shim导致的递归探测已通过限定runner PATH消除。纠正环境后旧4a应用20秒尾标缺失，保留为失败，进入新组合构建定向复验。main仍4ae7e7e4，SSH暂停，最终包和整批验收未完成。

## 2026-11-23 4a54f0a9 定向 UI 复验

已推送并构建 `4a54f0a9`，main仍为`4ae7e7e4`。同一应用构建的定向复验：原失败集3通过/8失败；Notes31通过/1启动失败（随后单项通过，未证明间歇问题修复）；Mail13项全部通过，但包装命令另有临时目录清理错误。已保全每组产物。任务投递即时唤醒回归已复现两条红灯，性能正在按真实耗时分段定位；不用放宽阈值或旧包替代最终验收。详见[收尾证据](evidence/linux-final-acceptance.md)。SSH仍暂停，Graph新信通知语义待用户决定，最终包与main落地未完成。

## 2026-11-23 04:33 联验返工

远端候选最后核对为 `feature/issue-fix=c0870297c816f9205d264f00d209399a8c5f54e8`，`main=4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。旧 05a 候选在 agent-linux 工作树和 AppImage 中保持固定。后续修复位于 integration 的 `impl/huhu-acceptance-followup`；索引、Agent/Gateway 和验收夹具三笔提交已推送，Notes 保存事件修复已完成最后独审并提交，进入固定组合构建。

旧包联验已定位并修正测试夹具的 Engine 身份观察、关闭后的 PID 读取、模板用例的 Codex 检测配置及 CLI/MCP 意图参数。T7.2 完整任务旅程、D09 同任务桌面/Web 联验分别诊断通过。真实 Web 保存后桌面不刷新是产品缺陷：路径事件缺失与迟到自身通知误报已修复并通过定向回归，Agent 删除未知审查意见恢复、索引大小写改名及暂扣创建/轮询交叉已通过独审，索引与监听 30 项回归通过。Notes 跨重载自身通知返工 93 项通过，独立反例关闭核对通过；实际新构建待验。此前失败或未执行的定向场景继续串行验证；不重复已运行的全量套件。

以上旧包诊断、未提交源码回归和最终组合验收分别记录。最终提交、共同包、逐 Issue 签收及 main 落地尚未完成；SSH 仍暂停。详见 [Linux 收尾记录](evidence/linux-final-acceptance.md)。

## 2026-11-23 首轮收尾位置（历史）

当前源码候选固定于 `80db95d0`，包含 Mail `25f5866b`、Notes保存对账 `ce3a3b7b` 和草稿记录身份修复。此前远端已核对 `feature/issue-fix=9252eeeab04a59402d8c1129a35cd84e587d4c6b`、`main=4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`；本轮后续推送以实际 ls-remote 输出为准。

Notes完整会话83项、真实Engine能力单文件11项、Notes与差异E2E类型、四文件格式/lint通过。t152/task04确认草稿跨工作台替换与真实读取失败两项关闭，未发现本次直接回归。Mail OAuth9项/Outbox20项与类型、差异lint通过，权限历史提示和实际重试E2E已补齐；真实工作台仍待验。画板45项DOM与vendor类型通过，1556文件上游重放零差异；HTML源码与8MiB保存上限定向通过。

进入固定组合的串行收尾门禁与构建。原 integration rc.4 包只代表旧main。一次全量E2E已运行，351通过、48失败、18跳过及6项测试外错误；后续只复验原非SSH失败集和新增受影响场景，不重复全量。最终包、三组联验和逐Issue验收尚未完成，Graph新信通知的产品口径仍待用户答复。完整证据见 [Linux收尾记录](evidence/linux-final-acceptance.md)。

SSH保持暂停，已有远端快照和change保留。未授权部署或发布。源码通过、固定组合门禁通过、真实界面与安装包验收分别记录。

## 2026-11-22 当前范围

用户已明确暂缓 #7 SSH，继续 #3–#6、#8–#10。SSH 已有实现与未提交局部处理保存为独立分支 `impl/huhu-issues-3-10-ssh-deferred`，快照 `45b9fae3e13cab49ad3dd0d62c51a52133bfcc56`，保留完整 change 和暂停说明。旧 SSH 证据仅描述当时已测范围，不代表暂停候选已验收。恢复工作已完成，不再重复执行。

当前源码组合在 `f310e541` 的 Agent／Tasks 五项联验通过；Web 邀请一项、Mail／Safe 新格式恢复两项和真实系统钥匙串一项通过。日志位于 `temp/issue-evidence/huhu-2026-11-22/agent-tasks-combined-linux.log` 与 `web-mail-safe-combined-linux.log`。最终共同包仍待构建与实际验收。独立审查发现候选制品与运行程序绑定不足、T7.2 收件前停用及一次 ACK 丢失顺序缺证、Mail 同地址子集恢复缺显式独立账号选项，正在补齐。三项均不得以现有绿灯代签。

后续候选 `f19affac` 已补 Mail 同地址独立恢复，`outbox-engine.test.ts` 的 12 项实测通过，Mail 定向类型检查通过；日志为 `temp/issue-evidence/huhu-2026-11-22/mail-separate-restore-check.log`。包身份与回执读数复审修复在 `4e767f2e`，四个 E2E 文件的定向类型检查及两项收件回归通过。实际 UI 与最终包仍待验。

原规格核对确认 #4 Linux Agent 环境与 #5 Linux 已批准终端规则外部执行缺正向路径，并无用户批准的 Windows 专用豁免。分别由 HC `t86/task01.md` 和 `t4x/task13.md` 实施。T7.2 已改为在临时规则的固定偏移时区内跨越真实午夜，按 Engine 创建日期、次日计划时间与唯一在线发生断言；源码调度时钟测试通过，仍待最终包实跑。

Linux 终端批准候选已于 `fc38dc86` 合入集成，绑定系统 sh 的规范映像与参数。Lead 在集成复跑 Automations 单文件 34 项通过，日志 `temp/issue-evidence/huhu-2026-11-22/linux-approval-check.log`。实际 Agent/native 接线仍在实施，独审由 HC `t8g/task01.md` 执行；此处不记为 Linux 实程验收通过。

独审 `t8g/report01.md` 复现四项待修：同地址双账号包在空库恢复失败、恢复后立即再导出丢失已读定位、定位字段差异造成独立恢复重复建账号，以及系统 sh 暂不可核对时桌面无法撤销已有批准。已派 `t8k/task01.md` 修复，未进入最终门禁。Lead 另在隔离运行目录复跑 Agent `sessions.test.ts`，31 项通过，日志 `temp/issue-evidence/huhu-2026-11-22/linux-session-check.log`；Linux 原生 helper 仍待报告及实程验证。

2026-11-22 后续集成：`c1b5cd39` 修复上述四项审查发现；`0f24ba18` 进一步修复同地址双账号恢复中途失败后的续跑。Lead 在 `0f24ba18` 运行 Mail `outbox-engine.test.ts`，17/17 通过，Mail 定向类型检查通过，日志 `temp/issue-evidence/huhu-2026-11-22/mail-partial-recheck.log`。真实桌面撤销批准与最终包恢复仍待验，不用源码回归代签。

Linux 原生实现候选 `d0f50bbb` 已通过 Go 测试、Linux helper 构建、真实 PTY 正常／宿主崩溃／映像变化三组夹具、Agent 定向类型检查及 Windows 交叉编译。Windows 未实际运行。CLI 已批准终端实程回归仍有一项失败：Core 创建宿主的回包丢失后，原命令尚未交付，当前不能在原启动上恢复。`t86/task02.md` 正在修复该生命周期，`t8y/task01.md` 独审固定原生候选。详细命令与限制见 [Linux 环境证据](../2026-11-19-issue-4-agent-cli/evidence/W7.3-linux-environment.md)。

恢复候选 `be992934` 与类型兼容修正 `5c7385b1` 已由 Lead 复验：Agent/Automations/CLI 定向类型检查通过，Linux helper Go 测试与构建通过，完整会话测试 41/41、真实 CLI/MCP 批准终端 2/2 通过，差异 lint/格式通过。独审仍发现前台取消结算和交付前 Core 换代两处边界，交 `t86/task05.md` 修复。真实 provider 入口与 Agent 退出后同 pane 返回 shell 由 `t8k/task03.md` 实施，未签收。

Mail 进一步以 `dbe58665` 将部分恢复豁免绑定到原主体、ZIP 和完整选择，支持已显式独立恢复批次的原参数续跑。Lead `t99` 完整 `outbox-engine.test.ts` 20/20 与 Mail 定向类型检查通过，日志 `temp/issue-evidence/huhu-2026-11-22/mail-batch-recheck.log`。审查中关于未发布旧开发候选恢复日志迁移的建议不作为本轮新格式交付要求；当前版 v1/v2 数据身份与正常新格式恢复仍保留验收。

原生取消修复已保存为 `18aa8c6b`。Lead `t9g` 在该组合上验证三个模块类型检查、Agent 会话 52/52、Automations 42/42 和真实 CLI/MCP 2/2 通过；日志 `temp/issue-evidence/huhu-2026-11-22/native-cancel-recheck.log`。`t9b/task02.md` 正在复核前两项 P2 的关闭情况。

真实 provider 与同终端返回 shell 候选 `6874c619` 已合入，Go 测试与 Linux helper 构建通过。`t9d` 的终端模式断言失败，`t9f` 的 Volta Codex、Volta Pi、直接 npm Pi、原生 Claude 均已输出真实版本，但返回 shell 交互证明失败，交 `t8k/task04.md` 诊断。不得将版本输出或合成解析测试记为真实交互通过。Mail 独立复核确认原两项后端批次问题关闭，但发现工作台重开后无法选回已恢复账号以续跑原批次，交 `t86/task06.md` 补足直接调用方。

Provider 实程已在 `6a510e6f` 组合通过：`t9j` 五项真实 PTY；`t9n` 四种实际安装的 version/interactive/同 host 返回 shell。原 bwrap 环境拒绝 memfd 执行，最终独立 netns 降回普通用户验证通过，详情见 W7.3 证据。Mail 工作台原批次续跑保存 `66667d9f`，E2E 类型修正 `6dcffca2`；`t9p` Mail 模块类型通过但旧 E2E 可选值类型失败，修正后 `t9q` 定向 E2E types 和完整 Mail 20/20 通过。

`t9b/report02.md` 确认交付前 Core 身份复核关闭；取消仍有 Agent 已落盘而 Automations 未落盘，以及 helper 核验时尚未创建会话两条缺口，由 `t86/task07.md` 先复现再修复。`t9b/task03.md` 正在定向复核 provider 和 Mail 工作台候选。未进入最终门禁与安装包验收。

当前取消收尾候选 `f13d4c78` 通过三模块类型、会话54/54、自动化44/44、真实CLI/MCP2/2，独审 `t9b/report05.md` 确认原两条取消缺口关闭。调用名修复 `cce683a0` 保留已核对的 shell 原路径，真实 Bash-as-sh 的 POSIX 模式、六个PTY场景及四种provider复验通过；独审 `t9b/report04.md` 关闭此项，测试可移植性修正 `66a9245d` 定向通过。八文件差异lint与格式 `t9w` 通过。

本轮实现与独审已收取，进入固定组合提交的串行全仓门禁。最终组合结果、逐Issue签收、同一安装包与远端main落地尚未完成。SSH仍按暂停范围保留，不恢复开发。

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

本次 Goal 已授权将有效改动经 `feature/issue-fix` 交付到 `origin/main`，并复核远端实际 SHA；本地候选提交不代表交付完成。成员验收、同一组合版本联验和最终候选包证据仍须完成。部署和发布另等授权。#7 SSH 保持暂停，其远端保存分支不代表验收或完成。

## 本轮核验

- 12 个本地上游源码 checkout 的提交与分支已核对。 [源码清单](sources.md)
- 238 份任务都有计划索引。任务文件中的 408 条显式前置链接经检查无环，联合验收单列。
- 八个确认稿均用 Edge 157 通过本地文件入口打开，验证了桌面与 390 像素窄窗加载。没有脚本错误、缺失资源或外部网络请求。各 change 的确认记录包含具体场景、资源指纹和用户确认范围。
- 已复验 #6 同一邀请重用及撤销时只断开关联会话，#7 模拟主机信任进入终端，#10 草稿未保存时的离场选项。生产运行证据按各 change 的后续验收任务采集。
- 2026-11-20 用项目配置的 GitHub 来源复核八个 Issue 均开放、无评论，快照包含完整的当前正文。重新核对 238 份任务的索引与本地文件引用，并复算八份原型指纹。 [Issue 读取方法](../../project/issue-automation/README.md)

## 2026-11-23 定向修复收口

当前工作树为 `temp/issue-worktrees/agent-linux`，分支 `impl/huhu-mail-graph-completion`。新增本地提交 `f0fb1810`（HTML 源码与大小上限）、`8c1a9675`（已结束 Agent 目标）、`4beb7eae`（独立 CLI/MCP 任务链路）、`9e854b1c`（编辑器快照生命周期与同文档导航）、`7b6ef95a`（档案缺失条件更新）。这些提交已由 t143 推送并核对远端 `feature/issue-fix=7b6ef95a5b9cb365a9a14b8adbd468cfb04acacd`；`origin/main` 仍为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。该分支保存不代表最终 main 或包验收。

当前可推进：t14j 关闭核对保存修复，t144/task02 修复已复现 Mail 三项P2与工作台刷新P3；Lead 随后定向验证并固定组合候选。Graph S5.2 通知口径等待用户决定，S4.2 补位回归不代表通知验收。最终固定候选仍须覆盖三组联验与之前失败的非 SSH 场景；既有全量测试和全量 E2E 已执行，不重复全量运行。#7 SSH 继续暂停并保留原分支/change。

证据、失败与未运行范围见 [Linux 最终验收记录](evidence/linux-final-acceptance.md)。


## 2026-11-23 当前接续：integration

当前工作树 `temp/issue-worktrees/integration`，分支 `impl/huhu-acceptance-followup`。固定应用 f91a55158f5b4e56100685a306cc954db592841b 的同一个 AppImage 已完成 12 组 21 项组合验收，零跳过/flaky/测试外错误。测试驱动修正与证据已保存至 feature/issue-fix 的 40a47ad3；其后仅交付资料更新。最终 origin/main 落地与回读在下方另记，不把 feature 保存当作 main 完成。

本机可验证的原 Web 停放旧正文、组合输入、原生任务/工作区、外部 CLI/MCP、权限/凭据/包恢复和窗口草稿组合均已有证据。原全量检查不重复。完整 Issue 签收仍缺声明平台/第二设备/授权线上账号条件，Graph S5.2 旧信移回通知口径待决定；Notes 返工独审受 CLI 账号额度限制未完成，Lead 检查与实跑另记。#7 SSH 暂停且 change 保留。部署/发布另等授权。

- [同包证据索引](evidence/linux-package-f91a5515.json)
- [逐 Issue 已验证及缺证范围](evidence/linux-delivery-scope-f91a5515.md)
- [完整历史与失败/修复记录](evidence/linux-final-acceptance.md)

## origin/main 实际落地

2026-11-23，HC `t19v` 先 fetch 并核对 origin/main、origin/feature/issue-fix 均为候选祖先，再依次快进两分支。远端实际回读均为 `7c3a494b117b6996aae17bbd695e8d0e516e5cf8`，原 main `4ae7e7e4`。这证明有效改动已落地，不代表上表外部环境缺证已完成；未关闭 Issue、未部署或发布。随后只追加本落地回执，应用仍为已验收的 f91 字节。

## 2026-11-23 首页验收补充

四主题明暗与键盘验收发现并修复了保存后的主动取消假错误。应用 9d96e902 新包已完成 dashboard/close/Web 三组四项定向回归；其余组合组保留 f91 原记录。原生截图排除了页面截图在125%缩放时的裁切假象。证据见 [首页查询取消](evidence/dashboard-save-cancellation.md)。全平台、真实读屏、第二设备、线上邮箱和独审额度缺口不变；#7继续暂停。

## 2026-11-23 同包补验与独审恢复

`t1bd` 在9d96e902同一AppImage补齐Tasks、CLI-only/MCP-only外部Agent、Gateway、包恢复9项；结合前轮dashboard/close/Web，共7组13项，三组目标联验齐备，见 [机器记录](evidence/linux-package-9d96e902.json)。旧f91更多场景只按其原版本记录。

已重验审查终端t194确实可用，task04确认Notes的组合输入自动保存P2仍在，新增首页同轮旧读缓存回写P3（实际Query内存对照，Chromium该时序未捕获）。t197/task02、t176/task22分别实施，Lead串行验证。当前不能以额度缺口代替已收到的真实报告，也不能以通过的13项推断这两项关闭。外部平台/第二设备/线上邮箱缺口仍在。

独审原文已保存：[t194/task04](evidence/review-notes-dashboard-f55f0759.md)。共享任务目录不可写及HC发送权限弹窗通过取消非必要写入/发送、由Lead主动读取工作树报告解决，未更改沙箱或权限设置。

返工候选已保存：Notes `8d56591f`（104项单文件通过），首页 `916a0508`（真实hook 5项通过），实施者定向类型/lint/format通过。t194/task05、task06正在独审，Lead尚未实跑新E2E，不能提前记为验收完成。

## 2026-11-23 组合输入与首页复审返工

`t1bf` 在 fda247614d291625d3011b03bc6cd07aaa88df25 源码构建上运行两条真实 Chromium 组合输入用例，2/2，无跳过、flaky 或测试外错误。原始 JSON：`temp/issue-evidence/huhu-2026-11-22/followup-ime-fda247614d291625d3011b03bc6cd07aaa88df25.FhqQMS/result.json`（相对项目根）。不是真实 OS 输入法或安装包测试。

独审 [task05](evidence/review-followup-task05.md) 关闭首页同轮旧读 P3；[task06](evidence/review-followup-task06.md) 关闭 Notes 拼音误保存 P2，但发现组合期间后续读失败会丢失延期刷新。3cf40143 只接续同基线且相邻序号的后台读，单文件108/108通过，显式重载、删除、基线切换失效保护均有回归；task07正在独立复核。

`t1bg` 已生成 fda24761 中间包，AppImage SHA-256 `7ccfe946896002dde5a14e27c2cc2089065dc759d986eff02f7d27cc76817014`，deb `6a7c9f88e7327d938657177f4f2eebd8fd26a0a16d6130916ff3bdcf9770f06a`。它不含3cf40143，不作为最终候选；尚未执行其安装包验收。最终包须重新固定当前应用提交。SSH继续暂停，外部环境缺证不变。

## 2026-11-23 当前候选 37fe09fd 已验收

独审 [task07](evidence/review-followup-task07.md) 关闭后续读取失败 P3，独立单文件108/108；首页task05与Notes task06原P2关闭结论保留。`t1bh` 对37fe09fd源码构建的两条真实Chromium组合用例再次2/2通过。

`t1bj` 生成应用37fe09fdf68a67995e3a09ed7a45646a0c36f917的AppImage/deb；`t1bk` 同一个AppImage串行完成dashboard、close、web、tasks、external-agent、gateway、package七组13项，零失败/跳过/flaky/测试外错误，见[最终同包索引](evidence/linux-package-37fe09fd.json)。覆盖三组约定联验；并非全量套件，历史失败不删除。原生截图已保存，Lead查看Vercel暗色完整截图；八主题组合均有驱动布局/保存断言，不将截图检查称为读屏验证。

实际OS输入法、完整跨平台/第二设备/授权线上邮箱及Graph通知决策仍未完成；#7暂停不变。代码交付不等于完整Issue签收，未部署、未发布。以下证据提交仅改变资料，应用字节保持37fe09fd。

## 2026-11-23 用户确认本轮交付边界

用户明确无其他平台、第二设备、线上测试账号，由用户后续自行测试。本轮继续完成非SSH复制复刻实现、可运行本机验证与代码交付，不因这些环境未测继续阻塞，也不把未测写成通过。Graph旧邮件移回Inbox不重复新信通知已定案，正在实施和独审；完整交付审计t194/task08核对实际剩余实现。详见[补充决定](decisions-2026-11-21.md)。

当前本机原生Wayland启动补验通过，限定范围见[记录](evidence/native-wayland-startup-37fe09fd.md)。最后已落地的main/feature均为5ea79f717baf81795566558f6f117f27d381aa17（t1bm实际远端回读）；后续Graph规则将另保存交付。

`t194/task08`独立[完成审计](evidence/non-ssh-completion-audit-5ea79f71.md)确认#4两项实现缺口：W2.2当前标签收纳、W8.1纯布局随包恢复；已派t176/task23且批准其12文件范围。该缺口不属于用户接手的外部环境验收，必须补齐。#8旧信回流通知由t197/task04实施，Lead t1bq业务红灯已复现2条而应1条。按已核对范围，其余非SSH路径没有新增确定实现缺口；Claude/Codex历史记录的仅预览资格边界保留，不声称支持未实现的任意恢复/fork。

## 2026-11-23 完成审查补充

独审进一步确认 #4 W5.2 的 Claude/Codex 历史恢复与分支被生产入口整体禁用，属于实现缺口，不能以只读预览或用户接手线上验收代替。与 W2.2 当前标签收纳、W8.1 纯布局包恢复共同补齐；前两项 t176 实施，历史项 t197 先只读准备，避免共享入口重叠写入。此前审查将其视为允许支持边界的结论在此更正。 [历史专项复核](evidence/agent-history-gap-5ea79f71.md)

用户确定的 Graph 旧信返回不再次通知已完成候选实现。Lead t1br 在实际 Engine/OAuth 回环夹具运行 oauth-engine.test.ts，10/10 通过，含正文窗口淘汰、重启、返回旧信及接收时间更早的真新信。独审进行中，尚未当作远端交付完成。完整无本地观察证据的首次移入与真新信无法仅由 Inbox delta 区分，最终记录保留此可观察边界。

W2.2/W8.1 候选的 Lead 真实 Core 回归 t1bs 已通过6/6，包括运行中及冷导出、源状态保留和布局恢复；安装包验证及独审尚未完成。Graph t194/task09 独审发现压缩前移出ID遗漏及较早真新信列表先到的交叉缺口，t176/task24 接手返工，原10/10绿灯仅代表受测范围。历史专项 t197/task05 准备最小实施方案。

## 2026-11-23 导入隔离与 Graph 返工验证

Graph t1bz 完整 oauth-engine 单文件12/12通过，包含两条独审反例：压缩前移出身份在重启后仍保留，以及列表先见但尚未由delta确认的较早新信仍可通知。三文件冻结交t194/task12复核。

布局包 t194/task10 发现启动页导入沿用源VaultID和冷导出停止未知被覆盖。Lead t1bv业务红灯、t1bx真实Core6/6绿灯、t1by定向类型退出0。task11确认两项关闭，同时发现从另一个Vault设置页导入仍会沿用源ID，已交t176/task25补充同宿主A/B/C回归与修复。安装包新布局入口尚未运行。

Claude/Codex历史恢复和原生分支由t197/task06实施，已批准最小方案并释放index.ts接线；尚未独审或算作完成。用户接手外部环境验收的边界不变。

设置页副本隔离 t1c0 真实红灯、t1c1 完整6/6绿灯，独审[task13](evidence/review-layout-settings.md)确认关闭；启动页和私有Core停止未知的[task11复核](evidence/review-layout-launcher.md)保留原范围。Graph task12两条漏报经t1c2真实Engine复现，t176/task26返工中。
