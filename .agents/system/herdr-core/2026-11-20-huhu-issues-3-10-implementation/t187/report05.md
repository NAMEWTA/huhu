# #4 Core 递归工作区与 #8 联系人对话独立审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task05.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task05.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report05.md`
- 执行结果 — `done`

## 结论

**#4 当前工作区交互、#8 S2.1 隐私验收均暂缓签收。** #4 的 Core 文档持久化、冲突拒绝和工作台重开已有通过证据。任务定位、启动回执和分栏终止仍有焦点或生命周期问题。#8 的历史缓存及公开列表已有通过证据。联系人阅读器仍能展示含 Bcc 的 IMAP 原文，也会在选中邮件从当前公开对话消失后保留旧阅读状态。下列 P2 为固定候选的源码审查结论，日志中的实测覆盖另列。

## 固定候选与产物

| 范围 | 固定候选 | 源码定位 |
| --- | --- | --- |
| #4 Core workspace | `04bfbba31f2cc6e11a50da5ed442c73f014b8de5`，父提交 `46a770ed` | `D:/Document/code/huhu/temp/issue-worktrees/integration` |
| #8 Mail S2.1 | `d941065be459584a9a3767673b28de1f56c5b2d5`，父提交 `b1aafd92` | `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle` |

各判断以对应 Git 对象为准。运行证据来自已有 Windows 日志和 Mail 实施记录。本终端未重跑共享集成工作树的测试，交付文件为本报告。

## #4 Core workspace

### P2 · 目标已关闭时，陈旧菜单仍可启动终端

窗口 A 的创建菜单保存目标叶及当时的文档版本。窗口 B 收起该叶后，A 仍可从旧菜单提交。提交先调用 `agent.sessions.launch`，布局写入才校验版本。Core 拒绝旧布局，进程已启动且没有分栏绑定，可在原 Space 的 Agents 找回。W3.1 要求另一窗口先关闭目标时保持进程和 attach 数量。另一 Space 的写入同样会递增整份文档版本，故启动成功之后的布局提交也可能因无关写入被拒绝。建议在启动前验证同一 Space 的当前目标，提交时绑定同一意图，并为仍在有效目标上发生的版本冲突保留可重试的落位路径。已获准启动才迟到的进程应继续在原 Space 可查。 [启动意图与布局提交](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:162) · [Core CAS](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/workspace-layout.ts:52) · [W3.1 验收](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W3.1-split-move.md:15)

### P2 · 任务定位可用旧布局结算，且成功选择后缺少键盘焦点交接

任务事件按 Vault 隔离，会刷新会话列表。在当前 Space 的布局已有缓存且正在重取时，`workspace.isFetched` 仍满足条件。定位用旧布局查找会话所属 Tab 和叶，随后清掉请求。若当前版本才绑定会话，刷新完成后预览会消失，画布仍可留在原 Tab。即使成功选择已绑定叶，也只更新选择状态，未走现有的 `setFocusTarget` 路径。应从同一 Space 的最新工作区结果确定归属，再一次性选择并移交焦点，保留未绑定会话的预览。 [任务打开与定位](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:117) · [预览判定](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:240) · [现有焦点路径](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:93)

### P2 · 创建回执会覆盖同一 Tab 内更新的焦点或 zoom

切换 Space、切换 Tab、打开既有会话和任务定位都会更新导航代次，旧回执据此避免覆盖这些操作。启动在途时，用户仍可聚焦或放大同 Tab 的另一叶，这两条路径没有更新代次。成功回执随后将活动叶换成新终端、清除 zoom 并请求 DOM 焦点。应让当前窗口的主动焦点和 zoom 变更也参与回执的焦点判断。 [回执写选择与焦点](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:178) · [叶选择](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:245) · [zoom](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:498) · [画布指针和焦点入口](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/WorkspaceCanvas.tsx:125)

