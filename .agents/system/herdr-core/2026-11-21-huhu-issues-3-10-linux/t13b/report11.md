# 未知草稿的保留、恢复和明确放弃

Lead `t3p`，worker `t13b`，工作目录 `agent-linux`。实现与定向验证完成，桌面交互待 Lead 验收。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task11.md) · [独审](t152-report02.md)

## 交互行为

- 手动和自动保存新正文都会保留尚未处理的未知草稿及恢复入口。保存成功后的草稿清理限于已知普通草稿或当前缓冲所关联的草稿；尚未载入的草稿在该路径保留。同一缓冲主动留下的普通稿在正文提交后仍会清理，普通同文稿在载入时仍会自动清理。[保存清理](../../plugins/notes/src/ui/documents/DocumentSession.ts#L445) · [留稿关联](../../plugins/notes/src/ui/documents/DocumentSession.ts#L644)
- 笔记、文本与 JSON、档案使用独立的确认放弃入口。当前缓冲有恢复或留稿副本时，先确认读取有效，再按队列处理草稿删除。删除失败保留当前编辑、原草稿和错误，用户可重试。通用载入及与当前缓冲无关的未知草稿继续可恢复。[会话入口](../../plugins/notes/src/ui/documents/DocumentSession.ts#L229) · [笔记](../../plugins/notes/src/ui/NoteDocument.tsx#L248) · [文本与 JSON](../../plugins/notes/src/ui/viewers/TextFileView.tsx#L95)
- 档案记录页显示共享会话的草稿，复用现有提示、恢复与丢弃动作。恢复后可留在同一记录页处理冲突或明确放弃并重载。[档案界面](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L435)

## 定向红绿结果

所有运行均使用 Node 24.21.0，在 `flock /tmp/huhu-heavy.lock` 下定向筛选同一个 `plugins/notes/test/document-session.test.ts`。

- 修改前 **4 失败、1 通过、73 跳过**。手动和自动保存均抹掉待处理未知草稿，通用载入在确认后重新显示已恢复草稿，删除失败也未阻止读取替换。普通同文清理照常通过。[红灯日志](save-draft-actions-red.log)
- 最终修改后 **10 通过、71 跳过**。覆盖上述四个实例，以及正文保存时草稿尚未载入、普通会话留稿的清理、确认丢弃普通编辑时保留另一份未知稿、普通同文兼容、跨会话未知稿恢复和草稿条件版本保护。[绿灯日志](save-draft-actions-green.log) · [单测](../../plugins/notes/test/document-session.test.ts#L1193)

## 未运行的验证

桌面 E2E 已编写，待运行「C06 保存新笔记正文保留未知草稿，恢复后确认放弃才删除」和「C06 档案记录页可以恢复未知草稿，也可以直接丢弃」。按任务范围，未运行其他单测、全量单测、类型检查、lint、构建、安装包检查或 Playwright/Electron。[笔记桌面用例](../../tests/e2e/knowledge/session-flush.spec.ts#L219) · [档案桌面用例](../../tests/e2e/knowledge/session-flush.spec.ts#L259)
