# Mail 同地址恢复与 Linux 终端批准独立审查

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- Core — `wta-ubuntu`，执行者 `t8g`，Lead `t3p`
- 任务文件 — [task01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8g/task01.md)
- 报告文件 — [report01.md](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t8g/report01.md)
- 执行结果 — `done`
- 固定范围 — Mail `4e767f2e..f19affac`，Automations `56cde0fe..fc38dc86`。逐提交核对 diff，包含 Linux 映像检查与 Playwright 两个新增文件。Agent 接口以 `fc38dc86` 为准，正在开发的 Agent/native 工作树在本次范围之外。交付物为本报告。

## 结论

Mail 有三项可复现的备份与恢复缺陷。Linux 批准有一项桌面撤销缺口。两个提交各有三份文件未通过项目格式检查。Linux 的批准摘要与私有启动参数已对齐，真实启动、替换校验和 Windows 回归仍需在接线后的固定候选上验收。

## 规格轴

1. **P1 · Mail 能导出含两个同地址独立账号的 ZIP，空 Vault 无法恢复其中任何一个。** 普通用户恢复独立账号后，可以在「创建 Mail 备份」勾选原账号与新账号。导出接收两个不同 ID 并成功生成 ZIP。预检却因包内地址相同把两行均置为 `conflict`，并且没有 `canKeepSeparate`。在三个隔离 Vault 的探针中，用实际 `subset.create` 导出两个账号，再向空 Vault 预检，得到 `[conflict, conflict]`。两个账号的 ID 不同，且探针中没有草稿、投递或附件冲突。建议按独立 ID 支持这类有效包的恢复，并保留目标 Vault 的冲突检查。 [导出选择器](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/ui/MailSubsetSettings.tsx:142) · [导出](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:147) · [包内地址冲突](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:205) · [Mail 规格](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md:40)

2. **P2 · 已成功映射的本地已读标记在再次备份后会失去定位。** 恢复有 IMAP 定位的 v2 包时，标记被正确映射到新账号，但提交只持久化新哈希。首次同步前再次导出，系统只能从缓存找定位，生成无定位的 v1 包。在另一已有同地址账号的 Vault 预检新包，实际返回 `unmappedReadOverrides: 1`。原包里的定位有效，数据在产品自己的恢复和再导出流程中退化。现有重导出测试在导出前注入了缓存，因此没覆盖这个边界。建议把已验证的定位随标记持久化，并覆盖恢复后立即重导出。 [导出定位](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:162) · [保存已读哈希](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:263) · [重导出测试](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:506) · [Mail 规格](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md:40)

3. **P2 · 同一源账号和同一份持久数据仅因消息定位字段有无，可再次创建独立账号。** 来源指纹对整个账号行取哈希。v2 带定位的同一 ZIP 重试能找回原目标，但同一账号行以 v1 编码且仅省略 `messageLocations` 时，预检找不到已有的独立恢复记录。探针先恢复 v2，再对同一源 ID、配置和本地标记的 v1 包预检及显式提交，账号数从 2 变成 3，返回新的目标 ID。只有标记、没有草稿和投递的有效包即可触发。现有 `legacyKey` 对照受原账号 ID 限制，独立恢复生成的新 ID 无法走该分支。建议为不改变持久内容的定位补充建立稳定的重复识别关系。 [指纹](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:68) · [目标匹配](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:194) · [恢复验收](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S6b.1-subset-restore.md:22)

4. **P2 · Linux 系统 sh 暂时无法核对时，桌面用户无法撤销现有批准。** 桌面预检先做映像核对，失败时整个调用被拒绝。对话框只在拿到 `approvalId` 后显示「撤销批准」。在真实批准处理器的隔离探针中，临时模拟 `/bin/sh` 无法解析，`approval.review` 和外部状态均返回 `PERMISSION_DENIED`。恢复路径后，预检再次返回同一个批准 ID，外部状态重新可用。用事先保存的 ID 调用 desktop revoke，则在映像仍不可核对时也能完成撤销。这表明桌面缺的是获取批准 ID 的路径。建议在桌面仍提供现有批准的撤销入口，同时继续拒绝新的批准和派遣。 [sh 核对](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/approved-linux-shell.ts:10) · [预检顺序](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:397) · [桌面撤销处理](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:432) · [对话框按钮](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/ui/TerminalApproval.tsx:84)

## 已核对的行为

