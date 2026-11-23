# task02：后台恢复不能交付未提交的组合输入
Lead t3p，实施者 t197，cwd /home/wta/projects/huhu/temp/issue-worktrees/integration，基线 f55f0759。
依据 temp/final-audit/t194-report04.md 以及新复审 temp/final-audit/t194-task04-final.md（后者稍后写完）。P2仍存在：后台不同正文复读调用drainer->port.flush->emitNow，无条件交付IME临时拼音；磁盘回到原版本后可能自动保存临时内容。现有session-flush组合用例manualSave没有覆盖。

先按 zh-modern-web-guidance 执行适用 search/retrieve，复用编辑器/会话既有接口。目标：后台恢复在组合进行时不得排空或覆盖未提交内容；组合结束后可继续核对。显式保存/切换/退出的原flush语义不改变。保留普通待结算输入保护与草稿丢弃/读失败修复。
写入范围仅 packages/editor/src/rich/RichMarkdownEditor.tsx、编辑器既有port契约（先定位并说明）、plugins/notes/src/ui/NoteDocument.tsx、plugins/notes/src/ui/documents/DocumentSession.ts 和相关单测、tests/e2e/knowledge/session-flush.spec.ts。若需要其他业务文件先发理由。不要改首页、共享查询、脚本/锁文件/文档。Lead唯一git索引写入者，不stage/commit/push。
先实际失败回归再最小修复，可只跑自己相关单个vitest文件；E2E只写不跑，不build/打包/全仓检查/截图，不启动agent。写E2E覆盖自动保存开启、保留后台读数、IME preedit、磁盘恢复原字节、跨过自动保存时间窗零临时文本写入、提交后正常保存或冲突。
报告工作树 temp/final-audit/t197-task02-final.md，列变更、红绿原始命令结果、未运行验证。完成hc send t3p。
