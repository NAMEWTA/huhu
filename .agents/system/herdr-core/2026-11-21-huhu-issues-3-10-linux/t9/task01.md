# task01.md Issue #7、#8、#9、#10 缺口盘点（只读分析）

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t9`
- 身份核对 — 本机 Linux 默认 Core，worker 内 `HC_TERMINAL_ID` 应为 `t9`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t9/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t9/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-snapshots/4d86c84b`（`git archive 4d86c84b` 的只读快照，不是 git 仓库）
- 接续依据 — 无

## 目标与输入

为 Issue #7、#8、#9、#10 建立“已验收 / 待验证 / 独立候选 / WIP / 未开始”的逐切片清单，供 Lead 决定剩余派发。这是 dev-program / dev-plan 意义上的核对，不实施。

输入（全部在快照内，路径相对快照根）：
- 批次：`.agents/dev/changes/2026-11-19-huhu-issues-3-10/` 的 `program.md`、`progress.md`、`handoff.nd`（交接文件在 `/home/wta/projects/huhu/.agents/dev/changes/2026-11-19-huhu-issues-3-10/handoff.nd`）以及 `windows-stage-*.md`、`evidence/`。
- 成员目录：`.agents/dev/changes/2026-11-19-issue-7-ssh-module/`、`.agents/dev/changes/2026-11-19-issue-8-mail-module/`、`.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/`、`.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/` 下的 `source.md`（GitHub Issue 原文快照；Lead 已于 2026-11-21 确认 #3–#10 仍开放、零评论）、`spec.md`、`design.md`、`plan.md`、`tasks/*.md`、`evidence/`、`prototype-review.md`。
- 代码：快照中的 `apps/`、`packages/`、`plugins/`、`tests/`。用代码和测试核实任务声称的状态，不要只信文档勾选框。
- Git：可以只读运行 `git -C /home/wta/projects/huhu log/show/diff/branch -r/merge-base` 查看提交和远端分支（`origin/impl/huhu-issues-3-10-*`）。集成基线是 `4d86c84b`。已知未合入候选：Mail AI `origin/impl/huhu-issues-3-10-mail-ai`（`5c1c52a9`，#8 S7.1/S7.2）、SSH WIP `origin/impl/huhu-issues-3-10-ssh-exec-jobs`（`c23a8258`，#7 H11.2，正由 t5 处理）、#9 P8.3 尚未开工（由 t6 处理）。另查是否还有其他远端 impl 分支含有集成里没有的独有提交（`git log 4d86c84b..origin/<分支>`），逐一判断是否已被替代。
- 旧 Windows Core 报告：`/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/`（manifest.tsv 与各 tNNN/report*.md）。报告缺失或终端标 error 的不算通过。

注意：之前所有验证都在 Windows 上做。本机是 Linux。Lead 已在 Linux 上对 `4d86c84b` 跑过 lint/knip/format/typecheck/build（均通过）和 test（1261 过、15 败，全是模块凭据仅 Windows 可用导致，t6 在修）。

## 读写范围与产物

- 可读范围 — 快照、`/home/wta/projects/huhu` 仓库（只读 git）、`/home/wta/projects/huhu/temp/sources`。
- 可写业务范围 — 无。只写报告和同目录临时稿。
- 禁止改动 — 一切业务文件；不运行会写仓库的命令；不联网；不启动子 agent。
- 预期产物 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t9/report01.md`，在“结论”部分对每个 Issue 给出：
  1. 一张表：每个 plan.md 中的任务/切片 → 状态（已验收 / 待验证 / 独立候选 / WIP / 未开始 / 已被替代）→ 证据（提交 SHA、证据文件、测试文件）→ 剩余工作（具体到要改的文件或要补的验证）。
  2. Issue 原文验收要求逐条对照：已满足（附证据）/ 部分 / 未满足 / 只能在其他 OS 或真实服务上验证。
  3. 跨成员依赖：本 Issue 依赖或被依赖的契约（#4 回执与 ACK、#6 能力目录与授权、#9 模块凭据、#10 Widget 贡献、#3 退出契约、#5 T7.1 → #4 W8.3），当前是否稳定。
  4. 推荐的剩余切片清单：按依赖排序，每条给出写入范围（目录）、是否触及 Lead 独占文件（Engine/Renderer 装配、插件注册、Vault 包收集器、静态能力目录、根锁文件）、预计规模（S/M/L）以及可否与其他切片并行。
  5. 三条组合联验（见 program.md「组合验收」与 Goal：①MCP 和 CLI 分别创建/派遣/答复/读取 Task，桌面定位同一会话，断线恢复与重复回执去重；②干净安装工具默认关闭、按需授权、撤销、Safe 锁定后模块自有认证、新格式备份恢复；③桌面菜单、文档落盘与看板草稿的关窗联动，两份邀请三个浏览器会话的重用与按邀请撤销，布局保存与重开恢复）中与本组 Issue 相关的部分：现有自动化测试（文件:用例名）能覆盖什么，还缺什么。
- 报告要具体、可核对，宁可列出“未知”也不要猜。长度不设上限，但不要复制大段原文。

## 验收与验证

Lead 会抽查报告中的 SHA、文件和测试名。区分事实（附路径或 SHA）与推断。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址 `t9` 与任务文件名。manifest 当前行须为 `t9	task01.md	active`。
2. 先查报告路径。已有身份匹配的终稿则仅打印路径。
3. 只写自己的报告和同目录临时稿。
4. 按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md` 格式：先写 `report01.md.tmp`，再 `ln report01.md.tmp report01.md && rm report01.md.tmp` 发布。
5. 发布后在终端打印报告绝对路径并停下。
