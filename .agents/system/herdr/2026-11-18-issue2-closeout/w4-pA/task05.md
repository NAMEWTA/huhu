# task05.md：审查发现修复——B06 快速换选区丢段落、编辑区就地右键、模板导入、DOM 测试逐项评估、来源映射、parity 用例本地化

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task05.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task05.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report05.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：独立审查报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report01.md（必读，含文件:行、复现方法与 Lead 的分配）；你自己之前的报告

## 目标与输入

**开工前先同步**：在工作目录执行 `git merge --no-ff --no-edit closeout/issue2-integration`（集成分支是 main 加上 layout / session / parity 三个分支，tip 03dc93b 或更新），解决冲突后再开始，之后都在这个基础上提交。集成分支以后会再合并你的分支。

（在 task04 表情选择器完成后再开始。）
1. **规格 8 · B06 缺陷（main 上也能复现）**：给一段加下划线后，立即点选另一段，按 End、Enter，再输入 `/embed`，后一段会被替换（磁盘上也丢失）。推断是输入先于选区同步到达：当前的同步守卫（`RichMarkdownEditor.tsx` 约 238–269 行，P-S3-08）只处理带修饰键的 keydown。查明根因：对照 OK 上游如何处理 `selectionchange` 与 `beforeinput` / mousedown / keydown；优先复用上游机制，比如在 `beforeinput` 和所有会编辑的 keydown 上先 `domObserver.flush()`。修复时不要破坏 F09 输入延迟和 IME 组合。加真实 Electron 回归，用审查里的快速序列（不加等待），断言实际范围、相邻段落保留、磁盘内容正确；先在修复前判红，然后在负载下重复 ≥ 10 次通过。
2. **B01 第 233 行 · 编辑区就地右键**：OK 在编辑区里对附件、双链、图片右键，会出现针对这个目标的菜单（上游 `FileTargetMenuItems` 等，在 /home/wta/projects/huhu/temp/sources/open-knowledge/packages/app/src 中定位）。在 Huhu 里接上：右键附件、双链、图片时，出现针对该目标的菜单（打开、在文件树中显示、复制路径等适用项），可用键盘唤出，并迁入相关的上游 DOM 测试。宿主侧的动作通过已有能力实现（打开文件走 DocTab，定位走文件树的 reveal）。加 e2e。
3. **规格 4 · 模板导入（Q2 / OP-D19 明定保留）**：`PATCHES.md:48` 登记了“移去导入”，模板接口也没有映射。查明 OK 的“模板导入”是什么（入口、数据来源、接口）；按 Q2 在 Huhu 里实现本地版本（模板来自 Vault 内的文件，不联网；接口映射登记到 endpoint-matrix），并加 e2e：导入模板，保存、关闭、重开后断言。如果查明它依赖 OK 服务端的模板存储、Huhu 没有对应概念，写出详细证据和最小的本地等价方案，然后实现这个方案。不要只登记一句不适用。
4. **规格 4 · 41 个 DOM 测试候选**：审查列出 41 个“同名实现已经在 vendor 中、同路径的 DOM 测试没有迁入”的候选（例如 FileTargetMenuItems、PropertyDisclosure）。逐个处理：迁入并通过，或写明不适用的理由（被测行为不在闭包，或服务于 OK 云 / AI / 应用壳）。产出逐文件的适用性清单 `evidence/parity/dom-tests-applicability.md`（覆盖上游全部 `*.dom.test.*` 文件，标明迁入 / 适配 / 不适用及理由）。
5. **工程 7 · G01 / G02 来源映射**：为本轮新增的 vendor 闭包文件和测试补文件级的来源映射（上游路径 → 目标路径 → 原样 / 适配 + 改写说明），更新 `closure-manifest`（或等价的仓库内清单）；提供一个能从干净的上游 44a2e0a 重放、得到与仓库 vendor 零差异的检查（可以扩展 `scripts/ok-patches.mjs`），并跑一次。
6. **规格 2 · parity 用例**：`editor-parity-closeout-remaining.spec.ts` 的第 59–67、191–204 行改为按中文界面定位（英文别名可以继续作为输入）；第 296 行的拖放用例改为按目标标签、正文标识或路径来验证关闭和重开，不要再断言全局没有 ProseMirror。

## 读写范围与产物

- 可写业务范围：你 task01–task04 的全部范围，**另加**：`packages/editor/src/rich/RichMarkdownEditor.tsx`（选区同步部分；不改 pC 加入的 flush / drainer 逻辑）、`plugins/notes/src/ui/documents/NoteEditorSurface.tsx`（仅就地右键与模板的宿主接线；pC 也会改这个文件的附件读取部分，请把改动限制在独立的函数 / 区块内）、`scripts/ok-patches.mjs` 与清单文件、`.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/**`。不改 TabStrip / 设置 / 样式（属 w4:pB），不改会话与 archives（属 w4:pC）。
- 预期产物：在你的分支上提交；更新 parity-82.md、runs.md，新增 dom-tests-applicability.md、review-fixes.md（每条：问题、修法、证据）。

## 验收与验证

- 每条都有证据；B06 回归修复前判红、修复后转绿。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check`（以及新的重放检查）、`pnpm build`、`pnpm format:check`、`pnpm knip`、`pnpm notices`、`xvfb-run -a pnpm e2e tests/e2e/knowledge`、`HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '打开 1 MiB|编辑输入延迟'`（在空闲时跑，并记录负载）。全部通过才算 done；偶发失败单独重跑 3 次并如实记录。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report05.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
