# t26 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t26
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t26/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t26/report01.md
- 执行结果 — blocked

## 结论

候选开放 14 个原关闭的 Tasks 和 Automations 工具，全部默认关闭。命令行与 HTTP MCP 逐项验证发现、调用和撤权。外部任务补充与停止核对原运行和会话身份，Automations 的取消绑定到具体规则发生及运行。通用 Agent 任务和扫描规则走同域授权，原生回执与本机固定终端批准仍通过原持有者。待 Agent 目标查询提供无拨号快照后才能开放 `tasks.dispatch.targets`。

每个描述符的 `defaultExposed` 均为 `false`。下表的开表示用户可选择开放。测试名缩写见下一节。

| 能力 ID | exposable | scope / risk | 意图 | 归属及结果 | 测试 |
| --- | --- | --- | --- | --- | --- |
| `tasks.receipts.consume` | 关 | write / high | 内部回执 ID | 仅 `plugin:agent-cli` 可以提交可信原生回执。t19 盘点第 227 行 | T、L |
| `tasks.supplement` | 开 | execute / high | `supplementId` | 原 task、run、session 和已认证主体，绑定有效的输入所有权。重查只含 ID 和状态 | T |
| `tasks.supplement.read` | 开 | read / high | 无 | 原 task、run、session、补充 ID 和主体。读取不投递 | T |
| `tasks.dispatch.targets` | 关，待 Agent 配套 | read / normal | 无 | 现有内部目标列表在热路径使用 Core 连接。等无拨号快照接入 | 待双入口 |
| `tasks.dispatch.list` | 开 | read / normal | 无 | 先核对当前 task 和原 Vault 的 run，只返回调用者可见记录 | T |
| `tasks.dispatch.recent` | 开 | read / normal | 无 | 同库、主体及任务可见性在排序截断前生效 | T |
| `tasks.dispatch.stop` | 开 | execute / high | `stopId` | 原任务、派遣、运行和本机执行代次。原生 executor 核对当代输入所有者 | T、L |
| `tasks.dispatch.stop.read` | 开 | read / normal | 无 | 原任务、运行、停止 ID 和主体。读取不发送停止 | T |
| `automations.followUps.get` | 开 | read / normal | 无 | 本 Vault 现有任务及其跟进计划，外部计划按主体核对 | F |
| `automations.followUps.schedule` | 开 | write / normal | `intentId` | 核对 task 版本、现有计划 revision 与未来时刻，计划与意图结果原子落盘 | F |
| `automations.followUps.cancel` | 开 | write / normal | `intentId` | 核对外部主体、原计划 revision 和 scheduled 状态 | F |
| `automations.cancel` | 开 | execute / high | `intentId` | 核对本机 Vault、rule/run/activation 三者关系，调用原 run 的控制器，回执仅含布尔结果 | C |
| `automations.terminal.environment.get` | 开 | read / high | 无 | 已批准、当前目标和变量名，复用遮蔽状态查询 | E |
| `automations.terminal.environment.save` | 开 | admin / high | `intentId` | 固定批准代次、规则版本和配置 revision，只允许更新已批准的变量值 | E |
| `automations.terminal.approval.review` | 开 | read / high | 无 | 核对当前命令、Space、变量名和已有批准 ID，读取不产生批准 | E |
| `automations.terminal.approval.approve` | 关 | admin / high | 无 | 仅本机桌面可批准固定命令、Space 与变量名。t19 盘点第 256 行 | E |
| `automations.terminal.approval.revoke` | 开 | admin / high | `intentId` | 本机批准、原 ID、规则版本以及当前工具授权，撤销后拒绝新使用 | E |

表中 T、F、C、E、L 的完整测试名和运行边界见候选证据。

## 产物与改动

- 工作目录 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-tasks`，候选 `cd9016f517896ab1365c137153855287348bbaed`，父 `5307b88f56fc7919fdcfed8d07311764ec745cad`。候选由临时索引生成，真实索引与分支仍指向基线。
- 证据 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G-tasks-automations-exposure-linux.md`。工作树的 `.agents` 为只读挂载，证据直接加入候选树，业务文件与候选相符。
- Tasks 描述符从 `Object.values(tasks.taskToolDescriptors)` 声明并由 `tasks.apply` 绑定。内部 `tasks.receipts.consume` 由清单声明 owner、按原方式运行时注册，以兼容 live 故障夹具替换 handler。
- Automations 描述符来自 `Object.values(automations.automationToolDescriptors)`、`Object.values(automations.terminalEnvironmentDescriptors)` 和 `Object.values(automations.taskScanToolDescriptors)`，由 `automations.apply` 及其中的同域注册函数绑定。清单补 `automations.followUps.{get,schedule,cancel}`。
- 候选在 `apps/engine/src/boot.ts` 单加一条 `registry.declareDescriptors("automations", Object.values(automations.automationToolDescriptors))`，真实 Engine 测试依赖它。其它描述符使用现有声明位置和生命周期。无 Kernel、共享协议或 Agent 源码改动。

