# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1s2
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1s2/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1s2/report02.md
- 业务验收报告 — [AW5](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/078-aw5.md)、[L5](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/084-l5.md)、[L7](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/085-l7.md)
- 执行结果 — done，三个提交与定向证据交 Lead 验收。下列未覆盖项仍待补验或接续。

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，起点 `1d0d2f215d1c1cefb5c5448d6d228f0e9fcd42cb`。沿用已经生成的供应商类型。验证为 Linux x86_64、Node 24.22.1、pnpm 12.10.1。每条命令在预检后独占 `/home/wta/projects/huhu/temp/dev/verify.lock`。 [运行日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task02)

### AW5 · `abd2c818b5e3845cb541f190e98ac44272ed0d72`

- 改动 `plugins/automations/huhu-plugin.json`、`src/engine/{follow-ups,index,periodic-occurrences,periodic-plans,plans,service}.ts`、`src/shared/occurrence-history.ts`、`src/ui/{AutomationsModule,OccurrenceDetail,OccurrenceHistory,PlanDirectory,RunsPanel}.tsx`、`test/plan-directory.test.ts`，以上相对 `plugins/automations/`。另改动 `plugins/tasks/huhu-plugin.json`、`plugins/tasks/src/engine/{dispatch-store,dispatch,github-sources,index,result-delivery}.ts`、`plugins/tasks/test/persistence-http.test.ts` 和 `tests/e2e/workflows/automation-center.spec.ts`。
- 新的 `automations.plans.history` 从既有 Cron、跟进和周期记录投影发生摘要。按计划、来源、状态、日期及稳定时间/ID 游标查询，旧目标保留历史。激活记录入口、计划菜单及最近发生共用详情。选中发生后读取子派遣、效果和原申请身份，按需加载任务、问题、脱敏终端输出与 GitHub/Mail 出站状态。复用 Tasks 答复、停止及按原会话代次定位。读取失败可以重读，未知核实也走同一查询。只对工作台开放新增历史与 Mail 关联查询。
- 持锁 `pnpm exec vitest run plugins/automations/test/plan-directory.test.ts` 3 通过，验证来源、待处理和稳定游标；`pnpm exec vitest run plugins/automations/test/periodic-plans.test.ts` 1 通过。持锁 `pnpm exec vitest run plugins/tasks/test/persistence-http.test.ts -t 'TW5 GitHub|TW5 邮件结果'` 4 通过，覆盖认领结果、原投递、冷恢复和受邀 Web 主体读原 Outbox 关联。 `pnpm --filter @huhu/plugin-automations run typecheck` 和 `pnpm --filter @huhu/plugin-tasks run typecheck` 均通过。 [游标](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task02/aw5-page.log) · [渠道](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task02/aw5-channels.log)
- Lead 可运行 `tests/e2e/workflows/automation-center.spec.ts` 的 **AW5：筛选原发生和逐项效果，重新读取不会再次发送通知**，并复跑该文件的 **AW3：暂停规则的手动请求断线后从原意图核实**。E2E 未运行。
- 待接续项包括通知反向深链、通用单效果重试、跨发生汇总子运行的待处理状态，以及独立终端的精确 Core 代次跳转。本批使用原有下游操作，待处理筛选作用在发生态。分页返回摘要并在用户选中时读取输出，历史源端仍汇整已有记录，规模、字节量和多客户端成本留 W6；独立 Web、真实 provider 和外部渠道未运行。

### L5 · `a2dd51e1c648140fba56287274e8a2785e24c473`

