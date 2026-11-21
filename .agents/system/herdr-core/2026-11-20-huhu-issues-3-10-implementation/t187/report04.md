# 69776e68 已批准终端规则独立审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task04.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task04.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report04.md`
- 候选工作树 — `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`
- 固定候选 — `69776e6887fb8ff75f4992f81445ebc8f15fa959`，父提交 `7aafa47b`
- 执行结果 — `done`

## 结论

**E07 外部首批路径暂不签收。** Desktop 审批、CLI/MCP 逐项开放、固定 PowerShell 命令、保护值版本绑定和同意图对账均已接线。存在一处 P1 权限竞态，通用启用 handler 可以把旧规则类型的授权判断用到队列内已变更的终端规则。另有工作目录身份、改名保存失败和终端清理三处 P2。四处为源码结论。本轮独立复跑 50 项通过，t18v 原 Windows 证据另用于核对真实 CLI/MCP、Core 和桌面路径。

## 规格发现

### P1 · 通用启用规则在配置队列外检查规则类型

`automations.setEnabled` 是可显式开放的能力。启用时，handler 在入队前按当前动作判断调用方能否启用。进入 `withRuleConfiguration` 后，`setEnabled` 重读规则，并使用读到的新版本写入。它没有在同一事务复核动作和调用方，也没有绑定通过检查的版本。若并行的受信编辑使规则从提醒变为终端或 Agent，旧动作的授权判断可以落到新动作。随后 `resync` 会按已启用的新规则安排将来的触发。外部计时用途授权尚未交付，该入口的已承诺限制仍应始终成立。

修复应把 caller 检查和当前 action 的读取移入 `setEnabled` 的实际写入事务，按同一版本发布。保留已允许的暂停行为。已有 HTTP 审计回归覆盖静态的提醒允许和终端拒绝，应在隔离夹具中增加受信修改与启用提交的版本交错断言。 [入口权限](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/index.ts:25) · [启用 handler](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/index.ts:346) · [配置队列](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:183) · [启用写入](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:239) · [既有 HTTP 回归](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/engine.test.ts:1083)

### P2 · 批准时的真实目录身份未传到 Windows 启动提交边界

`describeTarget` 计算并展示工作目录的真实路径，批准还绑定目录的文件系统身份。实际调用受保护启动时只传 Space ID 和 revision。Agent CLI 验证当前 Space 版本与目录可访问，再用 Space 的路径作为 cwd。它未接收获准的实际目录身份。准备之后尚要等待受保护票据服务与 Core 连接及标识，最终 `terminal.run` 直接用已保存的路径发出。若同一路径的本机目录在这段时间中被替换，Space revision 可以保持不变，原批准命令和保护值可能进入不同于已审核对象的目录。

承接原已受理运行的回执语义，修复应把受保护启动的实际目标身份传到执行端，在发出新 Core 请求时以相同身份核对将交给 Core 的 cwd。目标无法核对时保留原意图状态并给出明确原因。已有用例覆盖批准后先改 Space 版本再请求，且核对审批预览的目录。它没有覆盖目录身份在启动等待中变化，也没有在实际子进程中比较批准 cwd。 [批准目录身份](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:214) · [启动传参](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:388) · [准备 cwd](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/sessions.ts:332) · [等待 Core](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/sessions.ts:454) · [实际提交](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/sessions.ts:493)

### P2 · 本机变量命名变更保存失败也会撤销原批准

Desktop 环境保存遇到不同名字集合时，先持久化空批准，再调用 `ModuleCredentials.save`。如果凭据提交失败、被取消或发生条件写冲突，原定义可能仍正常读取，旧批准已经丢失。该路径对外保持拒绝，但用户得到环境保存失败后依然要重新批准原配置，和有条件保存的失败语义不一致。

修复入口为 Desktop 环境保存与批准有效性判断。让成功发布的配置变更决定批准失效，并保留“改名后又恢复原名字也需要新的批准代次”的约束。若必须跨文件，保留可恢复的中间状态与明确失败回包。补“批准已存在、定义写入失败/中途取消、重读原版本和批准状态”的合成事务回归。 [先清批准再保存](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:265) · [凭据保存事务](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/packages/kernel/src/credentials/module-credentials.ts:190)

### P2 · 受保护终端结果落盘后，释放失败没有后续对账

`settleTerminalRun` 先写退出状态和 `finishedAt`，再调用 `agent.sessions.release`，释放失败直接吞掉。对账只取未结束运行。若 Agent CLI 或 Core 在释放前短暂不可用，之后恢复也不会消费该终端的待清理义务。若调用已经进入 `SessionsService.release`，它会先清本进程的脱敏材料，再尝试 Core 移除。若调用在到达 handler 前失败，脱敏材料还可能留在该 Agent CLI 作用域，直到它结束。该窗口沿用旧受保护运行实现。现有证据证明普通退出路径、输出脱敏和 Core 参数中无原值，本项未观察到秘密落入持久文件。

