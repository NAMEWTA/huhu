# t17c · #8 M-02 缓存邮件的联系人对话

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task09.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task09.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report09.md`
- 执行结果 — `done`

## 结论

单账号和「全部账号」可按规范化的公开 From、To、Cc 组合浏览缓存邮件。先过滤已隐去的目录、已标记删除的邮件和草稿，再按同账号可靠 Message-ID 归并可见副本，排除 Vault 自身地址及 Bcc 后聚合并分页。无可靠 Message-ID 的邮件保留原来源。不同账号同一 Message-ID 的邮件可出现在同一联系人组合，分别保留自己的正文来源。仅 Bcc 的本机发送结果仍在发件箱查询。 [接线、复跑方式及窄屏截图](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.1-contacts.md)

## 产物与范围

- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-mail-confirmed-ui`，本地提交 `d941065be459584a9a3767673b28de1f56c5b2d5`，父提交 `b1aafd92c5649e7d314dcbcb42ee5776fe3a51a2`。工作树干净。提交范围为 `plugins/mail` 和 Mail 证据，根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。
- `mail.conversations.list`、`mail.conversations.messages` 用完整的本地缓存分组，再返回联系人页或往来页。IMAP 正文走现有 MailReader，按账号、目录及本地消息 ID 定位。`mail.conversations.sentBody` 从原账号的公开投递事实读取本机正文。
- 旧单封缓存可直接读取。同一 UIDVALIDITY 每目录保留已取回的最多 200 封，RFC822 base64 合计上限 24 MiB，单封原文仍限 2 MiB。每次手动同步沿用选中目录最新一封的抓取。历史批量扫描及远端已删旧信对账归后续同步切片。S2.2 的时间筛选、跨账号搜索及定位继续独立交付。

## 验证

Windows x64 固定 pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7 和 Edge 157.0.4341.60。基线单消息 Engine 测试通过，确认原实现每目录只缓存最新一封。完成后 Mail 8 个测试文件、43 项通过。Mail TypeScript、Oxfmt、Oxlint、Stylelint、五项项目 CSS 检查与 Git 差异检查通过。

| 检查 | 实测结果 |
| --- | --- |
| 两个本机回环账号与多目录 | 在真实临时 Engine 同时使用 UID 42 和同一 Message-ID。账号 A 的可见副本折叠为 INBOX 原来源，公开抄送合并。账号 B 的旧格式缓存保留独立来源，两封缺可靠 ID 的邮件保持独立。 |
| 分页与读取 | 账号 A 联系人逐组分页，多人组 5 封分成 2、2、1；全部账号多人组共 6 封。两账号各自正文可读，错用账号返回需刷新。Engine 重开后仍有历史，A 掉换 UIDVALIDITY 后旧消息失效，B 仍可读。 |
| 隐私与网络 | 隐藏、垃圾箱、垃圾邮件、草稿、已标记删除的邮件和 Bcc 均不进入公开组合。仅 Bcc 结果仍从发件箱读取。查看联系人、往来及正文时 IMAP 命令计数无增量，定向测试 SMTP 连接、认证、DATA 均为 0。 |
| 真实工作台 | Edge 在 390px 验证从单账号和「全部账号」进入对话并读取原正文，键盘返回恢复到邮件项或账号入口。「全部账号」浏览期间 SMTP DATA 无增量。既有阅读、回复、转发、新话题、草稿、发件和账号维护回归通过。 |

## 来源与指南

确认原型文件与 `7d17ffa6` 的资源一致，指纹 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。本地 one-mail 固定在 `d1be24d5bb83c2da7123b167f119d5abd169b0af`，README 标注 AGPL-3.0-only。核对 `src-tauri/src/commands/data/conversations.rs` 的分页、聚合、本机已发、账号内去重及参与者接线后，用 Huhu 已有缓存、OutboxStorage、Engine 能力和 MailReader 实现。

实施前完成 Modern Web Guidance `search`、`retrieve`。`stack-drill-down` 用于窄屏返回按钮与原项焦点恢复，`accessibility` 用于翻页时聚焦当前列表标题。

## 接续

共享 ZIP 锁独立补丁、上游台账和组合联验由 Lead 接续。

## Lead 验收
