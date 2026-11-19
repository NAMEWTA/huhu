# task03.md：疑难分析——选区后气泡菜单偶发不出现

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pD
- 当前任务：task03.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task03.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report03.md
- 工作目录：/home/wta/projects/huhu-wt-analysis（开工前 `git checkout --detach 9b143a4`，然后 `pnpm install --frozen-lockfile`、`pnpm build`）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pD
- 接续依据：Lead 在 9b143a4 上的全量 e2e 日志 /tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int4/e2e-full.log（第 355–430 行；trace 在 /home/wta/projects/huhu-wt-int/test-results/）；w4:pA/report07（“脚注按钮未出现”“块类型文本按钮未出现”）；w4:pC/report05（H03 等待气泡“粗体”超时）；w4:pA 在 0f69158 对 B06 的修复（在原生编辑输入和命令处理之前，按 DOM 快照变化调用 ProseMirror 的选区同步）

## 目标与输入

在 9b143a4 上，选中文字后格式气泡菜单（`bubble-menu-bar`、`footnote-bubble-button`、块类型按钮）偶尔不出现，用例在 10 s 内等不到它。涉及 `editor-parity-closeout.spec.ts:453`、`:551`，以及 `i18n-zh-hans.spec.ts:127`。

1. 在负载下（例如 `stress -c 4`）重复这几个用例 ≥ 20 次统计失败率，并对照 main 9f870c0（同样的用例；如果在 main 上不存在，就用 `tests/e2e/knowledge/editor-s3-menus.spec.ts` 中的气泡用例，或者写一个只读探针），判断这是不是候选引入的回归。
2. 查明根因：用例建立选区的方式（DOM Range / 鼠标拖选 / Shift+方向键）是否触发了 ProseMirror 的选区更新；气泡菜单显示的条件（上游 BubbleMenu / floating-ui 的 shouldShow、焦点、debounce），以及 B06 的选区同步修复（0f69158）、P-S3-08 的 domObserver.flush、chunk wrapper（`content-visibility`，P-S3-06）有没有让 `selectionUpdate` 丢失或者被延后。区分清楚：真实用户（硬件鼠标拖选、Shift+方向键）会不会遇到这个问题。
3. 给出根因证据、确定程度、最小修复方案（产品修复或测试修复，写明依据），以及能稳定判红的回归。只读业务代码；临时埋点只在你的工作目录，用完还原。

## 读写范围与产物

- 可写业务范围：无。
- 预期产物：报告。

## 验收与验证

- 结论由运行证据支持；推断要标注。

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
