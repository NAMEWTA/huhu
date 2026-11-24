# task02.md：修复关闭前最后输入未落盘（C06）与紧凑评论提交旧文本（H05）

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pC
- 当前任务：task02.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report02.md
- 工作目录：/home/wta/projects/huhu-wt-session（分支 closeout/issue2-session，接着 290e8f7 继续）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pC
- 接续依据：根因分析 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report01.md（必读，含调用链、文件:行与修复建议）；你的上一份报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report01.md

## 目标与输入

按 w4:pD 的报告实现修复（可改进，但要说明理由）：

1. **C06 笔记退出 / 切换 / 关闭**：把当前文档的可编辑端口接到对应 `DocumentSession` 的 drainer（`attachDrainer`），端口替换、路径变化、卸载时解除；drainer 支持异步（`() => void | Promise<void>`），`flushForExit` / `flush` / `keepDraft` / `dispose` 在读取文本前等待所有交付完成；不要新增第二个全局 flusher。保留自动保存 / 手动草稿 / 版本化串行保存的语义。切 Vault 的 dirty 筛选：用户发起切换时先排空再枚举。
2. **H05 紧凑评论**：`packages/editor/src/rich/compact.tsx`、`packages/editor/src/rich/rich.d.ts`、`plugins/tasks/src/ui/compact.tsx` 透传已有的 `onPort`；`TaskDetail.tsx` 的两个发表入口共用一处：先 `await port.flush()`，再用 `port.getDraft().trim()` 判空并提交；端口未就绪及请求在途时防止重入。同时排查同类入口：知识库评论 composer（OK 评论 UI 的提交）、收件箱 compact 输入（`InboxModule`）、档案记录正文，凡是“读取编辑器内容后再提交 / 保存”的显式动作，都要先结算。逐个列出并修复或说明为什么不需要。
3. **回归用例（必须能稳定判红）**：按 pD 建议，在真实挂载路径上控制一次慢结算（例如只在测试构建 / 测试钩子里把桥的首笔结算拉长，或用 CDP `Emulation.setCPUThrottlingRate`），保证“PM 已有完整输入、Y.Text 仍是旧值”这一前置条件成立，然后：
   - 直接 `app.close()`，再用**同一 Vault 新启动一个应用实例**回读，断言完整字节；手动保存模式下断言原文件不变、带末字的草稿可恢复；另覆盖立即切笔记、切 Vault，以及无编辑时字节和 mtime 不变；
   - 评论：输入 → 撤销 → 输入新文 → 立即点击，分别走普通发表和“发表并关闭”，断言请求体以及重开任务后的正文都是新文；撤销到空时不发送；连续点击只发一次。
   先在**修复前**的代码上运行，证明新用例会失败（判红），再修复，确认转绿。把 30 条只读实例成本用例与正文断言拆开，避免实例挂载数的波动遮住正文断言。
4. **F09 不回退**：修复后在机器空闲时运行 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '打开 1 MiB|编辑输入延迟'`（5000 行输入 p95 ≤ 16 ms，1 MiB 到可编辑 ≤ 500 ms），以及 `tests/e2e/knowledge/editor-s3-large.spec.ts`。注意：本机还有其他 worktree 在跑 e2e，严格性能测量前要确认负载（`uptime`），必要时等待或说明。

涉及前端时遵循 AGENTS.md（zh-modern-web-guidance 的 search / retrieve，与 `ime-safe-enter-submit` / `forms` 相关的指南）。保留 B07 的“输入法组合期间推迟交付”：flush 遇到组合中的状态时，按现有规则处理，并说明。

## 读写范围与产物

- 可写业务范围（仅在 /home/wta/projects/huhu-wt-session）：task01 的全部范围，**另加**：`plugins/notes/src/ui/NoteDocument.tsx`、`plugins/notes/src/ui/documents/**`、`packages/editor/src/rich/compact.tsx`、`packages/editor/src/rich/rich.d.ts`（只增加 onPort 声明）、`packages/editor/src/rich/RichMarkdownEditor.tsx`（只在确有必要时做最小改动，例如测试钩子，并说明理由）、`plugins/tasks/src/**`、`plugins/inbox/src/**`、`packages/workbench/src/state/**`、`tests/e2e/knowledge/**`（新增或修改 session / compact 相关用例；`compact-cost.spec.ts`、`editor-s2b.spec.ts` 可改）。不改 vendor 桥的调度参数，不改 CSS 与工具栏。
- 预期产物：在 closeout/issue2-session 上提交；`/home/wta/projects/huhu-wt-session/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/session/c06-h05-fix.md`（判红 → 转绿的运行记录、修改的入口清单、F09 数据）；更新 `/home/wta/projects/huhu-wt-session/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/session/runs.md`。

## 验收与验证

- 新回归用例在修复前判红、修复后转绿，并在 CPU 竞争下重复 ≥ 10 次全部通过。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows`，以及 F09 的严格性能测量。全部通过才算 done；偶发失败单独重跑 3 次并如实记录。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report02.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
