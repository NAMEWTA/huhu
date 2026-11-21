# E07 与 G5b.2 终端规则合同分析

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18z
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18z/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18z/report01.md
- 执行结果 — done（只读合同分析）

## 结论

**外部调用者可以获准为一条指定规则配置秘密、启停和触发已批准的执行版本。工作区已有规则版本、工具开放策略、凭据目标指纹和启动回执，可以复用。尚未找到把这四项连在一起的管理员批准记录。** 桌面创建、当前处于启用状态、环境显示 configured、网关勾选 runNow，任一项单独都不足以证明某条命令可由外部调用。现有桌面实测证明了注入与 Core 对账，E07 的外部正例和 G5b.2 的完整生命周期仍待实测。[#5 原始要求第 467、598 行](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/source.md) · [T6.3b](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T6.3b-terminal-rule.md) · [#6 D02、D10](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/source.md) · [G5b.2](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G5b.2-automation-rules.md)

旧安全约束指出，Agent、脚本及 SSH 命令以当前系统用户权限运行，Space 只指定工作目录。新规格要求开放已授权的领域操作，保留内部权限和实际来源。两者可以同时满足：把对外执行限定到管理员审过的本机规则版本及用途。外部可创建、编辑待审终端规则，写入新的命令文本只产生草稿。要仅凭 CLI/MCP 完成环境配置→运行，先由管理员批准固定执行内容、变量名和允许的用途，之后每次配置或运行无需回桌面。**具体如何持久化批准、批准是否允许轮换原变量及哪些调度变动需重审，属于设计建议。** [归档 security.md §1、§5](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/security.md) · [#5 spec](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md) · [#6 spec](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/spec.md)

### 公共操作与当前差距

| 外部操作 | 当前 integration 行为 | 满足合同的最小改动建议 |
| --- | --- | --- |
| 发现、读取、预览和历史 | Dispatcher 的 discover 与 call 共用 authorize，外部须有显式选择。automations.list/read/preview/activations 可选，runs.list/read 当前不可外露。publicRule 去掉旧 envRefs。 | 沿用 #6 同一目录和 handler。预览零写入，读历史仅投影本规则或本 run 的身份、状态、时间和已脱敏摘要。原始运行正文、终端输出流和输入控制分别处理。 |
| 新建、编辑规则 | create 默认暂停。create/update 对 terminal/agent 有工作台判断，update 同时检查新旧动作并要求 expectedVersion。 | 对已开放的调用允许创建暂停草稿及条件编辑。命令、shell、实际 Space/代次、变量名或可执行用途变更后，旧批准无法启动新内容。保留经确认的启停选择和三次预览，明确显示“待批准/不可调度”，对已启用版本的更新禁止出现先执行后失效的空隙。 |
| 查看、保存、清除环境 | automations.terminal.environment.get/save 均 desktopOnly、exposable=false，内部再要求 desktop。get 只给名字、本机可用性、targetChanged、revision 和逐名状态。save 接受 keep/replace/clear。 | 复用同一 Automations 定义与保存事务，为读状态、写配置分别显式开放。对批准的变量名只能保留、替换或明确清除，禁止调用者添加可改变进程行为的任意变量名或覆盖运行目标；保留首次 expectedRevision=null 的创建条件。秘密只进 write-only 字段，CLI 通过受保护的 stdin 输入。 |
| 立即运行、启用 | runNow 不可对外，输入只有 id，当前手动运行可用于暂停规则。setEnabled(true) 拒绝外部终端规则。 | 立即运行只接收规则身份、预期版本和意图键。启用另验定时用途和获准的日程。两者在领域接受点复核本机批准、实际配置与已认证来源，复用同一个 Agent CLI 启动入口。仅授权手动运行时保持日程不变。 |
| 停用、删除、取消 | setEnabled(false)、delete 已可按工具开放，但 service 使用服务端即时读取的版本。delete 只删规则。automations.runs.cancel 当前内部，tasks.dispatch.cancel 已有领域入口。 | 停用、删除采用调用方所见版本。取消排队项用原 task/dispatch 凭据；终端运行取消单独授权、绑定原 run/session 代次。已结束返回原终态；没有当前进程控制凭据时显示待核实。保留原历史及归属。 |

依据为 [Automations 注册及权限判断](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/index.ts)、[环境定义与 handler](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts)、[规则持久化与运行](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts)、[Tasks 取消入口](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/index.ts) 和 [编辑后保持启停的原型确认](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/prototype-review.md)。

### 条件事务、批准与启停

1. **批准由本机管理入口写入。** 建议用现有本机 Vault 实例与规则 ID、管理员审过的规则版本、可执行内容摘要、实际 Space ID/revision、允许的变量名、手动/定时用途绑定。哪些外部主体可操作仍由 #6 决定。批准只由可信入口产生，导入 ZIP、同步规则、Notes 原始编辑、调用参数自报 caller 或插件代调均不能产生批准。普通启停会改变文件 version，故需区分调用方 CAS 版本与获批执行内容；仅在受控提交确认执行内容完全相同时延续批准到新版本，旧版本写入仍冲突。若允许替换已批准名字的值，每次接受运行都另冻结当时的环境 revision；改名、改 Space、改命令不能借轮换继承执行权。
2. **同一规则的写入和领取有明确先后。** 在 Automations 所有的串行提交点检查 expectedRuleVersion、expectedEnvironmentRevision、真实目标、批准和删除状态，再发布变更或接受发生。在 ModuleCredentials 的串行 save/use 内同时核对预期 revision，pin 所接受版本。当前 save 在凭据层只比较 expectedRevision，use 按当前记录读取，不能以一次较早的 get 代替条件取用。沿用先暂存密文、条件发布定义、最后回收旧版本的顺序。若一次操作跨规则、批准和凭据文件，可先写不可执行的意图/删除标记，记录预留身份，恢复后按原内容补齐再发布；在未完成窗口禁止调度或使用半更新配置。竞争失败返回现版本，失败方不改变密钥、规则或调度。单独的规则删除还需按已知 revision 调用凭据删除并可恢复回收，防止还原同 ID 意外重新绑定。[模块凭据 save/delete/use/recover](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/credentials/module-credentials.ts) · [目标指纹和现用版本读取](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts)
3. **调度和手动操作共享接受条件。** Scheduler 已按已启用规则注册 Croner、根据 updatedAt 和既有激活计算补跑，服务再查 enabled，终端的同 ruleId + scheduledFor 可返回原发生。建议在接受时冻结 ruleVersion、配置 revision、用途和 run 关联，定时沿用 UTC 槽位，手动使用稳定 invocationId。停用/删除先提交则迟到 tick 不得新建发生；接受先提交则已有 run 按原批准快照对账。停用/删除只阻止未来触发，已排队未发仍可在 Tasks 单项取消，已发、待回答和待投递可追查；恢复启用跳过停用期间。关闭 MCP 应立即拒绝新旧 MCP 客户端，已授权 CLI 和内部调度保持各自生命周期。插件关闭、Agent CLI 不可用、Vault 只读或切换时禁收新执行并保留已有身份供恢复判定。[#5 时间规格](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md) · [Scheduler](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/scheduler.ts) · [其他发生记录已冻结版本的先例](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/task-scan-occurrences.ts)
4. **运行过程只交付所批准用途的秘密。** Automations 自有环境按变量名映射 credential purpose，指纹现含 ruleId、指定 Space、shell、command、实际 Space ID/revision；Agent CLI 可复用环境仍由 Agent CLI 管理。本机密文与 Windows Credential Manager 密钥分离。受保护启动由现有 agentProtectedTerminal、Sessions 与 ProtectedLaunch 完成，回环的一次性票据传给 PowerShell 中继，helper 在子进程局部环境注入，stdout/stderr 对已知值跨块遮盖，结束后释放。Agent CLI 负责票据消费、超时/撤销和收尾。它不能约束任意命令对配置的使用，故公共入参只可引用批准目标，不接受 argv、shell、命令覆盖、PID、交互输入、读取 env 或 reveal。用未保存的单次值时仅对本次启动有效；重启先对账，若尚未启动且值已丢失则提示补配并要求显式新意图。旧 envRefs 仅报告需迁移。首个正例限定 Windows PowerShell 和 provider=shell，Python/Claude runner 不进入本用途，也不作为失败回退。未在此链发现可证明“全系统禁用 Python/Claude”的开关；本结论限终端规则接口与测试范围。[启动装配](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/index.ts) · [代理票据](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/protected-launch.ts) · [子进程与输出处理](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/protected-launch-helper.cjs) · [#5 秘密与恢复](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/design.md)

### 回包丢失时认哪一次操作

| 断点 | 已有事实与缺口 | 领域返回与观测 |
| --- | --- | --- |
| 配置已提交，CLI/MCP 未收到应答 | Dispatcher 先鉴权，但默认只对 write/execute 做 24 小时幂等，环境 save 属于 admin。CLI 的 callCapability 每次生成新的 idempotencyKey。仅以旧 revision 重传将产生冲突，无法说明第一次是否提交。 | 令 CLI/MCP 接受可重用 intentKey；用 Vault 实例、已认证主体、能力、键与规范输入绑定 operationId，在发布配置前预留同一结果 revision。含秘密输入用本机带密钥摘要比对，不记录原值或可枚举的明文指纹。同键同参读回原提交，同键异参冲突，撤权后不返回旧结果。 |
| 立即运行已接受，外部应答丢失或输出校验失败 | 当前手动激活每次生成新 activationId，写 activation 后另建 run。并发映射和短期缓存无法覆盖这一跨文件崩溃窗口。 | 接受前持久关联 invocationId → operationId/activationId/预留 runId，登记冻结版本和原调用者。回包可先给句柄；同键查询原发生，不再调用 activate。没有证据时返回 unknown。输出验证失败与执行失败分别记录，断连只终止等待。 |
| Core 已创建终端，Agent CLI 或 Automations 尚未记确认 | 现有 run 先落盘，固定 requestId 为 autorun- 加 runId，回查原机器归属、原 requestId 和已知 sessionId；Sessions 保留 launch attempt 及绑定。当前 ModuleCredentials.use 会把回调异常归为 operation-failed，受保护启动的未知结果可能失去原错误类别。 | 进入可能已发送阶段后，只核对原 requestId、已知 session 和 Core 绑定；未能证实则保留 unknown、无完成时间。凭据缺失且已证明未发才报补配。保留脱敏的“未发/可能已发”区别，不因查询为空、过期、重启或换配置再启动。 |

复用 [Dispatcher](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts)、[现有 24 小时缓存](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/idempotency.ts)、[CLI 适配](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/cli/src/commands/call.ts)、[Sessions 启动与对账](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts)。持久意图、结果查询及跨主体隔离是 [G3.3 的验收](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G3.3-intent-outcomes.md)，上述关联字段和提交顺序为本报告建议。

## 产物与改动

唯一交付为本报告。分析工作目录为 `D:/Document/code/huhu/temp/issue-worktrees/integration`，分支 `impl/huhu-issues-3-10-integration`，读取基线 `7fd88b74503a48a2cbd754ff0b43ddce695766d7`。共享检出在分析期间有 Lead 并行改动，起始涉及 package 能力及 Vault 打包，后续还观察到 Dashboard 与 E2E 文件变化。本任务只读项目文件，未运行构建、测试、真实进程或远端调用。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 派工身份 | HC_TERMINAL_ID 与 hc get 均为 t18z，cwd 相符。wta Core 0.1.21，ID 346bd5608735e3fcb27f9d01f5c8008e。清单为 t18z / task01.md / active。 | [任务](task01.md) · [主题](../topic.md) · [清单](../manifest.tsv) |
| Windows 正例的已有部分 | 已读早前 36 项通过的日志及桌面 1 项通过的记录。Engine 用 desktop caller、Safe 锁定、合成 HUHU_TEST_PROTECTED、真实 Core 与 PowerShell，模拟第一次 terminal.run 已创建后丢包，同键并发只启动一次，票据不可复用，ZIP 还原显示需补配。桌面记录覆盖未初始化时配置、停用 Safe 后运行及清除。证据仅适用当轮候选。 | [Engine 夹具](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/test/module-credential-host.test.ts) · [Engine 日志](D:/Document/code/huhu/temp/issue-baseline/protected-terminal-final.log) · [桌面日志](D:/Document/code/huhu/temp/issue-baseline/terminal-cutover-desktop-ui.log) · [T6.3b 已有证据](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T6.3b-protected-terminal.md) |
| E07 与 #6 外部正例，待实测 | 隔离 Vault，沿用上述 PowerShell 夹具中已有的变量 purpose，管理员预批固定命令、目标 Space、变量名与用途。Safe 未初始化/锁定/停用下，分别以真 CLI、MCP（stdio、HTTP）执行受权的草稿创建/编辑、状态读取、replace/keep/clear、预览、启用、runNow 和读历史。记录身份、工具选择、版本和返回码。子进程须在所选目录以公开成功标记和退出码证明收到正确合成值，输出、命令行及历史只保留去敏结果。另验 Safe 三态下的 Tasks 派遣。 | [T6.3b 验收](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T6.3b-terminal-rule.md) · [#6 G5b.2 验收](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G5b.2-automation-rules.md) |
| 授权、条件写与对账，待实测 | 默认全关/撤权后，目录及直接调用均拒绝；仅开编辑无法执行，授权 A 不能运行 B。并行改规则、换 Space、轮换/清除配置或删除时，过期接受不产生新进程。分别在配置提交后、公共调用受理后、Core 启动后丢包，同键并发、重启后及跨缓存窗口再查，记录同一提交版本、operation/activation/run/request/session、Core 启动计数和未知→终态；同键异参、异主体、异 Vault 不复用结果。二次票据/超时票据均拒绝，结束后新进程不继承合成值。扫描任务、评论、run 快照、普通查询、预览、日志/审计、Git、导出与重启记录，检查原值零命中。 | [G3.3](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G3.3-intent-outcomes.md) · [E07](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/source.md) |
| 启停与排队，待实测 | 用同一时钟记录规则及下三次触发。手动运行保持原日程。分别在有已排队任务时停用、删除，观测未来槽位零新增、原 dispatch 仍可单项取消、已结束项重取消返回终态、既有终端可按原身份对账。重新启用核对停用时段无补跑，另查 MCP 关停后已有客户端、CLI 及内部运行的独立结果。 | [#5 已确定的队列语义](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md) · [G5b.2](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G5b.2-automation-rules.md) |

## 阻碍与接续

只读分析无阻碍。规范已要求授权外部编辑与运行、Safe 独立、条件写、重复意图不重复派发、停用与队列分离。既有实测限上述桌面/Engine 路径。本机批准记录的形态、写入协调与持久意图映射属于待实现并验证的推断。Lead 可按验证表判定外部正例、跨重启回包丢失以及启停竞态是否达到验收。

## Lead 验收
Lead 采用精确规则用途与现有工具授权的双重约束。先覆盖已批准手动运行与写入/清除受保护变量，已通过 Core 派发 t18v/task02.md。
