# t17c · #8 S5.1／S5.2 Mail 历史刷新、断线恢复与定位

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task14.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task14.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report14.md`
- 执行结果 — `done`

## 交付

分支 `impl/huhu-issues-3-10-mail-sync`。阶段提交 `251baeeff1a6d667f5629e75d7c6a56cfd1dabf2`，父提交 `ed17bce6ba6f75568e0a9b3920283b1395344686`。工作树为 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，提交后工作树干净。改动限 Mail 引擎、界面、专属回归和 #8 证据。根锁 blob 为 `b3c2fc9cb809a8acab6d55b003785463165cf37f`。

对照固定 one-mail 提交 `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的 IMAP 和后台同步实现，复用 Huhu 自有 ImapFlow 和缓存。初扫抓最近 200 封，摘要按 25 封分页；增量按已提交 UID 查边界并推进，重复刷新对账 FLAGS 和删除情况。邮件原文受每封 2 MiB 与整轮 18 MiB 约束。同一账号排序执行，同目录并发合并。UIDVALIDITY 变化立即撤出旧定位和缓存查询。

邮件设置可改实际刷新周期，默认 15 分钟，0 关闭后台。支持 IDLE 的收件箱可唤醒刷新，断线后保留定时轮询。刷新失败从 5 秒起退避。通知仅在已提交的新未读收件箱邮件上生成，使用稳定的 ID 确认或重投。Mail 按 Vault、Engine 端点与具体消息解析通知，并走既有搜索定位流程。

## Windows 实测

| 场景 | 观察结果 |
| --- | --- |
| 初扫、多封与重复 | 205 封目录，8 次摘要分页、200 次 BODY PEEK，搜索找到窗口最老的 UID 6。初扫零通知。重新刷新对账 FLAGS，BODY PEEK 总数仍为 200。 |
| 增量乱序、断线与回退 | 回环夹具乱序交付 27 封。正文传输中断时保留已提交的 UID 205。用可控时钟触发实际调度器，5 秒退避后恢复到 UID 232。另观察到了实际 IMAP IDLE 和 EXISTS 唤醒，IDLE 断开后保持定时刷新。 |
| 单飞、取消、换库 | 三个并发调用共用一次选箱。取消一个等待者，其余完成。换 UIDVALIDITY 后在新正文仍阻塞时，旧定位已撤出。关闭并打开另一临时 Vault 后，没有重开旧 IMAP 作业，也无法解析它的通知。 |
| 通知存储与精确定位 | 通过 Mail 宿主参数接实际 `NotificationStore`。只为新未读的 UID 206、232 发通知，按账号、INBOX、UIDVALIDITY 和 UID 定位。UID 233 的通知确认丢失后以相同 ID 重投，存储仍为 3 条。另验同 Vault ID 不同 Engine 端点会丢弃迟到请求。 |
| 回归与静态检查 | Mail 全项目 9 个文件、46 项通过，包括原文、公开联系人、移除账号及转发源变化。Mail TypeScript、改动文件 oxfmt／oxlint、`git diff --check` 通过。前端完成 Modern Web Guidance search/retrieve。 |

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-mail' --maxWorkers=2 --minWorkers=1
node node_modules/typescript/bin/tsc --noEmit -p plugins/mail/tsconfig.json
```

## Lead 装配与边界

- 给公共 Engine 的 `mail.apply` 传第五个参数 `{ notify: ({ id, ...notice }) => { notifications.create(notice, id); } }`。使用现有站内通知存储及其事件，保留稳定 ID 的幂等语义。
- 将 Workbench 的 Mail 通知点击接到 Mail UI 导出的 `requestMailNotification({ id, vaultId, endpoint: endpoint.baseUrl }, () => ui.getState().openModule("mail"))`。由当前 Engine 提供作用域。Mail 模块会重新核对目标，再切账号、时间和具体消息。
- 本次验证覆盖 Windows 回环 IMAP、真实通知存储和精确定位能力。公共桌面铃铛收到通知以及点击后的界面高亮和焦点仍待 Lead 装配联验。Google／Microsoft 的真实 OAuth 或邮箱未接触。

[#8 S5 复验证据](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S5-imap-refresh-and-notification.md)
