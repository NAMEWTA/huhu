# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task10.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task10.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report10.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/` 下的 `079-mailplan.md`、`080-gitplan.md`、`081-sshplan.md`、`089-f30.md`，由 Lead 填写
- 执行结果 — done

## 成果与运行指针

- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`。先快进到 `a4f89775`，追加任务发布后再同步到 `062d5696`。最终提交 `0111b2b5`。完整改动路径可用 `git show --stat <提交>` 查看。
- 运行原件 — `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task10/` 下的阶段目录，含逐文件日志、`results.tsv`、F28 Playwright 错误上下文与 trace。
- 定向单测命令 — `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run <测试文件>`，每次一个文件。类型检查逐包使用相同锁与 Node 版本执行 `pnpm --filter <包名> run typecheck`。每次启动前核对可用内存与磁盘门槛。

### F28 追加修复 · b5f2e1e1

- `plugins/tasks/src/ui/TaskDetail.tsx` 的任务详情有两个使用同一 task ID 做 React key 的相邻子组件。实际页面探针看到接口返回一份计划，详情却挂载两份提醒区。移除子组件的重复 key，保留任务详情自身的任务身份。验收 spec 先要求恰好一个提醒区、一个目标计划行，再断言可见。
- Lead 授权的桌面构建与单条 Playwright 用例先复现失败，再验证通过 1/1。命令为 `pnpm e2e tests/e2e/workflows/acceptance.spec.ts -g 'F28：' --workers 1`，Linux 以 Xvfb 启动。原件见 `f28-baseline/`、`f28-fixed/`。提交后已先通过 Core 回告 Lead。`@huhu/plugin-tasks` 类型检查通过。

### 079 MailPlan · dcda1497

- 修改 `plugins/mail/src/engine/sync-schedule.ts`、邮件同步设置页、共用 Contracts、Automations 计划目录与 Workbench 事件查询。Mail 设置和中心读写 `periodic-mail-sync` 的同一版本。定时、启停、删除和协议唤醒归 Automations，Mail 沿用账号、凭据、所选文件夹、游标及本地缓存。手动拉信独立于计划生命周期。
- 旧 Vault 明确保存的周期设置首次导入，原文件保留。空 Vault 从关闭状态开始。已删除计划保留墓碑，重启、插件重新启用、续作或旧配置仍在均不恢复自动拉信。
- 定向通过 `plugins/mail/test/sync-engine.test.ts` 2 项、`plugins/mail/test/messages-engine.test.ts` 5 项、`plugins/mail/test/tool-exposure.test.ts` 5 项。回环 IMAP 覆盖来源与中心操作、重启、手动拉信及 IDLE 唤醒。
- Lead 待跑 `tests/e2e/workflows/acceptance.spec.ts` 的「MailPlan：邮件设置和自动化中心管理同一周期同步计划」。

### 080 GitPlan · 2d5f2254

- 修改 `plugins/versioning/src/engine/{auto-sync,index,sync,sync-plans,descriptors}.ts`、同步设置页、Automations 和 Workbench 的共享接口。两个稳定计划分别执行拉取与完整同步，完整同步走原 Git 锁并执行拉取和推送。沿用远端操作、冲突、认证和待写修订收尾。认证修复仅对当前目标和对应凭据修订唤醒计划。远端、分支和排除项归 Versioning，周期和运行意图归 Automations。
- 定向通过 `plugins/versioning/test/` 下的 `periodic-sync.engine.test.ts` 1 项、`auto-sync.test.ts` 4 项、`remote-auth.engine.test.ts` 6 项、`domain-exposure.engine.test.ts` 5 项、`pending-history.engine.test.ts` 2 项、`safe-sync.test.ts` 7 项、`sync.test.ts` 16 项。临时 bare 仓库验证完整同步双向结果，删除经插件停用、启用及 Engine 重启保持有效。
- Lead 待跑 `tests/e2e/workflows/acceptance.spec.ts` 的「GitPlan：完整同步与拉取在中心各有一个可修改的计划」。

### 081 SSHPlan · 5a07848e

- 修改 `plugins/ssh/src/engine/{index,monitors,monitor-panels,monitor-plans}.ts`、监控合同、监控页及共用计划接口。工作台明确启动的命名面板登记稳定计划，来源与中心使用同一修订和周期。中心删除释放该面板引用，中心暂停保留其已打开的面板及数据。结束最后引用时释放连接。仅保存的面板不会连接，显式停止或 Engine 重开后必须从面板启动才会建立新的连接租约。临时侧栏和外部 SSH 授权运行沿用各自连接租约。
- 定向通过 `plugins/ssh/test/monitor.engine.test.ts` 3 项，覆盖回环 Linux/Windows 采样、同一主机共用一个采样源、暂停与删除、断线重连及最后引用释放。中心改期与面板投影在重启后仍使用同一修订。
- Lead 待跑 `tests/e2e/ssh/monitoring.spec.ts` 的「Workbench monitors a saved panel in the background and controls the active Pane separately」。

### 089 F30 · 0111b2b5

- 修改 `plugins/automations/src/engine/{periodic-plans,periodic-occurrences,plans,index}.ts`、`plugins/automations/src/ui/{AutomationsModule,PlanScheduleControls}.tsx`、Contracts、Workbench 与三个领域适配器。三类计划统一迁移入口、版本比较、执行前核对和持久发生记录。停止或改期取消原执行作用域，原发生的未核实结果可查询。发生日志复用项目已使用的 Node SQLite，避免短间隔采样为每条历史占用一个文件。旧发生文件仍可读。
- 中心和来源使用同一周期约束，中心显示下次运行、受阻原因与执行失败。计划变更和发生事件只刷新中心及对应来源。
- 定向通过 `plugins/automations/test/periodic-plans.test.ts` 1 项、`plugins/automations/test/service.test.ts` 49 项，并复跑 Mail、Git 和 SSH 的定向 Engine 测试。`packages/workbench/test/engine-client.test.ts` 35 项通过，见 `f30-query/`。共用测试核对同一计划不并发受理、改期取消旧发生、异设备无写权限、结果待核实及墓碑跨重启。
- 改动包 `@huhu/contracts`、`@huhu/workbench`、`@huhu/plugin-automations`、`@huhu/plugin-mail`、`@huhu/plugin-versioning`、`@huhu/plugin-ssh` 逐包类型检查零错误，原件见 `f30-types/`、`f30-final-types/` 和 `f30-query-types/`。合体验收使用本回执列出的三条 Mail、Git、SSH E2E。

### Modern Web Guidance

- `forms` 的可见原生标签和原生约束用于周期字段。Git 与中心数字输入使用范围和步进，SSH 中心与来源使用同一组周期选项。

## 阻碍与接续

- 实施无阻碍。Mail、Git、SSH 的新增或更新 E2E 由 Lead 在合并候选上运行。本批只按追加授权运行了 F28 的单条桌面 E2E 和所需构建。
- 未运行全量单测、全量 E2E、全仓类型检查、打包、全仓 lint、knip 或视觉截图取证。真实外部邮箱、Git 远端和生产 SSH 主机未验证。SSH 的既有 `public-resources.engine.test.ts` 失败仍由原负责范围处理。未测量长期高频采样的存储体积。
- 来源同时编辑领域配置和周期时，领域文件与计划目录分别落盘。本批的回环用例覆盖成功、版本校验和重启，未注入两个文件提交之间的磁盘故障。

## Lead 验收

- Lead 2026-11-25：MailPlan/GitPlan/SSHPlan/F30 合入 main febf92ea，8 包类型检查与 6 条 E2E 通过。清单转 task11。
