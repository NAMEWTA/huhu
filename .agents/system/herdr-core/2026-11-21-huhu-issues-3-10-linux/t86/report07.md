# 原生批准终端的取消恢复

- worker `t86`，Lead `t3p`。六个候选文件基于 `18aa8c6b` 的 Agent/Automations 相关代码。验证结束时 integration HEAD 为 `cce683a0`，期间 Lead 的提交与这六个路径无重叠。候选未提交，报告发布后冻结。 [任务](task07.md) · [定向独审](../t9b/report02.md)

## 修复

- **Agent 落盘后，Automations 可按原请求恢复取消。** 新增 Engine 私有的 `agentProtectedTerminal.readApprovedShellCancellation(requestId)`。它只读原请求的本地索引和会话凭证，返回经过核对的 `{ requestId, sessionId, cleanupRequired }` 或 `null`。读取独立于 helper 能力和 Core。Automations 仅对本机所有、已受理的外部批准原运行查证。确认取消后按原请求和原 session ID 写入 `cancelled` 与必要的清理待办。私有查询暂不可用时保留待核对状态，避免把公开列表里的 `failed` 会话当作终局。普通会话列表仍隐藏私有回执。 [Agent 接线](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts:734) · [恢复对账](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:900)
- **helper 文件核验期间取消可证明尚未提交。** 已验证批准启动输入后，`pinHelper()` 等待原请求的中止信号。仅在该信号实际触发且原请求没有在途或已发送尝试时，写入原请求的取消凭证。首次在这个窗口取消只写同 Vault、机器及意图绑定的请求索引，`sessionId` 为 `null`，无宿主清理。迟到的核验结果无法再启动。相同请求重投读原取消，改动命令后使用同键得到幂等冲突。单独由 helper 抛出的 `AbortError` 沿原错误处理。 [预检取消凭证](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts:546)

## 受控验证

- 修复前的有效红灯两项使用真实 Agent 和 Automations 服务。helper 用例卡住 `pinHelper`，解除后原运行得到 `unknown`。跨落盘用例让 Agent 创建外层宿主、执行取消并保存私有回执，再注入 Automations 写入失败。重开后旧代码把该运行写成有结束时间的失败。两处都由实际服务生成回执。日志 `/tmp/huhu-t86-task07-red.log`。 [跨模块回归](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/automations/test/service.test.ts:455)
- 最终 Automations `service.test.ts` **44/44**。用例核对私有查证离线时未完成、恢复后原 run/session 为已取消、同意图重投、原宿主清理先失败再重试。跨落盘路径只有一个外层 Core 宿主且零私有帧，helper 预检路径没有会话、Core 调用或清理调用。日志 `/tmp/huhu-t86-task07-automations.log`。
- 最终 Agent `sessions.test.ts` **49 通过、5 跳过**，过滤真实 Core/端点测试。新增断言覆盖重开后的无会话凭证、拒绝重放、隔离不同输入和普通 `AbortError`。日志 `/tmp/huhu-t86-task07-agent.log`。两个单文件使用 Node 26.11.1。六个修改文件的 `oxfmt --check` 及 `git diff --check` 通过。 [Agent 回归](/home/wta/projects/huhu/temp/issue-worktrees/integration/plugins/agent-cli/test/sessions.test.ts:318)

## 未运行的验证

- 本轮未运行定向 tsc、真实 Core/helper、CLI/MCP、Go、E2E、打包或全仓门禁。t9g 的真实短断恢复和命令只执行一次断言保持原样，t9g 的通过结果属于 `18aa8c6b`。完整进程强杀用受控写失败和服务重新构造模拟。 [Lead 原实程日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/native-cancel-recheck.log)
- 本轮没有改 Mail、native/provider、SSH、公开契约包、TypeScript 目标或真实 CLI 测试。

## Lead验收
f13d4c78定向类型、54会话、44自动化与2真实CLI/MCP通过，t9b/report05确认两路径关闭。实现与独审签收；最终组合门禁和GUI/包验收仍待完成。
