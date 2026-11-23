# #7 H4.3 跨窗口接线独立审查
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行 t4t。读取 dev-review 与 t5h/report04.md，写 t4t/report06.md。绝对只读源码，唯一写入本任务报告。
审查冻结窗口候选 858564a58e5780f20d5cbbed7953ab65b89fed55 相对 f16cf1cd，运行在集成工作树 /home/wta/projects/huhu/temp/issue-worktrees/integration。用 git show/git diff 读取固定对象，勿考虑后续 CA 改动。重点看桌面顶层文档身份、邀请 Web 无权交接、真正同一目标、单一输入者、取消/超时/崩溃/重载、宿主对账、布局和焦点、原窗口关窗契约、测试误判。阅读 temp/issue-evidence/huhu-2026-11-22/h7-pane-window-check.log（本项目根）所录 16 + 1 通过和 E2E 仅列表。逐条标明严重级别、发生条件、修复提议和证据。此次不运行任何构建、E2E、套件或远端命令，不触碰真实凭据。