### P2 · 终止校验与实际终止分开，另一窗口仍可改掉目标绑定

「收起分栏」只改布局。「终止并关闭」先读文档版本，再调用指定会话的 kill，等该 ID 真实退出后才尝试保存布局。另一窗口在读完版本后可收起原叶，先前操作仍会终止已经收起的会话，最后的布局 CAS 无法撤回 kill。其他 Space 在 kill 后先写入，也会使清理提交冲突，原叶可能留作已退出占位。修复应让终止针对仍成立的绑定，退出后的布局清理基于最新文档对账，并保持失败/未确认退出时原会话仍可查。此项是源码时序判断，实测日志覆盖收起和 shell 自行退出。 [终止、退出轮询和布局提交](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:255) · [收起逻辑](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/ui/AgentCliModule.tsx:289) · [W3.3 验收](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W3.3-close-park.md:15)

## #8 Mail S2.1

### P2 · 公开联系人阅读器可以展示含 Bcc 的 IMAP 原文

聚合从 From、To、Cc 提取参与者，公开列表正确排除 Bcc。本机已发走独立的正文能力。IMAP 对话项则复用普通 `MailReader`，其中「查看原文」将缓存 RFC822 字节解码后直接展示。若 IMAP Sent 副本保留 Bcc，该地址会在公开联系人阅读器出现，违反 M-02 的私有发件记录边界。应让联系人阅读路径只消费经公开投影的内容，并给含 Bcc 的 IMAP Sent 副本补上阅读入口回归。已有 Engine 用例断言公开列表和往来 DTO 无私有地址，覆盖范围到投影输出。 [M-02](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md:23) · [参与者投影](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/engine/public-mail.ts:9) · [联系人阅读器接线](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/ui/MailModule.tsx:772) · [原文字节读取](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/engine/message-cache.ts:234) · [原文展示](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/ui/MailReader.tsx:294) · [列表隐私断言](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/test/conversations-engine.test.ts:164)

### P2 · 账号或目录退出公开对话后，旧阅读器仍可留在原位置

「全部账号」的同一参与者组可以同时包含 A、B 两个账号的邮件。删除 A 后，只要 B 仍组成同一组，往来页刷新可移除 A 的邮件，但阅读器查找失败会退回旧 `opened`，保留同一组件及已加载正文。目录被移出账号的选中目录或变为不可见时也有这条回退。账号删除标记会阻止新的通用正文和原文读取，已在屏幕上的状态仍由阅读器持有。目录当前是否可见则未参与通用缓存读取的校验。应在公开时间线确认失去当前邮件时关闭阅读器，并以当前账号和目录可见性约束联系人正文的重新读取。回归可使用同组两个账号，核对移除后另一账号仍可浏览、原正文和原文入口随已失效的选择一起退出。 [公开目录与账号过滤](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/engine/conversations.ts:34) · [删除标记重查](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/engine/conversations.ts:105) · [旧选中项回退](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/ui/MailModule.tsx:704) · [阅读器正文状态](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/ui/MailReader.tsx:50) · [通用正文读取](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/engine/message-cache.ts:290)

## 验证

