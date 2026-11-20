# task06.md：消除查找替换控制器的每键全页查询（F09 回退）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task06.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task06.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report06.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：疑难分析报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report02.md（必读：调用点、trace、“只调整判断顺序”的验证方式）；本机原始数据在 /tmp/huhu-f09-pd02.1KM1ic

## 目标与输入

**开工前先同步**：`git merge --no-ff --no-edit closeout/issue2-integration`（tip 88fdabd）。

你在 ffbafa8 中加入的 `FindReplaceController`（vendor `app/src/editor/find-replace/FindReplaceController.tsx`，以及相关的 keydown 处理）在每次普通字母 keydown 时遍历整页查找浮层。修复要求：普通输入的按键不触发任何 DOM 查询；只有在真正相关的按键（例如 Mod+F、Mod+H、Escape、Enter，查找栏打开时）才做必要的查询，并且尽量限定在编辑器根节点内，或者用状态 / ref 代替查询。快捷键与其他浮层（斜杠菜单、表情选择器、链接编辑、IME 组合）之间的优先级保持不变。先对照上游 OK 的做法：上游是在哪里、如何判断的；Huhu 的不同点要写清原因。vendor 改动登记 PATCHES.md，并刷新重放清单（`OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --refresh-replay`，然后 `--replay` 校验零差异）。

验证：
- 加一条回归（单测或 e2e 均可），断言普通字母按键期间不调用那个全页查询（例如对 `document.querySelector(All)` 计数，或对控制器的判断函数计数）；查找替换的既有 e2e 与上游 DOM 测试通过（Mod+F 打开、查找、替换、Esc 关闭、IME 组合期间放行按键）。
- F09 配对测量：机器空闲时（`uptime` 1 分钟负载 < 4，记录），交替运行 main 9f870c0 与你的最终提交，各 ≥ 5 轮 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟'`（main 用单独的 detached worktree，先 build）。报告每轮 p95，以及各自的中位数与范围。这里的验收是候选与 main 处于同一水平（差异落在两者各自的轮间波动内），并如实记录相对 16 ms 门槛的情况。也要跑 `-g '打开 1 MiB'`。

## 读写范围与产物

- 可写业务范围：vendor 的 find-replace 目录及其测试、PATCHES.md、重放清单（只通过脚本刷新）、`tests/e2e/knowledge/editor-parity-*.spec.ts`、evidence/parity/**。
- 预期产物：在你的分支上提交；新增 evidence/parity/f09-findreplace.md（修法、回归、配对测量表），并更新 runs.md。

## 验收与验证

- 回归通过；配对测量数据齐全；运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check` 与 `--replay`、`pnpm build`、`pnpm format:check`、`pnpm knip`。

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
