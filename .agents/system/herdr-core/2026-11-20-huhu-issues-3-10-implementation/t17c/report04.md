# t17c · #8 S2.5 从当前邮件引用回复或回复全部

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task04.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task04.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report04.md`
- 执行结果 — `done`

## 结论

Mail 阅读区可用键盘打开引用回复，也可从正文右键选择回复全部。焦点进入原邮件下方的编辑器，发件人沿用来源账号。关闭保存失败会保留当前编辑内容，成功保存后可以从草稿列表重新编辑同一封。回环 SMTP 捕获了首次投递及拒收重试的原信线程头。 [回环证据与截图](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.5-replies.md)

## 产物与改动

- 独立工作树为 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`。分支 `impl/huhu-issues-3-10-mail-confirmed-ui`，本地提交 `6a75ccd7fd88c8c6149887c3c3a0640cd6ebfb68`，父提交 `44941ecd346f9aa452efcc0de13ad6fe84d2dae2`。提交后工作树干净。改动属于 `plugins/mail`、Mail 探针与验收证据。共享 Renderer、Engine 主入口及根锁保持基线，根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。
- `mail.messages.prepareReply` 按账号、目录和本地消息 ID 读取对应缓存中的原始邮件头。优先用原信 `Reply-To` 确定目标，缺少可用目标时回退到 `From`。回复全部增加公开的 `To`／`Cc`，排除 Vault 中已配置的自身地址、重复地址和原 Bcc。
- 草稿保留来源邮箱、目录、本地消息 ID、原主题与线程标识。引用是可编辑文本，长信限制为前 24,000 字符及 300 行并提示截短。收件专用邮箱可保存回复草稿，界面解释原因并停用发送。首次发送与选择性重试通过现有 outbox 冻结回复上下文，各自产生出站 `Message-ID` 并保留 `In-Reply-To` 与 `References`。线程头保留最多 32 个有效引用，超限时保留首项和最近项。
- 已回填 S2.5 验收。原型四个资源与确认提交 `7d17ffa6` 一致，确认指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。

## 验证

使用 Windows 固定 pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7 和 Edge 157.0.4341.60。邮件网络验证范围为本机回环 IMAP／SMTP 夹具，使用合成地址与临时 Vault。

| 检查 | 观察 |
| --- | --- |
| Mail 回归 | 7 文件、38 项通过，包括 Edge 实际组件与 Engine HTTP 联验。 |
| 键盘、右键和草稿恢复 | 键盘引用回复、正文右键回复全部、焦点、内联位置、收件人和锁定发件人均通过。修改引用后模拟首次草稿请求失败；重试保存，再由草稿列表进入，修改后的正文和引用均保留。打开回复、在主题按 Enter、保存和续编的 SMTP DATA 增量均为 0。 |
| 原始身份与持久化 | 两个邮箱的同 UID 消息保持独立，拒绝跨账号查找和更换回复发件人。注入 Vault 写入失败后，重启 Engine 可按原草稿 ID 继续编辑。收件专用账号可保存，UI 与 Engine 均阻止投递。 |
| 实际 SMTP 信封及 DATA | Edge 显式发送后捕获 1 次 DATA。Engine 部分接受与选择性重试用例捕获 2 次 DATA，各自的信封收件人正确。两次均保留原信 `In-Reply-To` 与 `References`，线程链尾为原信 ID，原始 Bcc 未进入信封或 DATA。 |
| 静态 | Mail TypeScript、改动文件 Oxlint、Stylelint、Oxfmt、项目 CSS 颜色／分层／类名／所有权／重复检查与 Git 差异检查通过。 |

[回环证据、源测试与重跑方法](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.5-replies.md)

## 源码与指南

核对本地 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`，许可证为 AGPL-3.0-only。对照 `conversation-pane.tsx`、`commands/data/conversations.rs` 和 `mail/smtp.rs` 的回复、参与者和线程头行为。本次复用 Huhu 原有 MailReader、MailComposer、IMAP 缓存、`@zone-eu/mailsplit` 5.4.31（MIT OR EUPL-1.1+）和 outbox，地址解析由 Nodemailer 10.6.0（MIT-0）提供。

实施前执行 Modern Web Guidance search 和 retrieve。`forms` 用于二级操作按钮语义，`accessibility` 用于回复聚焦正文和关闭恢复触发处，`ime-safe-enter-submit` 用于检查保留输入法及编辑器的 Enter 行为。回归用键盘分别验证了主题 Enter 和发送按钮 Enter。

## 阻碍与接续

- 本切片无阻碍。Mail 清单新增对现有锁定版本 `nodemailer@10.6.0` 的直接依赖。按任务边界，根锁保持基线。此工区以本机已安装版本验证。Lead 合并时需将该版本加入根锁的 `plugins/mail` importer，再用冻结锁安装。
- 转发和附件由独立切片承接。本次验证覆盖实际 Mail 组件、桌面身份的 Engine HTTP 能力和回环协议。完整安装包、preload、共享 Renderer 和 Web 会话的组合验收由 Lead 接续。

## Lead 验收


## Lead 核验结果

回复目标、同邮件身份和线程头的回环证据已读，等组合冲突处理及冻结锁检查后合入 6a75ccd7。
