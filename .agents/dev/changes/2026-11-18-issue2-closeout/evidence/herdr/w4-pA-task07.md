# task07.md：候选 33e2113 上，本地化后需要更新的 4 个用例定位

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task07.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task07.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report07.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：Lead 在集成候选 33e2113 上的全量 e2e 日志 /tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int3/e2e-full.log（第 352–470 行）；w4:pB 的 task05（通知 / 表情 / 块文案本地化，a8e5be5）

## 目标与输入

**开工前先同步**：`git merge --no-ff --no-edit closeout/issue2-integration`（tip 33e2113）。

w4:pB 本地化以后，以下用例还在用旧名称定位，在 33e2113 上失败：
- `editor-parity-closeout-remaining.spec.ts:48`（Embed：`textbox name /^src$/i` 找不到，焦点断言失败）
- 同文件 `:353`（代码块：按钮 `/Hide HTML preview|隐藏 HTML 预览/` 找不到）
- 同文件 `:395`（Callout：按钮 `/Callout properties|Callout 属性/` 找不到）
- `editor-s3-matrix.spec.ts:126` 的表情项（gridcell `Party popper`）

先确认每一处是不是仅仅文案变了：对照 vendor 当前的中文消息，看界面上实际的可访问名称。如果只是文案变化，就按实际中文名称定位，英文别名可以继续作为搜索输入；断言强度不变。如果是功能真的坏了（例如 Embed 属性面板没有自动聚焦到 src 输入框），就修产品并写清楚。

## 读写范围与产物

- 可写业务范围：上述两个 spec 文件；vendor 中仅修产品缺陷所需的部分（登记 PATCHES.md 并刷新重放清单）；evidence/parity/runs.md。
- 预期产物：在你的分支上提交。

## 验收与验证

- 四个用例在同步后的分支上各单独重复跑 3 次通过；`xvfb-run -a pnpm e2e tests/e2e/knowledge` 全量通过；`pnpm lint` 与 `pnpm format:check` 通过。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report07.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
