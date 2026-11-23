# 原取消两条路径收尾复核

- Core 与任务 — `wta-ubuntu`，Lead `t3p`，执行者 `t9b`，清单指针 `t9b/task05.md`。 [任务](task05.md) · [清单](../manifest.tsv)
- 执行结果 — `done`。固定目标 `f13d4c7893af0974b5ec569afec53284236b17ba`，基准为父提交 `cce683a02b56ac101cba6ca5483a48381d62e874`。复核两条原取消路径及相关证据，业务和测试文件保持原样。

## 规格轴

- **Agent 已保存取消，Automations 未保存后重开 — 关闭。** Agent 以原 request ID 查本机 Vault、机器和原会话凭证。Automations 恢复对账先查私有取消回执，再处理公开会话状态。查证暂不可用时，公开会话的 `failed` 保持待核对。确认取消后，以原 request、run 和 session 保存 `cancelled`，并按原宿主继续清理。新用例使用真实 `SessionsService` 与 `AutomationsService`，在 Agent 落盘后注入 Automations 写失败，再重建服务。用例核实查询恢复、同意图重投、清理失败再试，以及一次 `terminal.run` 和零私有帧。重建后的 Agent 查证成功时未配置 helper。 [原发现](report02.md#规格轴) · [私有查证](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L924) · [恢复对账](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L899) · [用例](../../../../../temp/issue-worktrees/integration/plugins/automations/test/service.test.ts#L455)
- **等待 `pinHelper()` 时取消，尚无会话或 Core 请求 — 关闭。** 在核验仍被阻塞时，原请求的中止信号使调用结算。Agent 持久保留同一请求及意图，回执为 `sessionId: null`、`cleanupRequired: false`。Automations 保存原 run 为 `cancelled`。核验迟到时原调用已经退出，零会话、零 Core 调用、零私有帧、零清理；同意图重投读原取消，改变命令重用请求键得到 `IDEMPOTENCY_MISMATCH`。helper 自己抛出的普通 `AbortError` 保留原错误处理。 [核验等待](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L516) · [原请求索引](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L546) · [无会话取消的回归](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/test/sessions.test.ts#L318) · [Automations 接收原回执](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L607)

## 规范轴

未发现本次差异引入的独立规范问题。取消查证复用原请求索引和启动回执，私有服务返回核对后的取消摘要，通用会话列表仍移除启动回执。查证入口独立注册，helper 可用性只控制批准启动的 getter。对账和清理沿用原 owner、intent 和 session 约束。固定六文件差异通过 `git diff --check cce683a0 f13d4c78`。 [私有服务与启动 getter](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L733) · [公开列表映射](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts#L419) · [结算与清理](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L764)

## 验证与未验证范围

- t86 红灯证实旧版的 helper 窗口得到 `unknown`，跨落盘窗口重开被提前结算。t9v 的固定 SHA 日志记录三模块定向 TypeScript 检查、Agent 54/54、Automations 44/44、真实 CLI/MCP 2/2。真实 CLI/MCP 验证原启动恢复与一次执行。两处取消窗口由故障注入和真实服务实例验证。 [红灯日志](/tmp/huhu-t86-task07-red.log:54) · [实施报告](../t86/report07.md) · [t9v 日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/cancel-recovery-check.log:1)
- 本轮独立复核限固定代码、差异检查和日志。真实整进程强制中断、Desktop/Web E2E、构建打包和全仓门禁未运行。

## Lead验收
f13d4c78定向类型、54会话、44自动化与2真实CLI/MCP通过，t9b/report05确认两路径关闭。实现与独审签收；最终组合门禁和GUI/包验收仍待完成。
