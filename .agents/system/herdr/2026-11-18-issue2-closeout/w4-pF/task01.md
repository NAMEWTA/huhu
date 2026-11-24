# task01.md：修复 ProseMirror 聚焦回调把旧光标写回、导致选区丢失（B06）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pF
- 当前任务：task01.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pF/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pF/report01.md
- 工作目录：/home/wta/projects/huhu-wt-pm（分支 closeout/issue2-pm，基于集成 9b143a4，已 pnpm install、已放随包 herdr）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pF
- 接续依据：疑难分析报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report03.md（必读：机制、时间线、“最小修复与稳定回归”一节第 68 行起，以及判红方法）；原始数据 /tmp/huhu-pd03.6ljBo0

## 目标与输入

编辑器刚获得焦点时，`prosemirror-view@1.41.8` 的 `src/input.ts:781–792` 安排一个 20 ms 回调，在观察器缓存与 DOM 不同的时候执行 `selectionToDOM(view)`。如果浏览器已经有非折叠的原生选区，而 ProseMirror 还没收到 `selectionchange`，这一步会把模型里的旧光标写回 DOM，选区丢失（气泡菜单不出现，或者拖选被截短）。main 9f870c0 上就有这个问题，属于 B06（“无选区跳失”）。

1. 按分析报告的建议修复：保留现有的视图存活、焦点与快照检查；当浏览器选区的起点和终点都在当前可编辑视图内、不在组合输入中、并且是非折叠选区时，先 `view.domObserver.flush()` 接收原生选区，再重新判断是否还需要执行原来的回写；折叠光标保留原有的焦点恢复逻辑。用项目现有的依赖补丁机制实现（`pnpm-workspace.yaml` 的 `patchedDependencies` / `pnpm patch`，参照已有补丁的写法；在 `PATCHES.md` 或 `docs/upstream/ledger.md` 中按现有约定登记），不要 fork。先查 prosemirror-view 的上游是否已经有对应修复（changelog / issue），有就说明，并优先采用与上游一致的写法。
2. 加一条能稳定判红的回归（真实 Electron）：按报告第 74 行起的方法（暂存下一次 focus 注册的 20 ms 回调，用真实点击取得焦点，然后 Home、Shift+End），断言气泡菜单可见、选区完整；再加一条快速拖选的回归。先在修复前判红。
3. 复核失焦、组合输入（IME）、浏览器把光标复位等路径没有被破坏：跑 B06 / B07 / IME 的既有 e2e、`editor-parity-selection.spec.ts`、气泡相关用例（`editor-parity-closeout.spec.ts:453`、`:551`、`i18n-zh-hans.spec.ts:127`），在负载下（`stress -c 4`）各重复 10 次。

涉及前端时遵循 AGENTS.md。

## 读写范围与产物

- 可写业务范围：`pnpm-workspace.yaml` 的补丁登记、`patches/` 目录（以项目现有位置为准）、`pnpm-lock.yaml`、`docs/upstream/ledger.md` / vendor `PATCHES.md` 的登记、`tests/e2e/knowledge/editor-selection-focus.spec.ts`（新增）、`.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/pm-focus/**`（新增）。不改其他产品代码。
- 预期产物：在你的分支上提交（中文 conventional 提交消息，结尾 `Co-Authored-By: Codex <noreply@openai.com>`）；在 evidence/pm-focus/ 写清修法、上游核查结果、判红到转绿的记录与重复运行结果。

## 验收与验证

- 回归先判红后转绿；负载下各重复 10 次通过。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`pnpm notices`、`xvfb-run -a pnpm e2e tests/e2e/knowledge`。

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
