# task06.md：修复候选 33e2113 上手动保存“离开后留下草稿并可恢复”的回归（ACC-KN-04 / C06）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pC
- 当前任务：task06.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task06.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report06.md
- 工作目录：/home/wta/projects/huhu-wt-session（分支 closeout/issue2-session）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pC
- 接续依据：Lead 在集成候选 33e2113 上的全量 e2e 日志 /tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int3/e2e-full.log（第 514 行起，trace 在 /home/wta/projects/huhu-wt-int/test-results/ 下 shell 对应目录）；你的 task02 / task03（drainer、keepDraft、手动保存语义的改动）

## 目标与输入

**开工前先同步**：`git merge --no-ff --no-edit closeout/issue2-integration`（tip 33e2113）。

`tests/e2e/shell.spec.ts:265`「手动保存：外部改动出现合并 Banner、合并后两边改动都在（ACC-KN-05）；离开后留下草稿并可恢复（ACC-KN-04）」在 33e2113 上失败：等不到 `note-draft-restore`。同一用例在第一次集成 03dc93b 的全量运行中是通过的，所以回归是在 03dc93b 之后引入的，最可能与你 task03 的“手动保存语义 / drainer 失败处理 / keepDraft”改动有关（也可能来自 layout 或 parity 的合入）。

1. 在 33e2113 上复现（单独重复跑），用 `git bisect` 或对照（03dc93b vs 33e2113 之间的提交）找出引入点，查明根因。
2. 修复产品行为：手动保存模式下离开笔记时，必须留下草稿，再次打开时出现恢复入口，恢复后内容正确；合并 Banner 的行为不变。不得放宽用例断言。
3. 检查同类路径是否受同一原因影响：切笔记、切 Vault、关闭标签、退出应用时的手动模式草稿。补充或确认相应回归。

## 读写范围与产物

- 可写业务范围：与 task03 相同（会话、documents、NotesModule、archives 等），另加 `tests/e2e/shell.spec.ts` 中本用例（只在确实是测试前提变化时修改，并写清依据）。
- 预期产物：在你的分支上提交；在 evidence/session/review-fixes.md 新增一节，并更新 runs.md。

## 验收与验证

- 用例修复后单独重复跑 5 次通过；`xvfb-run -a pnpm e2e tests/e2e/shell.spec.ts tests/e2e/knowledge/session-*.spec.ts tests/e2e/knowledge/compact-submit.spec.ts tests/e2e/workflows/archives-tabs.spec.ts` 通过；`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm format:check`、`pnpm knip` 通过。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report06.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
