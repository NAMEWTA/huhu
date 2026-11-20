# task03.md：审查发现修复——档案正文退出、手动保存语义、drainer 错误处理、附件读取安全与一致性、黄金样本

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pC
- 当前任务：task03.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task03.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report03.md
- 工作目录：/home/wta/projects/huhu-wt-session（分支 closeout/issue2-session）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pC
- 接续依据：独立审查报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report01.md（必读，含文件:行、复现方法与 Lead 的分配）；你自己之前的报告

## 目标与输入

**开工前先同步**：在工作目录执行 `git merge --no-ff --no-edit closeout/issue2-integration`（集成分支是 main 加上 layout / session / parity 三个分支，tip 03dc93b 或更新），解决冲突后再开始，之后都在这个基础上提交。集成分支以后会再合并你的分支。

逐条修复审查报告里分配给你的问题（报告“Lead 验收”一节列了编号）：
1. **规格 1 · 档案正文退出丢字（阻断）**：把档案记录正文（`ArchivesViews.tsx` 约 576–631 行的紧凑正文端口、最新正文和写盘队列）纳入同一 index.md 会话的退出 / 切换 / 切 Vault 协议，等待队列完成并处理错误结果。加真实 Electron 回归：慢桥条件下不失焦直接退出、切 Vault，用新实例回读磁盘；先证明修复前判红。
2. **工程 1 · 手动保存模式下切到档案视图就写盘**：`NotesModule.tsx` 约 171–222 行调用 `flushRef.current()` → `DocumentSession.flush()` 直接保存，绕过了手动保存偏好。改为切换时只结算缓冲、传递同一会话的版本，只在明确的写动作（编辑档案字段 / 保存）时按偏好落盘；并处理异步导航期间目标标签被关闭后，迟到的 `show()` 又把它打开的问题。加回归（手动模式切视图后磁盘字节不变，点保存后才写）。
3. **工程 2 · drainer 拒绝**：`DocumentSession.ts` 用 `Promise.all` 等 drainer，一个拒绝就跳过写盘和清理；`flushers.ts` 吞掉失败，preload 仍回执。改为保留已交付的快照、聚合并报告结算失败、在 finally 里释放资源；退出协议对失败要有可观察的处理（例如设置 flushError，阻止静默退出或至少保留草稿）。加单测。
4. **工程 3 · 受保护资源**：Engine 的共享资产读取边界（`packages/kernel/src/capabilities/vault.ts` 约 124–149 行、`packages/vault/src/paths.ts`）要同时核对规范化路径和 realpath 后的真实目标是否在受保护目录内；`UnindexedFileViewer`（`FileViewer.tsx` 约 69–97 行）要使用 `entry.protected`，保持受保护项既有的元数据 / 权限语义；`NoteEditorSurface.tsx` 约 78–95 行的检查同步。加边界测试（Vault 内的符号链接指向受保护目录）。
5. **工程 4 · 分段读取一致性**：分段读时固定版本（mtime / size / ino 或用同一个文件句柄），核对 `readSync` 的实际返回长度，版本变化就拒绝本次下载并提示；下载错误回调在组件卸载后不再 setState（用 AbortSignal 或作用域 token）。加测试。
6. **规格 7 的 H01 部分**：`golden-roundtrip.test.ts` 中大于 256 Ki 字符的样本走 lazyRich；补一组强制 `ensureRich` → 序列化 → 回读的往返断言，与“源码优先 hydrate 保真”分开；写清 22 项上游样本的构成（16 个数据文件 + 4 个 .gitkeep + 2 个 TS 管理文件）和 JSON 用例展开后的数量。
7. **工程 6 · 黄金夹具**：不再物理复制一份；测试改为直接读取仓库内已有的 vendor 固定夹具（逐 blob 相同），删掉 `packages/editor/test/fixtures/golden/ok` 的副本；在 `docs/upstream/ledger.md` 登记测试夹具的来源、范围和许可证（加密 PDF 是本地生成的，写清生成命令）。
8. **规格 2 · explorer-keyboard 用例**：`tests/e2e/knowledge/explorer-keyboard.spec.ts:70` 按实际中文名称“文件操作选项”定位。
涉及前端时遵循 AGENTS.md（zh-modern-web-guidance 的 search / retrieve 流程）。

## 读写范围与产物

- 可写业务范围：你 task01 / task02 的全部范围，**另加**：`plugins/notes/src/ui/archives/**`、`plugins/notes/src/ui/NotesModule.tsx`、`packages/kernel/src/capabilities/vault.ts` 及其测试、`packages/vault/src/paths.ts` 及其测试、`plugins/notes/src/ui/documents/NoteEditorSurface.tsx`、`packages/editor/src/vendor/open-knowledge/app/src/editor/bubble-menu/FileBubbleButtons.tsx`（仅工程 4，改动登记 PATCHES.md）、`docs/upstream/ledger.md`、`packages/editor/test/golden-roundtrip.test.ts` 与要删除的夹具副本。不改 RichMarkdownEditor 的选区逻辑（属 w4:pA），不改 TabStrip / 设置 / 样式（属 w4:pB）。
- 预期产物：在你的分支上提交；证据写进 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/session/review-fixes.md`（每条：问题、修法、判红到转绿的用例、结果），并更新 runs.md。

## 验收与验证

- 每条都有修复，以及修复前判红、修复后转绿的证据（无法判红的写明原因）。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows`。全部通过才算 done；偶发失败单独重跑 3 次并如实记录。

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
