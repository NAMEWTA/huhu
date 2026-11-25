# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1t7
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1t7/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1t7/report02.md
- 业务验收报告 — [L9](/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/101-l9.md)
- 执行结果 — done。合并提交与 L9 交 Lead 验收。

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `50047f8ab99f77eee9ab891fcd77e3f468704558`，交回 `3e096c4da4796df682b8b1b60f90e0b18525de53`。工作树干净，差异检查通过。沿用本检出已生成的供应商类型。定向检查均在 Linux x86_64、Volta Node 24.22.1、pnpm 12.10.1 下串行独占 `/home/wta/projects/huhu/temp/dev/verify.lock`，并在锁内检查内存、父 cgroup、磁盘和 inode。 [日志目录](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02)

### 合并 · `876a4f7d06e132d153bbc02abb7614fe6475178c`

- 用 `git merge --no-commit main` 合入实际 main `243652128f91fb28422a5a2cbb4db4dcd1e5ae6a`。派发标注的业务基线是 `81bf3858`，其后只增加了本轮的 Herdr 派发文件提交。双亲为 `50047f8a`、`24365212`。
- `plugins/mail/src/ui/MailModule.tsx` 与 `MailSyncSettings.tsx` 保留 UX07 的按需设置对话框和原四组设置。AW4 的来源请求由邮件工作区接收，打开同一对话框，展开同步设置并聚焦其标题。同步设置保留原计划回中心的入口。
- `plugins/tasks/src/ui/TaskDetail.tsx` 合并 `TaskDestination`、待处理事项的原 run 定位与 `ModuleProps.onNavigate`。提醒、观察和跟进沿用原计划 ID 打开中心。`TasksModule.tsx` 自动合并后确认两个参数均传入。
- 持锁运行 `pnpm --filter @huhu/plugin-mail run typecheck`、`pnpm --filter @huhu/plugin-tasks run typecheck`，均零错误。持锁 `pnpm exec vitest run plugins/mail/test/pane-save.test.tsx` 4 通过、`plugins/mail/test/sync-engine.test.ts` 2 通过、`plugins/tasks/test/ui-shared.test.ts` 9 通过。另检查 `plugins/tasks/test/activity-reconciliation.test.ts`，该基准用例按 `HUHU_F11_BENCH` 门槛跳过。 [邮件类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/merge-mail-types.log) · [任务类型](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/merge-tasks-types.log) · [分栏](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/merge-mail-pane.log) · [同步](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/merge-mail-sync.log) · [任务表单](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/merge-tasks-ui.log) · [基准跳过](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/merge-tasks-activity.log)
- 建议 Lead 在 `tests/e2e/workflows/workbench-pages.spec.ts` 联验 **UX05：窄窗口可填写长中文、多个标签与 Agent 日期字段，保存后可重新打开**、**UX06：待处理事项只投影原任务、问题和投递，处理后收件项数保持不变** 和 **UX07：邮件设置按需打开，三栏到窄窗继续阅读、回复草稿与逐收件人结果**。邮件计划来源打开对话框的浏览器行为仍待验。

### L9 · `3e096c4da4796df682b8b1b60f90e0b18525de53`

- 账本改动 `plugins/ledger/huhu-plugin.json`、`src/engine/backup/{archive-json,homibook-cycles,homibook,index,snapshot}.ts`、`src/engine/{index,reconciliation,records,recurring,store}.ts`、`src/shared/{backups,entries,recurring}.ts`、`src/ui/{Backups,Records,index}.tsx`、`test/{backup-engine,homibook-migration}.test.ts`，路径相对 `plugins/ledger/`。另改动 `apps/engine/src/boot.ts`、`packages/kernel/src/capabilities/package.ts`、`packages/vault/src/{index.ts,package/bounded-zip.ts}`、`packages/vault/test/package.test.ts` 和 `tests/e2e/workflows/ledger.spec.ts`。
- 版本化 ZIP 按模块导出报表事实、账户基准、流水关系、预算、映射、固定收支、贷款期次及可选凭证。恢复核对模块依赖、清单、哈希、路径、大小和引用关系。用户预览后新建账本并重映射内部 ID。复用账本写者队列和 `OperationLog`，一次发布状态、凭证、索引与恢复回执。通过原预览查询和重试已提交结果。
- 桌面全 Vault 备份接入账本一致快照和恢复前验证。按附件选项去除导出副本中的凭证字节及引用，原账本的数据不受影响。新包过滤账本事务日志。
- 适配 HomiBook 固定提交 `5d3d7171` 的 v1 表和附件路径。支持选账本、明确业务时区，以及账户、校准、流水、预算、可匹配映射、可等价迁入的周期规则和已核对贷款期次。旧平账标记、缺凭证或分类、无精确金额或不兼容的期次逐条确认。选择沿用旧标记时，报表和预算排除该流水，账户余额仍按实际流水计算，并可单独清除标记。固定收支恢复后由用户显式配置计划。
- 账本包使用现有 `@huhu/vault` 的 fflate，未新增依赖或修改锁文件。为适配桌面与 Web 的现有 JSON 入口，单个账本 ZIP 限 5 MiB，单条目 16 MiB，解压总计 32 MiB，最多 1024 个条目。过多待决条目要求拆分。HomiBook v1 本身缺少 Huhu 格式的文件哈希。跨币种转账缺少另一端金额、原 Cron 无法等价表达、缺固定收支期次身份或贷款逐期金额不一致时，预览提示跳过和人工核对。外部凭证与原 HomiBook 实机安装环境未验证。
- 持锁逐文件运行 `pnpm exec vitest run plugins/ledger/test/backup-engine.test.ts` 2 通过、`plugins/ledger/test/homibook-migration.test.ts` 2 通过、`plugins/ledger/test/recurring-engine.test.ts` 1 通过、`plugins/ledger/test/reports-engine.test.ts` 2 通过、`plugins/ledger/test/reconciliation-engine.test.ts` 3 通过、`packages/vault/test/package.test.ts` 18 通过。覆盖损坏、越界和限额、模块依赖、全 Vault 可选附件、期次不重复与事务中断回滚。逐包持锁 `pnpm --filter <pkg> run typecheck`，`@huhu/plugin-ledger`、`@huhu/engine`、`@huhu/kernel`、`@huhu/vault` 均零错误。 [原生账本包](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/l9-backup-engine.log) · [HomiBook](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/l9-homibook-migration.log) · [Vault ZIP](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02/l9-package.log) · [类型检查和回归日志](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1t7/task02)
- Lead E2E `tests/e2e/workflows/ledger.spec.ts` — **L9 独立 Web 导出账本包并预览恢复到新账本**、**L9 桌面全 Vault 包恢复账本并按附件选项清理引用**。全 Vault 单测覆盖 ZIP 和账本选择器，桌面实机的引擎装配与宿主入口由后一用例验收。

## 阻碍与接续

E2E、视觉取证、真实外部服务、构建、应用打包、全仓检查和 knip 未运行。macOS、Windows 沿用批次排除范围。集成后由 Lead 按上列用例验证。Web 指南在客户端实施前完成 search 和 retrieve，恢复表单使用原生文件输入、模块分组，并在下一步骤聚焦预览标题。邮件来源沿用现有原生对话框的初始焦点机制。

## Lead 验收
- Lead 2026-11-25：合入 main 95499eba（Lead 解决 AgentCliModule.tsx 冲突）。E2E 38 通过 3 失败（L8、L9 独立 Web，首页看板 Git/SSH），返工派 t1v2 task01。