- 改动 `plugins/ledger/huhu-plugin.json`、`plugins/ledger/src/engine/{index,records,reports,store}.ts`、`plugins/ledger/src/shared/{entries,reports}.ts`、`plugins/ledger/src/ui/{index,Records,Reports}.tsx`、`plugins/ledger/test/reports-engine.test.ts` 和 `tests/e2e/workflows/ledger.spec.ts`。
- 总览可保存卡片可见性与顺序。日历和报表复用原流水筛选，对同一业务日、币种和平账口径提供明细。报告按整数最小单位分币种计算，期末与月末余额直接使用账户余额口径。日历导入本地年份 JSON，在缺年数据时明确显示未配置。储蓄评分采用固定 HomiBook 提交 `5d3d7171` 的分段规则，以有收入的选定期间计算。
- 持锁 `pnpm exec vitest run plugins/ledger/test/reports-engine.test.ts` 2 通过，覆盖午夜、币种、下钻与账户余额一致、空评分、节假日和卡片冷恢复。持锁 `pnpm --filter @huhu/plugin-ledger run typecheck` 通过。 [报表日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task02/l5-report.log)
- Lead 可运行 `tests/e2e/workflows/ledger.spec.ts` 的 **L5 同一业务午夜在日历和报表可下钻，离线节假日与卡片可以调整**。未运行 Desktop/Web E2E。工作树依赖锁没有 ECharts，派发禁止安装新依赖，当前使用可访问数据表和原生比例条，折线/雷达图及其他健康维度尚未迁入。月预算、固定收支、贷款完整总览和真平账交叉验证仍归 L11。

### L7 · `76f1c6a87499840fa760f820754f3a9e803d77eb`

- 改动 `packages/contracts/src/automation-plan.ts`、`packages/workbench/src/engine-client/query.ts`、`plugins/automations/src/engine/{index,periodic-plans}.ts`、`plugins/automations/src/ui/{PlanDirectory.tsx,plan-presentation.ts}`、`plugins/ledger/huhu-plugin.json`、`plugins/ledger/src/engine/{index,records,recurring,store}.ts`、`plugins/ledger/src/shared/recurring.ts`、`plugins/ledger/src/ui/{index,Recurring}.tsx`、`plugins/ledger/test/{fixture,recurring-engine.test}.ts` 和 `tests/e2e/workflows/ledger.spec.ts`。
- 原统一计划版本持久记录启停窗口。账本按业务时区日初及稳定规则/期次键消费同一拥有者的发生，不设第二计时器。支持每日、每周和按原日月末收敛，补齐已启用窗口中的到期日期。流水、关联和期次在同一账本版本发布。失败可按原期次重试，删除生成流水后仍保留已处理事实。账本页和中心共用计划 ID、启停、业务时区及下一期。创建默认暂停。
- 持锁 `pnpm exec vitest run plugins/ledger/test/recurring-engine.test.ts` 1 通过，包含离线两期、同一发生提交中断后恢复、跳过停用窗口、插件停用、归档账户修复、重复重试和删除生成流水。持锁 `pnpm exec vitest run plugins/automations/test/periodic-plans.test.ts` 1 通过。持锁 `pnpm --filter <包> run typecheck` 检查 `@huhu/contracts`、`@huhu/plugin-automations`、`@huhu/plugin-ledger` 和 `@huhu/workbench` 均通过。 [期次日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task02/l7-recurring-final.log) · [旧周期回归](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1s2/task02/l7-automations-regression.log)
- Lead 可运行 `tests/e2e/workflows/ledger.spec.ts` 的 **L7 账本启用和中心暂停操作同一个固定收支计划，预览未来期次无记账副作用**。未运行 E2E。中心可管理同一日历型计划的启停和删除，规则金额、周期和起始日以创建时的账本规则为准，当前没有中心改期编辑入口。备份恢复与目标重绑待 L9/L11，贷款留 L8。

## 阻碍与接续

分支可整合。统一发生中缺失的单效果重试与独立终端的公开代次引用，以及依赖锁外的图表库，待对应 owner 接入。Linux 定向验证已记录，Playwright、截图、构建、打包与全仓检查未运行。Windows 和 macOS 按用户决定不验证。

## Lead 验收

- Lead 2026-11-25：三笔合入 main 0a0eb29c；E2E 12/12 通过。AW5 部分通过（缺口转 AW6/AW7），L5、L7 通过。清单 done；会话上下文 94% 已回收，由 t1t7 接手 L6/L8/AW4。
