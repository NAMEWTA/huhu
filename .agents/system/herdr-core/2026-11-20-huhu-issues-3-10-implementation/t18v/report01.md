# task01.md · #5 T7.1 定时终端原计划点恢复

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report01.md
- 执行结果 — done
- 模型 — Core 启动参数为 gpt-6.2-sol / high / fast
- 工区 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — impl/huhu-issues-3-10-production-cutover
- 基线 — 311ba0c82839f627018695f8651541c8ff63ad71
- 提交 — 7aafa47b17e4ead727f6a41b1f6c7c82a2243f3a

## 结论

定时终端先持久化唯一的 automation-run，Activations 从该运行投影。首次运行文件写入失败时，调度器依现有宽限补交最近的合格计划点，使用同一预留 ID。重开后，归属及原规则版本、Space 和受保护配置摘要相符且有明确未提交记录时，继续原运行。提交边界落盘后只核对原 requestId 和已有的 sessionId。查不到原请求时显示待核对，查到后更新原运行。

旧日志只有孤立发生时，当前终端规则的原计划点显示待核对。其他 Vault 的未完成记录以待核对显示，隐藏其会话入口并保留原文件。

## 产物与改动

提交包含 Automations 服务、对应测试、兼容旧记录的可选 automation-run 字段和切片证据。提交父对象为任务基线，工作树干净。默认 pnpm 包装器启动时曾补写根锁，已恢复并核对与基线一致。验证使用固定 pnpm 12.10.1 的本机可执行文件和离线模式。

[切片证据](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T7.1-terminal-occurrence-recovery.md) · [回归用例](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/plugins/automations/test/service.test.ts)

## 验证

| 验收要求 | 实际检查与结果 |
| --- | --- |
| 运行文件持久写入前 | 修复前定向测试失败，重开后只读到孤立 activation。修复后启用后的第一个槽由 Scheduler 补交，预留 ID 稳定，只有一个运行和一次启动。 |
| 已落盘且能证明未提交 | 提交标记写入前注入中断，重开继续原运行、发生和 requestId。规则修改、停用、Space 修订和受保护环境修订均保留原运行待核对。 |
| Core 提交确认缺失 | 覆盖标记已写但调用尚未送出、终端已创建而 sessionId 未写回、包装后的受保护启动错误和连接断开。中断后只有原请求查询，连接恢复时只认领原会话。 |
| 同槽、历史、归属 | 同服务并发和同进程双仓储实例共用一个运行。旧日志完整行和尾部半行保留原字节；有匹配旧运行时继续读出其结果。不同归属且有匹配会话的记录保持原字节和待核对。 |
| Windows 回归 | 固定 pnpm 12.10.1、Vitest 3.2.7。Automations 与 Windows 本机保护 70 项通过，包含真实 Core 0.1.19 的受保护启动回归；Engine 定向回归 3 项通过，46 项由测试名过滤。Contracts 和 Automations 的 TypeScript、改动源码 lint 与格式检查通过。 |

## 阻碍与接续

本任务无阻碍。定时故障探针在真实临时 Vault 文件上注入写入或确认中断并重建服务；真实 Core 回归从既有手动入口验证受保护启动。本次覆盖引擎和本机 Core，安装包层的 T7.1 联验由集成候选承接。

## Lead 验收

由 Lead 追加。
