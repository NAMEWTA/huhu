# task02.md：复审——Issue #2 最终交付候选 9b143a4

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pE
- 当前任务：task02.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report02.md
- 工作目录：/home/wta/projects/huhu-wt-review（开工前执行 `git checkout --detach 9b143a4`（即 closeout/issue2-integration），然后 `pnpm install --frozen-lockfile`、`pnpm build`）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pE
- 接续依据：你的首轮审查 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report01.md（含 Lead 的分配）；之后各修复报告：w4:pA/report05–07、w4:pB/report03–05、w4:pC/report03–06、w4:pD/report02（均含 Lead 验收）；Lead 在 9b143a4 上的全量 e2e 日志 /tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int4/e2e-full.log（Lead 可能还在跑，跑完后会生成）

## 目标与输入

复审 `git diff 03dc93b..9b143a4`（你首轮审查之后的全部改动，**包括新增文件**），并对照 `git diff main..9b143a4` 的整体，回答：

1. 首轮的每一条发现（规格 1–8、工程 1–7）是否已经正确解决？逐条给出 已解决 / 部分解决 / 未解决，附证据（代码引用；最好再加实际运行）。特别检查：档案正文退出、手动保存模式切视图、drainer 拒绝、受保护路径、分段读取版本、B06 快速换选区、233 / 235 入口、模板导入、41 个 DOM 测试与 596 个文件的适用性清单、H03 语言设置与扫描、ASAR 排除、G01 / G02 的重放。
2. 本轮新增的改动有没有引入新问题：语言设置让知识库在设置页保持挂载（06d0afb）引出的草稿回归及其修复（14d116c）；Lead 观察到的“手动保存模式下标签右键关闭 / 关闭其他走明确保存，与关闭按钮只留草稿不一致”（请判断是否违反规格 C06 / 手动保存语义）；表情离线词库；预览 iframe 的协议 / CSP（a2145c3、e99571c，确认 F05 没有放宽）；查找替换的按键路径（dedfab7）；黄金夹具的复用。
3. 验收证据是否站得住：F09（Lead 的判断：Issue 原文要求的是测量并记录，16 ms 是项目性能用例的门槛；main 与候选在空闲配对测量中处于同一水平，今天两边都没达到 16 ms，见 w4:pA/report06 与 evidence/parity/f09-findreplace.md。打开 1 MiB：main 194 ms，候选 433 ms，均低于 500 ms 门槛，但候选约慢一倍，请评估）；G07（同格式 Debian 包 +79.5 MB；冷启动配对测量由 Lead 在空闲时补做）；零重试下的偶发失败（以 Lead 的最终全量日志为准）。

规格同首轮：/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/source-issue-2.md §14、/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md §5、/home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/decisions.md OP-D19。可以运行只读检查与测试（打包 / e2e / 探针）；不修改业务文件，不提交。

## 读写范围与产物

- 可写业务范围：无。
- 预期产物：报告。首轮发现逐条给结论；新发现按严重度（阻断 / 应修 / 建议）列出，写明文件:行、影响、证据、建议修法；最后给出你对“是否达到 Issue #2 关闭条件”的意见，以及仍然缺的证据。

## 验收与验证

- 每条结论有证据；列出实际运行的命令与结果。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report02.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
