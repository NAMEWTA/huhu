# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1td
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1td/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1td/report02.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/` 下的 `050-ux05.md` 与 `071-ux06.md`
- 执行结果 — done（实施交回，待 Lead E2E 验收）

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2` 已先快进到 `main` 的 `6f0a8c89`，交回版本为 `74b2808d58ccc9f39c9970ce29b879a995697d26`，工作树干净。两票独立提交，均附 `Refs: #14`。改动落在回归用例与夹具。

### UX05 · c0431d98550d82a4b7120648346fca3c280ad9c8

- 改动文件 — `tests/e2e/workflows/workbench-pages.spec.ts`。
- 判断依据 — 确认原型的 `taskEditor` 在窄栏将字段改为单列，保存后把原任务设为选中。原型的概览卡片在窄窗口纵向排列。实际应用的 `TasksModule` 同样在保存后选择该任务，`tasks.css` 明确在 780px 以下用可关闭的抽屉呈现详情。Lead 在 460×640 的日志直接观察到该抽屉拦截列表行指针事件。
- 修复 — 用例先验证保存后已打开原详情，再点击可见的「关闭任务详情」，确认抽屉移除后从列表重开并核对编辑内容。
- 定向单测 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/tasks/test/ui-shared.test.ts`，9 项通过。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-tasks run typecheck`，0 错误。
- Lead E2E — `tests/e2e/workflows/workbench-pages.spec.ts -g 'UX05：窄窗口'`，用例「UX05：窄窗口可填写长中文、多个标签与 Agent 日期字段，保存后可重新打开」。

### UX06 · 74b2808d58ccc9f39c9970ce29b879a995697d26

- 改动文件 — `tests/e2e/workflows/workbench-pages.spec.ts`、`plugins/tasks/test/attention-fixture.ts`、`plugins/tasks/test/persistence-http.test.ts`。
- 根因 — 旧夹具的 `run-attention-fixture` 不符合 `isId(runId, "run")`，并把快照指纹同时写进了 `requestHash`。生产读取器要求 `requestHash = fingerprint({ input, source })`，另行核对 `snapshotHash`。派遣因此被任务索引排除，`tasks.questions.list` 查不到原执行绑定。
- 修复 — 用 `newId("run")`、真实任务的 Space 和输入分别生成执行身份、请求及快照指纹。派遣通过 `DispatchStore.create` 保存，问题通过 `TaskReceiptInbox.consume` 写入生产目录并验证接收身份。E2E 在 UI 操作前用真实接口确认 run ID 和 question ID，在完成普通任务前断言「等待回答」可见，完成后继续走原问题焦点及两种邮件投递跳转。
- 刷新核对 — 任务完成发布 `task.statusChanged`，工作台查询失效规则覆盖 `tasks.*`。定向 HTTP 测试确认 `tasks.attention` 完成后仅移除源任务，保留同一个 `taskId/runId/questionId` 的待回答条目。
- 定向回归 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts -t "UX06 待回答问题"`。修复前 `tasks.questions.list` 返回 `{ ok: true, data: [] }`，1 项在目标断言失败。修复后 1 项通过，同文件其余 51 项由测试名过滤。原件在 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1td/task02/ux06-before.log` 与同目录 `ux06-after.log`。
- 包类型检查 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-tasks run typecheck`，0 错误。
- Lead E2E — `tests/e2e/workflows/workbench-pages.spec.ts -g 'UX06：待处理事项'`，用例「UX06：待处理事项只投影原任务、问题和投递，处理后收件项数保持不变」。

### 未运行的验证

Linux Electron、独立 Web 的 Playwright 与视觉取证待 Lead 验收。真实 provider、外部服务、构建、打包和全仓检查未运行。HTTP 定向测试使用隔离 Vault 和合成问题回执。

## 阻碍与接续

实施无阻碍。Lead 可在同一候选复验上述两条用例。已移除本次检查终端。

## Lead 验收
- Lead 2026-11-25：合入 main e715abdb，workbench-pages 5/5 通过，UX05、UX06 验收通过。
