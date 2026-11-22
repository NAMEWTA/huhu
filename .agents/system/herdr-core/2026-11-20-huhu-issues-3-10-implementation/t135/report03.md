# #4 W6.3 原生 Codex 回执持久化与两阶段 ACK

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t135`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135/task03.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135/report03.md`
- 执行结果 — **done**
- 本地提交 — `77a52b6b2a7d92d41ef7fe1dd9a0b3f006d85c90`，直接父提交 `9b34df699ecfdd6f46b210f2d95b362cccdad56d`
- 工作树 — `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-task-executor`，Git 状态干净

## Agent 生产侧

- helper 只把已由原 `turn/start` 响应绑定的 thread、turn 和 item 转为 W6.0 回执。提前到达的有效帧暂存到原 turn 已核准。问题限单题、明确阻塞、非秘密和固定选项。结果要求原 turn 的唯一 `final_answer` 项和成功的完成事件。回执带稳定的 receiptId 与原生归属，先保存到原代次的签名文件。
- Agent 经 W6.1 的原输入意图、Core 绑定和原生输入签收核对预期执行。接收端沿用 `validateExecutionReceipt` 和 `createExecutionReceiptAck`，先按 receiptId 保全原 payload 及摘要，回读后才发布签名的 `agent_received`。重复接收得到相同身份，异载荷或异绑定不签收。
- Agent 从独立持久记录向 `tasks.receipts.consume` 重交同一 `ExecutionReceipt`。只有 `tasks_consumed` 的版本、阶段、receiptId、执行绑定和原摘要全部匹配才持久标记已消费。缺接收器、丢确认或收到错误摘要时保留原待交。恢复只重交回执，Codex 输入和原生问题回答次数由夹具独立观察。

## 与 Tasks 装配的约定

`tasks.receipts.consume` 接受裸 `ExecutionReceiptSchema`，返回 `ExecutionReceiptAckSchema`。Agent 清单声明同名权限组。集成端负责将权限组映射到这个私有写能力，并在 handler 校验调用者为 `plugin:agent-cli`。接收端应通过 receiptId 和原身份做持久业务去重，回读原 receipt 及可重建的 delivery 记录后签发 `tasks_consumed`。每次传输可有独立幂等键，回执的 receiptId 和 payload 不变。本提交的实际消费端为可重开的合成接收器，公共 Engine、Kernel 和 Tasks 装配归 Lead。

## 验收证据

| 条款 | 实测 | 日志 |
| --- | --- | --- |
| W6.3、F01 | Windows 固定 Core 和真实 Engine 入口。Codex 合成进程先发原生问题和结果帧。原 turn 尚未签收时无回执。异 thread、异 turn、commentary、秘密问题和自由文本问题未进入待交。合格问题和结果各保全一次，来自同一原执行。 | [固定 Core 的 Engine 回归](evidence-task03/regressions.log) |
| W6.3、W6.0 | Agent 已落盘后丢第一阶段 ACK，重开才见原 `agent_received`。将 helper 的问题副本移出待交目录后，Agent 用自有副本继续。合成 Tasks 已保存可重建消费记录时丢第二阶段 ACK。重开后同一问题重交，错误摘要保持待交，随后匹配 ACK 才结束。 | [两次丢 ACK 与回读](evidence-task03/regressions.log) |
| F02、C12 | Agent 存储拒绝同 ID 异载荷、错误 run、缺原生绑定和跨 Vault 读取。合成 Tasks 接收器拒绝桌面直接调用。回执流程完成后再次重开仍无重送。原生输入一次、问题回答零次，合成消费为两份唯一回执。 | [归属与指纹回归](evidence-task03/regressions.log) |

规格见 [W6.3](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W6.3-durable-receipt.md)、[W6.0](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W6.0-receipt-contract.md) 和 [原生接线分析](../t13g/report01.md)。

## 验证及清理

- Windows 固定 Core 0.1.19，二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。8 文件 70 项通过，6 项条件跳过。Contracts、Agent CLI、Engine 类型检查通过。改动文件通过 oxfmt、oxlint 和 Git 空白检查。 [运行命令](evidence-task03/verify.ps1) · [验证输出](evidence-task03/verification.log) · [退出状态](evidence-task03/verification-exit.log)
- 本轮使用一次性 Vault、Core 和合成 Codex 协议进程。真实 provider 的问题和结果能力门槛继续沿用 W6.1，Tasks 的业务回答和消费验收属于后续切片。验证 Core 已关闭，窗格已删除，根锁与父提交一致。 [窗格清理](evidence-task03/cleanup.log)

