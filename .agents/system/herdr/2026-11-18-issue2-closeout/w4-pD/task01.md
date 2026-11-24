# task01.md：疑难分析——关闭应用时最后输入未落盘（C06）与紧凑评论提交旧文本（H05）的根因

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pD
- 当前任务：task01.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report01.md
- 工作目录：/home/wta/projects/huhu-wt-analysis（detached，main 9f870c0，已 pnpm install，已放随包 herdr）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pD
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report01.md（“阻碍与接续”）与 /home/wta/projects/huhu-wt-session/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/session/runs.md 第 27–45 行

## 目标与输入

两个**偶发、可能丢数据**的失败，需要给出有证据的根因与修复建议（你只读业务代码，不修产品代码）：

1. `tests/e2e/knowledge/editor-s2b.spec.ts:85`「S2b：重开应用后内容一致」：打开笔记、键入「关闭前的最后输入」后立即 `app.close()`，磁盘只有部分内容（观察到「初始关」以及额外的标题尾符号）。在 w4:pC 的两轮全量与 3 次单独复跑里失败 3 次；负载下更易出现。Issue 要求：关闭 / 切换前 flush 不丢草稿（C06、Issue §6.6）。
2. `tests/e2e/knowledge/compact-cost.spec.ts:26`「S2c：任务评论」：评论输入框输入「撤销测试」→ Ctrl+Z → 输入「真正的评论」→ 立即点提交，偶发提交的是旧内容「撤」。H05 要求紧凑变体输入 / 保存 / 撤销可用。

已知线索（未验证）：S3 为性能给 PM→Markdown 桥加了“自适应推迟结算”，出口要先 `settleNow()`（.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/s3/verification.md 第 10–16 行，PATCHES.md P-S3-01～03）；B07 修过“输入法组合期间推迟交付”（RichMarkdownEditor）。怀疑：应用退出的 flush 链路（桌面主进程 before-quit → 渲染进程 flushers → DocumentSession）和紧凑编辑器提交路径，读取的是**尚未结算**的源文本，或 flush 不等待结算。请核实或推翻。

方法：在本工作目录 `pnpm build` 后用 `xvfb-run -a pnpm e2e <spec> -g <name> --repeat-each=N` 在负载下（可同时跑 `stress -c 4` 或另一个 e2e）复现，并统计；可加临时埋点（只在本 detached 工作目录，**不提交**，结束后 `git stash` 或还原），沿调用链取证：`packages/editor/src/rich/**`、vendor 中桥 / settle 相关（PATCHES.md 定位）、`plugins/notes/src/**` 会话与 flushers、`packages/workbench/src/state/flushers*`、`apps/desktop/src/main` 退出流程、tasks 插件评论输入组件。

## 读写范围与产物

- 可读范围：整个仓库与 /home/wta/projects/huhu/temp/sources。
- 可写业务范围：无（临时埋点只在本 detached 工作目录，结束前还原，报告里写明还原）。
- 预期产物：报告内给出：每个问题的复现统计、调用链与根因证据（文件:行、日志片段）、确定程度、最小修复方案（改哪些文件、怎么改、为什么不破坏 F09 性能）、应加的回归用例；以及两者是否同源。

## 验收与验证

- 根因由运行证据支持（埋点日志 / trace），不是纯阅读推断；推断部分明确标注。
- 若不能复现，给出运行次数与负载条件，并基于代码给出最可能的竞态窗口与验证方法。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report01.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
