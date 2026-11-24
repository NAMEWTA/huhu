# task03.md：让既有斜杠菜单逐项用例在负载下稳定

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task03.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task03.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report03.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity，接着 e212033）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report02.md（“斜杠菜单负载”和“阻碍与接续”两部分）

## 目标与输入

修改既有的斜杠菜单逐项用例（`tests/e2e/knowledge/editor-s3-menus.spec.ts` 或报告里定位到的那个文件），让每条命令都从可辨识的初始状态开始：每条命令使用独立的初始文档，或者先定位到一个顶层空段落。这样它不再依赖上一条命令留下的结构（例如引用、代码块残留）。断言强度保持不变，仍要覆盖全部 36 项并验证每项确实生效。之后在四路并行负载下运行 ≥ 20 次，必须全部通过。

另外，report02 中提到的紧凑评论偶发失败，由 w4:pC 负责修复（根因已定位），本任务不处理。

## 读写范围与产物

- 可写业务范围：仅限该斜杠菜单用例文件，以及 `tests/e2e/helpers/**`（只增，不改）。
- 预期产物：在分支上提交；把运行记录追加到 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/runs.md`。

## 验收与验证

- 四路并行跑 20 次以上全部通过；跑一遍 `pnpm lint` 和 `pnpm format:check`。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report03.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
