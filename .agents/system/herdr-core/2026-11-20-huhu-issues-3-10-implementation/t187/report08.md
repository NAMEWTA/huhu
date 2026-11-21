# 组合候选 SSH、Mail 搜索与 Agent 关窗独立审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task08.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task08.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report08.md`
- 固定候选 — `2e0d4d3636272691b861b8c123b77b93a71bbbc8`，父提交 `7e1ca71ab8027be02c7875ecee8e84ccbd929d9c`
- 执行结果 — `done`

## 结论

**组合候选暂缓签收。** SSH H4.2 实际集成 E2E 被主机页的指纹弹窗阻断。独立探针另确认 SSH 关闭最后一个等待运行后留下旧待答提示、Mail 撤出后搜索摘要保持可见，以及 Agent 跨 Tab 移动保存冲突后卸载原 viewer，共四处 P2。共享搜索命令在离场被拒后留下旧请求，记为 P3。

冻结门禁的 lint、typecheck、format、knip、build 和 Agent E2E 5 项通过。组合工作流 17 项通过、1 项失败，脚本在该门禁返回 1。独立复跑 28 项已有回归通过，另有 4 项针对性探针。 [冻结门禁与失败](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates.log:482) · [独立定向回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/focused-regression.log) · [实际 Mail 工作台复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/mail-renderer.log)

## SSH 工作区

### P2 · 在工作区等待指纹时，主机页自动弹窗挡住返回工作区

冻结的 H4.2 从工作区启动三台回环夹具，选定一条待信任提示。切到「主机」后，返回「工作区」的点击被打开的 `hostkey-dialog` 拦截，30 秒后失败。合并结果保留了主机页对任何等待连接的自动恢复和模态展示，工作区发起的同一尝试也进入该分支。可先关闭弹窗再手动返回，指定的重开路径因此中断。应以同一个 `attemptId/hop/promptId` 恢复等待，同时区分工作区和普通主机发起的连接，确保等待状态不会占用返回入口。此观察来自固定集成 App，非独立 renderer 模拟。 [真实 App 失败堆栈](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates.log:537) · [失败现场](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-batch-artifacts/workflows-ssh-workspaces-H4-2-临时运行独立信任和认证，重挂与重连保留分栏归属/error-context.md) · [等待主机恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/ssh/src/ui/SshModule.tsx:75) · [自动打开信任弹窗](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/ssh/src/ui/SshModule.tsx:541)

### P2 · 关闭唯一等待运行后，旧指纹提示仍可被处理

隔离 Engine 用真实回环 SSH 启动一项临时运行并等待首次指纹，此时没有输入过密码。关闭该运行后列表清空，但主机连接管理器仍持有同一 `promptId`；对它发拒绝决定仍返回 `applied: true`。运行控制器负责取消自己的 shell 交接，拨号由不接收该信号的主机级共享尝试管理，目前没有最后一个消费者离开时的收尾。应按连接尝试的实际所有者管理取消，保留其他仍在等待的运行或主机页连接。探针拒绝旧提示以清理夹具，未观察到关闭后发出认证或开启 shell。 [运行关闭和释放](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/ssh/src/engine/workspace-runs.ts:92) · [共享拨号与 shell 交接](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/ssh/src/engine/manager.ts:381) · [真实回环探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/ssh-run-and-command.log:12)

**通过的边界。** H4.1 集成 E2E 确认模板顺序、自定义比例、重开、旧版本拒绝和删除引用保护。1–12、重复主机及树叶数检查同时在入参和结构层，模板提交与主机删除由同一目录写队列排序。H4.2 的另一个同候选用例通过，证实绑定写失败零拨号，删除及改端点得到各自分栏错误。普通主机路径的重开、仅本次信任、已知主机变更和跳点、认证方式回归通过。独立回环探针还确认同一主机的两个运行共享同一个待答 ID，重复决定被拒，分别拿到各自 shell，关闭其中一个保留另一个。断开原连接后，旧分栏带原 session ID 保持结束，新连接建立的新 shell 未重新绑定旧分栏。固定候选 H4.2 失败用例中，后半段重开 App 后显式重连和重新附着的断言未执行完。 [普通 SSH 与工作区集成结果](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates.log:515) · [模板约束与引用](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/ssh/src/engine/workspace-templates.ts:53) · [运行持久化先于拨号](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/ssh/src/engine/workspace-runs.ts:51) · [并行信任和旧会话探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/ssh-run-and-command.log:15)

## Mail 搜索与命令

### P2 · 已撤出的账号仍出现在打开的搜索页

