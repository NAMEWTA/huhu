# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1rb
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/report02.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 `048-ux01.md`、`063-ux02.md`、`064-ux03.md`、`049-ux04.md`
- 执行结果 — done，提交及 worker 验证已交回，最终验收由 Lead 执行。

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，使用已确认的工作台原型 `9f5db0cb02b2aaf035ab4d80177bb1411ebce2291dc84b8a3e23cdc8d8ed42bb`。最终工作树无未提交业务变更。原始日志和复验脚本位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1rb/task02/`。

### Lead 追加 1 · 合并 W5d

- 合并提交 `a26d1ae3`，双亲 `0fb8257d`、`f4297f95`。冲突收敛在自动化 Engine 的 `service.ts`、`index.ts` 及 `service.test.ts`。保留 W5d 统一终端接纳和发送边界重查，保留 AW3 草稿预览、手动触发修订校验；旧内部提醒直发、轮询和扫描入口沿用 W5d 的清退。
- 串行通过自动化 `service.test.ts` 49 条、`default-task-scan.test.ts` 7 条、`plan-directory.test.ts` 2 条、`cron-presets.test.ts` 4 条、`scheduler.test.ts` 12 条、`task-scan-occurrences.test.ts` 30 条，共 104 条。按约定分别运行 `pnpm exec vitest run plugins/automations/test/<文件>`。
- `pnpm --filter <包名> run typecheck` 分别通过 `@huhu/plugin-automations`、`@huhu/plugin-agent-cli`、`@huhu/desktop`。状态汇总见 `merge-verification.log`，终端已回告。

### Lead 追加 2 · AW2/AW3 点击拦截

- 独立提交 `1f7fba45`。新增的 `.automation-center-host` 启用内联尺寸容器查询，作为外壳的直接 flex 子项没有获得页面可用宽度。为该容器补齐伸展与逻辑最小尺寸，在 AW2 用例断言外壳宽度及实际指针命中。
- 文件为 `plugins/automations/src/ui/automations.css`、`tests/e2e/workflows/automation-center.spec.ts`。提交信息的 `Refs` 脚注误标 #15，AW2/AW3 归 #16。回告的提交号 `1f7fba45` 已在主分支历史中。
- 持锁运行 `pnpm --filter @huhu/desktop run build`，构建通过，构建元数据在提交前记录了 `a26d1ae3`，构建输入已包含修复代码。持锁运行 `pnpm --filter @huhu/plugin-automations run typecheck`，通过。
- Electron 44.9.1，X11/Xvfb。串行通过 `automation-center.spec.ts` 4 条、`acceptance.spec.ts -g 'MailPlan：|F31：'` 2 条、`task-journey.spec.ts -g 'T4.1 与 T5.5'` 1 条、`automation-linux-environment.spec.ts -g 'Linux 桌面批准 sh'` 1 条。Linux 首跑跨过原点击拦截后，缺少原生 PTY 使批准按钮禁用。复跑复用主检出已有的原生宿主与私有 D-Bus/Secret Service，通过完整 CLI/MCP 流程。总计 8/8。使用 `aw23-layout-check.sh` 和 `aw23-retry-linux.sh` 复验，具体命令和输出位于日志目录。终端已分两次回告提交号及 8/8 结果。

### 048-ux01 · 知识库排版

- 提交 `5d3d1d21`。默认全文宽，已有显式宽度设置继续生效。实时预览、源码和阅读共享文档区，限制长内容的溢出，普通编辑去掉包围正文的输入框边线，焦点以面板上的可见标记反馈。
- 单测 `pnpm exec vitest run packages/editor/test/reading-parity.test.ts`，3 条通过。包级类型检查 `@huhu/contracts`、`@huhu/workbench`、`@huhu/plugin-notes` 均通过。
- Lead E2E，`tests/e2e/workflows/workbench-knowledge.spec.ts -g '^UX01'`，用例「UX01：混合 Markdown 三种模式铺满知识库编辑区并保留焦点」。

<details><summary>改动文件</summary>

- `packages/contracts/src/settings.ts`
- `packages/workbench/src/settings/SettingsModule.tsx`
- `plugins/notes/src/ui/NoteDocument.tsx`
- `plugins/notes/src/ui/notes.css`
- `tests/e2e/workflows/workbench-knowledge.spec.ts`

</details>

### 063-ux02 · 保存失败与回执未知

- 提交 `a0820529`。已知保存失败可从正文提示重试，回执未知时保留当前编辑并提供「核实原保存」。核实比较原提交正文与磁盘，只读成功后接纳磁盘版本，继续编辑的文字仍为待保存状态。沿用已有 DocumentSession 生命周期、条件写、恢复草稿和冲突处理入口。
- 单测 `pnpm exec vitest run plugins/notes/test/document-session.test.ts`，118 条通过。包级类型检查 `@huhu/plugin-notes` 通过。
- Lead E2E，`tests/e2e/workflows/workbench-knowledge.spec.ts -g '^UX02'`，用例「UX02：区分保存失败和未确认，保留中文输入并核实原保存」。重绑、切文档、离场和 IME 的实际宿主复验可沿用 `tests/e2e/knowledge/session-flush.spec.ts` 的 C06 与组合输入用例，及 `editor-s3-parity.spec.ts -g 'B08 保存、评论刷新、属性更新和列表更新'`。

<details><summary>改动文件</summary>

- `plugins/notes/src/ui/NoteDocument.tsx`
- `plugins/notes/src/ui/documents/DocumentSession.ts`
- `plugins/notes/src/ui/documents/useDocumentSession.ts`
- `plugins/notes/src/ui/i18n.ts`
- `plugins/notes/src/ui/notes.css`
- `plugins/notes/test/document-session.test.ts`
- `tests/e2e/workflows/workbench-knowledge.spec.ts`

</details>

### 064-ux03 · 单条批注与按需右栏

- 提交 `19932580`。通过 `comments.update` 和原版本保存单条 Markdown 批注，退役回复、解决与重新打开能力。保留原锚点、标识、跳转、孤立及删除路径。启动时按原版本转换历史文件，原 Markdown 内的作者和时间标题及消息顺序原样保留，`.huhu/comment-migrations/` 存有原始字节副本。新批注正文直接显示在一张卡片。属性与批注均由详情栏按需打开，Escape 关闭并返回工具栏焦点，批注编辑浮层按可用高度滚动。
- 单测逐文件运行 `pnpm exec vitest run <路径>`。`plugins/notes/test/comments.test.ts` 29 条、`comment-adapter.test.ts` 2 条、`domain-exposure.engine.test.ts` 11 条、`service.test.ts` 51 条，`packages/editor/test/comment-routes.test.ts` 16 条、`host-feedback.test.tsx` 30 条，最终均通过。包级类型检查 `@huhu/contracts`、`@huhu/editor`、`@huhu/plugin-notes` 通过。
- Lead E2E，`tests/e2e/workflows/workbench-knowledge.spec.ts -g '^UX03'`，用例「UX03：右栏收起时正文铺满，锚定批注可提交、编辑、定位和删除」。更新了现有 `tests/e2e/knowledge/comments-s4.spec.ts` 的 D01/D02「选区批注进真实存储」、D02「只读 Vault」和「编辑后的批注安全渲染 Markdown」及上述既有属性入口调用者，等待 Lead 回归。

<details><summary>改动文件</summary>

- `packages/contracts/src/kinds/capture.ts`
- `packages/editor/src/host/routes/comments.ts`
- `packages/editor/src/rich/rich.d.ts`
- `packages/editor/src/vendor/open-knowledge/PATCHES.md`
- `packages/editor/src/vendor/open-knowledge/app/src/comments/CommentSelectionAffordance.tsx`
- `packages/editor/src/vendor/open-knowledge/app/src/comments/ThreadCard.tsx`
- `packages/editor/src/vendor/open-knowledge/app/src/comments/comments-client.ts`
- `packages/editor/src/vendor/open-knowledge/app/src/comments/store.ts`
- `packages/editor/src/vendor/open-knowledge/app/src/comments/types.ts`
- `packages/editor/src/vendor/open-knowledge/core/src/schemas/api/comments.ts`
- `packages/editor/test/comment-routes.test.ts`
- `packages/editor/test/host-feedback.test.tsx`
- `plugins/notes/huhu-plugin.json`
- `plugins/notes/src/engine/comments/service.ts`
- `plugins/notes/src/engine/index.ts`
- `plugins/notes/src/ui/NoteDocument.tsx`
- `plugins/notes/src/ui/NoteInspector.tsx`
- `plugins/notes/src/ui/NotesModule.tsx`
- `plugins/notes/src/ui/comments/CommentsHost.tsx`
- `plugins/notes/src/ui/comments/commentAdapter.ts`
- `plugins/notes/src/ui/documents/NoteEditorSurface.tsx`
- `plugins/notes/test/comment-adapter.test.ts`
- `plugins/notes/test/comments.test.ts`
- `plugins/notes/test/domain-exposure.engine.test.ts`
- `tests/e2e/helpers/tree.ts`
- `tests/e2e/knowledge/comments-s4.spec.ts`
- `tests/e2e/knowledge/editor-parity-closeout-remaining.spec.ts`
- `tests/e2e/knowledge/editor-s3-matrix.spec.ts`
- `tests/e2e/knowledge/editor-s3-parity.spec.ts`
- `tests/e2e/knowledge/editor-s3-properties.spec.ts`
- `tests/e2e/knowledge/journey.spec.ts`
- `tests/e2e/knowledge/session-flush.spec.ts`
- `tests/e2e/knowledge/session-persistence.spec.ts`
- `tests/e2e/perf-note-journey.ts`
- `tests/e2e/shell.spec.ts`
- `tests/e2e/workflows/archives-tabs.spec.ts`
- `tests/e2e/workflows/workbench-knowledge.spec.ts`
- `tests/e2e/workflows/write-and-restore.spec.ts`

</details>

### 049-ux04 · 常驻日记月历

- 提交 `14545113`。日记分区常驻月历，展示中英月份、星期、当前日、选中日和已有日记标记。方向键、Home/End、PageUp/PageDown 移动焦点，已有日记直接打开，空日确认后创建。纯日期按 Vault 时区取今天，月份计算与文件路径均使用确定的日期值，两路同日创建复用同一文件。
- 单测 `pnpm exec vitest run plugins/notes/test/service.test.ts`，53 条通过，含同日并发、无效日期与跨日时区。包级类型检查 `@huhu/ui`、`@huhu/plugin-notes` 通过。
- Lead E2E，`tests/e2e/workflows/workbench-knowledge.spec.ts -g '^UX04'`，用例「UX04：常驻月历按时区与语言显示，键盘选日且空日仅创建一次」。

<details><summary>改动文件</summary>

- `packages/ui/src/components/DateCalendar.tsx`
- `packages/ui/src/components/MonthCalendar.tsx`
- `packages/ui/src/components/calendar-date.ts`
- `packages/ui/src/index.ts`
- `packages/ui/src/styles/components/view-etc.css`
- `plugins/notes/src/engine/index.ts`
- `plugins/notes/src/engine/service.ts`
- `plugins/notes/src/shared/daily.ts`
- `plugins/notes/src/ui/NoteExplorer.tsx`
- `plugins/notes/src/ui/NotesModule.tsx`
- `plugins/notes/src/ui/i18n.ts`
- `plugins/notes/src/ui/notes.css`
- `plugins/notes/test/service.test.ts`
- `tests/e2e/workflows/workbench-knowledge.spec.ts`

</details>

所有定向单测和类型检查使用 Node 24.22.1，按任务要求逐文件或逐包在 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1` 下运行。UX 用例及回归 spec 按派发约定只写未运行，15 个改动的 E2E TypeScript 文件已通过语法解析，整段 Git diff 通过空白检查。

