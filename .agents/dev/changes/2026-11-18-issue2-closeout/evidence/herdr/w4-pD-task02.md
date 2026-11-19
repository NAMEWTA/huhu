# task02.md：疑难分析——F09 输入延迟回退（5000 行实时预览 p95 从约 14 ms 升到 25–34 ms）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pD
- 当前任务：task02.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report02.md
- 工作目录：/home/wta/projects/huhu-wt-analysis（detached；开工前执行 `git checkout --detach closeout/issue2-integration`，tip 190605a，然后 `pnpm install --frozen-lockfile` 与 `pnpm build`）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pD
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report05.md（F09 一节：空闲时 p95 为 34.3 / 25.2 / 28.3 ms；去掉选区守卫后 p95 中位数 26.8 ms，没有差异）；/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report02.md（session 分支 eeb4413，空闲时 p95 为 14.1 ms）；独立审查 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report01.md（集成 03dc93b，负载 2.52 时 17.9 ms）；你自己的 report01（桥推迟结算机制）

## 目标与输入

F09 要求：5000 行文档实时预览编辑，输入延迟 p95 ≤ 16 ms（`HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟'`，`tests/e2e/perf.spec.ts:148`）。main 9f870c0 与 session 分支都曾达标，最终集成候选在空闲时却超标约 10–18 ms。

1. 用同一台机器、同一负载条件（开始前 `uptime` 的 1 分钟负载 < 4，并记录）做配对测量：main 9f870c0、eeb4413（session）、03dc93b（第一次集成）、190605a（最终集成），以及 layout / parity 分支的关键提交，在必要的地方二分（`git worktree add --detach` 到 scratch 目录即可，用完删掉），找出引入回退的提交。每个点至少测 3 次。
2. 对引入回退的提交，用 CPU profile（CDP `Profiler` / Performance trace，在按键期间采样）定位每键多出来的工作：例如新的 MutationObserver / ResizeObserver、i18n 在热路径上的重渲染、语言设置订阅、主题 token 的样式重算、选区或 DOM 快照比较、目标菜单 / 通知 / 表情等新挂载组件对每个事务的监听、vendor 测试辅助被打进生产包等。
3. 给出根因证据（文件:行、profile 片段）、确定程度、最小修复方案，以及修复后应该达到的数值。只读业务代码；临时埋点只在你的工作目录里，结束前还原。

## 读写范围与产物

- 可写业务范围：无（临时 worktree 与埋点用完还原 / 删除）。
- 预期产物：报告。

## 验收与验证

- 结论由配对测量与 profile 支持；推断标注清楚。

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
