# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1t7
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1t7/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1t7/report01.md
- 业务验收报告 — [L6](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/091-l6.md)、[L8](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/092-l8.md)、[AW4](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/098-aw4.md)
- 执行结果 — done。按顺序交回三个独立提交。最终验收范围和未完成项见下文。

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，起点 `0a0eb29c6ab0f430aa229816b5469d6e8e8e95fc`，交回 `50047f8ab99f77eee9ab891fcd77e3f468704558`。工作树干净，提交范围通过 `git diff --check`。沿用本检出已经生成的供应商类型。Linux x86_64、Node 24.22.1、pnpm 12.10.1。每次验证独占 `/home/wta/projects/huhu/temp/dev/verify.lock`，锁内复核内存、cgroup、磁盘和 inode。验证输出在 Lead 可读的[运行目录](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01)。

### L6 · `ef007b7172827cf386a2da9a53c5930f4a09e631`

- 改动 `plugins/ledger/huhu-plugin.json`、`src/engine/{budgets,index,store}.ts`、`src/shared/budgets.ts`、`test/budgets-engine.test.ts`，以上相对 `plugins/ledger/`。新增 `tests/e2e/workflows/ledger.spec.ts` 中的 L6 用例。
- 新增预算列表、分页明细、批量保存、删除及固定预算跨月复制能力。复用报表的业务日期、币种和平账过滤，进度和明细共用 ID 匹配。自由预算命中任一标签时每笔计一次，汇总按固定/自由、方向和币种分组。更新使用账本修订，复制保留目标同类同名项并返回跳过明细。冷重启后重复复制仍不增副本。
- 持锁 `pnpm exec vitest run plugins/ledger/test/budgets-engine.test.ts` 两个用例通过，覆盖业务午夜、标签多命中、已有流水的分类名称转给新 ID、进度与分页明细一致、年内汇总及复制冲突。持锁 `pnpm --filter @huhu/plugin-ledger run typecheck` 通过。 [预算单测](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/l6-budgets.log) · [类型检查](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/l6-typecheck.log)
- Lead E2E 用例 `tests/e2e/workflows/ledger.spec.ts` — **L6 预算进度和明细同源，复制冲突在独立 Web 中可核对**。用例从桌面建账和写预算，独立 Web 经同一账本能力读结果。
- 待接续的预算页、明细和批量对话框需要纳入 L0b 原型确认。现有账本确认场景表和导航未包含预算页。真实平账确认、撤销与预算联测依票据归 L11。

### L8 · `aa57a186e6e23e387adf828b79d215345822d010`

- 改动 `plugins/ledger/huhu-plugin.json`、`src/domain/loans.ts`、`src/engine/{index,loans,records,recurring,store}.ts`、`src/shared/{loans,monthly-date}.ts`、`src/ui/{index,Loans,Records}.tsx`、`test/{loans,loan-generation-engine}.test.ts`，以上相对 `plugins/ledger/`。新增 `tests/e2e/workflows/ledger.spec.ts` 中的 L8 用例。
- 迁移 HomiBook `5d3d7171` 的等额本金和等额本息公式，复用 L7 的原业务日锚点与 L2 账本提交。每期金额按整数最小单位舍入，末期结清。历史补记只提交明确确认的有款到期期次，流水和期次回执同版本写入。并发、冷重启和流水移除后重试均认原期次。已确认的固定收支与贷款页面可选择同币种账户、预览、确认和打开关联流水。
- Issue 指定的 `decimal.js@10.6.0` 在锁中是传递依赖，账本没有直接依赖。按本派发的锁文件约束，以有界 BigInt 整数比值精确计算月利率与幂，采用相同公式和舍入点。未安装依赖。年利率以百分数字符串传入，最多八位小数，期限沿上游 1 至 360 期。创建和移除目前由账本能力提供，新建与删除表单待确认交互。
- 持锁 `pnpm exec vitest run plugins/ledger/test/loans.test.ts` 2 通过，覆盖零/正利率、零舍入付款、单期/多期、闰年锚定、超出 JS 安全整数及本金余额不变量。持锁 `pnpm exec vitest run plugins/ledger/test/loan-generation-engine.test.ts` 1 通过，覆盖未确认无写入、拒绝未到期、并发、冷重启、移除流水、删除规则保留已入账流水。另跑 `pnpm exec vitest run plugins/ledger/test/recurring-engine.test.ts` 1 通过。持锁 `pnpm --filter @huhu/plugin-ledger run typecheck` 通过。 [公式](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/l8-loans.log) · [补记](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/l8-generation.log) · [固定收支回归](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/l8-recurring.log) · [类型检查](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/l8-typecheck.log)
- Lead E2E 用例 `tests/e2e/workflows/ledger.spec.ts` — **L8 独立 Web 预览和确认所选贷款期次并打开原流水**。

