# #4 W6.2 · 停止原受控运行

- 终端 `t135`，任务 [task06.md](task06.md)，报告 `report06.md`
- 执行结果 **done**
- 本地提交 `da653169aa2f71aabe08085989e951aa885bc1bb`，直接父提交 `162fa0dc3af5ccf03b20d701a30b2bf02612fa14`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-task-executor`，Git 状态干净

## Agent 与 helper 合同

新增私有 `agent.runs.stop`（execute，由 handler 幂等）和 `agent.runs.stop.inspect`（read），均只信任 `plugin:tasks`。入参为 `{ execution, stopId }`，返回 `{ status }`。停止意图以原执行为范围，重试沿用同一个 execution 和 stopId。

| 状态 | 判定依据 |
| --- | --- |
| `stopped` | Agent 的原停止意图、helper 为同一指纹和原 thread／turn 保存的发送记录，以及该原轮的签名 `turn/completed(interrupted)` 全部吻合。 |
| `completed` | 原轮有签名的 `completed` 或 `failed` 自然终态。即使中断已发出，随后观测到自然终态仍返回此状态。Tasks 继续负责业务状态。 |
| `not_sent` | 原轮仍由任务拥有且存活，Agent 无停止意图，原代次的认证 helper 也能确认从未提交中断。 |
| `unknown` | 已持久化原停止意图而证据未齐，或当前无法查证。旧版仅含 thread／turn 的签名完成记录保留原派发对账能力，本接口无法依该记录区分停止与自然终态。 |
| `stale` | 执行绑定已失效、当前输入归属已变化、另一 stopId 已认领该执行，或原轮已有未关联本停止意图的中断终态。 |
| `unsupported` | 非受控新 Codex、绑定的 adapter 已变更，或只读 Vault 收到执行请求。 |

Agent 复用原派发记录、W6.1 的输入摘要、原 Core／PID／代次验证和当前输入仲裁。它在最靠近写入处重复核验所有权，先将停止意图原子写入 Vault。helper 复用同一认证通道，保存该 stopId 对应的签名发送记录，随后只发送一次 `turn/interrupt {threadId, turnId}`。该 JSON-RPC 方法的空结果只反映调用返回。重复停止或检查只读原事实，已确认终态时用现有派发对账更新本地输入占用。 [W6.2 任务](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.2-takeover-stop.md) · [固定协议 schema 投影](evidence-task06/pinned-schema.json)

## Windows 验收

| 场景 | 实测 |
| --- | --- |
| 权限、归属与并发 | Engine 拒绝 desktop 调用两个入口，错 attempt 和代次返回 `stale`。首次检查为 `not_sent`。认证之后模拟原任务失去输入权，停止返回 `stale`，意图和中断均为零。两个并发调用共用原停止标识，只产生一次中断。竞争 stopId 返回 `stale`。 |
| 回包、异轮通知和重开 | 合成 App Server 先返回成功 RPC，随后发异 thread 和异 turn 的中断终态，仍为 `unknown` 且输入权保留。Engine 重开后重复提交仍为 `unknown`。原 thread／turn 的 `interrupted` 到达后，检查与重试均为 `stopped`，原生中断总数为一，原派发的持久占用已释放。 |
| 预先完成与完成竞争 | 已自然完成和已失败的轮次各产生零次中断。中断已写且 RPC 回包缺失时，迟到的同轮自然完成确定为 `completed`，原生中断总数仍为一。 |
| 同地址恢复新 shell | 在隔离 Core 上保留两个原终端并重启 Core，由其在相同地址恢复两个新 PID 的 `cmd.exe /d`。已发而无终态的原停止仍为 `unknown`，未发原停止返回 `stale`。两个替代 shell 保持存活，Agent 向 Core 的 terminal.interrupt、terminal.kill 和 terminal.send 次数均为零。 |

固定 Windows Core 0.1.19，SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。10 个测试文件通过，共 88 项通过、6 项按原条件跳过。Agent CLI、Engine 类型检查通过，改动文件通过格式、lint 与 Git 空白检查。 验证只使用一次性 Vault、隔离 Core 和合成 App Server。临时 Core、测试目录和本轮验证窗格均已关闭。 [专项证据](evidence-task06/live.log) · [最终回归](evidence-task06/regressions.log) · [验证输出](evidence-task06/verification.log) · [退出状态](evidence-task06/verification-exit.log) · [窗格清理](evidence-task06/cleanup.log)

## 集成范围与复跑

Lead 负责内置 `agent.task-input` 授权映射和 Tasks 的业务接线。受控目标的公开 `cancel` 门槛沿用原设置。人工接管、归还和停止提示的 UI 旅程属于后续验收，本轮以输入归属故障注入覆盖迟到停止。 [本轮授权范围](task06.md)

从 `agent-lifecycle` 工作树执行以下命令。运行脚本校验 Core 的固定 SHA。 [运行脚本](evidence-task06/verify.ps1)

```powershell
$task = 'D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135'
powershell.exe -NoProfile -File "$task/evidence-task06/verify.ps1" $task
```
