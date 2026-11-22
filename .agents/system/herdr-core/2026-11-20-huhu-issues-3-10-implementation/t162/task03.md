# #8 S1b.4 发件记录核对、选择性重试与本地删除

终端 t162，任务 task03.md，报告 report03.md。沿用 Mail worktree 的候选 `564a9b680bd48757ccf8691faf86c7572949b58a`，依据 `.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S1b.4-outbox-reconcile.md` 和 Mail 网络/数据规格。实现后端逐收件人查询、改正后只对已证未投递的显式选定地址新建有父身份的重试、未知的原事实及显式删除本地记录而保留防重复最小信息。保留原 Message-ID/操作关联并按规格明确新尝试语义，拒绝重发已接受或未知地址，尤其关闭重开无补发。复用真实 Engine 的合成回环 SMTP 夹具。按用户最新更新仅用锁定 pnpm exec vitest 等自动化测试，不打开 GUI 或其他平台。认证服务、外部邮件、UI 与共享装配仍留在相应边界，本次不改根锁或另开 worktree。保全报告与实际证据，关闭临时验证 pane。