- Mail 现有测试覆盖默认跳过、显式确认、原 ID 已占用、附件和草稿故障回滚、确认记录写失败后重开、同一 ZIP 回查、原账号密码与 revision 及新账号待认证。凭据写入按目标 ID，独立恢复使用新 UUID，投递保留原操作 ID、发送状态和防重认领。现有工作台界面显示来源与当前账号，勾选框说明默认跳过与本机认证保留，提交回执明确提示补配本机认证。 [凭据写入](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts:167) · [恢复提交](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:458) · [预检界面](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/ui/MailSubsetSettings.tsx:175) · [业务用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:401)
- Linux 候选把本机 Vault 实例、规则版本与文件身份、原命令、Space/目录身份、映像与固定 argv 纳入摘要，变量名和修订按原授权记录核对。撤销后重交先验证授权。同一授权及请求在规则配置串行边界下关联一次持久运行，启动使用固定 request ID，恢复按该 ID 查询。Windows 保留原目标摘要计算及 `launch` 分支，普通本机 `default` 和 `sh` 的既有名字解析及启动路径保持原行为，领域测试有对应断言。 [批准摘要](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:242) · [外部派遣](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:465) · [持久认领](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:532) · [领域测试](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/test/service.test.ts:146)
- 接口对照 `t4x/report13.md` 的约定，Automations 发送 `TerminalRuleLaunch`、`env`、`approvedDirectory` 和 `approvedShell`，签名接受 `AbortSignal` 并返回会话 ID。映像字段与 argv 三元组匹配契约。没有专用方法时，预检给出原因，提交批准和外部派遣拒绝，私有 `launch` 不承接 Linux 批准。已知的 Agent 接线由 `t86` 承接。 [私有消费者](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:174) · [固定版本提供方](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts:732) · [接口约定](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report13.md)

## 规范轴

- **P3 · 固定提交的六份文件未通过根工程格式检查。** 将两个提交的变更文件及各自的 `.oxfmtrc.json` 提取到临时目录，分别使用仓库的 `oxfmt --check --threads=1`。两个快照均退出 126。Mail 为 [message-cache.ts](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/message-cache.ts:35)、[subset-data.ts](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:77)、[outbox-engine.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/test/outbox-engine.test.ts:415)。Automations 为 [approved-linux-shell.ts](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/approved-linux-shell.ts:25)、[TerminalApproval.tsx](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/ui/TerminalApproval.tsx:107)、[TerminalEnvironment.tsx](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/ui/TerminalEnvironment.tsx:80)。[根检查命令](/home/wta/projects/huhu/temp/issue-worktrees/integration/package.json:22)
- 两边复用各自的现有存储、宿主接口和操作边界。Mail 使用原快照锁、账号存储与 OperationLog，Automations 使用现有规则配置边界、授权、凭据和 Agent 私有服务。读取 Modern Web Guidance 的 `forms` 指南，核对了本机界面的原生复选框、可见标签与 `aria-describedby`。本轮为只读审查。 [项目规则](/home/wta/projects/huhu/temp/issue-worktrees/integration/AGENTS.md)

## 验证证据与未运行项

- 两个提交的 `git diff --check` 均通过。Node 24.21.0 加载同版本的 Mail/Automations 业务文件，在临时 Vault 做无网络监听的能力处理器探针，得到上述四项复现结果。Linux 探针只模拟映像路径解析失败，使用批准处理器与本机批准文件，未启动终端。
- Mail Lead 日志记录同一测试文件 **12/12 通过**。开发者报告补充了凭据、journal 与附件覆盖。日志尾部显示启动过 `tsc`，现有片段不足以独立确认退出状态。 [Mail 定向日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-separate-restore-check.log) · [Mail 实施报告](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report12.md)
- Linux Lead 日志记录 `service.test.ts` **34/34 通过**，包括替身启动收到的目录、映像、argv 和一次调用。日志中的 lint 通过与本轮 `oxfmt` 格式结果属于不同检查。 [Linux 定向日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/linux-approval-check.log) · [Linux 实施报告](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report13.md)

### 待验收与未运行

- Mail 同地址分支的实际桌面及 Web 交互、双边同名且均待认证时能否定位新账号、真实 Gmail 重新授权和跨账号转发来源映射。现有原型确认记录覆盖空 Vault，明确把同地址冲突单列。Gmail 定位的哈希含 OAuth Client ID，跨端重授权使用不同 Client ID 时需核对标记与来源链接。 [原型确认](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/prototype-review.md:29) · [Gmail 标识](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/message-cache.ts:159) · [OAuth 保存](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/accounts.ts:176) · [转发映射](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/mail/src/engine/subset-data.ts:242)
- Linux 需用已接线的固定候选验证真实 CLI/MCP/Core、目录和映像替换、单次票据、已核对文件与实际执行对象一致、失去回包后的物理启动次数、保护值脱敏，以及 Windows PowerShell 和普通本机启动回归。用例为「Linux sh CLI/MCP 的终端授权、保护值轮换与原意图对账」与「Windows PowerShell CLI/MCP 的终端授权、保护值轮换与原意图对账」，桌面用例为「Linux 桌面批准 sh，CLI 和 MCP 配置及运行沿用原请求」。 [CLI/Core 集成用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/cli/test/approved-terminal.test.ts:28) · [桌面用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/tests/e2e/workflows/automation-linux-environment.spec.ts:19)
- 本轮未启动 Vitest、Electron/Playwright，未运行 Go 构建、打包、全仓测试、类型检查、lint 或 knip。项目格式检查仅覆盖两个固定提交的变更文件。

## 回告

`HC_TERMINAL_ID=t8g` 与共享清单当前指针一致。`hc get t8g` 返回 Core 锁文件系统只读。共享报告可由 Lead 直接收取。

## Lead 收取
已读取并核对四项发现的代码路径，审查任务完成；候选不判为验收通过。交 t8k/task01.md 修复后复审。
