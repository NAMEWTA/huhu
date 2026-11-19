# task08.md：复审修复——设置页 Ctrl+F 被隐藏编辑器消费；模板导入要能真正用于新建笔记

## 定位

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- topic：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/topic.md
- manifest：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/manifest.tsv
- pane_id：w4:pA
- 当前任务：task08.md
- 本任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task08.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report08.md
- 工作目录：/home/wta/projects/huhu-wt-parity（分支 closeout/issue2-parity）
- pane 核对方式：`echo $HERDR_PANE_ID` 应为 w4:pA
- 接续依据：复审报告 /home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report02.md（必读，含文件:行、复现步骤与 Lead 分派）

## 目标与输入

**开工前先同步**：`git merge --no-ff --no-edit closeout/issue2-integration`（tip 9b143a4）。

1. **新发现 3**：设置页以 display:none 保留笔记（`packages/workbench/src/shell/AppShell.tsx:98–106,283–289`），仍挂载的 `FindReplaceController` 在 window 上监听 Ctrl/Mod+F（`FindReplaceController.tsx:213–236,245–249`），没有检查笔记是否为当前活动界面。在设置页按 Ctrl+F 时，隐藏的笔记里会打开查找栏，返回知识库后仍然可见。修复：把模块是否处于活动状态纳入窗口级快捷键的限定范围（例如编辑器根节点不可见 / 不在活动模块中时不响应），保留可见笔记里的快捷键与外部浮层优先级。回归：在设置页按 Ctrl+F 不产生查找栏，返回后笔记里 Ctrl+F 照常工作。
2. **新发现 4**：本地模板导入只在“模板”目录生成一个普通副本（`plugins/notes/src/ui/explorer/filesDeps.ts:118–147`），新建对话框只列出 4 个内建模板（`plugins/notes/src/ui/NoteDialogs.tsx:119–125`）。OP-D19 Q2 要求保留模板导入，Issue §5.4 要求文件树菜单接通模板入口。修复：最小化接入本地模板清单（例如列出 Vault“模板”目录下的 Markdown），让新建对话框（以及文件树的新建入口）能选用已导入的模板生成新笔记。新笔记内容来自模板，模板文件本身不变。同时处理你在 report05 里提到的“创建副本和保存内容分两步，中断时可能留下空白模板”：改成原子写入，或者失败时回滚。e2e：导入一个模板，用它新建另一篇笔记，保存、关闭、重开后断言内容，并断言模板文件字节没有变化。

## 读写范围与产物

- 可写业务范围：你此前任务的全部范围，**另加** `plugins/notes/src/ui/NoteDialogs.tsx`、`plugins/notes/src/ui/explorer/filesDeps.ts`、`plugins/notes/src/engine/**` 中与模板 / 新建相关的部分及其测试；vendor 的 find-replace（登记 PATCHES.md 并刷新重放清单）。不改会话 / 草稿逻辑（属 w4:pC）。
- 预期产物：在你的分支上提交；更新 evidence/parity/review-fixes.md 与 runs.md。

## 验收与验证

- 两项回归先判红后转绿；运行并记录 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:vendor`、`node scripts/ok-patches.mjs --check` 与 `--replay`、`pnpm build`、`pnpm format:check`、`pnpm knip`、`xvfb-run -a pnpm e2e tests/e2e/knowledge`。

## worker 执行约定

1. 先读本任务指定的 topic 和 manifest，核对实际服务端、共享根、真实 pane ID 与当前任务文件名。任务身份是“共享根 + pane_id + task”。manifest 只有 pane_id/task/status 三列；active 包含待启动、执行中和待审，done 表示 Lead 已验收，blocked 表示停止推进。
2. 先检查准确的报告路径。已有身份匹配的终稿报告时只回告其绝对路径，不重跑；已有报告身份不符时停止并在终端说明。没有终稿时，只有身份相符、manifest 当前行指向本任务且状态为 active 才执行。旧指针、pane 不符或其他状态都交回 Lead，不自行修改清单。
3. 同一 pane 一次只做一项任务。若已在执行同一任务，重复提示不启动第二份执行。上下文丢失时先核对已有产物和实际状态；不因没有报告就认定先前动作没有发生。
4. 仅在上述业务范围内写产物。协作记录中只写自己的报告执行部分及同目录临时稿；不改 topic、manifest、task、他人报告或 Lead 验收部分。不自行领取下一任务。
5. 执行所要求的验证，用下面的完整格式写报告。完成填 done；无法继续填 blocked，说明已完成部分、阻碍与继续所需条件。不要把 Herdr 的 idle/done 当成任务或验证结果。
6. 先把完整报告写入同目录临时文件，核对任务身份和内容，再重命名成 report08.md 终稿；已有终稿不得覆盖。提交后仅在终端回告报告绝对路径。
7. 如果无法读取必要文件、核对身份或写入报告，在终端明确说明任务绝对路径、失败原因和已有产物；不要声称已提交报告。

## 完整报告格式

（照 /home/wta/projects/huhu/.agents/skills/system-herdr/assets/report.md 的格式填写：任务身份头、结论、产物与改动（含提交 SHA）、验证表、阻碍与接续；Lead 验收部分留空。）
