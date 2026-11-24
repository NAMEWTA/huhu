# task05.md：完整旅程用例“切回后写入的尾字没有落盘”的定因

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pC
- 当前任务：task05.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task05.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report05.md
- 工作目录：/home/wta/projects/huhu-wt-session（分支 closeout/issue2-session，接着 b8df90f）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pC
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report03.md（全量 e2e：“完整旅程单独三次复跑通过两次，另一次切回后写入的尾字在磁盘断言中尚未出现”，日志见 /home/wta/projects/huhu-wt-layout/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/runs.md 与 task03-journey-retries.txt）；你在 report04 用过的“精确字节等待 + 慢桥”方法；你 task02 记录的“完整旅程 1/3”

## 目标与输入

`tests/e2e/knowledge/journey.spec.ts`（Issue 完成定义的贯穿路径）偶发：切回普通文件后继续输入的尾字，没有出现在磁盘断言里。用与 task04 相同的方法查明：是测试读盘时机的问题（例如等到了旧的“已保存”），还是真实的保存缺陷（切换 / 切回时会话、drainer 或档案视图的交错）。在负载下重复 ≥ 20 次统计；必要时加受控慢桥。是产品缺陷就修，并加一个能稳定判红的回归；是测试问题，就按用户可观察的完成信号（精确文件字节）修测试，并说明依据。最后在你的分支上跑 journey 用例 10 次，以及 `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows` 全量。

## 读写范围与产物

- 可写业务范围：与 task04 相同；另加 `tests/e2e/knowledge/journey.spec.ts`。
- 预期产物：在你的分支上提交；在 evidence/session/review-fixes.md 新增一节，并更新 runs.md。

## 验收与验证

- 有根因证据；journey 在负载下重复 10 次通过；全量通过，或者失败已如实归因。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report05.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
