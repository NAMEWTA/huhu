# 任务报告 · #4 W6.0 回执与双 ACK

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t19
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report01.md
- 执行结果 — done

## 结论

已交付可供 W6.3 和 #5 T3.1/T3.3 共用的 v1 回执、双 ACK 校验以及固定样例。已核对 topic、有效 manifest 指针、`HC_TERMINAL_ID=t19`、Windows Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`）及目标报告路径。

## 产物与改动

- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`，分支 `impl/huhu-issues-3-10-receipt`，基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`，本地提交 `3804140c6c4da026694e2d798b348f1229848d42`。工作树干净，提交范围为五个合同和样例文件，根锁与装配无差异。
- `packages/contracts/src/index.ts` 从 `@huhu/contracts` 导出 `EXECUTION_RECEIPT_VERSION`、`ExecutionBindingSchema`、`ExecutionSessionBindingSchema`、`ExecutionReceiptSchema`、`ExecutionReceiptIdentitySchema`、`ExecutionReceiptAckSchema`、`ExecutionReceiptAckStageSchema`、`TasksReceiptConsumptionSchema` 及对应合同类型。执行入口为 `validateExecutionReceipt`、`executionReceiptIdentity`、`createExecutionReceiptAck` 和 `validateExecutionReceiptAck`。
- v1 绑定 Vault、task、run、attempt、dispatch 以及机器、Huhu session、Core ID/地址、进程代次、provider 和原生会话。原生暂停问题还要求原生请求 ID 和原生会话。五种回执的 payload 独立校验。`kind` 与 payload 以对象键排序、数组保持原序的 UTF-8 JSON 求完整小写 SHA-256，原文和选项次序参与比对。`task-run.ts` 只抽出并复用既有 attempt 校验。
- `agent_received` 要求回读匹配的已提交原回执，允许适配器释放自身待交副本。`tasks_consumed` 还要求匹配的 Tasks 运行绑定和含同一回执身份、稳定 `deliveryId`/`messageId` 的记录，允许 Agent 释放待交副本。原 payload 与该记录可重建投递。ACK 收件方按可信传输、阶段及本地原回执身份校验，接收函数接受的持久回读由各宿主的实际存储提供。
- `packages/contracts/test/fixtures/execution-receipt-v1.ts` 提供 result、普通 question、原生暂停 question 各自的固定 receipt、SHA-256 身份、两段 ACK 和 Tasks 投递记录。示例 ID 的构造只用于样例，生产投递 ID 的派生归 Tasks。

### 消费者与上游核对

- 核对 #4 `source.md`、`spec.md`、`design.md`、`plan.md`、W6.0/W6.1/W6.3 与批次计划的相关条目，使用本地 Issue #4 快照核对来源。#5 `design.md`、T1.2、T3.1、T3.3 将受理、问题与投递归 Tasks。当前 `plugins/agent-cli/src/engine/sessions.ts` 保存启动记录后打 Vault/session/launch 标签，`plugins/tasks/src/engine/index.ts` 的 `tasks.markDispatched` 仍限 Automations，`TasksService.addComment` 已按 ID 去重，`AutomationsService.completeTaskRun` 仍先写运行再调用 `commentRun`。本地基线的生产接收、重交和 delivery 尚需后续切片接通。
- 对照 Herdr Core `c7517808d64f06609e4ecf0db1757005373cc3a3`（Apache-2.0，`schema/hc.openrpc.json` 与 `crates/herdr-core/src/api/run.rs` 的终端创建、查询及 Core 身份）；Herdr App `317e673f1f1568b876cbaa0b41dabeb9153ecbea`（Apache-2.0，`src/mirror_sync.rs` 的断线后文档回读与 CAS）；ORCA `8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3`（MIT，`src/shared/workspace-layout/terminal-topology/terminal-pane-tree.ts` 的分栏树）；agent-autoloop `d1ec2d8e48de62b2a49bd8dc5985c03482c753ce`（MIT，`kernel/decide.ts` 的 `finish`/`applyReceipt` 以及 `kernel/store.ts` 的提交边界）。四者为参考，本提交无上游代码移植或新增依赖。实际复用 Huhu 基线 `packages/contracts/src/kinds/task-run.ts` 和 `packages/kernel/src/idempotency.ts` 的规范化键顺序思路（GPL-3.0-or-later），在 contracts 内仅对严格校验的 JSON 计算完整指纹，沿用锁定 Zod 4.6.7 和 Node `crypto`。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 绑定一致与重交 | 三组样例首次校验为 `new`，原样重交为 `duplicate`，双方得到固定身份。对象字段换序后身份一致，换 kind、正文空格或选项次序时冲突。 | `packages/contracts/test/execution-receipt.test.ts` |
| 两段 ACK 与重读 | 样例驱动器使用隔离文件写入并重新读取。Agent 接收前待交，接收后首个 ACK 丢失可按原身份重交，第二次确认只释放适配器副本。Tasks 仅存原回执时保持待交，提交投递记录后才确认。丢弃首次 Tasks ACK 后，重读可用原 payload 与同一稳定 ID 重建 delivery，最终 ACK 才释放 Agent 副本。 | 同上，`replays across both persistent handoffs` 三组 |
| 拒绝与保留待交 | 覆盖同 ID 异 payload、各运行及会话绑定字段不匹配、错版本、错 receiptId/指纹/ACK 阶段、缺原回执、缺运行或 delivery 证据以及证据属于另一个回执。 | 同上，公共校验入口 |
| pnpm 检查 | `pnpm --filter huhu --filter @huhu/contracts install --frozen-lockfile --prefer-offline` 成功。`pnpm --config.verify-deps-before-run=false exec vitest run --maxWorkers=1 --minWorkers=1 packages/contracts/test` 通过 2 文件 29 项（回执 21、既有 8）。`pnpm --config.verify-deps-before-run=false --filter @huhu/contracts run typecheck` 与 `git diff --cached --check` 通过。初次默认并发运行有两组磁盘同步样例超过五秒默认时限，三组同步用例设独立 30 秒时限后单 worker 复测通过。 | Node 24.21.0，pnpm 12.10.1，Windows |

## 阻碍与接续

W6.0 范围内无阻碍。验证器覆盖格式、身份和回读输入条件。样例驱动器覆盖隔离文件重读、丢确认后的重交以及各自的释放行为。真实 Agent/Tasks handler 的鉴权、原子持久化及进程崩溃恢复、Vault 评论实际只写一次、生产消息投递和真实 provider 运行留给 W6.3、T3.3 和 T6.4。未运行全工作区测试或类型检查。此次为 Engine 合同与 Node 测试，体验确认相关实现仍待原型确认。

## Lead 验收

候选回执与双 ACK 样例完成，独立审查复现 messageId 往返、原生问题 schema 导出及 Node 宿主边界问题。当前候选等待修复，未合入。转 t19/task02。

