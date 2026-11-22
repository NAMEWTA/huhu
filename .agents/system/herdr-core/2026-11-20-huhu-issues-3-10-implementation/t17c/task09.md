# #8 M-02 按公开联系人组合连续邮件

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t17c`
- 独立工区 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 基线 b1aafd92c5649e7d314dcbcb42ee5776fe3a51a2
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report09.md`

按已确认 #8 原型、对应 S2.1/S2.2（以实际任务文件为准）与 M-02 完成已缓存邮件的联系人对话。复用现有 MailReader、消息缓存/UID 和 Bcc 隔离。一个账号内按可靠 Message-ID 去重可见副本，缺 ID 保留来源。按 From/To/Cc 规范化的公开参与者与 Vault 自身地址计算组合，已隐去的目录和 Bcc 不进入。分页发生在正确分组之后，选定对话时保留当前账号/原来源读正文。先验证现有实现，参考固定本地 one-mail 并登记接线点。涉及前端先做现代指南 search/retrieve。Windows 固定 pnpm，真实临时 Engine 及两个本机回环账号/目录测试，包含相同 UID/Message-ID、多人抄送、跨账号、隐藏目录、零 SMTP。只写 plugins/mail、Mail 证据与该模块测试。Lead 写 ZIP 共享锁的独立补丁及上游台账。不要建 worktree、连接远端或委派。提交并按文件协议交付。
