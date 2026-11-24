# task07.md：补评论边缘提示（D02），以及编辑器内 Mod+K 打开链接编辑

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pB
- 当前任务：task07.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task07.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report07.md
- 工作目录：/home/wta/projects/huhu-wt-layout（分支 closeout/issue2-layout，接着 60d7589）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pB
- 接续依据：/home/wta/projects/huhu-wt-layout/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity-ok/unaligned.md 与 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report06.md 中的 Lead 裁定

## 目标与输入

1. **D02 边缘提示**：OK 在带评论的段落旁显示“打开评论”的边缘按钮（见 /home/wta/projects/huhu-wt-layout/temp/dev/2026-11-18-issue2-closeout/integration/legacy-7984bff4/parity-ok/comments/ok-edge-marker.png），Huhu 没有。在上游 /home/wta/projects/huhu/temp/sources/open-knowledge/packages/app/src 中找到这个组件 / 装饰及其挂载点，整体复用到 Huhu 的知识库编辑器（vendor 已有的就接线，缺的按闭包复制，并登记 PATCHES.md、刷新重放清单）。行为要与 OK 一致：位置、点击打开对应线程、键盘可达、多条评论、窄窗口（详情栏开 / 关）下不与工具栏和正文重叠。加 e2e，并用你的 `tests/parity-ok/compare.spec.ts` 重新跑这一项对照，把 unaligned.md 中这一条改成“等价”，附新截图。
2. **Mod+K**（Lead 决定）：焦点在富文本编辑器（含有选区或光标在链接上）时，Mod+K 打开链接编辑（与 OK 一致：气泡工具栏里的 URL 输入）；焦点不在编辑器时仍然打开命令面板。改 `packages/workbench/src/command-palette/CommandPalette.tsx` 的全局监听，参照 Mod+T 在终端里的让位方式（编辑器声明自己接管 Mod+K，命令面板跳过），并在 `packages/workbench/src/shortcuts.ts` 登记（例如“Mod+K · 编辑器内：编辑链接”），设置页的快捷键列表会自动显示。e2e：编辑器内选中文字按 Mod+K 打开链接输入并能保存，编辑器外按 Mod+K 打开命令面板，源码模式下的行为也要说明并测试。重跑对照中的链接一项。

先同步：`git merge --no-ff --no-edit closeout/issue2-integration`（如果集成分支有更新）。涉及前端时遵循 AGENTS.md。

## 读写范围与产物

- 可写业务范围：vendor 评论相关组件与 PATCHES.md、重放清单（只用脚本刷新）、`packages/editor/src/rich/**` 中的接线（不改选区同步与 flush 逻辑）、`plugins/notes/src/ui/comments/**`、`packages/workbench/src/command-palette/**`、`packages/workbench/src/shortcuts.ts`、`tests/e2e/knowledge/comments-edge-*.spec.ts` / `editor-link-shortcut.spec.ts`（新增）、`tests/parity-ok/**`、evidence/parity-ok/** 与 evidence/layout/**。
- 预期产物：在你的分支上提交；更新 unaligned.md、README.md 汇总表、runs.md。

## 验收与验证

- 两项 e2e 通过并在负载下重复 5 次通过；对照重跑。
- 运行并记录：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check` 与 `--replay`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/shell.spec.ts`。

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
