# #3 第二次退出与延期 Engine 恢复独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — `t4x`
- task — `task05.md`
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/task05.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report05.md
- 执行结果 — `done`
- 身份 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`。发布时核对 `HC_TERMINAL_ID=t4x` 和 `t4x / task05.md / active`。

## 签收建议

**上一轮第二次退出的反例已修复。S1a-03 整体建议返工后签收。** 单独复验了 Vault 切换与已取消退出重叠的顺序，发现另一项仍存在的 P2。切换已经请求停止旧 Engine 后，较早取消的退出仍可重新登记恢复，旧 Vault 的 Engine 因此会额外启动一次。该问题在直接父提交和候选上均复现。 [上轮报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report04.md) · [S1a-03 契约](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md)

## 规格轴

**上一轮 P2 红绿对照。** 使用同一个 Windows Electron 44.9.1 隐藏窗口探针，执行冻结的 Main 退出路径与对应 SHA 的 `EngineSupervisor`。第一次退出停机期间，已获许可的窗口导航并撤销整轮。触发强制停止时限后保留旧进程 exit 事件。第二次退出用新的 ID 两窗同意，在第二次 stop 已发送 shutdown 后再发出旧进程 exit。父提交在退出时 fork 数为 **2**，第二个子进程的 shutdown 数为 **0**。候选退出时 fork 数为 **1**，原进程已退出，状态为 `stopped`。把候选的同一 Vitest 回归用例复制至隔离父提交快照，父提交 1 通过、1 失败，失败为期望一次 fork 实得两次，退出码 1。候选 2 项均通过，退出码 0。 [父提交原生日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-baseline-timeout-requit.log) · [候选原生日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-timeout-requit.log) · [Vitest 红绿](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/targeted.log)

**P2 · Vault 切换先调用 stop，较早退出的取消稍后又能登记恢复。** 按实际 `openVaultNow` 的换库路径取证。首轮应用退出开始停止后，导航撤销窗口许可。旧进程仍在停止阶段时，由已释放的窗口进入换库流程，`openVaultNow` 发送第二个 shutdown 并等待。先触发首轮应用退出的停止时限，再发出旧子进程的 exit。此时换库仍持有旧 supervisor，首轮退出的 `supervisor === engine` 检查成立，把旧 Vault 的恢复重新排入。旧进程退出时先额外为旧 Vault fork，再正常为新 Vault fork。两个 SHA 的探针均记录总 fork 数 **3**、旧 Vault 恢复 **1** 次、额外旧子进程收到 **0** 次 shutdown。新 owner 正常 ready，原 supervisor 仍为 `starting`。任务要求的成功结果是旧 Vault 停止且只启动新的 owner。 [Vault 入口](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/candidate/apps/desktop/src/main/index.ts:283) · [退出恢复调用](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/candidate/apps/desktop/src/main/index.ts:543) · [候选重叠证据](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-swap-overlap.log) · [父提交重叠证据](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-baseline-swap-overlap.log)

| 补充边界 | 候选实际结果 |
| --- | --- |
| 普通取消 | 导航撤销两窗退出许可，另一窗收到 release。旧进程正常退出后恢复一次，ready 后可取新端点。再确认退出时，用新 ID 完成，恢复后的子进程收到一次 shutdown。 [正常取消](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-normal.log) |
| 只有一次取消，旧进程晚于强制停止时限退出 | kill 返回至旧进程的 exit 之前只有首个 fork。等到 exit 才恢复一次。 [时限恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-timeout.log) |
| 等待第二次用户决策时旧进程先退出 | 第二次尚未调用 stop，旧进程退出后按首轮取消请求恢复。第二次参与者允许后，新进程收到一次 shutdown 再退出。第二次参与者选择留下时，两窗和已恢复的 Engine 均保留，新进程收到 0 次 shutdown。 [允许](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-wait-allow.log) · [留下](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-wait-stay.log) |
| 已登记恢复后再切 Vault 或重复 stop | 排队恢复后才开始切换的次序通过，旧进程停止，新 owner ready，总 fork 2，旧 Vault 恢复数 0。挂起恢复后发出两个 `stop()`，同一旧进程的 exit 使两调用均结算，计时器清空，总 fork 1。包含第一轮在内，替身记录三次 shutdown 发送。 [切换次序对照](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-swap-after.log) · [重复 stop](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/native-candidate-repeat-stop.log) |

## 规范轴

- 返工将延迟恢复收回 Supervisor 持有。当前子进程的 exit 回调消费 `restartWhenStopped`，`start()` 和新 `stop()` 同步清空该标记。这覆盖「先登记恢复，再接受更晚的停止」。Vault 交叠的实测证明，较早停止的完成处理仍能在更晚的停止开始后重新设置标记。建议把延迟恢复和产生它的那次停止绑定，换库或新退出真正开始 stop 时推进所有权。更老的停止完成后不能重新登记恢复，等待用户期间仍保留应有的恢复。 [Supervisor 停止与恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/candidate/apps/desktop/src/main/engine-supervisor.ts:158) · [窗口停止的恢复判定](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/candidate/apps/desktop/src/main/index.ts:543)
- 两文件的 oxfmt、oxlint 和 Git 差异检查通过。新增测试在同锁 Windows 环境中使用合成 UtilityProcess，原生探针也使用独立 test profile 与隐藏窗口。 [验证日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/targeted.log)

## 冻结、运行与范围

- 候选 `063e97d3d1f620de4b17f4e36b9167e6f837c8e1`，树 `f9ae72159742b131571e233eb5270b623d451257`。直接父提交 `9cf0d9ef84373d2d7452d12fca003abd58838796`，树 `4f1af11e7dbd249dcc600da6b51836d0b1f9ea2b`。本轮两文件是 `engine-supervisor.ts` 与新增的单元测试，候选 Main 退出入口保持相同 Git blob。上轮 `b4dc2066060af88efe45622201126821044319b2` 的 Main 与 Supervisor blob 均等于本轮红灯父提交。 [冻结源码核验](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/snapshot.log)
- Windows、Node 24.21.0、Vitest 3.2.7、实测 Electron 44.9.1 / Chromium 152.0.7977.167。两个隔离 Git 归档使用同锁依赖，锁文件 blob `8165f3147cf5564a2d36a67959f3afed0d697f95`。原生探针覆盖真实 BrowserWindow 与应用退出事件。进程回执、计时器、参与者选择和 Vault 资料由夹具控制，切换用例执行实际 `openVaultNow`，替换引擎对外回报合成端点。范围限于退出增量、所有者交接和进程事件顺序。 [原生探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/probe-native.cjs) · [验证脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/run-targeted.ps1)
- 本轮 11 个已完成的命令 pane 均已关闭，独立日志保存在系统临时目录。 [Core 清理日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r05-46fb6b594c71/logs/core-cleanup.log)

## Lead 验收

由 Lead 追加。