### AW4 · `50047f8ab99f77eee9ab891fcd77e3f468704558`

- 改动 `packages/workbench/src/{AutomationPlanLink.tsx,contributions.ts,index.ts,state/automation-navigation.ts,home/FocusCard.tsx,home/HomeModule.tsx,settings/SettingsModule.tsx}`，以及 `plugins/automations/{huhu-plugin.json,src/engine/index.ts,src/engine/plans.ts,src/shared/home-widget.ts,src/shared/plan-directory.ts,src/ui/AutomationHomeWidget.tsx,src/ui/PlanDirectory.tsx,test/plan-directory.test.ts}`。
- 来源接线改动 `plugins/agent-cli/src/ui/AgentCliModule.tsx`、`plugins/ledger/src/ui/{index,Recurring}.tsx`、`plugins/mail/src/ui/{MailModule,MailSyncSettings}.tsx`、`plugins/ssh/src/ui/{SshModule,MonitorDashboard}.tsx`、`plugins/tasks/src/ui/{TaskDetail,TaskFollowUp,TaskReminderPlans,TasksModule}.tsx`、`plugins/versioning/src/ui/sync/SyncSettingsPage.tsx`。联合用例写入 `tests/e2e/workflows/{acceptance,automation-center,ledger}.spec.ts`。
- 工作台复用按 Vault 绑定的计划深链。中心可打开原 Task、Agent 会话、邮件同步设置、Git 同步设置、桌面 SSH 监控面板、专注卡片及原账本规则。来源页按原 ID 回中心。任务区展示同一目录内的提醒和观察，账本来源可在原修订上启停或确认删除。使用现有计划端口和领域能力。
- Home 摘要读取同一个计划投影的启用、受阻及下次安排。读取直接投影当前已存在的计划，跳过目录查询的迁移触发及 Cron 全量历史。最早计划可按原 ID 打开。账本跳转按计划来源切到正确账本并聚焦规则标题，用户原有账本选择通过正常选择器控制。
- 持锁 `pnpm exec vitest run plugins/automations/test/plan-directory.test.ts` 4 通过，新增摘要投影场景。持锁 `pnpm exec vitest run plugins/automations/test/periodic-plans.test.ts` 1 通过，覆盖调度归属、旧执行中断及删除后冷重启不复活。逐包持锁 `pnpm --filter <pkg> run typecheck`，`@huhu/workbench`、`@huhu/plugin-agent-cli`、`@huhu/plugin-automations`、`@huhu/plugin-ledger`、`@huhu/plugin-mail`、`@huhu/plugin-ssh`、`@huhu/plugin-tasks`、`@huhu/plugin-versioning` 均 0 错误。 [目录](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/aw4-plan-directory.log) · [周期计划](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01/aw4-periodic-plans.log) · [各包类型日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task01)
- Lead E2E 用例 `tests/e2e/workflows/ledger.spec.ts` — **AW4 AU01 AU15 AU16 账本与中心双向定位同一计划且删除后插件重开不复活**。 `tests/e2e/workflows/automation-center.spec.ts` — **AW4 AU16 专注来源与中心共享计划修订和下次时间**。 `tests/e2e/workflows/acceptance.spec.ts` — **首页看板：概览读取失败由卡片重试，近期笔记、专注和规则摘要仍可用**。
- 当前共同端口缺少全局自动运行暂停，固定收支的日/周/月日期规则也未开放公共改期写入。两项需对应调度和领域 owner 补足。AU01 全来源组合、AU15 运行期精准停止和凭据恢复分支，以及 AU16 的真实 Mail/Git/SSH/Agent 旅程待联验。SSH 来源跳转使用已有桌面监控面，独立 Web 可在中心读可见计划并按权限管理。

## 阻碍与接续

- 三笔提交可交 Lead 整合。main 在此分支开发期间推进，整合需复核 `TaskDetail.tsx`、`TasksModule.tsx` 的相邻改动。
- 未运行 Playwright E2E、视觉截图、真实 provider 和外部服务联测、构建、打包、全仓 typecheck/lint 或 knip。Windows/macOS 按用户既定范围未验证。
- Web 指南在客户端实现前执行了 search 和 retrieve。使用既有原生对话框、数据表和带标签字段。删除对话框把初始焦点交给取消按钮，跨模块定位给目标标题独立焦点，贷款确认按 `fieldset` 和 `legend` 组织。

## Lead 验收
- Lead 2026-11-25：合入 main 时 MailModule.tsx、TaskDetail.tsx 冲突，已中止；由本终端 task02 先合并 main 再交回，E2E 待合并后运行。
