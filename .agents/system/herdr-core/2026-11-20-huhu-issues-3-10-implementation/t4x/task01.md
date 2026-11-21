# task01.md 独立复验 #6 目录返工和 G2.1 默认关闭

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t4x
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t4x
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作目录 — D:/Document/code/huhu。原工作区业务文件及用户改动全程只读。旧 capability、receipt 等 worktree 即将回收，只通过共享 Git 对象读取候选。用户要求最多四个 worktree，禁止添加 Git worktree。

冻结候选 `cc736e5fbdead615b4d49fa147969f8f86ea4076`，G2.1 父提交 `29a6e8f13bcbd3e644ef9b7a2a463627e6d39735`，G1.2 `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e`。按 dev-review 复验 `t20/report04.md` 两项发现，读 `t1c/report03.md` 和 `t1c/report04.md`。审查实际变更与新增文件，核对同一 Engine 卸载、停用、复装、重名与静态描述快照。对 G2.1 维持零默认、显式开闭、重开 Vault、损坏 fail-closed、两个 Vault 独立，查看适用 HTTP 与 CLI/MCP 入口。结合实际证据核对安装回滚、并发停用和公共授权回归。规格与规范两轴给出签收建议，未测范围写实。

仅 Windows。本任务不可创建 worktree、改业务文件、操作真实 Vault、发远端写入或自行派遣。需要动态验证时，用 `git show` 或按 SHA `git archive` 取必要文件到独立系统临时目录，复用集成检出的锁定依赖，禁止改动其文件。通过同号报告非覆盖发布，说明精确 SHA、构建和测试证据。
