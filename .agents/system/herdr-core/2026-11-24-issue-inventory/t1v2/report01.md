# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1v2
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report01.md
- 业务验收报告 — [L8](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/092-l8.md)、[L9](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/101-l9.md)、[AW4](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/098-aw4.md)
- 执行结果 — done，交回 Lead 验收。

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `95499ebaf1449184232d8a7a7c9738e0701e8648`，交回 `d48bc0fa4fcf6a4b7abf563084c801e0bbf273f4`。三个提交均通过差异和暂存证据结构检查，工作树干净，验证终端已回收，本检出没有残留验证进程。

定向检查逐条独占 `/home/wta/projects/huhu/temp/dev/verify.lock`，锁内检查可用内存、父 cgroup、磁盘和 inode 后执行所列命令。类型检查复用本检出已有的供应商类型声明。失败证据来自 Lead 在基线上的 E2E 日志及当时的 Playwright 错误快照。 [Lead 失败日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-l6-l8-aw4-l9.log) · [本次验证日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01)

### L8 · `69de1bd20400e5e50dcc00945781fdc4b9660b88`

- 改动 `plugins/ledger/src/ui/Loans.tsx` 和 `tests/e2e/workflows/ledger.spec.ts`。
- 失败快照中的弹窗显示「此能力未启用通用持久意图，请使用业务入口的操作标识」。贷款对话框经 `useLedgerAction` 发送了 `intentKey`，但 `ledger.loans.confirmHistory` 声明 `idempotency: "handler"`。Dispatcher 在进入贷款写入前拒绝了请求。
- 通过现有账本写入入口提交原预览与所选期次。工作台客户端生成写入所需的普通 `idempotencyKey`，账本沿原贷款和期次识别已提交的流水。E2E 按贷款名称定位，核对选中与未选中的期次状态、原业务日及桌面查询读到的流水 ID。
- `volta run --node 24.22.1 pnpm exec vitest run plugins/ledger/test/loans.test.ts`，2 通过。 `volta run --node 24.22.1 pnpm exec vitest run plugins/ledger/test/loan-generation-engine.test.ts`，1 通过，覆盖并发、重启、移除流水后重试及原期次回执。 `volta run --node 24.22.1 pnpm --filter @huhu/plugin-ledger run typecheck`，0 错误。 [计算](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/l8-loans.log) · [补记](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/l8-generation.log) · [类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/l8-typecheck.log)
- 待 Lead 复验 `tests/e2e/workflows/ledger.spec.ts` 中的 **L8 独立 Web 预览和确认所选贷款期次并打开原流水**。

### L9 · `cf7836f0da5e6df756b3913af980c7a684fa88e3`

- 改动 `plugins/ledger/src/ui/Backups.tsx` 和 `tests/e2e/workflows/ledger.spec.ts`。
- 恢复弹窗的失败快照显示同一持久意图拒绝。恢复表单也发送了 `intentKey`，而 `ledger.backups.confirm` 由自己的处理器按 `previewId`、恢复主体及输入指纹提交并查询同一回执。请求在进入恢复事务前被拦截。
- 通过现有账本写入入口提交原恢复预览及模块选择，复用处理器已有的回执核对。E2E 继续用产品导出的 ZIP，按名称找到恢复账本，再核对选中账本的 ID、重映射的流水 ID 和原账本的流水金额及 ID。
- `volta run --node 24.22.1 pnpm exec vitest run plugins/ledger/test/backup-engine.test.ts`，2 通过，覆盖恢复事务中断、原预览核对及冷重启重试。 `volta run --node 24.22.1 pnpm exec vitest run plugins/ledger/test/homibook-migration.test.ts`，2 通过。 `volta run --node 24.22.1 pnpm --filter @huhu/plugin-ledger run typecheck`，0 错误。 [备份](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/l9-backup-engine.log) · [迁入](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/l9-homibook-migration.log) · [类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/l9-typecheck.log)
- 待 Lead 复验 `tests/e2e/workflows/ledger.spec.ts` 中的 **L9 独立 Web 导出账本包并预览恢复到新账本**。

### AW4 · `d48bc0fa4fcf6a4b7abf563084c801e0bbf273f4`

- 改动 `tests/e2e/workflows/acceptance.spec.ts`。
- `git diff 50047f8a^ 50047f8a -- packages/workbench/src/home packages/kernel/src/capabilities/home-dashboard.ts` 显示 AW4 的 Home 改动限于导航和专注卡片，保存函数、草稿状态和落盘路径沿用原实现。`Dashboard` 在保存期间仍渲染草稿中的 Git 与 SSH 卡片，旧用例在卡片可见时立即同步读取文件，产生 ENOENT。
- 用例等待看板提示「布局已保存。」后读取 `.huhu/home/widgets.json`。该提示由成功写入回执触发。随后继续核对 SSH 停用和恢复过程中已保存的文件内容。
- `volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/dashboard-save.test.ts`，1 通过，覆盖受理前断开、提交后断开、原键回放和已存布局。提交仅涉及根目录 E2E spec，根包没有可单独运行的包级类型检查。 [看板保存](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task01/aw4-dashboard-save.log)
- 待 Lead 复验 `tests/e2e/workflows/acceptance.spec.ts` 中的 **首页看板通过可信目录添加 Git 和 SSH 卡片，停用后保留 SSH 实例**。

## 阻碍与接续

无实施阻碍。三条 E2E 均待 Lead 在 Linux Electron 与独立 Web 的实际入口复跑。实机 HomiBook、外部服务、Windows/macOS、视觉取证、构建、打包、全仓类型检查、全仓 lint 及 knip 未运行。

## Lead 验收
- Lead 2026-11-25：合入 main e25b0464，22/22 通过，L8、L9 通过，AW4 首页用例修复通过。
