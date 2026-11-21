# #8 S2.5 在当前阅读邮件中回复或回复全部

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17c`
- 独立工区 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 分支 — `impl/huhu-issues-3-10-mail-confirmed-ui`
- 基线 — `44941ecd346f9aa452efcc0de13ad6fe84d2dae2`
- 报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report04.md`

按 S2.5-reply-forward.md、spec、design 与完整确认的 Mail 原型，复用当前 MailReader、原邮件身份、MailComposer、IMAP 解析和有原身份的 outbox。实现当前邮件回复／回复全部、账号自己的地址排除、去重和引用可继续编辑，明确关联原邮件并按任务规格处理实际 SMTP 回复头。验证所有网络行为仅通过已有授权本机回环 IMAP/SMTP 夹具，点击回复不发送，故意保存失败保留草稿，重新编辑原草稿并验证真实请求。转发与附件留已有独立切片，勿扩到外部账号。先完成 Modern Web Guidance search 和 retrieve。只改 plugins/mail、Mail 专用证据与测试夹具，保持共享 Renderer、Engine 主入口和根锁不动。使用 Windows 固定 pnpm，发布提交和 report04.md。
