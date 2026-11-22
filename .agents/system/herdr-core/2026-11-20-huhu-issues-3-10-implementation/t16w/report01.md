# #5 T5.3 规则发生与冻结入选名单

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t16w`
- 任务文件 — [task01.md](task01.md)
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t16w/report01.md`
- 执行结果 — `done`

## 交付

实现已提交到 `impl/huhu-issues-3-10-task-occurrence`。候选为 `3d9f6079cb4b7f55a68de1072b7d921eb5dbbc36`，父提交为 `891c20e1c747534fa62634f7f107efcc89da7374`。提交含 Automations 后端、Engine 回归和 T5.3 任务说明，共 6 个文件。工作树干净。

- Automations 在既有插件作用域提供 `taskScanOccurrences`。定时发生以 `ruleId + scheduledForUTC` 定位，人工调用每次分配独立 invocation。先通过 `VaultFiles.write` 原子保存规则版本、日历筛选、补充指令和每个任务的输入版本、哈希、入选或跳过结果。定时补扫使用恢复时钟筛选，定时身份沿用原 UTC 时刻。
- 入选项使用发生或 invocation 身份与任务 ID 导出稳定 `dispatchId`，经 `TaskRuleDispatch.acceptRule` 受理。Automations 保存 Tasks 回传的 `eventId`、`runId` 和受理时间。Tasks 持有任务执行快照、活动占用及当前资源状态。同 Space 的合格任务可进入 Tasks 待派，由 Tasks 判断资源是否就绪。
- `recover()` 根据原记录补齐未完成项，重交保留原规则、任务名单和派遣标识。受理之后状态写入失败时，原请求重交得到同一 Tasks 记录。尚未受理的任务如果已变更输入，会记录 `stale_input`。发生落盘即能从 `lastScheduledFor(ruleId)` 读出游标，未结束项仍可独立补齐。
- 规则正文现在可编辑扫描补充指令。任务规则新建和编辑按 Tasks 源协议的 20,000 字符上限校验。

参考本机 `temp/sources/agent-autoloop` 的 `d1ec2d8e48de62b2a49bd8dc5985c03482c753ce`。该版本 `LICENSE` 为 MIT，版权归数字生命卡兹克。核对 `kernel/decide.ts` 的 `ingest`（226 行）、`claimNext`（306 行）和 `tick` 的最近时点、暂停推进及 `rule@slot` 查重（584–614 行）。Huhu 实装沿用自己的 Croner、Vault 原子写和 Tasks 受理，参考范围为行为和设计，源码移植量为零。

## 自动化验证

按更新后的范围，在当前环境用项目锁定的 pnpm 12.10.1、Node 24.21.0 和 Vitest 3.2.7 执行验证。夹具从真实 `boot()` 启动隔离 Vault，通过回环 HTTP 创建规则、任务及人工派遣，通过插件实际注册的进程内服务触发新路径。任务执行器为合成替身。

| 验收点 | 实测结果 |
| --- | --- |
| UTC 去重、两条规则与人工入口竞争 | 同一计划点用 UTC 和 +08:00 重交返回同一发生。两个不同规则和一次工作台派遣合计只持久接受一次，竞争失败项指向同一获胜 run。修改规则正文并新增任务后重复投递，仍返回原版本、原指令与原名单。 |
| 资源忙与长轮次 | 合成执行器忙时，已受理项保持 `pending/waiting_resource`。资源恢复后执行器收到一次调用，执行仍在等待时发生详情可读。旧 worker 调用次数为零。 |
| 发生刚落盘 | 在首次写入成功后中断，磁盘留有两项原候选和迟到任务的 `not-due` 跳过记录，Tasks 受理为零。编辑规则、改变一项输入、新增任务并停用规则后重开，保留原规则与名单。变化的原项记为 `stale_input`，另一原项接受一次；新增项留到以后扫描。 |
| Tasks 已受理、发生项状态未写 | 中断时 Tasks 已有一份受理且发生仍显示两项待处理。重开补齐后单项请求身份保持一致，第一项沿用原 `eventId/runId`，第二项接受一次，Tasks 共两份记录。 |
| 各项已写、发生收尾未写 | 中断时两项受理和原游标均可读。重开只完成发生的结束写入，新增 Tasks 受理调用为零。 |
| 停用、重启后的补扫与手动身份 | 停用期间的计划点无法创建新发生。既有待派保留，原任务入口可取消该项。使用实际 Scheduler 装配，重启窗口跨多个周期只调用最近计划点一次，并接受计划点之后、实际扫描时刻之前才到期的任务。重新启用的新发生使用当前规则版本。两次手动 invocation 取得不同身份且游标保持原值。删除后仍可读取原发生。 |

最终回归结果为 **85 项通过**。Automations 全项目 59 通过，监督执行器的 11 个 POSIX 用例按既有平台守卫跳过。Tasks `persistence-http.test.ts` 24 通过。Engine 自动化规则正文和外部授权定向回归 2 通过，其余 46 项由筛选跳过。Automations TypeScript 检查、五个 TS 文件的格式与 lint、`git diff --check` 均退出 0。

复现时从仓库根取 `$root` 与 `$vitest`。本机全局 pnpm 命令的 trampoline 不可执行，使用缓存中已核对版本的 `@pnpm/exe.win32-x64` 作为 `$lockedPnpm`。首次在仓库内运行触发了自动依赖安装，已终止该进程并将根锁文件复原到基线。最终从临时目录调用同一锁定二进制，再将 Vitest 根指向仓库。

```powershell
$root = (Get-Location).Path
$vitest = "$root/node_modules/vitest/vitest.mjs"
& $lockedPnpm --dir $env:TEMP exec node $vitest run --root $root --project "@huhu/plugin-automations" --maxWorkers 2
& $lockedPnpm --dir $env:TEMP exec node $vitest run --root $root --project "@huhu/plugin-tasks" "$root/plugins/tasks/test/persistence-http.test.ts" --maxWorkers 1
& $lockedPnpm --dir $env:TEMP exec node $vitest run --root $root --project "@huhu/engine" "$root/apps/engine/test/engine.test.ts" -t 'automations.update|审计回归：外部入口即使被开放 automations' --maxWorkers 1
```

三个中断用例采用原子写边界的异常注入和真实 Engine 重开。验证窗格 `t16z`、`t170` 已移除，测试夹具清理了隔离 Vault。共享插件注册、Tasks 契约、manifest、根锁文件和 worktree 登记均没有提交差异。

## Lead 接续

- T7.1 统一切换生产 Cron 回调、启动 `recover()`、公开 `runNow`、预览和运行详情后，再退役旧 supervisor 写者。需要确认首次启用后尚无发生的停机基线，以及合并错过计划点的公开记录。此次实际 Scheduler 验证使用已有游标的补扫路径。
- 详情用发生项的接受身份查 Tasks 当前派遣，展示待资源、运行和取消状态。新版执行路径的规则 `maxConcurrent` 执行槽约束，以及已有会话和原生恢复目标的旧 `dispatchBlockers`，需要在切换时与 Tasks／Agent CLI 合同一起核对。当前发生记录已保存原规则配置。
- 原型记录已确认停用和删除后的队列语义。界面确认、发行包和整库还原后的调度验收属于后续切片。此次验证覆盖内部 Engine 服务与合成执行器。没有实施阻碍。

## Lead 验收
