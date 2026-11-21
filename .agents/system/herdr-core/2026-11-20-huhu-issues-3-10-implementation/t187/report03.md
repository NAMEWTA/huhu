# 623608c7 定时终端、任务等待和 Mail 恢复复验

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task03.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task03.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report03.md`
- 固定候选 — `623608c76066559611df6d61e00cf357a26c7e99`，比较基线 `d667d1ac`
- 执行结果 — `done`

## 结论

原计划点在运行写入前中断、已写入但尚未提交、提交确认丢失三个窗口都有对应的持久处理。已确认终端归属的纯 blocked 信号会显示在原任务和 run。Vault 切换会在旧 Engine 停止时撤销附件导入，Mail 启用期间的数据包装配也排除了未提交附件。**仍有三处 P2 时序遗漏**，涉及 Mail 由停用转启用时的 ZIP 一致性、定时终端取用的凭据版本，以及纯 blocked 首次对账失败后的补投。三项均为固定源码推导，已有正常路径证据不能覆盖这些时序。

## 规格发现

### P2 · Mail 在导出期间重新启用，可产生有新引用但无对象的 ZIP

Engine 开始导出时只查询一次 `mail.draftAttachments` 服务。Mail 停用时服务已经注销，`exportSnapshot` 直接执行。此时读取已提交引用并枚举文件，后续 ZIP 逐文件读取内容且会让出事件循环。期间桌面可以启用 Mail，新作用域则创建自己的草稿写入队列，未与已开始的导出同步。

反例是从 Mail 已停用、Vault 已有 `drafts.json` 的状态开始大包导出。在枚举之后、该文件被读入之前，Mail 重新启用并为已有草稿提交一个合成附件。新摘要没有进入最早枚举的文件清单，之后读取到的草稿却已包含新摘要。ZIP 清单与归档字节的哈希仍可匹配，恢复草稿时附件缺失。同一个反例也可从归档与删除交错的相邻时序核查。Mail 已启用时 `withSnapshot` 确实将整个 `exportPackage` 的 Promise 留在写入队列，完成 ZIP 后才释放。现有 19 项回归覆盖该正常序列及未提交对象过滤。

修复入口是 Engine 的导出装配和 Mail 草稿写入所有权。让同 Vault 的导出和 Mail 写入使用跨插件实例的同一串行边界，或在持锁期间冻结将实际归档的 Mail 数据快照。补停用状态开始导出、恢复启用后再提交附件的回归，检查归档中的引用和对象属于同一快照。 [Engine 取服务及回退](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:162) · [服务随作用域注销](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/context.ts:88) · [重新启用能力](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/capabilities/system.ts:122) · [Mail 队列](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/drafts.ts:215) · [ZIP 枚举与分次读取](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/vault/src/package/package.ts:55)

### P2 · 定时运行校验的环境修订与启动实际取用的修订仍可分离

固定候选把规则版本、Space ID/修订和可移植环境定义纳入发生指纹。写入 `submittedAt` 后再比对指纹，但启动服务随后异步枚举环境配置，并在 `ModuleCredentials.use` 中重新读取当前定义、凭据和 pin。终端环境只比较命令与 Space 的目标指纹，取用回调没有携带或验证发生指纹中选中的环境修订。规则命令和 Space 保持相同时，轮换一个本机变量会改变环境修订，目标指纹仍相同。

如果轮换在最后一次发生指纹检查之后、凭据 lease 捕获之前提交，原计划点可以使用新值运行。此时发生记录仍宣称原配置。既有回归覆盖的是在重启对账前已经更改环境的情况。应把预留的环境身份传到同一次带 pin 的取用操作内校验，并在获得正确版本时才提交给同一受保护启动入口。补同目标轮换与尚未提交发生并行的合成回归。 [预留指纹](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:471) · [最后检查与启动](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:506) · [取用环境](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:137) · [凭据 pin](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/credentials/module-credentials.ts:312) · [已有配置变更测试](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/test/service.test.ts:437)

### P2 · 纯 blocked 首次无法确认原绑定时，恢复可查后仍可能缺少原任务提示

事件处理先持久化 active waiting，再以当前 `ownerActive` 派遣和原进程绑定核对任务。若事件早于派遣绑定落盘，或对账临时返回不可用，`onBlocked` 抛出，处理编号没有前移。这个安全回退不会创建 Human 任务。现有 watcher 只由 Core 的后续状态事件或订阅重连快照再次运行回调。持久化同一派遣绑定或查询链恢复本身没有补投入口。

保持 blocked 的进程可能很久没有下一条状态事件，原任务的组件又要求已有匹配的 `waiting.taskRun` 才显示提示。结果是会话可核对后，原任务仍没有本轮等待提示。修复入口为 WaitingWatcher 和派遣绑定确认点，在同一会话和发生编号下重新对账尚未处理的等待。应保留现有完整进程代际核对和已解绑不建 Human 的语义。当前真实 Core 夹具在绑定与受理已有证据后才发 blocked，覆盖的是成功路径及 working 清除。 [等待处理](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/waiting.ts:112) · [归属检查](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts:125) · [派遣持久绑定](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/dispatch.ts:245) · [原任务显示](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/ui/TaskDispatchPanel.tsx:250) · [Core 回归](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/test/dispatch.live.test.ts:195)

## 原问题复验

- **定时 Terminal，原第 2 项。** `623608c7` 集成 `7aafa47b` 的单一持久发生。ruleId 与 UTC 计划点派生稳定发生和运行 ID，启动请求由同一个 runId 派生。写运行前中断，按启用或编辑至补跑宽限的规则补回。只有原 Vault 和机器、配置匹配且尚未提交的记录可继续原请求。一旦写了提交边界，只核对原 requestId 和已知 sessionId。边界后尚未真正调用 Core 时也保持待核对。旧 NDJSON 孤立行保存原字节、保留原计划点并显示待核对。其他 Vault 的运行保留历史且不认领、不启动。原两次写入之间只有激活无运行的窗口已关闭，新发现为凭据读取竞态。 [定时发生与阻断](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:405) · [原会话对账](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:637) · [故障探针记录](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T7.1-terminal-occurrence-recovery.md)
- **原 Task/run 的纯 blocked，原第 3 项。** `1c07566a` 通过已确认派遣的归属、完整会话进程绑定和发生编号路由。绑定分支跳过独立 Human 任务和等待评论，工作台查同 session/task/run 的 active waiting，仍用原派遣会话做定位。真实 Core 的 blocked/working 回归通过。首次确认临时失败后的补投仍待修复。 [绑定回归日志](D:/Document/code/huhu/temp/issue-baseline/task-bound-waiting.log)
- **Mail 附件取消和导出。** `2e32b8ea` 在 Main 的 Engine stop/start 边界撤销旧导入并关闭旧进程通讯端口，Engine 自己在 shutdown 开头撤销私有附件请求。已送入旧 generation 的工作仍受草稿写队列及 CAS 约束。已完成的草稿提交以重开结果为准。 `24438602`/`64f4df74` 的快照按已提交草稿和 outbox 摘要选对象，在启用状态下从枚举、逐文件读取到 ZIP 发布均保持 Mail 写入锁。对象落盘、随后取消或 CAS 拒写的夹具证实未引用字节从 ZIP 排除。跨 Mail 启停仍有前述窗口。 [Main 停止](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/desktop/src/main/engine-supervisor.ts:212) · [Engine 停止](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:493) · [附件停止日志](D:/Document/code/huhu/temp/issue-baseline/mail-attachment-endpoint-stop.log) · [ZIP 回归](D:/Document/code/huhu/temp/issue-baseline/mail-attachment-package-privacy.log)

## 相邻变更

- **#10 布局备份和恢复，`db4fb826`。** 导出从 Engine 重新读已提交看板，编辑中的草稿未混入。导入解析有界且符合当前 schema 的文件，先预览，确认后经既有 Vault/源 revision/摘要/候选摘要检查和 CAS。隔离桌面日志验证草稿排除、预览取消和确认恢复，当前候选任务 E2E 同样覆盖备份和几何修复。所审路径未发现会静默覆盖不同 Vault 或未确认草稿的新增缺陷。 [备份和预览](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/workbench/src/home/useDashboard.ts:225) · [确认 guard](D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/capabilities/home-dashboard.ts:218) · [独立桌面记录](D:/Document/code/huhu/temp/issue-baseline/dashboard-backup-desktop.log)
- **Mail 预览和删除指定本地账号，`7fd88b74`。** Desktop 按账号 ID、版本及影响指纹确认，先持久化可续作的清理记录。按账号撤销、等待在途 SMTP/IMAP 后再改写本地 draft/outbox/cache。保留已接受或未知投递的去重和结果凭据，回收只触及本账号候选且无其他引用的附件。双同地址账号、旧预览失效、首写失败、重启续作和迟到回调均有回环夹具证据。删除路径未发现远端删除调用或对另一账号直接删写。上面 ZIP 的跨启停问题也适用于此工作区的导出一致性。 [删除协调](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/account-removals.ts:176) · [SMTP 收尾](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/outbox.ts:225) · [账号删除证据](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1a.4-remove-account.md) · [回环与界面日志](D:/Document/code/huhu/temp/issue-baseline/mail-account-remove-gate.log)

## 验证与接续

- 固定候选的 Lead 日志已记录 lint、TypeScript、format、knip、build 通过，两组 Windows E2E 分别为 14 和 7 项通过。发布取证时全量 unit 已启动，尚无结束摘要。早期本机夹具分别记录附件停止 4 项、附件/ZIP 19 项、绑定等待 5 项、邮箱删除相关 38 项和看板桌面 3 项通过。定时发生分支记录 Automations/Windows 保护 70 项及 Engine 3 项。各阶段覆盖有重叠，未汇总为同候选的全量通过。 [固定候选门禁](D:/Document/code/huhu/temp/issue-baseline/623608c7-windows-gates.log)
- 本轮使用固定源码和现有本机日志复验，未另启测试进程，避免与全量 Windows 门禁争用。本报告为唯一文件交付。按任务要求随后移除 t187 此前自建且已退出的测试终端 `t189`、`t18b`、`t18d`、`t18x`、`t18y`。
- E07 显式授权的外部终端入口、Mail 转发沿已派发任务。当前结果尚需三项时序复验，以及同候选包与后续工作区、真实 Task 生命周期验收。

## Lead 验收

Lead: 两项已分别提交 f154b370 和 bb259e39，真实 Core 重查 5 项，Mail 跨启停 ZIP 6 项 Windows 回归通过。环境版本竞态处理见 t18v/report02.md 及 69776e68，进入独立审查。
