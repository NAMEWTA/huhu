# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task07.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task07.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report07.md
- 业务验收报告 — [059-ux18.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/059-ux18.md)、[093-tw8.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/093-tw8.md)
- 执行结果 — done，待 Lead 验收

## 成果与运行指针

检出为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，接续基线 `d64fe62e`。两票独立提交，工作树干净，`git diff d64fe62e..HEAD --check` 通过。运行原件位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task07/`。

### UX18 · 3dd3e5adb85b66507865a72289dcf98ab27f911e

- 改动文件 — `tests/e2e/workflows/workbench-baseline.spec.ts`。
- Lead 的失败日志显示，Web 已通过两个宿主共同的初始布局和拖动后任务卡 `{ y: 5, h: 3 }` 检查。之前的缩放断言只限制笔记卡的宽度。使用真实 `DashboardGrid`、锁定的 React Grid Layout 和 Chromium 的独立组件探针复现偏差。在高度 720px 的滚动区，原 `scrollIntoViewIfNeeded()` 将手柄中心留在距底边 2px，鼠标 `clientY` 保持 718，滚动区从第一个 move 的 `scrollTop=8` 增至最后一个 move 的 85。组件实际提交笔记卡 `4 × 4`，任务卡被推至零基第 6 行。用 `scrollIntoView({ block: "center", inline: "nearest" })` 开始同一手势后，滚动位置保持 358，组件提交 `4 × 3`，任务卡保持零基第 5 行。纯布局探针验证键盘缩放在两种输入下均保留原卡行位。
- 用例在手势前居中手柄，等待预览退出后检查指针提交的完整尺寸、键盘调整前后的行位与尺寸，再检查保存、重开和取消。原日志未采集指针坐标，因果样本见 [组件探针](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1tw/task07/probe.log)。本票提交只改 Playwright 用例。
- 在共用锁及 Node 24.22.1 下执行 `pnpm exec vitest run packages/workbench/test/dashboard-layout.test.ts`，4/4。临时探针以同样方式执行 `pnpm exec vitest run packages/workbench/test/inventory-task07-probe.test.ts`，2/2，源码已随日志保留在运行目录。本票无改动的包。
- Lead 运行 `tests/e2e/workflows/workbench-baseline.spec.ts` 的「UX18 看板相邻卡片拖缩与键盘调整，保存重开和取消保留布局」，核对同一候选的 Linux Electron 与独立 Web。

### TW8 · 51d04ce6b20d9df1281c3981a0d702bbc3553dcc

- 改动文件 — `plugins/inbox/src/engine/{index,service}.ts`、`plugins/inbox/src/ui/InboxModule.tsx`、`plugins/tasks/src/engine/index.ts`、`plugins/tasks/src/ui/{TaskDetail,TaskDispatchPanel}.tsx`、`plugins/agent-guide/src/shared/guide-files.ts`、`plugins/tasks/test/persistence-http.test.ts`、`tests/e2e/workflows/{workbench-pages,github-task-connector}.spec.ts`。
- Inbox 受信转换把原 capture ID 写入新 Task 的 `origin.captureId`，沿用原保留目标 ID、转换回执和重放行为。已整理的收件详情按转换目标精确打开原任务，并在任务详情显示收件箱来源。旧任务已有的 `origin.kind` 继续可读，缺失的历史 capture ID 未补写。
- 现有 Task 运行卡以 Task ID、结果回执和渠道对象读取原投递。显示 GitHub 待核实/已接收及确切评论链接，邮件复用原 Outbox operation ID 跳转。任务来源、执行目标、真实答复署名、请求和终态继续来自 Tasks/原生回执。Inbox 的待处理视图继续从 `tasks.attention` 和 `mail.outbox.list` 读取。CLI 的 `--skill` 和生成到 Vault 的同源指南补入能力发现、回执核实和同 Engine 常驻入口。
- 在共用锁及 Node 24.22.1 下逐文件执行 `pnpm exec vitest run plugins/inbox/test/service.test.ts`（13/13）、`pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts -t 'UX06 / TW8|TW5'`（5 项通过，47 项因筛选跳过）和 `pnpm exec vitest run plugins/agent-guide/test/guide.test.ts`（10/10）。HTTP 单测覆盖同源转换重放、伪造来源的拒绝、归档与独立任务状态、原问题投影，以及 TW5 的原投递核实。三个改动包 `@huhu/plugin-inbox`、`@huhu/plugin-tasks`、`@huhu/plugin-agent-guide` 均按约定逐一持锁执行 `pnpm --filter <包名> run typecheck`，退出码 0。Tasks UI 整理后再次单独执行也通过。
- Lead 运行 `tests/e2e/workflows/workbench-pages.spec.ts` 的「UX06 / TW8 AT-A14：转换身份、待处理跳转与通知清除保留原任务和投递」。该用例走真实 Desktop/Web 页面和 Engine，问答、发件箱与待清通知用确定性夹具准备，核对精确跳转、清除通知、归档、Outbox 与原任务状态。
- Lead 运行 `tests/e2e/workflows/github-task-connector.spec.ts` 的「TW5 GitHub 评论回包丢失后核实原投递且桌面只显示一次模型结果」，包含本次新增的原评论链接断言。它使用真实受控 Codex 二进制和回环 GitHub/模型协议夹具。
- 同一候选的公共入口补证沿用 `tests/e2e/workflows/external-task-web.spec.ts` 的「D09 同包 CLI 创建与 MCP 修改的同一任务刷新到桌面和 Web」和 `tests/e2e/workflows/engine-lifecycle.spec.ts` 的「TW7 桌面附着当前常驻 Engine，退出工作台后同一端点继续服务」。上述五项 Playwright 用例均通过 `--list` 收集。

## 阻碍与接续

- 未运行项 — 实际应用 Playwright E2E、构建、打包、全仓检查、截图、远程 GitHub/邮件真实投递和线上模型。本回执的 Chromium 探针运行在工作台包内，候选应用的 Linux Electron 和独立 Web 仍由 Lead 验收。
- 无实施阻碍。若 UX18 第二次实际复验仍有行位差异，请按升级约定交由 Lead 处理，并在手势前后记录滚动容器 `scrollTop`、笔记卡的完整尺寸及任务卡行位，以现有组件探针和两次尝试为输入。

## Lead 验收
- Lead 2026-11-25：合入 main 1c36fa77；UX18（第 2 次修复）与 TW8 通过。
