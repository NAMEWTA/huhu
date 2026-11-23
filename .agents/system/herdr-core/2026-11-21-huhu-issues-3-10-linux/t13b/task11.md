# Notes 未知草稿明确处理入口
Lead t3p，worker t13b；工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux。
读取 temp/final-audit/t152-report02.md。原 task10 两问题已有75项定向通过和类型通过。请关闭本次持久化标记直接暴露的三项问题：未处理未知草稿不能被无关正文保存无条件丢弃；用户明确确认放弃并重载须完成放弃语义，通用内部load不能随便删除草稿；档案记录页面须能恢复/丢弃共享会话读到的草稿，复用现有NoteDocument/TextFileView交互和翻译。不要扩大到全模块探索。
先新增可执行会话回归，证明失败后最小修复。此次允许仅在 flock /tmp/huhu-heavy.lock 下运行单个 plugins/notes/test/document-session.test.ts 的相关筛选，保存修前和修后日志于 temp/final-audit/，其余验证均不运行。编写对应 E2E，不执行。
可写 Notes 共享会话、直接恢复/放弃调用方 NoteDocument/TextFileView/ArchivesViews/必要现有i18n、document-session.test.ts 与 session-flush.spec.ts。不改Mail/SSH/其他契约，不开子agent不提交。前端沿用已读取指南。
报告 temp/final-audit/t13b-report11.md：说明每项真实交互语义、定向红绿结果和未运行验证。
