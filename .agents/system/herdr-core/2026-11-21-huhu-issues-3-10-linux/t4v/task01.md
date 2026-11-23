# task01.md #7 合并与接线的规格审查

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 当前任务 — `t4v/task01.md`，本机 `wta-ubuntu` 默认 Core
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/report01.md`
- Lead — `t3p`，终稿发布后回告路径
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`

## 目标与证据

基准 `cc671b5f`，目标 `690e90978b6a012cead9f6bdd47ed93f13b65550`。读取两个端点的完整差异 `git diff cc671b5f 690e9097`，必要时分别检查合并父提交 `53e516ca`、`cc671b5f` 与合并 `ade79b58`。认证规格见成员 #7 的 `source.md` 和 `spec.md`，接线证据见 `evidence/H-remaining-linux.md`，本机定向日志在 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22`。

以 #7 原文、规格、`t34/report01.md` 及工作台确认稿为依据，逐项核对当前合并与接线的真实行为。重点追到公开能力的静态目录、发现、策略、handler、外部资源和工作台身份分离。确认合并没有把外部的信任、键盘交互、断开、Shell 或文件对象归到工作台。核对终端快捷输入的实际条件。区分相对合并前的回归与候选仍缺的验收项。为每个真实缺口指出具体入口、需要的修正及可复用验证。

## 边界与产物

业务和工作记录只读，仅写自己的报告和同目录临时稿。不要切分支、修改索引、派发 agent、写远端、运行测试或启动应用。报告将已证实缺陷、可核对风险、已知候选缺口及未运行验证明确列出。按 Core 文件协议核对 topic、manifest、当前终端和同号报告，发布后回告路径。

## Lead 验收

由 Lead 复核后填写。
