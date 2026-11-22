# #8 Mail 同步历史、断线恢复与桌面定位

- terminal_address `t17c`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 新分支 `impl/huhu-issues-3-10-mail-sync`，以 `ed17bce6ba6f75568e0a9b3920283b1395344686` 为基线
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report14.md`

处理已确认 #8 的 S5.1/S5.2，并补足当前只取最新邮件所丢的一批历史。先对照现有 Mail IMAP / message-cache、one-mail 已固定来源、WorkBench 通知与定位，交付有界分批的真实多封刷新、协调同账号与取消重试。目录 UIDVALIDITY 变化继续撤出旧查询结果。基于既有调度和站内通知推进实用的刷新周期、断线回退、点击回到精确消息。阶段提交优先拿到真实 Windows IMAP 夹具的多封、重复刷新、乱序、断线恢复、切 Vault 停止和通知定位证据。Google/Microsoft 真实客户端另做，当前不接触真实账号。不要伪造产品认证或数据通知结果。

可写 Mail 引擎、Mail UI、专属测试与 #8 证据。公共 Engine / Renderer 装配仍归 Lead。Web/UI 先 search/retrieve。仅用本机 Windows 和隔离假邮箱，不写其他工作树、根锁、真实远端或系统设置。