修复入口为终端结果收尾。在保留原结果事实的同时持久记下受保护会话清理状态，后续只沿原 session 身份重试释放。增加释放暂时不可用、重开对账后完成清理的合成回归。Windows 强制停止或超时后子进程是否全部退出需要另取真实进程证据。 [先结束再释放](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:701) · [对账筛选](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:750) · [释放实现](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/sessions.ts:881)

## 通过的设计边界

- **公开权限与本机范围。** 新 status/save/run 三项默认关闭。Dispatcher 先按工具选择鉴权，领域入口再限定 `cli` 或 `mcp`、Vault 本机实例、有写权限及批准的 Windows PowerShell 对象。批准由 Desktop 写应用私有目录，绑定规则版本和文件身份、Space 真实路径及身份和批准变量名。外部参数没有命令、argv、cwd 覆盖、交互输入或读取秘密值。应用只接收批准名前缀内明确列出的名字。已有 Vault ZIP 恢复的批准隔离证据。 [领域授权](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:195) · [固定入口](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:369)
- **批准代次和准确的环境修订。** Desktop 规则编辑、启停、删除、批准和外部操作共用配置队列，本机撤权与外部 run 的受理能排序。外部写保护值按规则与环境 revision，凭据发布前复查批准及开放状态。外部运行和已有桌面手工、定时均核对 `ModuleCredentials.use` 同次 pin 捕获的 revision。report03 的同目标值轮换问题已有新合成回归覆盖，旧预留在捕获 lease 前轮换不会启动。#6 的既有合同允许已接受运行继续，撤权后的新调用和旧意图重交仍经过授权。 [凭据 lease](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/packages/kernel/src/credentials/module-credentials.ts:312) · [手工及定时取用](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/terminal-environment.ts:402) · [同目标轮换回归](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/module-credential-host.test.ts:158) · [#6 撤权行为](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/spec.md:24)
- **意图和原启动。** 外部 intentId 派生稳定 run 与 activation，记录规则、调用类型、批准代次和所见版本的绑定摘要。同键重交先重新授权，再按同一 Vault 归属读原运行。冲突项拒绝。预留落盘但未有 Core 证据时可保留待核对。写提交边界后，重开只查原 requestId 和已知 session；即使之后尚未来得及提交也不重发。此处是保守的持久协议。已读真实 Core 丢 ACK、CLI 未消费首次应答、HTTP 与 stdio 读取同一 MCP 意图、原 Vault 重开与导入后拒绝的夹具。 [受理与重交](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:511) · [原会话对账](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/src/engine/service.ts:750) · [CLI/MCP 夹具](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/cli/test/approved-terminal.test.ts)
- **Windows 启动与输出。** 固定原命令作为 PowerShell 单个命令参数，通过既有 Session 和 ProtectedLaunch。Core 参数只含中继与一次性票据，helper 取用本次环境并在子进程注入。stdout/stderr 在进入 Core 前按原值遮盖，运行正文再按会话脱敏，已重开而无脱敏材料时保守不读取正文。候选证据使用普通 sandbox PowerShell 的合成变量，覆盖常规退出和恰好一次实际启动。原值未出现在已检查的 Core 请求、审计、运行正文和 ZIP。 [PowerShell 参数](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/shared/shell.ts:3) · [票据与中继](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/protected-launch.ts:11) · [helper](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/agent-cli/src/engine/protected-launch-helper.cjs:71) · [候选证据](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/E07-approved-terminal.md)

## 验证与接续

- **独立 Windows 回归 50 项通过。** 固定 pnpm 12.10.1、Vitest 3.2.7，关闭缓存，单 worker，隔离临时目录。 `plugins/automations/test/service.test.ts` 32 项，`packages/kernel/test/credentials.test.ts` 18 项。检查候选 worktree 的 HEAD 及范围内源码，排除 t18v 正并行更新的 `apps/cli`，上述两组测试不经过该目录。子终端 `t191` 退出 0，发布后关闭。
- **实现者原取证。** t18v 的完成记录为组合 101 项、Engine 定向 4 项和准确提交 Electron 端到端 1 项通过。独立检查对应已提交测试的断言与证据范围。此前 CLI 夹具从文件向进程内 CLI 实现传合成值，面向用户的真实文件/stdin 输入由 t18v task03 接续。此轮没有把并行 CLI 更新计入候选。 [原实现报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report02.md)
- **G5b.2 与 G3.3 后续。** 外部草稿创建和条件编辑、定时用途审批、启停和删除对现有队列的版本化验收、按 run 单独取消，以及通用保护写入的可重放意图回执未在本片交付。真实 Windows 子进程的批准 cwd、强制退出收尾，以及同候选安装包复跑仍需补证。 [E07](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-5-task-automation/source.md:598) · [G5b.2](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G5b.2-automation-rules.md) · [G3.3](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G3.3-intent-outcomes.md)

## Lead 验收

Lead 已核对 P1 及三个 P2，全部由 t18v/task04.md 接手修复。冻结 69776e68 的签收，待修复和独立复验。
