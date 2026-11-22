# t17c · #8 S1a.4 预览影响并删除指定邮箱

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task06.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task06.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report06.md`
- 执行结果 — `done`

## 结论

桌面 Mail 可按配置修订预览本地删除范围，取消后继续原工作。确认时按账号 ID 清理本机缓存、草稿、附件引用、配置和凭据，保留仍被其他本机资料引用的附件。已接受或可能已接受的投递保留 Message-ID 及可核对结果。清理中断后可从「继续清理」恢复。 [验收证据、截图和复跑方法](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1a.4-remove-account.md)

## 产物与改动

- 独立工区 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`。分支 `impl/huhu-issues-3-10-mail-confirmed-ui`，本地提交 `f4e43d5eba286969b1ea141f644f6c24366119e2`，父提交 `46b9047ae67e2a1f1abe9f0549e3f7144a512cc2`。提交后工作树干净。
- `mail.accounts.previewRemoval` 与 `mail.accounts.remove` 限桌面和可写 Vault。预览指纹绑定原配置修订、目标草稿修订、缓存版本、投递记录版本和在途状态、凭据登记以及受影响对象的共享引用。确认时重新校验。同地址的两个账号用不同 ID 计算和清理。
- 确认后的第一笔 Vault 写入发布持久的账号清理记录，之后中止目标同步、标读、认证修复和投递，等待在途工作退出。草稿、缓存及 outbox 复用原有写入边界，附件使用同一快照和对象回收。SMTP 已接受或可能已接受的记录剥离主题、正文、传输配置及附件，只留投递核对和防重所需的数据。明确未投递保留去重标记。
- 事务按阶段提交。第一笔写入失败时账号继续可用。后续阶段失败时账号保持停用，清理记录保留恢复依据，可重复执行已授权清理。配置和凭据按原 revision 走既有凭据事务。
- 改动限 `plugins/mail` 和该成员证据。共享 Renderer、preload、Engine 主入口及根锁保持基线，根锁 blob 为 `ce368ced5888cc3775d8e0265113737839e989d5`。确认原型的四个资源与 `7d17ffa6` 一致，指纹为 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65`。

## 验证

Windows 固定 pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7、Edge 157.0.4341.60。验证使用临时 Vault、合成账号、真实 Engine HTTP 与本机回环 SMTP／IMAP。

| 检查 | 观察 |
| --- | --- |
| Mail 回归 | 7 文件、39 项通过，包含 Edge 的实际 Mail 组件联验。Mail TypeScript、Oxfmt、Oxlint 及 Git 差异检查通过。 |
| 预览、取消与冲突 | Edge 初始焦点在取消，取消后焦点回到原触发按钮，原编辑器保留。配置改名后旧确认被拒，刷新可拿到新预览。Engine 中草稿修订、共享附件变更及跨账号使用指纹也触发冲突。 |
| 删指定邮箱 | 两个同地址账号使用不同 ID、IMAP 及凭据。目标的三份草稿、一份缓存、一个独占附件和本机配置凭据被清理。另一账号的草稿修订、缓存、共享对象和独立凭据仍可读。 |
| 在途和投递核对 | 夹具分别提供明确接受、DATA 前拒收、收到 DATA 后扣留回执三种结果。目标在途 IMAP 与 SMTP 停止。前者可查已接受记录，后者可用同一 Message-ID 查待核实记录，两者均不可重试。明确未投递详情被清理。迟到响应、旧的认证保存和过期草稿写入都没有恢复资料。SMTP DATA 前后均为 2 次，清理无远端删除指令。 |
| 分步失败和重启恢复 | 注入首条清理记录写入失败，保持账号可用且 SMTP 仍在途。另注入凭据定义写入失败，返回待清理。Edge 可从「继续清理」完成，Engine 在同一 Vault 重启后也可完成并重放确认。 |

## 源码与指南

对照本地 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的 `src/components/account/remove-account-dialog.tsx`，许可证为 AGPL-3.0-only。实际采用 Huhu 原有 Dialog、账号凭据 CAS、Mail 写入队列、草稿和 outbox 防重记录与附件快照。实施前完成 Modern Web Guidance search 和 retrieve，采用 `dialog` 的安全初始焦点、`accessibility` 的关闭与焦点恢复、`forms` 的显式按钮类型。回归中同时修复附件动作结束时的焦点恢复时序。

## 阻碍与接续

本切片无阻碍。此轮验收覆盖 Windows 临时 Vault、Edge 组件和受控协议夹具。Lead 负责组合工作树和安装包验收。

## Lead 验收

