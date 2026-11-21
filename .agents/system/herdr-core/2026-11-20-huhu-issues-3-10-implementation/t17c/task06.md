# #8 S1a.4 预览影响并删除指定邮箱

- 共享根：`D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address：`t17c`
- 工作目录：`D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 实施分支：impl/huhu-issues-3-10-mail-confirmed-ui
- 基线：46b9047ae67e2a1f1abe9f0549e3f7144a512cc2
- 报告：`D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report06.md`

继续独立实现 S1a.4，按已经整体确认的 #8 原型删除场景、Mail source/spec/design、S1a.4 验收。稳定的预览需按账号 ID、已核对 revision 和变化的影响项绑定，清理指定账号的本地草稿、附件引用、缓存、配置和凭据，保留可能已接受的可核对投递事实。先读取 #8 已有 outbox 去重、回收、凭据事务与同步取消，沿用现有串行范围与 durable tombstone，按真实调用路径证实旧回调无法复活。两个账号可使用同地址也要完全隔离。对事务步骤部分失败给可恢复的状态，避免宣称原子性超出写入边界。只实现本地删除，远端协议零删除。Windows 临时 Vault、回环 SMTP/IMAP 与合成测试。涉及前端先执行现代 Web 指南 search/retrieve。

独占 agent-lifecycle 的 plugins/mail 和该成员证据。Lead 在 integration 接线 t17c 的附件宿主。保持你的 preload/Engine 入口/锁不动。勿再确认原型，禁止连接或写入远端，不开子 agent。正常提交并按文件协议发布。
