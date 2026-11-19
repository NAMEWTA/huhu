# task04.md：属性保存后磁盘缺追加正文的定因，以及 comments-persistence D01 在集成后失败

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pC
- 当前任务：task04.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task04.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report04.md
- 工作目录：/home/wta/projects/huhu-wt-session（分支 closeout/issue2-session，接着 b147410）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pC
- 接续依据：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report03.md（含 Lead 验收）、/tmp/huhu-session-03/ 下的 retry-* 日志

## 目标与输入

1. **属性保存偶发丢失追加正文**（你在 report03 里记录了 2/3：显示“已保存”之后读盘，缺少追加的正文）。这可能是 C04 数据丢失（规格：正文有未保存修改时编辑属性，或者顺序相反，最终都要保存到同一文件，不能互相覆盖）。在负载下（`stress -c 4` 或并行 e2e）重复 ≥ 20 次统计失败率；用埋点或 trace 确认，是产品竞态（例如属性写入和正文 drainer / 推迟结算交错、属性路径的保存读取了未结算的正文，或者“已保存”状态先于真正的落盘），还是测试读盘的时机问题。是产品缺陷就修，并加一个能稳定判红的回归（参照 w4:pD 慢桥的做法）；是测试时机问题，就按真实用户可观察的完成信号修测试，并给出依据。另外，在你的分支和集成后的 main（9f870c0）上各跑同一用例 ≥ 10 次，确认这是不是本轮改动引入的回归。
2. **comments-persistence D01 在集成版本上失败**：集成提交 03dc93b 的全量运行中，`tests/e2e/knowledge/comments-persistence.spec.ts:56` 关闭标签再重开后，`openComments` 等不到 `note-inspector` 的“批注”标签，超时（日志 /tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int/e2e-full-1.log 第 332 行起；trace 在 /home/wta/projects/huhu-wt-int/test-results/ 下 knowledge-comments-persist-38b35* 目录）。layout 分支改了详情栏，把它移到编辑区内并做了窄栏收纳。查明原因：是 `isVisible()` 加切换按钮的竞态（详情栏的开关状态会跨重开保留），还是重开后详情栏的状态不一致（产品问题）。产品问题就修；测试问题就改成按状态确定性地打开批注页。你的分支已经合入了 03dc93b，可以直接复现。
3. 修完后在你的分支上跑 `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows` 全量，以及 typecheck / lint / test / build / format:check / knip。Embed / 格式气泡两项属于 w4:pA，如果仍失败，只记录。

## 读写范围与产物

- 可写业务范围：与 task03 相同；另加 `tests/e2e/knowledge/editor-s3-properties.spec.ts`、`comments-persistence.spec.ts`。如果需要改详情栏的组件或布局（`notes.css` / 详情栏），先在报告里写清原因和最小改动，限于修复本问题所需。
- 预期产物：在你的分支上提交；更新 evidence/session/review-fixes.md（新增这两节）和 runs.md。

## 验收与验证

- 两项都有根因证据；属性保存如果是产品缺陷，回归必须能稳定判红。
- 全量与门禁通过，或者把失败如实记录并归因。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report04.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
