# Mail 搜索、筛选与定位缓存消息

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t17c`
- 只使用 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，继续 `impl/huhu-issues-3-10-mail-confirmed-ui`，基线 `d941065be459584a9a3767673b28de1f56c5b2d5`。
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report10.md`

按 #8 已确认原型、S2.2-search-locate.md、source/spec/design/plan 承接 M-02/S2.1。复用现有公开联系人和 IMAP 来源记录，接入本地时间/账号/文本筛选、跨账号缓存查询和定位实际原信。用已有读取路径保证消息 UIDVALIDITY 与账号绑定，分页与改变条件时不能把迟到页插入新筛选。维持遮蔽 Bcc 和目录权限；查询过程禁止访问远端或发生投递。缺少历史时说明只覆盖已同步的本地范围。阅读真实 one-mail 固定提交、记录精确来源，从 Workbench 及真实临时 Engine 取证。

可写 plugins/mail 及 #8 证据，边界同 task09。公共 Vault ZIP、根锁及装配归 Lead。客户端改动先完成 Modern Web Guidance search/retrieve。仅使用本机 Windows 和环回合成夹具，不增开 worktree、不访问 ubuntu26 或操作远端。报告每一验收项及剩余范围，完成后关闭自开的测试 pane。
