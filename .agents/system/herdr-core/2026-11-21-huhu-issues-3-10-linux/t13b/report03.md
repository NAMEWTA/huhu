# 档案条件写与在途保存撤销修复

状态 `done`，待 Lead 验证。Lead `t3p`，worker `t13b`，工作树 HEAD `4beb7eae`。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task03.md) · [t140 修改前日志](save-late-red.log)

- 档案更新收到明确的 `expectedVersion`，而原 `index.md` 已缺失时，返回 `NOT_FOUND`。文件存在时，Vault 写入沿用调用方提供的版本。省略版本且档案尚无正文时，继续使用 `null` 表示独占首次创建。[ArchivesService.update](../../plugins/notes/src/engine/archives/service.ts#L402) · [移走文件的回归](../../plugins/notes/test/archives.test.ts#L136)
- 会话在发出实际正文写入时记录其基线代数，回执或异常到达后清理。当前基线的正文写入尚未确认时，撤销回上次确认的正文会保持 `dirty`，保存按钮可将撤销正文排入队列。空闲撤销仍立即显示 `saved`，同基线第二笔仍用第一笔回执推进的版本。字段的前置正文写入也沿用同一个 `doSave` 路径。[编辑状态](../../plugins/notes/src/ui/documents/DocumentSession.ts#L236) · [正文回执](../../plugins/notes/src/ui/documents/DocumentSession.ts#L308) · [在途撤销回归](../../plugins/notes/test/document-session.test.ts#L427)

本轮沿用 task02 的回归用例。第三项迟到写入对账仍等 t13x 设计及 Lead 下一任务，原回归留作验收。[同版本重载回归](../../plugins/notes/test/document-session.test.ts#L570)

## 未运行的验证

按任务分工，本轮未运行任何验证。t140 日志是修改前结果，两项修复的单测、类型检查、lint、构建及 Electron E2E 均待 Lead 验证。
