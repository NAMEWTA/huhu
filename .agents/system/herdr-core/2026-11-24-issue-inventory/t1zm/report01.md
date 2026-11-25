# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1zm
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zm/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zm/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{078-aw5,098-aw4,104-aw6}.md
- 执行结果 — done，待 Lead 验收

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`。基线 `10b8c46c`，最终提交 `2b5a8c73`，6 个独立提交。工作区干净，`git diff --check 10b8c46c HEAD` 通过。下面的 `git show --stat <提交>` 给出每项完整文件清单。

### 078-aw5 · 发生、效果、待处理与成本

- AU03 · `85a27a4d`。通知 DTO 和事件保留原 `planId/occurrenceId`。通知中心、工作台提示与 Electron 原生通知共用 Vault 绑定的导航。详情校验原计划及发生的对应关系，识别过期、删除与不匹配，原计划提供现有来源页入口。主要文件包括 `packages/kernel/src/notifications.ts`、`packages/workbench/src/state/automation-navigation.ts`、`apps/desktop/src/main/index.ts`、`apps/desktop/src/renderer/workbench.tsx`、`plugins/automations/src/ui/OccurrenceDetail.tsx`。定向测试覆盖重启后原通知身份。
- AU13 单效果恢复 · `4e339c58`。公共入口 `automations.plans.recoverEffect` 校验工作台权限、本机所有权以及计划、发生、效果三重身份。提醒的建任务与任务评论可按原 ID 重试，未知通知按原 ID 查回执。通知记录缺失时结果保持待核实。定向测试覆盖并发重试同一建任务效果、保留原通知和未知通知核实。主要文件包括 `plugins/automations/src/engine/reminder-deliveries.ts`、`plugins/automations/src/engine/plans.ts`、`plugins/automations/src/ui/OccurrenceDetail.tsx`。
- AU13 跨发生待处理 · `56e6a9ac`。任务域按原 dispatchId 或 runId 提供待处理投影。目录和历史可找到较早发生中的待答、失败、未知或受阻子运行，发生态仍反映原受理事实。Engine 共享激活与历史读取，任务运行事件使聚合失效。定向测试覆盖较早发生受阻、较新发生无候选的组合。主要文件包括 `plugins/tasks/src/engine/dispatch.ts`、`plugins/automations/src/engine/plans.ts`、`plugins/automations/src/shared/occurrence-history.ts`、`packages/workbench/src/engine-client/query.ts`。
- AU18 样本 · `2b5a8c73`。新增 `apps/engine/test/automation-cost.test.ts`。套件使用真实 Linux Herdr Core 中的单个活动会话、一个固定观察计划、Engine 的 HTTP/WS，以及受控的观察时钟。对 0、1,000、10,000 条预置历史分别测量 1 个、3 个和 0 个订阅者。1 个与 3 个订阅者均为每轮 1 次 `terminal.list`、1 次通知创建及 1 次激活历史读取。关闭订阅后仍有 1 次查询及 1 次通知，历史读取为 0。每客户端收到一帧通知，样本为 434 字节，历史每页最多 5 条。每档的第二轮包含第一轮新增的发生，HTTP 字节按实际结果记录。原始样本在 [au18-samples.json](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1zm/task01/au18-samples.json)。

### 098-aw4 · 全局暂停与固定收支改期

- AU15 · `12847369`。`automations.plans.automationState` 和 `setAutomationState` 提供持久状态与乐观修订。中心和设置操作同一开关。调度与任务发送边界检查全局状态，恢复跳过原排期。日历计划保留暂停前应补的期次并从启用窗口中扣除暂停区间。专注计时在恢复时结束已错过的截止，完成计数保持原值。定向测试覆盖重启、修订冲突、手动提醒、跳过旧时点和保留单计划意图。主要文件包括 `plugins/automations/src/engine/schedule-gate.ts`、`plugins/automations/src/engine/index.ts`、`plugins/automations/src/engine/periodic-plans.ts`、`plugins/automations/src/ui/AutomaticRunControl.tsx`、`packages/kernel/src/capabilities/home.ts`。
- AU16 · `646a8971`。账本来源对周期和起始日期执行领域校验。中心与账本复用公共改期表单和同一计划修订。已欠期次沿原日历补记，新排期从改期时生效，已生成流水与期次保留。定向测试覆盖原时点补齐、下一次计算与修订冲突。主要文件包括 `packages/contracts/src/automation-plan.ts`、`plugins/automations/src/engine/periodic-plans.ts`、`plugins/automations/src/ui/PlanScheduleControls.tsx`、`plugins/ledger/src/engine/recurring.ts`、`plugins/ledger/src/ui/Recurring.tsx`。

### 104-aw6 · 公共端口和权限

- 统一合同随上述提交落在 `packages/contracts/src/automation-plan.ts`、`packages/contracts/src/task-dispatch.ts` 与公共计划能力。全局操作与效果恢复使用工作台权限，固定收支校验由账本端口提供。通知的发生链接对外部 Focus 通知读取保持原 DTO 边界。

### 已运行

全部命令在 `inv-w1`，通过 `flock /home/wta/projects/huhu/temp/dev/verify.lock` 和 `volta run --node 24.22.1` 串行执行。

- `pnpm --filter "./vendor/*" run build:types`，3 包通过。
- `pnpm --filter <包名> run typecheck`，`@huhu/contracts`、`@huhu/kernel`、`@huhu/workbench`、`@huhu/plugin-automations`、`@huhu/plugin-tasks`、`@huhu/plugin-ledger`、`@huhu/engine`、`@huhu/desktop` 各自返回 0。
- `pnpm exec vitest run plugins/automations/test/task-scan-occurrences.test.ts`，34/34。
- `pnpm exec vitest run plugins/automations/test/service.test.ts`，49/49。
- `pnpm exec vitest run plugins/ledger/test/recurring-engine.test.ts`，2/2。
- `pnpm exec vitest run apps/engine/test/automation-cost.test.ts`，1/1。设 `HUHU_AUTOMATION_COST_OUTPUT=/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1zm/task01/au18-samples.json` 以重写样本。

### 待 Lead 运行的 E2E

| Spec | 用例 |
| --- | --- |
| `tests/e2e/workflows/acceptance.spec.ts` | AU03 任务提醒：通知定位原发生及来源任务，并标为已读 |
| `tests/e2e/workflows/automation-center.spec.ts` | AU15 全局暂停从中心写入并在设置中恢复 |
| 同上 | AU13 重试原建任务效果，保留通知和任务身份 |
| `tests/e2e/workflows/task-journey.spec.ts` | T7.2 AU13 Linux 定时与手动运行共享 Tasks 派遣，待处理可定位受阻子运行 |
| `tests/e2e/workflows/ledger.spec.ts` | AW4 AU16 账本与中心双向改期同一计划且删除后插件重开不复活 |
| `tests/e2e/workflows/automation-center.spec.ts` | AU18 桌面和获邀 Web 同步显示同一次通知和发生 |

## 阻碍与接续

- 未运行 E2E、全量单测、全仓类型检查、全仓 lint、构建、打包和视觉取证。桌面原生通知点击、获邀 Web、真实外部 provider 与 Mail/GitHub 渠道待验收。
- 通用恢复入口现有适配覆盖自动化提醒的建任务、任务评论和通知核实。Tasks 邮件及 GitHub 等领域交付沿各自原回执入口，需相应领域提供可证实的单效果恢复端口后才能接入。账本单期已证失败沿用原期次重试。
- AU18 样本的会话是实际 Shell 终端。给定规模下的原生 Agent 待答进程和规则槽仍需用对应 #17/J13/J14 旅程核对。首次历史查询仍读取历史，样本验证的是同一 Engine 的共享读取次数和按需分页。 
- 样本临时 Vault 和 Core 会话已由测试回收，未发现 AU18 残留进程。工作树保留给 Lead 验收。

## Lead 验收
