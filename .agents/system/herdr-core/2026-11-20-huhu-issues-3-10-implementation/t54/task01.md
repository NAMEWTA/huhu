# task01.md 独立审查 #4 W1.1 与 #5 T1.1

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t54
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t54
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作目录 — D:/Document/code/huhu，原树业务与用户现有改动均只读，旧实现 worktree 已回收。用户限制最多四个 worktree，本任务不得新建。

对两个冻结候选分别按 dev-review 给规格与规范两轴独立结论。先看 #4 W1.1 `ce5289ddd1ae5713167f6987fe6db53c3beef51f` 相对 `5daf048665ea46ae62e60dfbda9beed6459a8868`。核对 `t19/report04.md`、真实锁定 Core `.cmd` 与 PowerShell 夹具、预览同实际 argv 和 cwd、启停与扩展路径边界、旧配置兼容性。用户未授权使用真实 Agent 历史；W1.2 对账与 W6.1 接线按后续切片，区分实际缺口。

其次核对 #5 T1.1 `a5d82cb704cdd44fbae387518f7d1c4246908fb1` 相对 `1b3b385797eee2dbd9d9af42c57be44dd8ad2562`。核对 `t44/report01.md`，阅读包括新增 HTTP 测试的实际改动。特别确认部分更新、状态和一份编辑表单的条件保护，旧 baseInputHash 重试及输入 revision 稳定性，缺配或 existing 不启动，外部评论没有执行权，后续与 W6.1 的契约差距。

通过 Git 对象读取准确提交与新增文件，可解包定向文件到一次性临时目录复用锁定依赖。仅 Windows，严禁远端写入、改业务文件、真实 Vault 或原生 Agent 历史、自行派遣。只在共享根发布不覆盖的同号报告。
