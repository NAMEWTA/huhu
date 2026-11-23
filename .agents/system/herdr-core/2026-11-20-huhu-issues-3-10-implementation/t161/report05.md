# #5 T5.3 冻结发生与 Tasks 受理独立复核

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t161`
- task — `task05.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/task05.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/report05.md`
- 执行结果 — **done**

## 结论

冻结提交 `3d9f6079cb4b7f55a68de1072b7d921eb5dbbc36` 的 T5.3 内部发生与 Tasks 受理路径通过独立复核，Windows pnpm 自动化共 85 项通过。发生先落盘，跨中断保留规则快照和原名单，同一任务的并发受理仅占位一次。冻结版本的生产定时与手动入口仍走旧 supervisor，切换受下述接线、目标判定和规则并发约束阻挡。 [原实现报告](../t16w/report01.md) · [独立复跑](evidence-task05/occurrences.log)

## 冻结范围与状态所有权

直接父提交为 `891c20e1c747534fa62634f7f107efcc89da7374`。在两个冻结 Git 对象间检查 6 个变更文件，`git diff --check` 通过，锁文件 blob 相同。业务行为从 `plugins/automations/src/engine/task-scan-occurrences.ts:170` 追到 `plugins/tasks/src/engine/dispatch.ts:226` 的受理和后续领取。 [静态证据](evidence-task05/static.log)

- **规格。** 定时身份由 ruleId 与规范化后的 `scheduledForUTC` 决定，手动 invocation 单独分配。新发生先以条件创建保存规则版本、筛选输入、指令、候选与跳过名单，每项保留任务修订／哈希并导出稳定 dispatchId。重开从持久记录推进，原发生重交不重新筛选。受理结果只记录 eventId、runId 等关联和受理事实。
- **项目规范。** Automations 新路径复用 `VaultFiles` 与 `TaskRuleDispatch.acceptRule`。Tasks 持有执行快照、任务占用和当前派遣状态。新发生只是派遣的来源和历史。旧 supervisor 仍自行写 legacy claim 与 `task-run`，并调用 `tasks.markDispatched`，生产运行事实的所有权要随入口切换统一。

## 独立 Windows 自动化

从提交对象解包到 Windows 系统临时目录，使用锁文件相同的 `safe-personal` 已安装依赖，临时 workspace 依赖指向候选归档。原测试、Engine 相关夹具与发生、受理和生产订阅接线的相关源码已核对 Git blob。由本机固定 pnpm 12.10.1 运行 `pnpm exec vitest`，禁用自动依赖核验和安装脚本，启用离线及回环 registry，每组单 worker。夹具使用真实 Engine `boot()`、隔离 Vault 和回环 HTTP，按原测试接入合成执行器。 [复跑脚本](verify-occurrences.ps1) · [版本、命令与日志](evidence-task05/occurrences.log)

| 测试范围 | 结果 |
| --- | --- |
| Automations 全项目（含 5 项发生用例） | 6 文件，59 通过，11 项按原平台守卫跳过。 |
| Tasks `persistence-http.test.ts` | 1 文件，24 通过。 |
| Engine 规则正文与外部授权定向 | 1 文件，2 通过，46 项按名称筛选跳过。 |

| 行为 | 实测 |
| --- | --- |
| UTC 身份、并发与待资源 | UTC 与 +08:00 表示的同一时刻返回同一发生。两个规则与一次桌面人工派遣争同一任务，磁盘仅有一份有效受理，落败项能定位获胜 run。忙时 Tasks 记录 `pending/waiting_resource`，释放后合成执行器调用一次；执行期间仍可读取发生，旧 worker 调用为零。 |
| 跨中断恢复 | 发生落盘后中断时受理为 0，重开后使用原规则版本、补充指令、任务名单和 dispatchId。改变了一项执行输入后记为 `stale_input`，新增任务留待下一次扫描。受理完成但发生项未写时，重开沿用原 eventId／runId，补齐后 Tasks 共两份记录。各项已落盘而发生未收尾时，只做结束写入，新增受理调用为 0。 |
| 停用与补扫 | 停用期间定时点不建新发生，既有待派仍由 Tasks 独立取消。恢复启用的补扫夹具在已有游标时只补最近一个计划点，按实际扫描时钟考虑候选并使用当前版本。手动两次有不同 invocation，未推进定时游标。规则删除后原发生仍可查回。 |

## 生产切换阻断与边界

1. **公开入口与恢复尚走旧路。** `index.ts:92` 只在插件内部提供 `taskScanOccurrences`。`index.ts:95` 的 Cron 仍调用 `svc.activate`、读取旧 `lastActivatedFor`；启动仍调用旧 `svc.reconcile`；`automations.runNow`、预览、激活和运行详情仍读取 `svc`。生产切换需要一起接通定时发生、启动 `recover`、手动 invocation、预览和发生详情，任务执行信息由 Tasks 派遣查询提供，同类任务扫描只保留一个生产写者。已有游标的补扫已验证；没有发生时 `lastScheduledFor` 返回空，`missedRun` 直接结束，既有规则迁入时的首个补扫基线仍需在 T7.1 确定。
2. **直接切换会固化旧目标预检。** Engine 在启动时异步填充无界面 CLI 的可用性缓存。旧 `service.ts:554` 等待 `refreshClis` 后扫描，新 `classifyTaskScan` 直接读缓存。缓存尚为空或过期时，`cli-missing` 可能被持久写成该次发生的跳过项，重交仍采用原名单。Tasks 的 `dispatchable` 可把 `existing`／`resume` 目标送到执行器判断，新发生仍继承 Tasks DTO 对这两类目标的旧 `dispatchBlockers`，`scan.ts:117` 因此在交给 Tasks 前将其跳过。目标可受理性与每次新扫描的可用性来源需对齐。
3. **规则并发与预览语义缺接线。** 规则输入保留 `maxConcurrent`，旧 `service.ts:552` 用它限制 worker，新流程提交给 Tasks 的来源没有携带并发配额，Tasks 领取有任务和资源检查而缺规则槽判断。冻结版预览默认按旧 Space 忙／一次只选一个的筛选，新 `freeze` 允许同 Space 候选进入 Tasks 队列。切换时须统一预览与实际受理的语义，并在执行领取时兑现规则配额。

以上生产边界由冻结源码确认。独立 Windows 复跑覆盖注册后的内部发生服务及现有授权回归。GUI、真实账号、生产 Cron 切换和备份恢复未在本轮运行。 [T5.3 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T5.3-scan-occurrence.md) · [T7.1 切换](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T7.1-cutover.md)

## 清理

三组 Vitest 与验证 pane 均退出 0。夹具目录为零，解除临时依赖联接后归档快照已移入回收站，原路径已核实移除。验证窗格 `t176` 已回收。Lead 可关闭或复用 `t161`。 [窗格退出](evidence-task05/pane-exit.log) · [清理](evidence-task05/cleanup.log)