| 验收要求 | 已有执行证据和覆盖判断 | 证据 |
| --- | --- | --- |
| Core 文档、版本和写入丢回执 | Windows 领域检查两文件共 6 项通过，其中真实临时 Core 测试从空文档开始，验证 A 写入后 B 的旧版本被拒、B 按新版本只改自身条目、成功写入回执丢失后只发一次 `doc.set`。同一用例验证未知文档格式保持原样和 CLI 能力拒绝。 | [领域测试日志](D:/Document/code/huhu/temp/issue-baseline/agent-workspace-domain-ui.log) · [真实 Core 断言](D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/test/agent-workspace.test.ts:35) |
| 本机工作台重开、Core 重启与连接恢复 | Lead 的组合提交 `285cd6f6` Windows Agent E2E 3 项通过。递归测试建六叶、验证稳定叶 ID、切换两个 Space、收起一叶并重开应用，核对五个原叶 ID、两个 Space 与保存比例。组合提交的 Agent CLI、Herdr client 与 Core 文档测试路径和固定候选无差异。另有真实 Core 测试重启 Engine/Core 后再次读取两 Space 的结构；订阅代码在重连成功及命中文档事件时均触发刷新。现有证据分别覆盖本机应用关闭重开和 Core 文档重启保留。在线窗口跨重连后的焦点、旧文档与二窗同步仍需实测。 | [Lead 组合日志](D:/Document/code/huhu/temp/issue-baseline/285cd6f6-windows-gates.log:470) · [Core 重启实测](D:/Document/code/huhu/temp/issue-baseline/agent-workspace-core-doc-r2.log) · [订阅与回连](D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/waiting.ts:78) |
| 分隔条、zoom 与关闭 | E2E 实测键盘改比例、拖动后 Escape 回滚、放大/还原、两终端输出隔离、收起后 Agents 项保留及独立 shell 退出。更早的工作区日志曾因显示比例为 55 而预期 60 失败。固定候选验证持久值 60，显示值按可用空间上限计算，Lead 后续用例通过。输出帮助函数会手动聚焦终端，证据未覆盖点击 zoom 后随即键入、窄窗持续输出时隐藏和恢复、双窗下的实际终止及子进程结果。 | [比例与 zoom 输入](D:/Document/code/huhu/temp/issue-worktrees/integration/tests/e2e/shell.spec.ts:1760) · [持久比例断言](D:/Document/code/huhu/temp/issue-worktrees/integration/tests/e2e/shell.spec.ts:1824) · [旧运行日志](D:/Document/code/huhu/temp/issue-baseline/agent-workspace-ui-e2e-r2.log) · [W3.2 验收](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W3.2-resize-zoom.md:15) |
| Mail 历史升级、公开参与者与网络副作用 | `d941065b` 的 Windows 实施记录为 8 文件 43 项通过。双本机回环账号覆盖旧版单封快照、同 UIDVALIDITY 留存历史、去重、跨账号保留来源、分页、重启和单账号 UIDVALIDITY 切换。缓存保留同代最多 200 封、原文 Base64 总长最多 24 MiB。测试还覆盖排除草稿、垃圾箱、隐藏目录、已标记删除项以及仅 Bcc 本机发送。列表和正文能力的执行观察到 IMAP 命令无增量、SMTP 未连接。Edge 390px 实测单账号和全部账号浏览、打开原正文与返回焦点。M-02 的 Bcc 原文和已打开消息被撤出后的路径没有同等运行证据。 | [固定候选实施记录](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report09.md) · [S2.1 Windows 证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.1-contacts.md) · [历史加载及清理测试](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/test/conversations-engine.test.ts:137) |

## 范围与接续

- #4 此次实做包括 Core 文档、稳定递归树、当前视图的 zoom/选择、收起及终止入口。Tab/叶的窗口选择在组件实例内保留，应用重开证明了结构与比例恢复。在途终端跨 Core 重连与焦点恢复应单独取证。W3.4 的终端移动、后续权限与组合验收、同提交 Windows 安装包属于后续范围。这里记录的 Workbench 能力拒绝与本机 E2E 可用于当前切片。 [W3.4](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W3.4-move-terminal.md) · [W8.2](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W8.2-integrated-workspace.md) · [W8.3](D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W8.3-acceptance-package.md)
- #8 此次实做为已有本地缓存的联系人聚合和阅读。每次手动同步仍沿用单目录最新一封抓取。批量扫描、远端删信对账、S2.2 跨账号筛选与定位为后续切片。 [S2.1 实施范围](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report09.md)
- 本轮报告已完成。两候选须修复上述发现，并在相应的真实工作台或隔离夹具中复验。

## Lead 验收
