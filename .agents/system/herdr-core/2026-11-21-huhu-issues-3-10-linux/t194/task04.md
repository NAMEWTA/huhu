# task04：当前提交 Notes 组合输入风险与首页取消修复复审

Lead t3p，审查者 t194，工作目录 /home/wta/projects/huhu/temp/issue-worktrees/integration，当前 HEAD f55f0759e9d33bdecd6ca92cf6b25837947e3e28。
只读业务/测试文件，不启动 agent，不跑 E2E/build/typecheck/全量；可做局部内存对照。只写报告 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t194/report04.md。

优先复核你已有 temp/final-audit/t194-report04.md 中 Notes P2：后台复读可能排空尚未提交的 IME 内容后自动保存。之前 Lead 把额度限制记为独审未完成；现已观察你空闲并读到真实报告。请确认当前 f55（应用 f91 到9d只改首页）是否仍存在该P2；检查 RichMarkdownEditor、NoteDocument、DocumentSession、session-flush组合用例，区分已有 t19f 实跑是否真的覆盖自动保存+磁盘回退时序。如果仍未修复，给出最小修复边界及真实路径回归建议，不改代码。已有 report04 另在 temp，不覆盖它。

其次只读审查 9d96e902 的 useDashboard.cancelQueries 去除 revert:false，以及新增 dashboard-appearance-package.spec.ts，证据 dashboard-save-cancellation.md / dashboard-package-9d96e902.json。核查主动取消不会把成功回执变为错误，旧读取不会覆盖成功布局，真实读失败仍可提示及重试。

报告标明复核版本、已关闭/仍存在的具体问题、未运行验证，完成后 hc send t3p 报告路径。
