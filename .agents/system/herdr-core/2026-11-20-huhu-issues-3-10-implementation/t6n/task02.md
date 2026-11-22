# #5 并发回归与正文 UTF-8 写入边界

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t6n
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t6n
- 当前任务 — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/report02.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/tasks，分支 impl/huhu-issues-3-10-tasks，当前 `6b43fceceee002bd3141648946e1d907c1d9349c`。

读取 t54/report02 的两个独立反例。保留 6b43fce 的候选，复现同版本两个不同正文提交必须一成一冲突、并行评论和正文必须都保留。关注现有 taskId 队列是否已覆盖新反例。Lead 在集成 `e940403` 将 Vault 条件检查及实际原子写放入同一进程队列，你可在本分支按 SHA 拉入同一提交帮助组合验证，报告标明其归属，勿重做。独立探针在 t54/report02 中。

在 Tasks create 和 update 的规范正文入口拒绝不成对的 UTF-16 代理项，避免 HTTP 即时 DTO 和 UTF-8 磁盘字节不一致。当前 TS target ES2023，优先使用可导出 JSON Schema、运行时覆盖普通中文、合法 emoji/CRLF 的标准方式。若涉及共享 `packages/contracts/src/dto/task.ts` 仅改 Task 输入约束，交 Lead 合入，不改公共导出或其他模块。实测无效输入明确 `INVALID_INPUT`、零改文件和 revision，随后合法文本能够写入重开。禁止真实 Vault、provider、外部写入、开新 worktree、自行派遣。仅 Windows；保留源码 SHA、红绿回归和合成隔离证据。代码已可测试时尽快交回，方便后续凭据／#4 分配。
