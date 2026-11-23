# 复核候选包身份与回执顺序修复
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行 t4t。工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration。只读独立审查，报告 report08.md，不写业务、不派发代理、不运行重型检查。
复核当前 HEAD 最新两个提交，主要为 tests/e2e/helpers/candidate-package.ts、workflows/task-journey.spec.ts、packaged/packaged.spec.ts，以及 plugins/tasks/src/engine/receipt-inbox.ts 的故障夹具改动和 persistence-http.test.ts。核对 task07/report07 中 P1 制品绑定、隔离、先接收前停用再丢一次 ACK 的修复正确性与尚存的具体 bug。所有现有实测仅是定向源码用例和枚举，包尚未构建，不做验收通过宣称。
关注 AppImage 到可执行文件和 ASAR 的完整 SHA，appInfo 12 位与实际 commit 的绑定、路径解析、夹具隔离、Tasks 启停后 UI 和回执存储实际形状。非本 diff 覆盖矩阵沿用旧报告，不重复长篇，给出可执行修复点与准确文件行。最终将报告发回 Lead。
