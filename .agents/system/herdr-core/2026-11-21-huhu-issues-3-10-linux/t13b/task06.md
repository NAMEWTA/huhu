# 修复已证实的保存独审三项缺口
Lead t3p，worker t13b，工作目录 agent-linux。t14c 已实际证明两项单测红灯（2 failed/62 skipped，保存于 temp/final-audit/save-review-races-red.log）。从 task05 与 t147-report01.md 接续，完成生产修复。
可写：plugins/notes/src/ui/documents/DocumentSession.ts、plugins/notes/src/ui/NoteDocument.tsx、plugins/notes/test/document-session.test.ts、tests/e2e/knowledge/session-flush.spec.ts。其他文件保持原状。
keepDraft 在队列中切代后必须追随当前正文到实际留稿回执，写失败拒绝不得假成功。所有已发写入包括同代未知结果都必须使之前尚未接纳的读取样本失效并保守核对实际磁盘；不得隐式重放写入。未知冲突的笔记 UI 使用真实 hasUnsaved/冲突状态，提供明确保留动作和重载确认，复用现有组件。保留原有62用例语义与快照/字段时序，不仅改预期。
前端沿已读指南。只写不运行验证、不派代理不发送消息。完成写 temp/final-audit/t13b-report06.md，明确改动和未运行验证。
