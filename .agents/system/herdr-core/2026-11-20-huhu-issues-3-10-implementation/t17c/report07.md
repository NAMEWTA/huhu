# t17c · #8 S1b.2 数据包附件引用

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task07.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task07.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report07.md`
- 执行结果 — `done`

## 结论

Mail 已提供 `mailAttachmentPackagePaths(files)`。它只返回现有提交记录引用的 Mail 对象路径。在对象落盘后取消或草稿 CAS 拒写的情况下，队列一释放就能得到正确的清单，即使两个孤立文件仍留在磁盘上。 [独立审查第 2 个 P2](../t187/report02.md)

## 产物与边界

- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-mail-confirmed-ui`。本地提交 `4e6daf0829fd41867df5db11bde329598f84f978`，父提交 `f4e43d5eba286969b1ea141f644f6c24366119e2`，工作树干净。七个文件都在 `plugins/mail` 中，根锁 blob 仍为 `ce368ced5888cc3775d8e0265113737839e989d5`。
- 入口从 `@huhu/plugin-mail/engine` 导出，返回 `ReadonlySet<string>`，成员形如 `.huhu/mail/attachments/<sha256>`。草稿和发件箱共用现有存储路径、schema 和解析方式，排除草稿墓碑、已删发件详情和仅含投递证据的墓碑，并按摘要去重。Mail 停用或打开只读 Vault 时仍可读取。
- 无法读取的草稿格式或损坏的规范发件记录会报错。引用集合按有效元数据计算，保留已有引用在对象缺失或字节损坏时的快照语义。此入口只读元数据。孤立字节可留到现有 sweep，筛选效果与 sweep 的执行时间无关。 [实现](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/src/engine/drafts.ts:76)

## 验证

Windows 固定 pnpm 12.10.1，使用隔离临时 Vault、合成字节和本机回环夹具。

| 检查 | 观察 |
| --- | --- |
| 修复前复现 | 暂停 `addAttachment` 于真实对象完成写入后，分别注入取消和真实 Vault 文件版本 CAS 冲突。旧 ZIP 收集在队列释放后返回三个路径，其中两个为无引用对象，回归按预期失败。 |
| 同一时序复验 | 在第二次写入暂停期间排队执行引用查询，放行后立即只得到一个已提交的共享对象路径。目标草稿仍为原修订，另一份草稿的并发提交保留，共享字节及两个孤立对象均可读，过程中未执行 sweep。 |
| 仅发件箱持有与引用消失 | 移除草稿附件后，发件记录仍使该路径入选。改为墓碑后，物理字节还在，路径已经排除。现有 sweep 随后可回收。 |
| 停用、只读与损坏 | 实际停用 Mail 后能力返回 `PLUGIN_DISABLED`，辅助入口仍返回相同清单。重开只读 Vault 后同样可读。未知草稿格式和损坏发件记录分别报错，已引用的缺字节和坏字节仍返回其路径。 |
| 回归与静态检查 | 定向 13 项通过。完整 Mail 回归 7 文件、41 项通过，含 Edge 现有组件探针。TypeScript、Oxfmt、Oxlint 和 Git 差异检查通过。 |

[附件和队列回归](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/test/draft-attachments-engine.test.ts:94) · [仅发件箱引用回归](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/plugins/mail/test/outbox-engine.test.ts:910)

## 接续

Lead 在共享 ZIP 快照锁内调用此入口，用集合约束既有文件枚举中的 `.huhu/mail/attachments/` 成员，并持锁至最后一次 ZIP 文件读取。Mail 停用时直接用 Vault 文件访问器调用。最终 ZIP 联验由 Lead 在组合版本完成。当前轮以实际旧 ZIP 重现泄漏，并验收修复后的 Mail 侧引用集合。

## Lead 验收

