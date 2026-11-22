# #5 T2.2 与 #8 批次 ZIP 生产入口组合复核

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t161`
- task — `task03.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/task03.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/report03.md`
- 执行结果 — **done**

## 结论

冻结集成 `891c20e1c747534fa62634f7f107efcc89da7374` 的 Tasks 桌面停止与桌面 ZIP 导出均通过独立组合复核。Windows 定向复跑 2 个文件、4 项通过，未发现阻挡本轮生产入口验收的问题。 [复跑日志](evidence-task03/stop-zip.log)

## 冻结对象与实际入口

- `33e2d230976de268ffb492fe8025f1456b54de9e` 的 Tasks 停止补丁在集成历史中对应 `891c20e`。两者的稳定补丁指纹均为 `c6cfde6ddb3fbb975f67659b8f338f36f8140707`。`fbb5641f9d76cdb6c3eaec39a6c74e2546c39bd3` 是冻结提交的祖先，Engine、Kernel 和插件相关差异的 Git 空白检查通过。 [静态证据](evidence-task03/static.log)
- **Tasks。** 桌面工作台经真实 Engine HTTP 调用 `tasks.dispatch.stop` 和 `tasks.dispatch.stop.read`。Tasks 按原 taskId、dispatchId、runId 和 stopId 持久记账，走 `packages/kernel/src/permissions.ts:22` 的实际 `agent.task-input` 授权调用两个 Agent 私有能力。冻结测试使用生产授权表，夹具替换范围是合成 App Server、隔离的历史目录和可控的时序。
- **Mail。** 桌面工作台经同一入口族调用 `vault.exportPackage`。`apps/engine/src/boot.ts:153` 按当前 Engine 查找 Mail 服务，`packages/kernel/src/capabilities/package.ts:69` 将导出库的完整调用交给该服务的 `withSnapshot`，把信号传到枚举和读取路径。现有测试在真实 `withSnapshot` 已取得队列后暂停回调，以安排同 Engine 的移除与回收竞态。Web 工作台请求走生产 Dispatcher 的 `desktopOnly` 检查。

## 独立 Windows 结果

| 验收 | 实测 |
| --- | --- |
| 桌面停止、待核实与 Engine 重开 | `tasks.dispatch.stop` 先返回 `pending`。原生中断已发送但原轮无终态时，`tasks.dispatch.stop.read` 返回 `unknown`。关闭 Engine 后让合成 App Server 发布原轮 `interrupted`，重开查回 `stopped`，重提同一意图也返回 `stopped`。原 thread／turn 只收到一次中断。原 run 投影为 `cancelled`，任务仍为 `in_progress`。 |
| 原绑定与替代 shell | 原绑定首次只读检查为 `not_sent`。失去输入权时无意图、零中断。RPC 回包和异轮终态保持 `unknown`。自然终态按 `completed` 对账。Core 重启导致同地址新 shell 后，已发无终态仍为 `unknown`，失效新停止为 `stale`，替代 shell 零中断。 |
| 桌面 ZIP 与工作台边界 | `web:fixture` 调用 `vault.exportPackage` 得 `PERMISSION_DENIED`。桌面请求进入 Mail 快照队列，排队的附件移除和回收在导出后完成。桌面响应的 ZIP SHA-256 与实际文件一致。以 `includeAttachments: false` 导出仍保留 Vault 管理的 Mail 对象。恢复到独立 Vault 后，只读 Engine 读回导出时的草稿修订、同摘要引用和同一 Buffer。 |
| 附件回归 | 同草稿和跨草稿去重、原源文件离开后重开、最后引用回收、缺失及损坏、复制中断和条件写均由现有 Mail 夹具断言通过。 |

本轮验收范围是同一可写 Engine 的生产 HTTP 能力、工作台 Dispatcher 以及固定 Core 下的合成提供方。桌面界面实际操作、真实提供方与跨 Engine 并行导出未在本轮运行。快照队列属于创建该 Mail 服务的 Engine。 [T2.2 范围](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T2.2-inspect-stop.md) · [附件范围](../../../../dev/changes/2026-11-19-issue-8-mail-module/tasks/S1b.2-managed-attachments.md)

## 取证与清理

从冻结提交归档至 Windows 系统临时目录，复用同提交的本地已安装依赖，工作区依赖指向归档。两个测试文件、合成服务、控制 helper 和生产接线文件均比对 Git blob。Windows x64、Node v24.21.0、Vitest 3.2.7 单 worker 运行。固定 Core 0.1.19 的 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。 [复跑脚本](verify-stop-zip.ps1) · [归档与断言](evidence-task03/stop-zip.log)

Vitest 和验证窗格均退出 0，日志确认隔离 Core 已停止、夹具目录归零。解除依赖联接后将一次性源码快照移入回收站，已核实原临时路径不存在。验证窗格 `t16x` 已关闭。Lead 可关闭或复用 `t161`。 [窗格退出](evidence-task03/pane-exit.log) · [清理日志](evidence-task03/cleanup.log)
