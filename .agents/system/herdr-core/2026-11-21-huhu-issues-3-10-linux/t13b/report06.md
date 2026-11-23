# 保存独审三项修复

状态 `done`，待 Lead 验证。Lead `t3p`，worker `t13b`，工作目录 `agent-linux`。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task06.md) · [t14c 修改前红灯](save-review-races-red.log)

- 切换 Vault 的 `keepDraft()` 在排队或等待回执期间切代后，会重新结算编辑器并按当前基线留稿。当前基线还需要草稿时，以实际写入回执为准。当前基线的草稿写入失败会拒绝 Promise，由现有 Vault 切换调用方取消操作。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts)
- 正文保存和已提交的档案字段更新，在同代失败或跨代结果待核对时，均在原队列槽失效先前读数并复读实际磁盘。失效的重载、合并和保留操作等待核对完成后再决定是否重读。新冲突会保留当前缓冲并阻止隐式覆盖。已确认的成功回执仍推进同基线版本。明确的正文条件写拒绝使旧读数失效，后续读取会重新取样。对账过程只读磁盘，待执行写入各自保留原来的快照和基线约束。[DocumentSession.ts](../../plugins/notes/src/ui/documents/DocumentSession.ts)
- 笔记页在冲突状态用会话发布的 `hasUnsaved` 显示「保留我的修改」及重载确认。即使缓冲等于最后可信正文，未知结果仍由会话标为需保留，重载不会跳过确认。沿用原 Banner、按钮和重载动作。[NoteDocument.tsx](../../plugins/notes/src/ui/NoteDocument.tsx#L257)

对账继续依赖 Engine 暴露的错误信息和读数。跨代未确认结果、原始传输异常或磁盘读取失败会保守阻止干净结算。同代普通失败经复读确认磁盘未变时，保留现有的错误提示和后续重试行为。接口没有远端提交屏障，一次相同读数无法解锁已知的传输不确定状态。

## 回归

保留原 62 项以及 task05 的两条红灯。加强同基线正文红灯的门控，使旧重载先于对账返回，并检查它不会抢先再次读取和接纳。新增「同基线的字段响应丢失时，复读未变也不能结算为干净」，断言拒绝排空、保留缓冲并在退出写入草稿。桌面用例继续验证真实保存后的冲突按钮和重载确认。[document-session.test.ts](../../plugins/notes/test/document-session.test.ts) · [session-flush.spec.ts](../../tests/e2e/knowledge/session-flush.spec.ts#L149)

## 未运行的验证

本轮未运行任何验证。t14c 的两条失败是修改前结果。修复后 Vitest、类型检查、lint、构建、打包和 Playwright/Electron E2E 均待 Lead 执行。桌面用例名为「C06 对账无法读取且缓冲等于原文时，笔记仍可保留修改并确认重载」。