## 验证

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| 最后一次双域类型检查 | 通过 | `/tmp/huhu-g6-t26.aFiNpx/typecheck-scope.log` |
| `pnpm typecheck` | 通过 | `/tmp/huhu-g6-t26.aFiNpx/typecheck.log` |
| `pnpm lint` | 通过 | `/tmp/huhu-g6-t26.aFiNpx/lint.log` |
| `pnpm format:check` | 通过 | `/tmp/huhu-g6-t26.aFiNpx/format.log` |
| `pnpm knip` | 通过 | `/tmp/huhu-g6-t26.aFiNpx/knip.log` |
| 定向 Vitest 与 Core live，`--maxWorkers=1` | 154 通过、3 跳过，3 条随包 Core live 全通过 | `/tmp/huhu-g6-t26.aFiNpx/targeted-final.log` |
| 最后一次 Tasks 和 Automations 双入口矩阵回读 | 59 通过 | `/tmp/huhu-g6-t26.aFiNpx/matrix.log` |
| `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` | 首轮 1688 通过、1 失败、19 跳过。复跑 1689 通过、19 跳过 | `/tmp/huhu-g6-t26.aFiNpx/full.log`、`/tmp/huhu-g6-t26.aFiNpx/full-retest.log` |
| Vault 暂存测试单文件 | 独立复跑 26 通过。取锁顺序复跑 26 通过 | `/tmp/huhu-g6-t26.aFiNpx/vault-directed.log`、`/tmp/huhu-g6-t26.aFiNpx/vault-retest.log` |
| 组合快照 HTTP MCP 恢复后重交领域写入 | 3 项复现 Dispatcher 的 unknown。没有进入领域写 handler | `/tmp/huhu-g6-t26.aFiNpx/recovery-direct.log`、`/tmp/huhu-g6-t26.aFiNpx/c05-test.patch` |
| 组合快照 HTTP MCP 恢复后的读回及效果计数 | 3 项通过。C05 自身的 Kernel 夹具另有 3 项通过 | `/tmp/huhu-g6-t26.aFiNpx/recovery-read.log`、`/tmp/huhu-g6-t26.aFiNpx/recovery-kernel.log` |
| 规则取消完成回执落盘中断 | 两个入口的定向用例 2 项通过 | `/tmp/huhu-g6-t26.aFiNpx/cancel-interrupt.log` |

首轮唯一失败项为 `packages/vault/test/operations.test.ts:109`。轮询已观察到异步暂存文件删除时，该测试随后的断言仍观察到临时文件标记。Vault 与 Contracts 相对基线没有差异。第二轮按同一共享锁、同一最大并发完成。

C05 组合树为 `203f9e0f8d7c22e5443335669b058bd9c71c8c01`。三条组合用例在快照上使用新的 recoverable-session 测试夹具。正向重交的最小改动在 `/tmp/huhu-g6-t26.aFiNpx/c05-test.patch`，只读事实及效果计数版本在 `/tmp/huhu-g6-t26.aFiNpx/c05-read-test.patch`。正式候选的父提交维持 `5307b88f`。

首轮全量出现一次 Vault 异步暂存清理断言失败。单跑和第二轮全量均通过。Core live 观察到同一会话、预期 3 次输入、1 次原生答复、1 次普通答复及 4 份持久回执。两个确认丢失窗口只核对原回执。通过桌面可信入口复查同一会话 ID。桌面实际点击定位未执行。

## 阻碍与接续

- `tasks.dispatch.targets` 等 Agent 组提供可供 Tasks 的内部 `agent.targets.list` 无拨号查询。当前 `AgentDispatch.targets` 对已有会话调用 `SessionsService.executionSession`，后者使用 Core peek 和 RPC。即使不会启动 Core，热路径也会拨号。建议 Agent 在 Tasks 内部调用增加显式快照模式，复用同 Space 的 `SessionsService.list(spaceId)` 已存会话和 `AgentDetector.locate` 的磁盘检查，并将未核实的 live 资格明示为不可用。冷和热夹具都需检查无进程、拨号、网络和写入，然后开放外部描述符并复跑同一双入口矩阵。
- C05 已合入集成 `ecc1bd93`。隔离组合快照验证原逻辑会话跨重启的读取、拒绝新主体认领及无重复副作用。重交领域写入时，`Dispatcher.run` 的 recovered 分支仅允许通用 durable 回执回放。Tasks 补充、停止、跟进及规则取消在调用领域 handler 前返回 `INTERNAL` / `outcome: unknown`。若要求同一次写调用也能取回原领域回执，共享层需要可验证的只读对账合同。详细复现及日志见候选证据。
- Windows PowerShell 的本机批准、值更新和撤销成功链路需要 Windows 运行。Linux 本轮成功覆盖目录、外部自签拒绝和不支持宿主拒绝。命令代理调用两条关闭入口、浏览器界面和发布包证据留待组合验收。
- 本候选的新领域回执仅留关联 ID、状态、修订或布尔结果。已有人工任务和专用扫描的通用响应结构按原合同保留，历史回执未改写。

## Lead 验收


Lead 验收（2026-11-22）：通过。候选 `cd9016f5` 快进到 `impl/huhu-issues-3-10-g6-tasks`，合入集成 `d7581825`（boot.ts 一行 declareDescriptors 保留）；合入后 typecheck 与 tasks+automations+mcp-recovery 151/151。保留项：`tasks.dispatch.targets` 待 Agent 无拨号快照；C05 恢复后领域写重交返回 unknown（不重复执行，原结果经 *.read 回读）；Windows 终端批准链路待 Windows。终端 t26 关闭。
