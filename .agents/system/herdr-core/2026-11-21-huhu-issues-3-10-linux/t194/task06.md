# task06：Notes组合输入自动保存返工独审
Lead t3p，cwd /home/wta/projects/huhu/temp/issue-worktrees/integration。task05完成后进行，两个报告分开保存。
Notes六文件现已冻结，读temp/final-audit/t197-task02-final.md（含blob）和你的task04 P2。核对RichMarkdownEditor/rich.d.ts/NoteDocument/DocumentSession、document-session.test.ts和session-flush.spec.ts当前未提交diff。确认后台组合不排空、提交/取消后重新读盘、显式保存/退出原语义、注册与卸载/丢弃等边界。特别检查新增E2E是否真正跨800ms并实际生产编辑器/Engine路径，别把mock测试当UI已验。
仅只读、局部内存对照，不跑E2E/build/全仓/重型，不改业务，不启动agent。报告仅工作树temp/final-audit/t194-task06-final.md；无需hc send和共享目录权限，Lead主动读取。Lead可能提交这些冻结blob以构建，按blob对齐，不把SHA变化误判实现变化。
