# 保存队列基线修复

状态 `done`，待 Lead 验证。Lead `t3p`，worker `t13b`，在 `agent-linux` 工作树交付。工作树 HEAD 由 Lead 推进到 `f0fb1810`，本次改动留在工作树。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task01.md)

## 改动

- 正文保存继续使用同一条串行队列。每次明确保存在编辑器交付后冻结正文，实际发出时使用同基线上前笔成功回执推进后的版本。重载、合并、保留我的修改或恢复草稿接纳新基线时，旧快照轮到执行便返回 `false`。已发操作的迟到回执和错误退出时不更新会话，也不触发保存成功回调或草稿清理。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L180)
- 载入和冲突解决用同一个读取序号仲裁。如果读取期间同基线已接纳一次写入，重新读取磁盘。这个判断用写入计数，覆盖正文版本因撤销而重复的情况。排空操作在基线切换时返回 `false`，退出结算会按最新基线重新检查。自动保存仍在队列轮到它时取当前正文，过期计时器和过期排队操作都不会在新基线上保存。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L191)
- 档案字段操作在编辑器交付后冻结正文，字段更新前只按这份快照决定是否需要先写正文。成功回读后，字段差异合入当前缓冲及同基线等待中的正文和字段快照。档案回调会在异步预检返回后、发出更新前再次核对基线。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L367) · [ArchivesViews.tsx](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L380)
- 正文保存回执按当前缓冲和实际写入正文的相等性设置 `saved/dirty`，保持与 `hasUnsaved` 一致。保存 A 后撤销至 A 显示已保存，撤销至旧磁盘正文 X 在 A 确认落盘后仍有待保存内容。富文本等价规范化保留原有的编辑 revision 检查。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts#L282)

## 回归用例

保留原 43 个用例，扩充了同一基线版本递进和字段前置写入的逐笔版本断言，并补充 7 个时序或状态用例。

- 现有重载和合并场景增加对两笔旧操作返回值的断言。同一组增加保留我的修改，以及下一次明确保存才覆盖外部正文的检查。独立用例让旧保存先真实写入内存磁盘，再扣住成功回执，断言新基线、草稿和成功回调均不受旧回执影响。[document-session.test.ts](../../plugins/notes/test/document-session.test.ts#L469)
- 相邻两笔档案字段操作各用自己的冻结正文，并吸收前一笔字段差异。字段预检跨重载后应跳过写入和后续回读，后方排队的旧字段操作也应退出。已发字段写入的旧回读跨重载后，后方新基线保存仍按重载后的版本及正文落盘。[document-session.test.ts](../../plugins/notes/test/document-session.test.ts#L297)
- 手动模式空闲时撤销回磁盘正文会立即显示已保存。另用读取门控覆盖重载在途期间同基线保存成功，要求重载重新读取并采用最新磁盘版本。[撤销用例](../../plugins/notes/test/document-session.test.ts#L417) · [重载用例](../../plugins/notes/test/document-session.test.ts#L666)

## 边界

保护点在会话和档案预检。切换基线前已发给 Engine 的请求仍按发出时的条件版本执行，版本匹配时可能已经产生磁盘或索引副作用。会话会丢弃其过期结果并抑制后续请求。实际写入结果由 Engine 的条件写与后续磁盘读取判定。

## 未运行的验证

按任务分工，本轮未运行任何验证。定向 `plugins/notes/test/document-session.test.ts`、模块及全仓类型检查、lint、完整测试、构建、安装包检查和 Playwright/Electron E2E 均待 Lead 串行执行。现有 C06 手动保存和 E04 档案条件写可用于端到端复验。[session-flush.spec.ts](../../tests/e2e/knowledge/session-flush.spec.ts) · [archives-tabs.spec.ts](../../tests/e2e/workflows/archives-tabs.spec.ts)
