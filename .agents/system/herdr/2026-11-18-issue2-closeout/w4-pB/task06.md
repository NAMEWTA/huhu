# task06.md：与固定 OK 基线的同样本、同操作实跑对照（B01 / B03 / D02 等）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pB
- 当前任务：task06.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task06.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report06.md
- 工作目录：/home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout）；OK 基线运行在 /home/wta/projects/huhu/temp/sources/open-knowledge 的一个**副本**里（例如 `git -C /home/wta/projects/huhu/temp/sources/open-knowledge worktree add /home/wta/projects/ok-baseline 44a2e0a`，或者复制一份），不要修改原工作副本
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pB
- 接续依据：复审报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report02.md（规格 4：“兼容性矩阵多行仍只有一侧 E2E 或上游单测，固定 OK 同样本同操作对照需用实跑记录或明确差异逐项补齐”）；方法见 /home/wta/projects/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification.md §4（第 65–83 行）；矩阵见 /home/wta/projects/huhu-wt-layout/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/parity-82.md 与 .agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/parity-matrix.md

## 目标与输入

**开工前先同步**：`git merge --no-ff --no-edit closeout/issue2-integration`（tip 9b143a4）。

Issue 验收的 B03（“/ 分类、过滤、别名、预览、方向键、Enter/Tab、Escape、鼠标、无结果和定位与固定 OK 基线对照通过”）与 D02（“正文高亮、边缘提示、线程、回复、Markdown 内容、解决/重开、过滤、删除确认与 OK 对照验收”），以及规格 §7（“OK 行为对照用同一份样本文档、同一操作序列，在固定 OK 基线与 Huhu 间逐项比对”）要求有**实跑对照**。

1. 在本机运行固定 SHA 44a2e0a 的 OK（先读 OK 仓库的 README / package.json，找到本地运行编辑器的最小方式：浏览器 dev 构建加本地服务端，或者它的桌面壳；记录命令、版本和遇到的问题）。如果确实无法运行，写清楚具体原因（命令与错误输出），以及已经尝试过的替代方式，然后停下来报告，不要伪造对照。
2. 能运行时，用 Playwright 驱动 OK 与 Huhu（Huhu 用生产构建的真实 Electron），执行**同一份样本文档、同一操作序列**，至少覆盖：
   - B03：`/` 菜单的分类与顺序、按中英文过滤、别名、预览、方向键、Enter / Tab 选择、Escape、鼠标选择、无结果状态、菜单定位（靠近视口边缘时）；
   - D02：选区评论创建、正文高亮、边缘提示、线程、回复、Markdown 内容渲染、解决 / 重开、过滤、删除确认；
   - 复审点名“只有一侧证据”的矩阵行中，与用户可见行为相关的若干项（例如块类型菜单、链接编辑、表格、脚注）。
   每项输出：两边的截图、最终 Markdown 文本、关键 DOM 状态；逐项归类为“等价 / 已登记差异（原因：Huhu 的本地化、宿主差异、OP-D19 的范围决定等）/ 未对齐（待修）”。“未对齐”的项单独列出，附复现步骤。
3. 对照脚本放在 `tests/parity-ok/`（新增，不进默认 e2e），可以重复运行。

## 读写范围与产物

- 可写业务范围：`tests/parity-ok/**`（新增）、`.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity-ok/**`（新增：每个功能一份 md，截图放在子目录）。不改产品代码；发现“未对齐”只报告，由 Lead 分派修复。
- 预期产物：在你的分支上提交；`evidence/parity-ok/README.md` 写明 OK 的运行方式、版本、覆盖项与归类汇总表。

## 验收与验证

- 每项对照都有两边的实跑证据；归类有依据。
- `pnpm lint`、`pnpm format:check` 通过（新增脚本也纳入格式检查）。

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
