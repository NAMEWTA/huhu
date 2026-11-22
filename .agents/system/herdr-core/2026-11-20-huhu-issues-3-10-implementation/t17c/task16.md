# #8 S3.2 Gmail 历史与重连，并核对 S4.2 Outlook 退回路径
共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t17c
task task16.md
report t17c/report16.md

基线 4563a422，独立工作树 D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle，分支 impl/huhu-issues-3-10-mail-api-sync。所有原型已确认。按 #8 spec/design/tasks S3.2 与 S4.2，复用 S5 IMAP 缓存、S3.1/S4.1 已提交凭据和 one-mail。优先以 Google 官方 Gmail API 历史能力对接受管合成 mailbox，游标、有界初始化、历史失效回退、重启/重试、删除与通知，确认隐私范围和批次。只用 Windows 隔离 Vault、合成凭据、本地发行方和本地协议夹具。Outlook 先验证无 Graph 权限时真实 Exchange IMAP 继续工作，仅当已有账户确有权限才接相应路径。额外 consent 未另行确认。可写仅 plugins/mail 和验收证据，Lead 负责公共 OAuth 系统浏览器装配。客户端 HTML/CSS/TS 先 MWG search/retrieve。分步提交，报告保留真实权限、请求计数及恢复证据。不使用任何真实登录、账号、外部主机。
