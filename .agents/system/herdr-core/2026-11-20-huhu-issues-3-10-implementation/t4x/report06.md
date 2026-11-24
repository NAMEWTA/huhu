# #3 Vault 切换与退出停止代次独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — `t4x`
- task — `task06.md`
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/task06.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report06.md
- 执行结果 — `done`
- 身份 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`。发布时核对 `HC_TERMINAL_ID=t4x` 和 `t4x / task06.md / active`。

## 签收建议

**建议签收 `f49df4a` 的停止代次返工。** 上轮 Vault 切换重叠的 P2 已修复。新 Vault 可以先于旧进程的退出事件就绪，候选在旧事件随后到达时仍保持旧 Vault 停止。再次关窗、普通取消和等待用户期间的恢复均通过。T03 整体仍需同一组合构建的真实应用证据。 [上轮报告](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4x/report05.md) · [S1a-03 契约](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/tasks/S1a-03-quit-transaction.md)

## 规格轴

| 重放场景 | 实际结果 |
| --- | --- |
| 上轮 `swap-overlap` 红绿 | 窗口导航撤销退出后，实际 `openVaultNow` 先发出第二次 stop。随后结束第一次退出的停止时限，再触发旧子进程退出。父提交总 fork **3**，含一次旧 Vault 恢复。候选总 fork **2**，旧 Vault 恢复数 **0**，旧 supervisor 为 `stopped`，新 Vault 为 ready。 [父提交](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-baseline-swap-overlap.log) · [候选](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-swap-overlap.log) |
| 新 Vault 已接管，旧 exit 晚到 | 先结束两次 stop 的时限，新 Vault 进入 ready，旧进程仍未发出 exit。父提交在旧事件到达后又 fork 一次旧 Vault，候选的总 fork 始终为 **2**，新 owner 和端点保持可用。 [父提交](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-baseline-swap-detach.log) · [候选](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-swap-detach.log) |
| 已登记恢复后再切换 | 候选先登记当前停止的延期恢复，再发起换库。较晚的 stop 撤回恢复，旧进程退出后仅启动新 Vault，总 fork **2**，旧 Vault 恢复数 **0**。 [顺序对照](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-swap-after.log) |
| 已取消后再次确认关窗 | 首次 stop 超时且旧 exit 未到时，第二次请求使用新 ID 并完成两窗许可。旧进程收到第二次 shutdown 后发出 exit，应用退出时总 fork **1**，无新子进程待处理。 [连续退出](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-timeout-requit.log) |
| 普通取消、超时取消和等待用户 | 单独取消在旧进程正常退出后恢复一次。走强制停止时限时，等到旧 exit 才恢复。第二次退出仍等一窗选择时，首轮恢复照常发生。选择允许会有序停止已恢复的进程，选择留下会保留两窗与 ready 的 Engine。 [普通取消](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-normal.log) · [时限恢复](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-timeout.log) · [允许](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-wait-allow.log) · [留下](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/native-candidate-wait-stay.log) |

同一份三项 Supervisor 用例在隔离父提交上为 **2 通过、1 失败**。换库重叠用例期望一次 fork，父提交实得两次，退出码 1。候选 **3 项通过**，退出码 0。红灯用例从候选复制到父提交的临时测试目录，业务源码取各自冻结版本。 [测试入口](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/candidate/apps/desktop/test/engine-supervisor.test.ts:54) · [独立 Vitest 日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/targeted.log)

## 规范轴

- `stop()` 在发起关闭前同步分配代次并清除延期恢复，完成后返回本次代次。Main 把该值交回同一 supervisor，恢复只接受当前代次。`start()` 推进代次，隔开已重新启动的子进程。晚到的旧停止完成处理和较早已登记的恢复都在相应时序失效。Main 仍核对 supervisor 身份。换库、关闭 Vault 等调用方可继续等待 stop 并忽略返回值。 [Supervisor](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/candidate/apps/desktop/src/main/engine-supervisor.ts:160) · [Main 调用](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/candidate/apps/desktop/src/main/index.ts:545)
- 冻结候选通过独立 TypeScript 5.9.3 检查，覆盖 Desktop 原有源码及 Vite 配置，并额外纳入 Supervisor 测试。另一次定向检查覆盖改动的 Main、Supervisor 和测试。三个 vendor 类型声明构建通过。三文件 oxfmt、oxlint 和 Git 差异检查均通过。 [Desktop 类型](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/types.log) · [定向类型](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/main-types.log) · [格式与 lint](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/targeted.log)

## T03 剩余前提

此处按批次 #3 组合验收记录列出 T03 的剩余前提。

- 在含停止代次修复的同一 Windows 组合 SHA 上构建应用与候选安装包，记录 build-info 和包 SHA。使用真实隔离 Vault 实跑 TB-14/15 的完整 session-flush 场景，包含未落盘输入、取消后继续编辑、重开读回和失联后的宿主恢复。此前的真实文档证据有独立的构建版本。 [批次组合验收](D:/Document/code/huhu/.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/program.md#组合验收) · [此前 Windows 文档回归](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/evidence/S1a-03-quit-coalescing.md)
- 按记录的确认范围完成实际 Windows 菜单和窗口入口。S3-01 需要标题栏 S2-01 与退出契约。#10 W04-07 需要草稿会话 W04-01，并接入真实退出参与者验证保存、放弃、继续编辑和失败保留。对应原型反馈及组合联验由各场景记录。 [产品菜单 S3-01](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/tasks/S3-01-product-menu.md) · [看板离场 W04-07](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W04-07-leave-draft.md) · [原型确认](D:/Document/code/huhu/.agents/dev/changes/2026-11-19-issue-3-desktop-shell/prototype-review.md:31)

## 冻结与验证范围

- 候选 `f49df4a354ef1458cac543063c618980c123cc0c`，树 `151161f5eb7f009d30f9a8df0c862099f0dbf6b4`，直接父提交 `2758912ebf27656a5d2eb2a5e3f0917063674f38`，树 `b92b257517d5e517e3410c98d22088ccd720be56`。候选三个增量文件逐一核对归档 Git blob。直接父提交的 Main 和 Supervisor blob 等于上轮 `063e97d3d1f620de4b17f4e36b9167e6f837c8e1` 的相应文件。 [快照核验](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/snapshot.log)
- Windows、Node 24.21.0、Vitest 3.2.7、TypeScript 5.9.3。运行的 Electron 为 **44.9.1**，Chromium 为 **152.0.7977.167**。两个 Git 归档复用同锁依赖，锁文件 blob `8165f3147cf5564a2d36a67959f3afed0d697f95`。隐藏的真实 BrowserWindow 与退出事件在独立用户目录运行，进程回执、计时器、参与者响应和 Vault 资料由夹具控制。对换库只执行真实 Main 代码并回报合成端点。评审范围限停止代次和 Engine 所有权。 [原生探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/probe-native.cjs) · [验证脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/run-targeted.ps1) · [类型脚本](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/run-types.ps1)
- 本轮已完成且无需复用的 13 个命令 pane 均已关闭。 [Core 清理日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t4x-r06-c6e957ec9fd1/logs/core-cleanup.log)

## Lead 验收

由 Lead 追加。
