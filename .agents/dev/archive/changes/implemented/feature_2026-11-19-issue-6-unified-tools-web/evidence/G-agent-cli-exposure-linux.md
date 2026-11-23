# Agent CLI 与 Tasks 目标快照的 Linux 开放验证

基线为 `d7581825`。本组使用 t19 任务报告第 136–217 行的 Agent CLI 裁决，以及第 230 行的 `tasks.dispatch.targets` 裁决。验收使用隔离 Vault、独立 HTTP MCP 令牌及 Core 运行目录。测试中的 Pi 历史、命令、凭据状态、Git 仓库与终端内容由夹具生成。

## 外部选择与对象约束

- 40 个 Agent CLI 用户动作可单独开放，初始均为关闭。Tasks 的目标列表也可单独开放。原有 7 个 Tasks→Agent 委托和 Automations 终端清理继续走可信插件身份。
- `agent.catalog.detect` 保留工作台 read 调用。改成 execute 后 Dispatcher 会先检查幂等键，现有 Agent、Tasks、Automations 工作台查询均未传该键。代码范围之外的调用方须随该项调整。
- 外部目标列举按本机 Vault 与 Space 读取磁盘中的会话和可执行文件。已有会话缺少实时核验时，返回 `available: false`。工作台目标选择和派遣准备继续走实时资格核验。
- 外部读取会话、历史、设置、环境和工作区文件不执行对账写入。热路径需要实时观察原终端或布局时，仅复用 Engine 已建立的本地 Core 连接。外部环境列表仅读本地记录，受到 OS 保护的键给出待核实状态。
- Git 变更、worktree 列表及受保护启动预览使用工作台已读取的快照。Git 快照绑定 Space 版本和目录身份并带观察时间。缺少可核实快照时明确返回不可用。保护启动预览隐藏批准值和用户参数，实际启动核对既有工作台批准。
- Space 新绑定及 worktree 新目录限 Vault 内授权路径。会话操作核对 Space、会话版本或进程代次。关闭分栏并结束进程还需要开放 `agent.sessions.kill`。Core 重启核对持久 Core 标识与当代 PID。
- 原生启动沿用按逻辑主体限定的 `requestId` 及领域回执。其他无独立操作标识的写入使用 Dispatcher 的稳定意图键。外部设置、环境与评审写入返回安全投影。未知启动只核对原绑定，恢复后的 HTTP MCP 领域重交返回 unknown，再通过 `agent.sessions.list` 读回指定会话。

## 可复跑的验证

| 验证范围 | 结果与证据 |
| --- | --- |
| Agent CLI 默认关闭、逐 ID 开放、原连接撤权后拒绝、内部工具批量不可选 | 两个真实入口使用 `plugins/agent-cli/test/tool-exposure.test.ts`，逐项断言目录、调用、版本、期望副作用及禁用。受保护启动 Linux 取证为工作台预览夹具及错误批准拒绝。 |
| Tasks 无拨号目标和原 Tasks/Automations 矩阵 | `plugins/tasks/test/persistence-http.test.ts`、`plugins/automations/test/task-scan-occurrences.test.ts`，CLI 和 HTTP MCP 各验证冷、热、拒绝、撤销。热夹具保存一个标记为 running 的会话，读取后字节一致。进程、Core ensure/peek、连接、RPC、实时会话核验、Vault 写入计数为零。`/tmp/huhu-t28-task-retest.log`。 |
| 同键并发、丢 Core 回包、进程与文件对象绑定、恢复逻辑会话 | Agent 双入口矩阵检查同键重交与异参冲突、丢回包后的原会话、Core 代次、指定版本、只读重查、持久回执重放。通用 C05 的丢完成回执和单次恢复由 `packages/kernel/test/mcp-recovery.test.ts` 覆盖。`/tmp/huhu-t28-replay.log`。 |
| 随包 Core 0.1.19 真跑原生回执 | `HUHU_AGENT_LAUNCH_TEST_BIN=$PWD/apps/desktop/resources/herdr/linux-x64/herdr-core pnpm exec vitest run plugins/agent-cli/test --maxWorkers=1`。原生 ACK 丢失、CLI/MCP 实际派遣与回复、原生回答单次提交三项通过。Agent 全组 127 通过、1 跳过。`/tmp/huhu-t28-agent-live.log`。 |
| 静态门禁 | 四项通过。最新 Agent 变更另行通过范围类型检查，并复跑 lint、format:check、knip。`/tmp/huhu-t28-typecheck-final.log`、`/tmp/huhu-t28-lint.log`、`/tmp/huhu-t28-format.log`、`/tmp/huhu-t28-knip.log`。 |
| 全量 | 1802 通过、19 跳过。业务代码一致，后加的回放断言由定向矩阵复跑。`flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`，`/tmp/huhu-t28-full.log`。 |

## 装配

`apps/engine/src/boot.ts` 的 Agent CLI 静态声明替换为 `registry.declareDescriptors("agent-cli", agentCli.agentToolDescriptors)`。同一 descriptor 实例由 `agentCli.apply`、`registerAgentEnvironments`、`registerWorkspaceFiles`、`registerWorkspaceLayout`、`registerWorkspaceWorktrees` bind。清单补入 `agent.history.locate` 与 `agent.history.workspaceLaunch`。Tasks 的现有 `taskToolDescriptors.dispatchTargets` 静态声明和 bind 一并复用。
