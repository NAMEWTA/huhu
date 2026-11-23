# 保存回执审查修复
Lead t3p worker t12c；目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。
读 AGENTS、dev-build/dev-debug、modern-web search+retrieve。读 temp/final-audit/t124-report01.md。
仅负责前三个保存语义发现及旧 Mod+S 焦点回执缺口：ArchivesViews 路径操作 untilClean；comments 两条落盘路径及 NoteDocument 显式保存与前置排空分离；并发两次明确保存只保存各触发时已交付文本，按前一回执版本串行推进，不吞后续输入。先读现有代码和调用者，以最小可维护改动修复。不要碰 Graph、HTML 编码修复、候选夹具。
可写 plugins/notes/src/ui/documents/DocumentSession.ts、对应 test/document-session.test.ts、NoteDocument.tsx、comments/useCommentsBridge.ts、archives/ArchivesViews.tsx、tests/e2e/shell.spec.ts 和 knowledge/session-flush.spec.ts（仅保存用例）。保留已有改动，不提交不重置。
这一轮只写代码和测试，不运行任何验证，不派子代理，不调用 hc send。Lead 统一验证。完成写 temp/final-audit/t12c-report01.md，列改动、红绿待跑命令及未运行验证。先新增并发保存回归并告知屏幕状态，保留清晰回归证据；必要时最终报告提供如何在原版本复现。
