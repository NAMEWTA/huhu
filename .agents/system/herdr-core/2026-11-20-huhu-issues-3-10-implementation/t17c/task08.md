# #8 M-05 从原邮件进入转发和新话题

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t17c`
- 独立工区 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 基线 4e6daf0829fd41867df5db11bde329598f84f978
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report08.md`

按已确认 #8 原型、Issue M-05 和 Mail spec 补全正文转发入口与新话题。复用已交付的 MailReader、MailComposer、原信身份校验、有界引用正文、draft/outbox 与受管附件。转发空白收件人、可编辑转引内容，明确显示源附件只有名称时未携带文件字节。只有实际纳入这封草稿的受管附件可进入 SMTP；历史 Bcc、不相关邮件及远端资源保持隔离；新话题可以选账号并清理原线程头。使用本地 one-mail 参考与固定许可记录，勿复制 GPL 实现。先做现代 Web 指南 search/retrieve。Windows 固定 pnpm、真实临时 Engine 与 IMAP/SMTP 回环验证焦点、草稿保存/重开和发送有无正确线程头/附件。只写 plugins/mail、Mail 证据，Lead 负责共享上游台账。不要建新工作树，不连接远端，不委派。提交，按协议报告。
