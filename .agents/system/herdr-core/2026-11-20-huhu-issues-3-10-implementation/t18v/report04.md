# task04.md · 批准规则的四项审查修复

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task04.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task04.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report04.md
- 执行结果 — done
- 模型 — gpt-6.2-sol / high / fast
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — impl/huhu-issues-3-10-production-cutover
- 审查候选 — 69776e6887fb8ff75f4992f81445ebc8f15fa959
- 实施基线 — 815d9917b2a32f246725343fd633040fe39b7acf
- P1 提交 — 9198c3497285182f7a2efb26a9a2c4d0e8442f4d
- P2 提交 — 3f479b899d67000d26ba95f0f069a39aa86569df

## 结论

P1 单独验证及提交后，再实施三个 P2。启用检查读取配置事务中当前规则动作，使用同一版本提交。已认证调用方经原权限判据检查，暂停仍获允许。

P2 分别在受保护启动的 Core 接受前和 helper 启动子进程前核对批准目录，在凭据定义成功发布时原子变更名称代次，并在保存退出结果时记录受保护终端尚待释放。恢复时沿原 Vault、原请求、原会话和原 Core 进程绑定核对释放。成功写回释放状态保留原退出结果与正文。

## 产物与验证

| 验收要求 | 观察结果 |
| --- | --- |
| P1 事务顺序与权限 | 真实 HTTP 的受控提醒编辑／启用交错在原基线看到 1 次入队前读取。修复后为 0，提交引用刚完成编辑的版本。真实 HTTP 也通过外部终端与 Agent 启用拒绝、提醒启用和原暂停行为。P1 定向 2 项通过，最终 HEAD 复跑仍通过。 |
| P2 工作目录 | 目录路径、设备／inode 身份及出生时间随私有票据交给 helper。Core 就绪前的合成触点由会话服务拒绝，实际 Windows helper 用继承目录核对后拒绝失配。真实 CLI 与 Core 的正常批准运行报告与批准目录相同的 PowerShell 当前目录。 |
| P2 变量改名事务 | 真实 Engine 的凭据定义发布故障保留原修订、原批准 ID 及可用状态。成功改名后失效，改回原名字仍须重批。包内 CLI/MCP 的原值轮换路径通过。 |
| P2 释放重开 | 真实 Core 释放暂不可用时，成功结果、输出与待释放标记同时存在。重开仅释放原会话；人为丢弃实际移除回包后，同一 Core 快照确认已移除。启动和成功移除各一次，结果与正文一致。模拟外来 Vault、结束的作用域及错误请求 ID 的拦截用例通过。 |
| Windows 门禁 | 固定 pnpm 12.10.1、Vitest 3.2.7 及随包 Herdr Core 0.1.19。Automations、Agent 启动对账、helper、本机保护和真实 CLI/MCP 组合 92 项通过。相关五包 TypeScript、改动源码 lint、格式及 Git 差异检查通过。 |

[独立审查](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report04.md) · [验收与复跑入口](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/E07-approval-transaction-recovery.md)

## 阻碍与接续

四项均已交付。当前 Core 身份或原绑定无法确认时保留待释放标记。历史失败若原记录缺标记，无法按退出结果补推清理义务。Windows 强制停止、超时后整棵子进程树及安装包组合联验仍待单独实机取证。工作树干净，t18v 保留。

## Lead 验收

由 Lead 追加。
