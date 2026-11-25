# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1rb
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/report03.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 `061-f07.md`、`050-ux05.md`、`071-ux06.md`、`051-ux07.md`
- 执行结果 — done，worker 提交与定向验证完成，业务验收由 Lead 执行。

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，起点 `4b9ae4ff`，最终提交 `6b802980`，工作树干净。前端按已确认的原型修订版 `9f5db0cb02b2aaf035ab4d80177bb1411ebce2291dc84b8a3e23cdc8d8ed42bb` 实施。原始测试日志、构建输出索引和单项验证脚本位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1rb/task03/`。

### Lead 追加 · UX02 / UX04 首次修复

- 独立提交 `a26d6c3a`，已在继续 F07 之前回告 Lead。
- C06 中 Engine 返回明确错误，随后复读失败使原基线需要冲突保护。DocumentSession 将这一内部保护与回执未确认分开。明确错误场景恢复「文件已被外部修改」及「保存失败」提示，仍可保留我的修改或确认重载。运输中回执丢失仍显示「保存结果待核实」。C06 原有产品断言保留。
- 日记分区原本是 `role="tab"`。UX04 用例改用这一语义定位。Playwright 的 `-g` 匹配完整标题，复验使用 `-g 'UX04：常驻月历'`，以避免前一回执中建议的起始锚点筛不到用例。
- `pnpm --filter @huhu/desktop run build` 通过。Linux Electron 44.9.1、X11/Xvfb 下，`tests/e2e/knowledge/session-flush.spec.ts -g 'C06 对账无法读取且缓冲等于原文'` 1 条通过，`tests/e2e/workflows/workbench-knowledge.spec.ts -g 'UX04：常驻月历'` 1 条通过。日志为 `ux02-c06.log` 和 `ux04-retry-ux04.log`，构建命令见 `ux-regressions.sh`。
- `pnpm exec vitest run plugins/notes/test/document-session.test.ts` 118 条通过，`@huhu/plugin-notes` 类型检查通过。

- `plugins/notes/src/ui/documents/DocumentSession.ts`
- `plugins/notes/test/document-session.test.ts`
- `tests/e2e/workflows/workbench-knowledge.spec.ts`

### 061-f07 · 按原捕获身份恢复转换

- 提交 `49aedfaf`。在调用目标前把转换标识、源版本、源内容摘要、目标类型和输入摘要写入捕获文件。任务使用预分配的稳定 ID，笔记和档案通过 OperationLog 一并写入文档、稳定笔记 ID 与目标凭据。跨客户端以原捕获和对应凭据完成回填，ACK、版本和网关回执查询权限保持各自的校验边界。
- 目标凭据缺失、源版本内容或输入变化时保留待核实状态；恢复查询只检查原目标。已处理记录归档和恢复后仍关联原目标；显式撤销处理才允许开始新意图。原始内容和目标字段正文只走业务文件，转换凭据保存标识、摘要及路径。
- 定向单测使用 `pnpm exec vitest run <单个文件>`。回归红灯为 `plugins/inbox/test/service.test.ts` 的缓存过期后目标调用从预期 1 次变为 2 次；修改后同文件 13 条通过。`plugins/notes/test/domain-exposure.engine.test.ts` 11 条，`plugins/notes/test/service.test.ts` 53 条通过。覆盖目标调用前后中断、原捕获回填失败、重开与重交、三种目标、源变动、归档恢复和 CLI/MCP 权限路径。
- `@huhu/contracts`、`@huhu/vault`、`@huhu/plugin-inbox`、`@huhu/plugin-tasks`、`@huhu/plugin-notes` 类型检查通过。
- Lead E2E，`tests/e2e/workflows/workbench-pages.spec.ts -g 'F07：丢失转换响应'`，用例「F07：丢失转换响应后重开工作台，三类转换只返回原目标」。

<details><summary>改动文件</summary>

- `packages/contracts/src/kinds/capture.ts`
- `packages/vault/src/inbox-conversion.ts`
- `packages/vault/src/index.ts`
- `plugins/inbox/src/engine/index.ts`
- `plugins/inbox/src/engine/service.ts`
- `plugins/inbox/test/service.test.ts`
- `plugins/notes/src/engine/archives/capabilities.ts`
- `plugins/notes/src/engine/archives/service.ts`
- `plugins/notes/src/engine/index.ts`
- `plugins/notes/src/engine/service.ts`
- `plugins/notes/test/domain-exposure.engine.test.ts`
- `plugins/tasks/src/engine/index.ts`
- `tests/e2e/workflows/workbench-pages.spec.ts`

</details>

### 050-ux05 · 任务窄栏表单

- 提交 `6ea1126f`。复用 U1 的容器表单，任务名称和多段正文优先排布，短宽度下项目和日期自动换行，标签可断行且兼容中文输入组合。明确区分「个人待办」与「派给 Agent」，使用同一表单状态保存 Space、Agent 和日期字段。原生表单的提交按钮位于对话框操作区，滚动正文时仍可达。
- `pnpm exec vitest run plugins/tasks/test/ui-shared.test.ts` 9 条通过，`@huhu/plugin-tasks` 类型检查通过。普通评论、显式回答和补充仍各走对应现有入口。提醒同 ID/revision 与 TW8 真实来源联验延续票据中 AW4/J03/TW8/J17 的职责。
- Lead E2E，`tests/e2e/workflows/workbench-pages.spec.ts -g 'UX05：窄窗口'`，用例「UX05：窄窗口可填写长中文、多个标签与 Agent 日期字段，保存后可重新打开」。

<details><summary>改动文件</summary>

- `plugins/tasks/src/ui/TaskEditor.tsx`
- `plugins/tasks/src/ui/i18n.ts`
- `plugins/tasks/src/ui/tasks.css`
- `tests/e2e/workflows/workbench-pages.spec.ts`

</details>

### 071-ux06 · 快速捕获与待处理投影

- 提交 `2ef2e901`。快速捕获复用 U1 的原生模态框和紧凑编辑器浮层。来源选项写入真实来源值，正文保存保留首尾与段落内容。转换回执丢失时刷新原捕获，使用「核实原转换」对账，保留一次创建语义。
- 收件箱的待处理事项读取原任务和运行、问题、Mail 投递摘要；按稳定标识跳到任务详情、原问题或原发件箱投递。摘要不复制问题、表单或投递正文，不增加 capture 数量。答复、失败核实和投递重试继续由各领域入口执行。
- `pnpm exec vitest run plugins/inbox/test/service.test.ts` 13 条，`pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts` 51 条通过。`@huhu/contracts`、`@huhu/workbench`、`@huhu/plugin-inbox`、`@huhu/plugin-tasks`、`@huhu/plugin-mail` 类型检查通过。
- Lead E2E，`tests/e2e/workflows/workbench-pages.spec.ts -g 'UX06：'`，用例「UX06：快速捕获的斜线菜单在模态框内，中文正文和来源可保存并核实原转换」和「UX06：待处理事项只投影原任务、问题和投递，处理后收件项数保持不变」。第二条以真实的任务、问题和投递记录格式在临时 Vault 准备合成记录，使用生产查询和 UI 跳转。

<details><summary>改动文件</summary>

- `packages/contracts/src/kinds/task.ts`
- `packages/workbench/src/state/open-request.ts`
- `plugins/inbox/src/engine/service.ts`
- `plugins/inbox/src/ui/InboxModule.tsx`
- `plugins/inbox/src/ui/inbox.css`
- `plugins/mail/src/ui/MailModule.tsx`
- `plugins/tasks/huhu-plugin.json`
- `plugins/tasks/src/engine/index.ts`
- `plugins/tasks/src/ui/TaskDetail.tsx`
- `plugins/tasks/src/ui/TaskDispatchPanel.tsx`
- `plugins/tasks/src/ui/TasksModule.tsx`
- `tests/e2e/workflows/workbench-pages.spec.ts`

</details>

### 051-ux07 · 邮件三栏与设置入口

- 提交 `6b802980`。同步、AI 设置、缓存、备份与恢复集中于邮件设置对话框。无账号时显示添加指引，保留主工具栏的添加动作。宽屏继续使用可调账号和联系人栏并提供阅读引导，窄屏沿账号、会话、阅读返回。复用 Huhu 的阅读、草稿和逐收件人发件箱。参照 [one-mail 固定版本的工作区入口](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/features/mailbox/mailbox-workspace/mailbox-workspace-view.tsx) 的设置、空态和分栏位置。
- 定向单测 `pnpm exec vitest run <单个文件>`。`plugins/mail/test/pane-save.test.tsx` 4 条，`conversations-engine.test.ts` 1 条，`outbox-engine.test.ts` 20 条通过，`@huhu/plugin-mail` 类型检查通过。首次分栏单测用空账号夹具而找不到分隔线，后续用实际可分栏的账号夹具复跑。
- Lead E2E，`tests/e2e/workflows/workbench-pages.spec.ts -g 'UX07：邮件设置'`，用例「UX07：邮件设置按需打开，三栏到窄窗继续阅读、回复草稿与逐收件人结果」。更新 `tests/e2e/workflows/mail.spec.ts` 的「工作台重开后续跑同地址 Mail 原批次并保留未完成邮箱的已读标记」以新设置入口打开备份功能。

<details><summary>改动文件</summary>

- `plugins/mail/src/ui/MailModule.tsx`
- `plugins/mail/src/ui/mail.css`
- `plugins/mail/test/pane-save.test.tsx`
- `tests/e2e/workflows/mail.spec.ts`
- `tests/e2e/workflows/workbench-pages.spec.ts`

</details>

定向检查统一使用 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1`，每次一个测试文件或一个包。3 个改动的 E2E TypeScript 文件通过语法解析，整个提交区间通过 `git diff --check`。

