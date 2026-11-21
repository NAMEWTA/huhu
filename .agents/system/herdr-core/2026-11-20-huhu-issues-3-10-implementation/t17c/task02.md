# #8 S1a.2、S2.3、S2.4 真实收件箱和阅读状态

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17c`
- 工作目录 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 分支 — `impl/huhu-issues-3-10-mail-confirmed-ui`
- 基线 — `20567cc22d1dd661331015130001d106c0bc0b0e`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report02.md`

按已完整确认的 #8 原型、S1a.2-first-message.md、S2.3-read-message.md、S2.4-read-state.md。优先完成从已保存邮箱同步、看到首封合成邮件、选中打开安全正文、失败时明确重试和读状态的实际闭环。复用已装配的 mail.messages 能力、现有 IMAP 同步和正文清理，不开发第二套持久层。有实际远端修改的能力仅对本机授权的测试邮箱夹具调用。需要其他小型能力时可在 plugins/mail 内实现并用真实 Engine HTTP 验证，说明状态与持久证据。保持上一切片的账号、写信、草稿和发件箱行为。OAuth、联系人或转发等超出本任务范围。

可写 plugins/mail 和对应 #8 任务证据，不改公共 Renderer、Engine 主入口、根锁或其他工区。前端首先执行 zh-modern-web-guidance search/retrieve。使用 Windows 和固定 pnpm 12.10.1 运行仓库自动化与合成、回环夹具，不连接外部服务、不派发 agent。提交完成后按文件协议发布报告。
