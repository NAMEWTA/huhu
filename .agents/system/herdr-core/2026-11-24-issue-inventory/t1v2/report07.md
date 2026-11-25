# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1v2
- task — task07.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/task07.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1v2/report07.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{106-l11,104-aw6}.md
- 执行结果 — done

## 成果与运行指针

分支 `inv/w1`，工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，基线 `0d9bddfa`，HEAD `d2701048614af6e68de08eb14f89f5616d19be93`。工作树干净。

### L11 · 修复账本界面用例

- 提交 `8ecc6ae150448a329836f0f5c5ab7251e7bed99b`，改动 `tests/e2e/workflows/ledger.spec.ts`。
- Lead 原运行 16/17。失败 trace 和 `inviteWorkbench(desktop)` 的实际导航表明，生成邀请后桌面留在能力网关。后续的总览导航都在 Web 页面，桌面断言查找的是已移出当前页面的账本卡片。运行指针为 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task07/l11-trace-summary.log` 和 Lead 的 `e2e-ledger-ui.log`。
- 生成邀请后，桌面返回账本总览并先确认已补记 0 / 2 期。桌面总览保持挂载，独立 Web 确认补记后检查两端卡片都显示 1 / 2 期，并在桌面回读原业务日的真实流水。该提交只改 Playwright spec，已通过 TypeScript 语法解析和 `git diff --check`。

### AW6 · 公共接口、运行导航及来源收敛

- 提交 `d2701048614af6e68de08eb14f89f5616d19be93`。实际改动文件 39 个，完整列表为 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task07/aw6-files.txt`。入口包括 `packages/contracts/src/{task-dispatch,execution-receipt}.ts`、`packages/workbench/src/{task-automation-views.ts,engine-client/query.ts,state/automation-navigation.ts}`、`apps/desktop/src/renderer/workbench.tsx`、`plugins/{automations,tasks,agent-cli}/src/`、Automations manifest、架构检查和下列定向测试及 E2E。
- 派遣、运行、停止与跟进使用共享合同，持久化的执行归属留于领域 owner。Electron 与独立 Web 在同一 Workbench 入口组装 Tasks 和 Automations 各自的公开组件，复用原运行详情、停止、答复、计划排期和草稿保护。运行摘要可定位原 Task 和 Run；同一 Vault 的 Tasks 插件启停使计划、跟进和详情数据失效。
- 补齐四个现役计划能力的 manifest 声明。Tasks 来源停用时，提醒和观察按同一计划身份显示来源不可用，停用前的版本与意图保留。观察停用期间停止读取来源，来源恢复后使用原计划。管理界面继续使用现有 Dispatcher、计划 owner 和 W5d 的迁移／恢复机制。共享边界检查拦截生产源码中以相对深路径进入兄弟插件的导入，合成检查同时确认同插件导入和宿主公共入口允许。
- 权限证据覆盖同 Vault 的来源启停和只读、foreign owner 的写拒绝、已授权 CLI 和真实 HTTP MCP 的领域能力发现、固定终端目标批准及存取隔离、浏览器邀请会话、原始事件拒绝。只读测试按共享 Dispatcher 的实际合同验证，带意图键的写入在进入领域 handler 前返回 `INVALID_INPUT / 此能力需要可写的持久操作记录`，原计划修订保持一致。历史终端运行测试已同步 AW5 的真实 `terminalRunId` 关联。

定向验证均在 `/home/wta/projects/huhu/temp/dev/verify.lock` 下用 `volta run --node 24.22.1 pnpm` 串行执行。原件位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1v2/task07/`。

| 定向命令 | 结果 | 原件 |
| --- | --- | --- |
| `pnpm exec vitest run plugins/automations/test/task-scan-occurrences.test.ts` | 31/31 | `aw6-task-scan-occurrences-final.log` |
| `pnpm exec vitest run packages/workbench/test/engine-client.test.ts` | 37/37 | `aw6-engine-client.log` |
| `pnpm exec vitest run plugins/automations/test/periodic-plans.test.ts` | 1/1 | `aw6-periodic-plans-final.log` |
| `pnpm exec vitest run plugins/automations/test/service.test.ts` | 49/49 | `aw6-service-final.log` |
| `pnpm exec vitest run packages/contracts/test/execution-receipt.test.ts` | 39/39 | `aw6-execution-receipt-final.log` |
| `pnpm exec vitest run apps/engine/test/module-credential-host.test.ts` | 3 通过，3 个 Windows 用例跳过 | `aw6-module-credential-host-final.log` |
| `pnpm exec vitest run apps/engine/test/web-share.test.ts` | 4/4 | `aw6-web-share-final.log` |
| `pnpm exec vitest run apps/engine/test/engine.test.ts -t 'F18 HTTP 凭据不能订阅原始工作台事件'` | 目标用例 1/1，其余 50 个由筛选排除 | `aw6-f18.log` |
| `pnpm --filter <包名> run typecheck` 逐包 | `@huhu/contracts`、`@huhu/plugin-agent-cli`、`@huhu/plugin-tasks`、`@huhu/workbench`、`@huhu/plugin-automations`、`@huhu/desktop` 均退出 0 | `typecheck-*-final.log` |
| `node scripts/check-lint-rules.mjs` | 拦截样例与合法反例通过 | 终端输出 |

### 待 Lead 执行的 Playwright 用例

- `tests/e2e/workflows/ledger.spec.ts` 中的 `L11 总览三张卡片定位本月预算、固定收支和贷款补记并反映新流水`。
- `tests/e2e/workflows/automation-center.spec.ts` 中的 `AW6 AU16 AU17 获邀 Web 在任务来源管理原提醒，停用来源时中心显示准确状态`。
- 回归 `tests/e2e/shell.spec.ts` 中的 `自动化运行：Agent 规则经 Tasks 派遣，运行页显示已完成和结果并可定位原会话`，涉及通过公共入口挂载原运行详情。Linux 桌面批准撤销回归可使用 `tests/e2e/workflows/automation-linux-approval-revoke.spec.ts` 的 `Linux 桌面对话框在系统 sh 无法核对时仍可撤销原批准`。

## 阻碍与接续

本次实施和允许的定向检查已交付。真实 Electron／独立 Web 复验、截图、构建、打包、全仓检查和全仓 lint 未运行。AU18 已验证同一周期模型的重复读无触发副作用，以及跨 Vault 查询失效隔离。真实客户端的历史 0/1k/10k 成本对照和关页、重启组合证据仍待 AW7／组合验收。真实 Agent provider 和外部邮件／GitHub 服务未运行。业务验收记录由 Lead 回写。

## Lead 验收

- Lead 2026-11-25：L11 UI 通过；AW6 两项回归，派 task08。