在真实 Engine 和 Edge 的两个视图中，用一个视图搜索已缓存的合成 Sent 正文，在另一个入口移除来源账号。原读区关闭，新的 Engine 搜索没有命中，已显示的结果仍保留原主题和正文摘要。点击这条结果得到「已不在本地可见缓存中」，摘要仍在对话框。联系人的查询会因账号修订刷新；搜索响应则由输入和页码标识，未随账号及目录可见性变化撤出。应在公开来源失效时同时剔除已显示结果并废弃在途响应。已实测账号移除，目录撤出的相同搜索页面时序尚未独立运行。 [搜索页响应与查询状态](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/mail/src/ui/MailSearch.tsx:34) · [账号更新后刷新联系人](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/mail/src/ui/MailModule.tsx:112) · [实际组件复验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/mail-search-revocation.log:12)

### P3 · 离场被拒的共享搜索命令会在下一次进入 Mail 时执行

已接入共享 Workbench 命令，首页正常进入 Mail 并交接焦点的集成用例通过。命令先设置模块级的待执行标记，再调用 `openModule`；后者会遵循当前模块的离场判断，但拒绝时标记未清。使用实际 UI store 和命令监听器的隔离探针，拒绝从 Agent 离开后仍留在 Agent，随后手动打开 Mail，旧搜索命令却在 Mail 挂载时自动执行。命令交接应绑定成功的模块进入，并在拒绝时清理该请求。 [候选命令装配](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/apps/desktop/src/renderer/main.tsx:115) · [待执行标记](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/mail/src/ui/mail-search-command.ts:1) · [离场判断](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/packages/workbench/src/state/ui-store.ts:41) · [命令时序探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/ssh-run-and-command.log:18)

**通过的边界。** 独立 Engine 及实际组件复跑使用固定合并源码。当前可见目录与公开本机已发进入跨账号搜索；Engine 再核查账号修订和删除状态，隐藏目录、Bcc 和被丢弃的 HTML 脚本不进入搜索。按台北及洛杉矶自然日检查时间范围。Edge 从 A 的今天视图搜索 B 的旧信，8、2 分页，旧页晚到不覆盖改词结果，Esc 返回焦点，定位以账号、目录、UIDVALIDITY、UID 和本地消息 ID 找到原邮件，并切到全部时间。合成搜索和已读目标定位未产生额外 IMAP 或 SMTP 动作。 [搜索与原件定位](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/mail/src/engine/conversations.ts:225) · [固定候选测试记录](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.2-search-locate.md) · [实际组件复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/mail-renderer.log) · [共享命令集成通过](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates.log:524)

## Agent 跨 Tab 与关窗

### P2 · 跨 Tab 移动保存冲突会卸载原终端 viewer

独立 Edge 探针使用实际固定组件，并让布局保存回传版本冲突。开始移动源叶后切目标 Tab，隐藏的源 viewer 仍挂载。失败后 `moveTo` 的 `finally` 清空移动来源，目标 Tab 仍选中，源 viewer 被卸载；手动回源 Tab 创建了新 viewer。域布局未提交，原进程是否继续运行及 Core attach 计数没有在此合成响应探针中测量。成功移动的真实 App 回归同时核对了同一 DOM 节点仍连接、叶和 session ID 保留、重开后顺序正确。失败分支应保留源 viewer 直到还原原选中叶，避免让失败的移动触发额外 detach。 [移动提交与清理](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/agent-cli/src/ui/AgentCliModule.tsx:364) · [源叶保留](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/agent-cli/src/ui/WorkspaceCanvas.tsx:119) · [冲突时实际组件结果](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/agent-move-receipt.log:12) · [真实 App 成功分支](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates.log:497)

**关窗在途路径通过。** 固定 App E2E 扣住已成功保存的分栏关闭回执，确认关窗等待、放回回执后关闭，再打开核对已提交布局。源码登记窗口退出与切模块 guard，并以同一 `writeReceipt` 暴露在途结果。此 E2E 覆盖正常成功回执交接，失败后离场由上述合成 store 探针核对共享命令行为。report07 的三个 Agent 细项沿原结论，本轮未重复演练。 [离场与关窗登记](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/plugins/agent-cli/src/ui/AgentCliModule.tsx:97) · [真实关窗测试](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task08-1c9ba388/candidate/tests/e2e/shell.spec.ts:1894) · [固定候选 Agent E2E](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates.log:483) · [report07](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report07.md)

## 验证范围与接续

- 全部复核以固定 Git 对象和该候选的已生成门禁为准。独立测试从个人临时目录的 `git archive` 源码运行，复用已安装依赖。SSH 和邮件夹具只用本机回环，未写共享工作区构建目录。未创建 Git worktree 或测试 pane。
- 冻结脚本在组合工作流失败后退出。其后定义的任务 E2E、关窗文档 E2E、全量单测和同提交安装包，本报告无通过证据。组合门禁应在 SSH 重开及本轮确认的恢复边界修复后重跑。 [冻结脚本](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates.ps1) · [门禁结束记录](D:/Document/code/huhu/temp/issue-baseline/2e0d4d36-windows-gates-transcript.log)

## Lead 验收
