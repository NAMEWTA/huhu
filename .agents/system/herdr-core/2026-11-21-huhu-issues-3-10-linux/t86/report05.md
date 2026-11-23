# 原生恢复的前台取消与交付前复核

- worker `t86`，Lead `t3p`。任务基线 `dbe58665`。工作树当前 HEAD 为 `cf8d1bce`，两者之间只有 Lead 的项目进展文档改动。六个授权文件中的候选改动未提交，交付后冻结。 [任务](task05.md) · [独审](../t93/report02.md)

## 两处 P2

1. **前台取消保留原请求和原会话。** Core 连接、`hello` 或 broker 就绪被阻塞时，取消可立即写入原会话的未交付凭证。会话落为 `failed` 且无 attempt，按原请求重投会得到相同会话的取消结果，Space 中无阻挡删除的会话状态。若 Core 已创建外层宿主但凭据尚未放行，前台和延期路径共用取消结算，保留原 attempt 及宿主清理待办。Automations 核对取消回执的请求归属后，一次写入 `cancelled`、原 session ID 和必要的清理待办。前台回执直接返 `cancelled`。释放失败可以重开后重试。共享契约沿用现有会话状态，取消证明保存在 Agent 的私有启动回执。 [Agent 取消凭证](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts:863) · [Automations 结算](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:600)
2. **进入凭据 lease 后重新核验。** 私有帧写入前重新读取宿主进程的创建标识、原 Core 身份和当前唯一候选，并比对标签、argv、cwd 与原绑定。重新核验后再同步复核原主体、工具和批准状态。无法确认原宿主时，该 attempt 以未交付失败结算，保留清理待办。取消或 broker 到期会结束核验等待并释放 lease，迟到的只读结果无法继续写帧。只保留原 `terminal.run` 和一次性私有交付。t97 的真实 CLI/MCP 原运行最终成功和命令只执行一次断言原样保留。 [交付前核验](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts:900) · [私有授权复核](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:555) · [真实 CLI/MCP 用例](/home/wta/projects/huhu/temp/issue-worktrees/integration/apps/cli/test/approved-terminal.test.ts:190)

## 定向验证

- 先运行新受控测试。Agent 8 项复现失败，覆盖三处前台等待、凭据放行和四种候选变化。Automations 两项前台取消均复现初次回执为 `unknown`。日志为 `/tmp/huhu-t86-task05-agent-red.log` 和 `/tmp/huhu-t86-task05-automations-red.log`。
- Agent `sessions.test.ts` 用 `-t '^(?!.*(?:HerdrCore\.peek|真实 Herdr Core))'` 跑出 **47 通过、5 跳过**。覆盖重开后的原请求和失败会话、Space 占用条件及实际 `SpaceStore.delete`、凭据放行前取消及外层宿主释放、Core 换代、候选歧义与消失、绑定及 PID 创建标识变化、核验中取消或到期后 lease 清空，以及零私有帧。 [Agent 回归](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/test/sessions.test.ts:296)
- Automations `service.test.ts` **42/42 通过**，覆盖前台和延期取消、同一请求重投、取消后重开、清理失败落盘后重试及未提交时无清理调用。两个单文件使用当前 worker 的 Node 26.11.1。六个修改文件的 `oxfmt --check` 和 `git diff --check` 通过。 [Automations 回归](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/test/service.test.ts:315)

## 未验证

- 第一次较宽筛选带入一项真实 Herdr Core 测试，启动状态为 `unavailable`，该项失败，未重试真实环境。最终 47 通过的命令排除了真实 Core 测试。日志 `/tmp/huhu-t86-task05-agent-green.log` 记录该次失败。t97 的既有实程结果属于改动前基线。
- 本轮未运行定向 tsc、真实 Core 与 CLI/MCP 验收、Go、Playwright、打包、Windows 实程或全仓验证。Lead 可先复跑定向类型与原有真实 CLI/MCP 用例。重开回归验证了两条记录已持久化后的恢复。独立进程在 Agent 和 Automations 两次落盘之间被强杀的窗口未做故障注入。
- Mail、native helper、`native-pty.ts`、`interactive-environment.ts`、`index.ts`、公共契约和真实 CLI 测试均保持原样。没有扩大 TypeScript 库目标。

## Lead定向验证
候选保存18aa8c6b。Node24.21.0，t9g三模块typecheck、Agent52/52、Automations42/42及真实CLI/MCP2/2通过；日志temp/issue-evidence/huhu-2026-11-22/native-cancel-recheck.log。待t9b/task02独立复核；不代表最终包验收。
