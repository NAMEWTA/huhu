# task01.md #7 合并与接线的项目规范审查

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t4t/task01.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report01.md`
- Lead — `t3p`，终稿发布后回告路径
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`

## 目标与证据

基准 `cc671b5f`，目标 `690e90978b6a012cead9f6bdd47ed93f13b65550`。读取两个端点的完整差异 `git diff cc671b5f 690e9097`，必要时分别检查合并父提交 `53e516ca`、`cc671b5f` 与合并 `ade79b58`。认证规格见成员 #7 的 `source.md` 和 `spec.md`，接线证据见 `evidence/H-remaining-linux.md`，本机定向日志在 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22`。

核对合并与接线的代码质量及跨模块影响。重点检查私有 Herdr 生命周期、端点归属、取消与资源回收、Agent 既有行为、Web/桌面的流权限、TerminalView 的回调与控制权、依赖/锁文件、现有测试的判定力。核对对应 AGENTS.md 与发行版本，不以假设代替证据。按影响排序并给出可以独立复核的命令或代码位置。

## 边界与产物

业务和工作记录只读，仅写自己的报告和同目录临时稿。不要切分支、修改索引、派发 agent、写远端、运行测试或启动应用。报告将已证实缺陷、可核对风险、已知候选缺口及未运行验证明确列出。按 Core 文件协议核对 topic、manifest、当前终端和同号报告，发布后回告路径。

## Lead 验收

由 Lead 复核后填写。
