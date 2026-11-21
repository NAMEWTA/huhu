# #8 S1b.2 只将可证实已提交的 Mail 附件写进数据包

- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address `t17c`
- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 基线 f4e43d5eba286969b1ea141f644f6c24366119e2
- 审查来源 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report02.md` 第 2 项 P2
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report07.md`

在 Mail 模块实现只读 `mailAttachmentPackagePaths(files)` 入口，由 `@huhu/plugin-mail/engine` 导出，返回只包含已提交草稿和仍有引用的发件记录所指向的完整正斜杠 Vault 相对文件路径 `.huhu/mail/attachments/<sha256>` 的 ReadonlySet<string>。该 helper 必须能在 Mail 停用时读取自己的新格式仓储，沿用原草稿／outbox 的 schema、路径和读入方式，避免把文件枚举本身当成引用。当无法证明当前格式或记录损坏时，明确失败或只排除不可证明者，不把无引用附件加入导出。保持保留引用的损坏/缺失对象语义与现有快照相容。

数据流约定：Lead 在 Engine 共用快照锁内调用 helper，并接到已有 Vault package 文件枚举。你不编辑 packages/{vault,kernel}、apps/desktop、apps/engine 或根锁。补 Mail 本身的已提交/共享/仅发件箱、取消和 CAS 写失败后遗留孤立对象等测试，明确当前是否保留 orphan 直到 sweep。要求释放队列后立即导出时仍能只选择已提交对象，避免依赖“迟些会扫掉”。Windows 固定 pnpm 12.10.1、本机合成夹具。不要委派，不连接远端。提交后按协议报告。
