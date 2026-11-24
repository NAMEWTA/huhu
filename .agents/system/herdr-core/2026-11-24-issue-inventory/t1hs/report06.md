# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task06.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task06.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report06.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 `025-f01.md`、`036-f23.md`、`062-f29.md`
- 执行结果 — done

## 成果与运行指针

- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`
- 提交 — F01 `24913a14`，F23 `bde09d8f`，F29 `33a0459a`。合并提交 `488e10f7` 已纳入 main 上的 F12 类型修复 `f10f8475`。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task06/`
- 每个定向文件逐一运行 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <单个测试文件>`。启动前检查内存。追加授权的 F23 构建和 E2E 在同一把锁下串行执行，拿锁后分别核对 20 GiB 门槛。

### F01 回归

- `plugins/mail/test/{outbox-engine,drafts-engine,draft-attachments-engine}.test.ts` 与 `plugins/mail/test/fixtures/vault-write.ts`。
- journal 步骤在路径预留内走 VaultFiles 的 checked writer，原公开 `write` spy 没拦截这些提交。版本替换在同步发布边界走命名导出的 `renameSync`，历史的异步 `rename` spy 仍适用于新附件 blob 的写入场景。故障注入已分别对准这两条真实写边界。保留原断言，包括部分投递、待核实、重开防重、原字节和暂存清理。
- 检索 `vi.spyOn` 与 `vi.mock` 对直接 VaultFiles 写入、原子替换及 journal 发布原语的 fault 或 gate。以下为完整文件复跑清单。附件 `f01-direct-consumers.tsv` 保留首轮观察，`f29-confirmed/` 保留 Automations 双消费者及 Vault 的最终复跑，`recheck/` 保留 SSH 二次结果。

| 测试文件 | 结果 |
| --- | --- |
| `plugins/mail/test/outbox-engine.test.ts` | 20 通过 (20) |
| `plugins/mail/test/drafts-engine.test.ts` | 2 通过 (2) |
| `plugins/mail/test/draft-attachments-engine.test.ts` | 8 通过 (8) |
| `plugins/mail/test/web-draft-attachments.engine.test.ts` | 1 通过 (1) |
| `plugins/mail/test/accounts.test.ts` | 22 通过 (22) |
| `plugins/mail/test/accounts-engine.test.ts` | 2 通过 (2) |
| `plugins/mail/test/oauth-engine.test.ts` | 16 通过 (16) |
| `plugins/safe/test/safe.test.ts` | 21 通过 (21) |
| `plugins/safe/test/external.engine.test.ts` | 3 通过 (3) |
| `plugins/safe/test/personal.engine.test.ts` | 10 通过 (10) |
| `apps/engine/test/dashboard-recovery.test.ts` | 6 通过 (6) |
| `plugins/versioning/test/safe-sync.test.ts` | 7 通过 (7) |
| `apps/engine/test/module-credential-host.test.ts` | 3 通过，3 跳过 (6) |
| `apps/engine/test/tool-access.test.ts` | 3 通过 (3) |
| `packages/kernel/test/home-dashboard.test.ts` | 3 通过 (3) |
| `apps/engine/test/engine.test.ts` | 50 通过 (50) |
| `packages/kernel/test/credentials.test.ts` | 18 通过 (18) |
| `plugins/tasks/test/persistence-http.test.ts` | 43 通过 (43) |
| `plugins/ssh/test/public-resources.engine.test.ts` | 1 失败，55 通过 (56) |
| `plugins/ssh/test/route-edits.test.ts` | 9 通过 (9) |
| `plugins/ssh/test/shortcuts.test.ts` | 5 通过 (5) |
| `plugins/ssh/test/host-auth.engine.test.ts` | 4 通过 (4) |
| `plugins/notes/test/service.test.ts` | 51 通过 (51) |
| `packages/vault/test/operations.test.ts` | 47 通过 (47) |
| `plugins/automations/test/task-scan-occurrences.test.ts` | 29 通过 (29) |
| `plugins/automations/test/default-task-scan.test.ts` | 6 通过 (6) |

### F23 大库保存

- `tests/e2e/perf.spec.ts` 的夹具仍含 5,001 篇笔记。初始索引断言确认目标路径存在，虚拟树滚动后真实点击该路径，保存计量仍从已打开编辑器开始。
- 在 `bde09d8f` 执行 `flock … volta run --node 24.22.1 pnpm --filter @huhu/desktop run build` 通过。使用相同锁执行 `volta run --node 24.22.1 pnpm e2e tests/e2e/perf.spec.ts -g "F23 大库正文保存" --workers=1 --retries=0 --trace=on`，1 项通过。
- 结果为 0 次整树索引 RPC、0 响应字节、保存旅程 283.14 ms、观察到 1 次 53 ms 长任务。保存断言验证了 Vault 内实际字节。原件为 `f23-build.log`、`f23-e2e.log`、`f23-metrics.json` 和 `f23-e2e/` 内的 Playwright trace。这次测量使用修复版夹具的一次采样。

### F29 计划目录

- `plugins/automations/src/engine/{plans,index,service,follow-ups,default-task-scan,task-scan-occurrences,reminder-deliveries}.ts` 与插件清单。Cron 继续由规则文件和现有调度入口管理，跟进继续由原持久记录和 Tasks 受理管理。稳定 `planId` 与改期时新建的 `followUpId` 分开。旧跟进按原 Vault 和任务身份映射，首次写入将映射存入原记录。旧记录首次观察时间取文件修改时间。
- `packages/contracts/src/kinds/automation.ts`、`packages/kernel/src/{capabilities/define,dispatcher}.ts` 与 `packages/vault/src/{operations,semantic/repository}.ts`。规则同一时刻往返编辑有不同的实际持久版本，Cron 写入延续已有配置队列与 Vault 提交边界。规则改期、停启和删除统一按版本拒绝过期请求，持久意图查询走现有 `/api/v1/operations`。默认扫描使用显式创建或恢复动作，并保留删除标记。Cron 的新定时受理经过配置队列，跟进调度跳过已暂停和已删除记录。
- `packages/workbench/src/engine-client/{client,query}.ts`、`packages/workbench/test/engine-client.test.ts`、`plugins/tasks/src/ui/TaskFollowUp.tsx`、`plugins/tasks/test/persistence-http.test.ts`。实体事件同时刷新同 Vault 的来源与目录，跟进来源显示暂停。真实 Engine HTTP 用例覆盖两个来源的稳定身份、改期、停启、读旧版、版本冲突、删除、重启、重交和默认模板恢复。
- 读取已存的扫描、提醒及跟进发生。跟进保留受理时修订和原冻结输入，提醒与扫描从原记录投影效果。旧终端激活缺少可核实的冻结修订，继续由 `automations.activations` 查询历史概要。

| 测试文件 | 结果 |
| --- | --- |
| `plugins/automations/test/service.test.ts` | 46 通过 (46) |
| `plugins/automations/test/default-task-scan.test.ts` | 6 通过 (6) |
| `plugins/automations/test/task-scan-occurrences.test.ts` | 29 通过 (29) |
| `plugins/tasks/test/persistence-http.test.ts` | 43 通过 (43) |
| `packages/vault/test/operations.test.ts` | 47 通过 (47) |
| `apps/engine/test/write-boundaries.test.ts` | 2 通过 (2) |
| `packages/workbench/test/engine-client.test.ts` | 34 通过 (34) |
| `packages/kernel/test/dispatcher.test.ts` | 29 通过 (29) |

最终原件保存在 `f29-confirmed/`，Workbench 和 Dispatcher 原件保存在 `recheck/`。

## 阻碍与接续

- SSH 的 `a changed jump revision invalidates the original pending target before authentication` 两次均为 `NOT_FOUND`，断言期望 `VERSION_CONFLICT`。单文件其余 55 项通过。当前路由变更事件会立即撤下失效探针，`PublicSshProbes.decide` 在无有效提示时走 `NOT_FOUND`。这两次运行在错误码断言处结束。交 Lead 确定 SSH 错误契约后再处理。原件分别位于 `plugins_ssh_test_public-resources.engine.test.ts.log` 和 `recheck/` 同名文件。
- F22 等 U1。F11 按本批余量约定顺延，完整交付涉及未来派遣所有权迁移、活动回执读取和固定 0/1k/10k 历史对照。
- 待 Lead 做包级类型检查，涉及 `@huhu/contracts`、`@huhu/kernel`、`@huhu/vault`、`@huhu/workbench`、`@huhu/plugin-automations`、`@huhu/plugin-tasks` 和 `@huhu/plugin-mail`。F29 的中心 UI 旅程归 AW 验收。本批 E2E 验证仅为 F23 的上述用例。其余全量套件、构建和真实 provider 由后续整合验收覆盖。

## Lead 验收

- Lead 2026-11-24：F01 回归、F23、F29 通过并合入 main b7834d34。清单转 task07。
