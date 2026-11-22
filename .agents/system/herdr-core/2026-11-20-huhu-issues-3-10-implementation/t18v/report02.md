# task02.md · #5 E07 终端规则的本机批准和凭据修订

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report02.md
- 执行结果 — done
- 模型 — gpt-6.2-sol / high / fast
- 工作区 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — impl/huhu-issues-3-10-production-cutover
- 基线 — 7aafa47b17e4ead727f6a41b1f6c7c82a2243f3a
- 提交 — 69776e6887fb8ff75f4992f81445ebc8f15fa959

## 结论

Windows 桌面可以核对并批准一条 PowerShell 规则的实际命令、工作目录和明确变量名。三个能力分别由 #6 工具设置开放，领域调用还要满足本机 Vault、具体规则和批准代次。首批可写名字限 HUHU_RULE_SECRET_ 命名空间。经认证的 CLI 与 MCP 可读遮蔽状态、按规则和环境版本替换或清除值，并用稳定 UUID 意图手动运行。批准保存在应用私有目录。规则文件、Space 路径或修订、名称变化使旧批准失效。

新意图以 automation-run 保留运行、发生和原 requestId。提交边界落盘后保留原请求的对账语义。同键重交返回原运行，输入或来源不匹配拒绝，撤权后重新检查权限。外部回应只提供运行身份、状态和时间。

按补充要求，工作台手工、定时和授权外部运行都核对 ModuleCredentials 同一次 lease 捕获的环境修订。沿用现有回调并传入已有 pinned revision，凭据发布使用可选的提交前校验。定时已提交记录继续按原请求对账。Automations 插件内启动装配只传递预留修订。

## 产物与验证

| 验收 | 实际结果 |
| --- | --- |
| 真实 CLI 和 MCP HTTP／stdio | 默认关闭、逐能力开放、未批规则拒绝、原命令和 Space 变化、变量名变化、旧版本写入、同意图并发、跨来源和异版本不匹配、两级撤权均通过。CLI 回包和 Core 确认丢失后，同一意图保持原 runId，状态由待核对变为成功。MCP HTTP 的意图可从同一 MCP 身份的 stdio 读回。 |
| 本机保护和 Vault | CLI 从请求文件读入合成值，测试进程 argv 不含值。MCP 完成轮换，CLI 清除后新意图拒绝启动。Core 请求、网关审计、运行正文及 ZIP 恢复文件检查通过。原 Vault 重开读取旧结果，恢复 Vault 拒绝沿用旧批准。 |
| 独立审查的环境修订竞态 | 在外层校验之后、凭据 lease 捕获之前，用真实 Windows 保护层提交同目标的新修订。工作台手工与定时旧运行均未启动，定时重交和对账仍未启动。随后显式新手工运行成功。 |
| Windows 门禁 | 固定 pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7、Core 0.1.19。组合回归单独复跑 101 项通过，Engine 定向回归 4 项通过，按名称过滤 45 项。准确提交的桌面构建和 Electron 端到端 1 项通过。相关五包 TypeScript、定向 lint、lint 规则探针、格式检查与 Git 差异检查通过。并行复跑曾遇 Vitest IPC 通道关闭，隔离复跑完成。 |

[可复跑证据](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/E07-approved-terminal.md) · [竞态审查来源](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report03.md) · [CLI/MCP 回归](D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/cli/test/approved-terminal.test.ts)

## 阻碍与接续

本次首批路径无阻碍。通用 huhu call 仍只有 --input-json。请求文件用于真实 CLI 回归的测试入口，通用 CLI 的安全输入选项留在 CLI 后续切片。G5b.2 的草稿创建与编辑、外部定时用途许可、停用和删除的版本化队列验收及独立取消，以及 G3.3 的通用保护写入意图回执仍待后续。安装包联验由集成候选承接。

## Lead 验收

由 Lead 追加。
