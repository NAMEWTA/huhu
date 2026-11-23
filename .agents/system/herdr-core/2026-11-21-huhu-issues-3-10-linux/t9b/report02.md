# 原生取消修复定向复核

- Core 与任务 — `wta-ubuntu`，Lead `t3p`，执行者 `t9b`，清单指针 `t9b/task02.md`。 [任务](task02.md) · [清单](../manifest.tsv)
- 执行结果 — `done`。固定基准 `6874c619146f363a798dd4ff95cfb66686de1c2d`，目标 `18aa8c6bc1cb32916de2022e82c4d60f53a699a1`。复核限六个变更文件和直接调用路径。Agent、Automations 的相关工作树与目标一致。本次交付为同目录报告。

## 规格轴

### 原第一项 P2 · 前台及延期取消

**原三处等待与在线结算已修复，跨重开仍有取消事实丢失路径。** 取消时 Core 连接、hello 或 broker 就绪仍被阻塞，原会话立即落为 `failed`，记录未交付取消，保留原 request/session ID，无 attempt。重开后原请求返回原取消回执，Space 可删除，`terminal.run` 与私有帧计数均为零。已创建外层宿主而仍等凭据时，前台及延期回执共用 Automations 的取消结算。前台立即返回 `cancelled`，延期完成后保存同一 run 和 session。宿主清理失败可保留待办，重开后按原请求重试。 [原两项](../t93/report02.md#规格轴) · [Agent 三处等待与 Space 断言](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/test/sessions.test.ts#L317) · [前台清理用例](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/test/sessions.test.ts#L344) · [Automations 测试](../../../../../temp/issue-worktrees/integration/plugins/automations/test/service.test.ts#L386)

**P2 · Agent 证实取消后，Automations 重开可将同一运行结算为失败。** 输入为原生 sh 规则已经提交，Agent 在等待凭据时收到取消，已把原 session 的 `nativeCancelledBeforeStart` 和原宿主清理待办写入磁盘。让 Automations 的取消状态写入失败一次，或在这次写入前关闭，再重开同一 Vault。预期沿原 request 得到 `cancelled`，并按原 session 继续清理。实际重开对账经 `agent.sessions.list` 取得 `failed` 会话，列表已移除私有启动回执。对账以新取消信号进入 `settleTerminalRun`，把原运行持久结算为 `failed`。同意图重投随后直接读取该状态。现有重开用例在 Automations 已成功写入 `cancelled` 后重开。该缺口由读写链路核实，未运行跨落盘故障复现。 [Agent 写取消回执](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L846) · [关闭时跳过结算](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L600) · [列表去除回执](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L52) · [重开对账](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L887) · [状态归类](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L799) · [同意图重投](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L552)

**同一启动路径的前置取消缺口 · 受理后核验 helper 期间取消会留下 `unknown`。** 让已受理的规则停在 `pinHelper()` 的异步文件核验，调用 `cancelRun`，再放行核验。此时仍未创建 Agent 会话或提交 Core 请求。Agent 在准备阶段末尾抛出普通取消，Automations 已设置 `submitted=true`，因缺带原请求的取消回执，保存 `unknown`。重开后按请求找不到任何会话，重投仍读取同一条 `unknown`。预期将可确认未提交的原运行结算为 `cancelled`。本条依据代码，现有测试名为 `preflight-cancel` 的场景模拟的是 Agent 已存在失败会话并返回结构化回执的路径。 [异步核验](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L496) · [取消检查在会话创建前](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L419) · [Automations 提交判断](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts#L615) · [模拟前置取消的边界](../../../../../temp/issue-worktrees/integration/plugins/automations/test/service.test.ts#L338)

### 原第二项 P2 · 实际交付前的原 Core 与宿主核验

**关闭。** 凭据 lease 内重新读取进程创建标识，再只读查询原 Core 身份和唯一的 live 宿主。匹配使用原 launch 标签、argv、cwd 及终端地址、创建时间和 PID，随后同步复核原授权与取消信号，持久记录 `delivering` 后才写私有帧。核对实现及用例覆盖等待凭据时 Core 换代、候选缺失或重复、PID 变化或复用。lease 内核验被取消或到期会结束等待，迟到结果不触发交付，凭据 Map 清空。成功短断路径仍保留一次 `terminal.run`、原 attempt 和一次私有交付。Lead 的真实用例核对了短断解除前命令计数为零，恢复、重投和重开后为一。 [交付复核](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L899) · [原宿主匹配](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L833) · [迟到与单次交付用例](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/test/sessions.test.ts#L374) · [真实 CLI/MCP 断言](../../../../../temp/issue-worktrees/integration/apps/cli/test/approved-terminal.test.ts#L190)

## 规范轴

固定差异内未见独立项目规范违规。改动复用原私有启动服务、逐请求回执、规则配置队列、一次性凭据 lease 和原请求宿主清理。取消证据保存在 Agent 的内部回执，未放入通用会话列表。跨模块重开恢复中的缺口见规格轴。 [项目规范](../../../../../temp/issue-worktrees/integration/AGENTS.md) · [W7.3](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W7.3-agent-settings.md) · [授权与 lease](../../../../../temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts#L508) · [原宿主清理](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts#L1370)

## 验证

- 独立用 Node 24.21.0 运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/automations/test/service.test.ts -t 'Linux 原运行等待宿主时' --maxWorkers=1`，8 项通过，34 项由过滤跳过。固定差异的 `git diff --check 6874c619 18aa8c6b` 通过。
- Lead 在同一完整 SHA 上验证三模块类型检查、Agent 52/52、Automations 42/42、真实 CLI/MCP 2/2。真实用例覆盖短断恢复与一次执行，取消的具体时序来自受控测试及上述代码核对。 [实施报告](../t86/report05.md) · [固定候选日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/native-cancel-recheck.log)

## 未运行的验证

本轮未独立实跑真实 Core/helper 或 CLI/MCP，未复跑类型检查、桌面或 Web E2E、Go、构建、打包及全仓门禁。跨模块落盘中断和 helper 文件核验时取消两条路径为代码证据，尚无针对这两个触发时点的运行结果。

## Lead收取
第二P2关闭；第一P2剩余跨模块落盘和helper预检取消路径交t86/task07，要求先做受控复现。
