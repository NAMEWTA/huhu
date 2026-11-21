# task07.md：复审阻断修复——设置返回草稿竞态、标签右键关闭在手动模式下写盘、退出回执、H01 语义等价

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pC
- 当前任务：task07.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task07.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report07.md
- 工作目录：/home/wta/projects/huhu-wt-session（分支 closeout/issue2-session）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pC
- 接续依据：复审报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report02.md（必读，含文件:行、复现步骤与 Lead 分派）

## 目标与输入

**开工前先同步**：`git merge --no-ff --no-edit closeout/issue2-integration`（tip 9b143a4）。

1. **新发现 1（阻断）**：从设置页返回时，`reopenDraft()` 先等待 `flushForExit()`，之后才读取 `this.revision`，于是写草稿在途期间用户的新输入会被重读覆盖，恢复草稿也找不回来（`NotesModule.tsx:64–79`、`DocumentSession.ts:161–187,364–368`）。修复：从重显 / 请求开始时就固定会话版本，任何一步发现更新的修订，就保留当前缓冲；避免不必要的重复 checkpoint 写入。回归：在真实 Electron 中分别停住“写草稿”和“读文档”两个阶段，期间输入新内容后放行，断言编辑区与可恢复草稿都包含新输入、磁盘未变。先在修复前判红。
2. **新发现 2（阻断）**：手动保存模式下，标签右键“关闭 / 关闭其他 / 关闭右侧”走显式保存（`NotesModule.tsx:189–202` → `DocumentSession.flush`），与关闭按钮只留草稿的行为相反。工作台契约 US-KN-05 / ACC-KN-04（`modules/knowledge.md:13,119`）规定：手动模式下保存是独立的明确选择。修复：菜单的关闭与按钮共用同一个关闭入口（手动模式留草稿，自动模式按自动保存落盘），不要静默写盘。修改 `tests/e2e/knowledge/layout-tab-menu.spec.ts:19–23,54–73` 中把错误行为当作期望的断言，为三种菜单关闭分别断言：手动模式下磁盘原字节不变、草稿可恢复；自动模式下落盘。
3. **工程 2（部分）**：桌面 preload 仍吞掉 flusher 的拒绝并无条件回执，main 仍然销毁窗口（`apps/desktop/src/preload/index.ts:46–50`、`src/main/index.ts:58–67,91–97`）。修复：把结果传回 main；当草稿也无法保全时，不要静默销毁窗口，给出明确选择（例如提示“仍有未保存内容，重试 / 放弃并退出”），或者至少暂停自动销毁并显示错误。3 秒上限对“等待超时”这种情况保留，但要和“明确失败”区分开。加测试（单测或 e2e，可以注入失败的 drainer）。
4. **规格 7（H01）**：`golden-roundtrip.test.ts:83–123` 中，富文本往返后对“非字节相等”的样本，按规格 H01 用 `markdownSemanticallyUnchanged`（vendor 中已有，以实际位置为准）判定无变化，或者把它们逐例登记为规范化例外（写明差异类别）。不要只比较顶层块数和文本。
涉及前端时遵循 AGENTS.md。

## 读写范围与产物

- 可写业务范围：你此前任务的全部范围，**另加** `plugins/notes/src/ui/tabs/**`、`tests/e2e/knowledge/layout-tab-menu.spec.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/src/main/index.ts`（仅退出协议）、`packages/workbench/src/state/flushers.ts`、`packages/editor/test/golden-roundtrip.test.ts`。
- 预期产物：在你的分支上提交；更新 evidence/session/review-fixes.md 与 runs.md。

## 验收与验证

- 每项都有修复前判红、修复后转绿的证据（无法判红的写明原因）。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`xvfb-run -a pnpm e2e tests/e2e/shell.spec.ts tests/e2e/knowledge tests/e2e/workflows`。全部通过才算 done；偶发失败单独重跑 3 次并如实记录。

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
