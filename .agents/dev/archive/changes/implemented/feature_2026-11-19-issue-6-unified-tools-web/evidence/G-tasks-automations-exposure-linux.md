# G8.1 Tasks 与 Automations 外部工具 · Linux

基线 `5307b88f56fc7919fdcfed8d07311764ec745cad`，分支 `impl/huhu-issues-3-10-g6-tasks`。测试使用临时 Vault、合成任务、隔离 `XDG_RUNTIME_DIR` 和回环连接。真实 Core 取工作树随包 Linux x64 的 0.1.19，Agent 使用合成 provider。

## 逐项结果

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

## 可复跑的验证

- T — `plugins/tasks/test/persistence-http.test.ts` 中「逐项开放、撤销和重查任务的派遣、补充与停止」。真实 CLI 命令和带独立测试令牌的 HTTP MCP 各跑隔离 Vault。检查默认不可发现、按 ID 调用被拒绝、授权后发现和调用、原连接续用同名被拒、外部主体隔离、Run 归属、并发、重开。停止夹具只收到一次原执行绑定。对读取监测 Vault 写入、进程启动与 Core peek。
- F — `plugins/automations/test/task-scan-occurrences.test.ts` 中「逐项开放、撤销和重查任务跟进」。两个入口分别生成一次计划、一项取消，验证 task 和计划版本、同键重交、错主体、撤权、CLI 重开回读。只读查询无 Vault 写入或派遣。
- C — 同文件「取消规则只能作用于指定本机运行和发生」。两个入口分别验证错规则、错发生、外来 Vault 运行、后续运行、并发同意图、撤权。通过夹具监测取消控制器调用。模拟效果后回执写入中断，原意图持续待核实且不会再调用控制器。CLI 重开读回已完成回执，并保留中断记录的待核实状态。
- E — 同文件「终端环境与批准能力逐项开放，本机批准不能自签」。Linux 验证默认拒绝、依策略发现、未获批准和不支持的宿主拒绝、两种外部入口都无法签发批准、撤权后的原工具不可调用。Windows PowerShell 的成功保存、同键并发及撤销分支在测试中定义，待 Windows 验证。
- L — `plugins/agent-cli/test/native-receipts.live.test.ts`。真实 Core 三项，含 CLI／HTTP MCP 创建、派遣、答复、读取，桌面查询定位同一会话。两个确认丢失窗口只对账原回执。生产联验观察到 3 次预期输入、1 次原生答复、1 次普通答复和 4 份持久回执。
- G8.1 — T 文件中「命令行分别授权 Agent 任务创建与派遣」覆盖通用 Agent 创建、编辑与复制、独立授权及非法 Space。F 文件中「CLI 逐项开放任务扫描」覆盖经通用工具保存及更新受限草稿，与专用信任及版本检查一致。外部新支持的 Agent 任务和通用任务扫描写入返回无 Markdown 正文的确认结果。

CLI 对账通过。在把候选业务树和 `ecc1bd93` 合成的隔离快照中，HTTP MCP 使用恢复证明找回原逻辑会话。原会话能读取补充、停止、跟进和绑定的规则运行。相同令牌的新会话仍无法读回原主体的补充、停止及跟进。重新提交领域写入或执行在 Dispatcher 的 recovered 分支提前返回 `INTERNAL` 和 `outcome: unknown`，后续只读验证表明无重复效果。此分支只回放通用 durable 回执，尚无领域意图的只读对账入口。Linux 本轮无 Windows PowerShell 成功链路，也没有执行桌面界面点击定位。

## 门禁

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

## Engine 装配

使用同一源的 `Object.values(tasks.taskToolDescriptors)`、`Object.values(automations.automationToolDescriptors)`、`Object.values(automations.terminalEnvironmentDescriptors)`、`Object.values(automations.taskScanToolDescriptors)`。候选仅在 `boot.ts` 新增 `automationToolDescriptors` 静态声明一行，真实 HTTP、CLI 和 live 夹具依赖这一装配。Tasks 和 terminal/taskScan 使用现有声明位置。通过领域插件的 `apply` 绑定同一描述符。Automations manifest 补齐三个跟进 ID。内部 `tasks.receipts.consume` 沿用原运行时注册及 manifest 名称声明，live 故障注入可替换原 handler。