### Modern Web Guidance

- `css-layout` — “Use the `flex` shorthand `<grow> <shrink> <basis>`”。自动化容器明确作为可伸展 flex 子项，知识库编辑和内容列使用逻辑最小尺寸控制溢出。
- `accessibility` — “Match ARIA implementations to actual behavior”。保存状态由状态区域通知，右栏关系连到实际面板，月历按网格导航行为维护焦点。
- `spatial-navigation`、`responsive-design`、`form-factor-adaptation` — 用箭头导航日期，详情栏按文档可用宽度布局。

## 阻碍与接续

- UX01–UX04 的 Electron、独立 Web、真实 IME、视觉与原单 §10 环境矩阵由 Lead 实机验收。UX 阶段未执行构建、打包、全量单测、全量 E2E、全仓 typecheck、lint 或 knip。
- 已回收本任务验证终端及 Linux 回归留下的专用 Core 进程。保留 `inv/w2` 检出供 Lead 整合；AW2/AW3 的桌面构建输出约 72 MiB、CLI 输出约 1.9 MiB，仍随检出保留。复核为 3 个 Git worktree，相关卷剩余约 141 GiB，磁盘和 inode 使用率分别为 50% 和 15%。

## Lead 验收

- Lead 2026-11-25：UX01–UX04 合入；C06 回归与 UX04 定位经 a26d6c3a 修复，main 88274720 上 28/28 通过。清单转 task03。