### Modern Web Guidance

- `css-layout` — “Use logical properties … for layout dimensions and spacing”。任务输入、标签和邮件设置按内联方向约束尺寸。
- `forms` — “use semantic tags like `<button type="submit">`”。任务保存按钮显式关联原生表单，保留键盘提交并让表单内容可独立滚动。
- `dialog` — “focus return to the invoker”。邮件设置复用原生 Dialog 的 Esc 和焦点归还，快速捕获沿用同一对话框中的编辑器浮层宿主。
- `accessibility` — “Match ARIA implementations to actual behavior”。日记按真实 tab 语义定位，待处理入口将焦点带到对应原运行或问题。

## 阻碍与接续

- F07/UX05–UX07 的工作台 E2E 按派发约定只写未运行。真实 Electron、独立 Web、系统输入法、实际邮箱和原单环境矩阵由 Lead 验收。本批仅为 Lead 明确授权的 UX02/UX04 回归执行桌面构建与两条 E2E。未执行全量单测、全量 E2E、全仓类型检查、全仓 lint、打包或视觉截图。
- 目标创建前业务转换若已经记录、同时缺少能够证明结果的目标凭据，保守保留待核实。升级前已经中断且没有业务绑定的旧转换无法从新的凭据路径证明原目标。
- 验证终端均已回收，未发现本任务残留 Electron、Playwright 或 Vitest。保留本 worker 的 `inv/w2` 检出供 Lead 整合，桌面构建输出约 72 MiB，CLI 输出约 1.9 MiB。复核总共 3 个 Git worktree，相关卷可用约 141 GiB，磁盘与 inode 使用率分别约 50% 和 15%。

## Lead 验收
- Lead 2026-11-25：合入 main 1b7bcb6d。E2E：F07、UX07、mail 回归通过；UX05、UX06 待处理投影失败，返工派 t1td task02。会话上下文 94% 已回收。
