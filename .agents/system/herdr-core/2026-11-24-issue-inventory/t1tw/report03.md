# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task03.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report03.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/055-ux12.md、067-ux14.md，由 Lead 更新
- 执行结果 — done

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`。执行前 `git merge --ff-only main` 确认已在当时的 `4d83f40a0028320e94c1beb8b894bc7a3adb5101`。两张票各自提交，最终 HEAD 为 `ff857edb6e08aff8265925bc4e8f44c67608a973`。工作树干净，两份 spec 的 TypeScript 转译语法检查和 `git diff 4d83f40a..HEAD --check` 通过。单测和包级类型检查使用共享锁 `/home/wta/projects/huhu/temp/dev/verify.lock` 和 Node 24.22.1。

原始双宿主失败见 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ux11-12-14.log`。本轮单元探针的源文件和日志已保存到 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task03/`。

### UX12 · 窄表单的列数断言

- 提交 — `ecb026712c505457e2144910ce1eee293dda16a3`。
- 根因 — 两处 460px 尺寸设置早于 UX12，且共享 660px 断点在先前通过的版本与失败版本间一致。Chromium 探针载入 Lead 构建产物的共享 CSS，测得窄 Task 容器和规则容器都为 410px，主区与附栏均已逐行排列。Task 的 `div` 轨道序列化为 `410px`，规则的 `fieldset` 序列化为 `minmax(0px, 1fr)`。按空格切分使规则的一条轨道被数成两条。探针同时确认 710px 的 Task 容器显示两列。
- 改动文件 — `tests/e2e/workflows/workbench-baseline.spec.ts`。沿用 460px 窄样本，检查实际表单宽度、主区和附栏是否可见且同列上下排列。
- 本地验证 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/ui/test/inventory-ux12-ux14-probe.test.ts`，1/1 通过。证据为 `browser-unit-probe.log`。探针只加载 CSS 和最小表单 DOM，未启动 Huhu。
- Lead E2E — `tests/e2e/workflows/workbench-baseline.spec.ts` 中「U1 Inbox、Task 和 Automation 在真实对话框中共享浮层与表单行为」。该用例一次覆盖 Linux Electron 和独立 Web，请复验两处窄表单几何及其后的真实控件操作。

### UX14 · 关闭工具预览归还焦点

- 提交 — `ff857edb6e08aff8265925bc4e8f44c67608a973`。
- 根因 — 预览请求 pending 时，`busy` 暂时禁用触发开关或所属批量操作区。Chromium 会把焦点从禁用控件移到 `body`，而原生对话框在请求完成后才调用 `showModal()`，所以原有焦点捕获时已失去触发控件。最小 Chromium 探针重现了关闭后焦点停在 `body`。
- 改动文件 — `packages/workbench/src/gateway/ToolPolicyCatalog.tsx`、`packages/ui/src/components/controls.tsx`、`packages/ui/src/components/Dialog.tsx`、`tests/e2e/workflows/acceptance.spec.ts`。逐项及批量操作在开始请求前保存触发按钮，刷新预览沿用同一引用。共用原生 Dialog 关闭时可显式归还焦点，并避开已取得焦点的其他控件或对话框。扩展原用例检查批量预览按 Escape 后回到「开启所选」且原策略修订仍为 0，然后继续既有冲突、刷新和保存步骤。
- 本地验证 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/inventory-ux14-focus-probe.test.tsx`，1/1 通过。使用真实 Gateway 组件和延迟预览回执，按 Chromium 探针观察模拟禁用后的失焦，检验两条入口取消后正确归还焦点且只发出预览请求。证据为 `gateway-unit-probe.log`，jsdom 桩代替原生模态行为，日志含 TanStack 表格的 React `act` 提示。
- 授权回归 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/kernel-exposure.test.ts`，98/98 通过。
- 包级验证 — 持同一锁运行 `volta run --node 24.22.1 pnpm --filter @huhu/ui run typecheck` 与 `volta run --node 24.22.1 pnpm --filter @huhu/workbench run typecheck`，均为 0 错误。检出沿用既有 vendor 声明。
- Lead E2E — `tests/e2e/workflows/acceptance.spec.ts` 中「能力网关：逐项和批量选择先预览，旧版本保留草稿并在刷新后整批保存」。请复验逐项与批量预览关闭后的焦点和策略修订，以及后续冲突恢复与保存。

## 阻碍与接续

无。两张票的应用 E2E 由 Lead 运行。worker 未运行 E2E、构建、打包、全仓类型检查、全仓 lint、knip 或应用截图取证。已回收本轮创建的验证终端。

## Lead 验收
- Lead 2026-11-25：合入 main adb29540，4/4 通过，UX12、UX14 验收通过。
