# #5 T1.2 持久受理独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t54
- task — task03.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/task03.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/report03.md
- 执行身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t54
- 执行结果 — done

## 结论

- **规格轴**：正常受理、人工与规则竞争、跨重启的原 run/attempt 对账、长期去重及桌面专用 API 均通过。损坏的 run 身份仍会进入执行器对账，持久记录完整性验收暂不通过。同机导入副本也会在注入执行器后自动领取原 Vault 的待派意图，构成组合启用的阻碍。
- **规范轴**：复用 Tasks 的业务所有权、Dispatcher、Vault 条件写和现有 run 投影入口。独立实测确认 Tasks 的共享写队列已覆盖上一轮的 HTTP 并发反例。规则来源和执行器的宿主装配仍有明确边界。未发现新建第二套进程启动设施。

建议将冻结候选作为**执行器未接入的本地开发增量**保留。T1.2 完整验收前应修正损坏 run 身份的校验与恢复。接入生产执行器前需验证 Vault 恢复隔离和旧 Automations 的切换顺序。 [T1.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T1.2-accept.md) · [实现报告](../t6n/report01.md)

## 冻结范围

候选 `6b43fceceee002bd3141648946e1d907c1d9349c` 是父提交 `6cc99edd0feefe75e601e8aded0e4329fa927f56` 的直接子提交，树为 `2fb6b9c0b9871d7e4e8cd3be9faf53c66cfd68da`。审查七个 Tasks 文件，包括 manifest、新增的 `dispatch-store.ts`、`dispatch.ts`、`write-queue.ts` 及新增 HTTP 回归。源码按 SHA 从 Git 归档获取。本轮使用 Windows、Node 24.21.0、Vitest 3.2.7 和隔离的合成 Vault，实际派遣由夹具执行。

候选锁的 blob 为 `e7c2876017054b1a8944cf954b2cec97981bfdc0`。复用了集成检出的第三方依赖，所有工作区包指向冻结归档。执行时集成锁比候选多一个现有 `tsx@4.23.15` 的 importer 登记。本轮命令使用 Node 直接运行 Vitest/tsc。锁内 Vitest 3.2.7、Zod 4.6.7、write-file-atomic 8.0.0 与实际依赖吻合。

## 规格轴

### P2 · 损坏的持久运行身份进入对账

先令夹具返回未知结果，记录停在 `unknown`；关闭 Engine，仅把该合成 JSON 的 `receipt.runId` 从实际 run ID 改为空串，`attempt` 从 1 改为 2。保持 JSON 语法、eventId、claim、快照和快照哈希原样。重开后，实际 HTTP 查询返回成功及空 runId，`inspect` 收到同一空 runId/attempt 2。该探针期待 `WRITE_PARTIAL` 且执行器零次对账，两个断言均失败。此次夹具返回 unknown，dispatch 为零。

存储校验核对 eventId、taskId、快照哈希和 claim 有无。`runId` 仅为任意字符串，原始 attempt 也缺少与不可变受理身份的关联约束。现有截断 JSON 测试确实返回 `WRITE_PARTIAL`，本探针覆盖可解析但身份已坏的记录。建议在 lookup/check 之前拒绝无效 run ID，并校验 run/attempt 与持久受理的关联，以免未来执行器对错误轮次认领或放行重发。定位 `plugins/tasks/src/engine/dispatch-store.ts:28–50,91–105`、`dispatch.ts:193–212`。 [持久记录与恢复约束](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/spec.md)

### 组合启用阻碍 · 导入副本会领取原 Vault 的待派意图

在合成 Vault 接受一个 pending 意图。经真实桌面 HTTP 导出 ZIP（`includeAttachments:false`），再导入同机新 Vault。导入分配了不同 Vault ID，ZIP 携带的 `.huhu/tasks/dispatches/evt-*.json` 字节完全相同。为副本注入合成执行器，启动后收到一次 send 并进入 running。再打开原 Vault，另一个合成执行器也收到一次 send。两个发送都使用同一 eventId、runId 和 attempt 1。

当前生产 Engine 尚未注入执行器，所见发送均由夹具记录。实际组合启用前必须定义收集、导入及执行归属，保留可查事实，并在新 Vault 建立明确的恢复决定和绑定校验；当前 JSON 记录没有原 Vault 身份，首次领取只识别本机，通用 ZIP 导入仅改写目标 Vault 的全局 ID。还应以新 Vault 验证未知/已发记录和绑定后的恢复。定位 `packages/vault/src/package/package.ts:24–49,150–164`、`packages/kernel/src/capabilities/package.ts:76–87`、`plugins/tasks/src/engine/dispatch.ts:193–242`。 [T7.1 数据包与切换验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T7.1-cutover.md)

### 受理与竞争的实测

| 范围 | 实际结果 |
| --- | --- |
| 人工与双规则竞争 | 复跑冻结 HTTP 夹具。停用 Automations 后，一个真实桌面 HTTP 请求和两个受信进程内规则调用竞争，仅一条 event/run/attempt 1 成功，其余指向原持有者。首次落盘为 pending，忙时看板保持未开始，输入被接受后才为进行中，系统评论一条。讨论未进入快照。 |
| 跨任务 dispatchId、重启与原凭据重发 | 独立探针使用两个不同 task 抢同一 dispatchId，另一请求返回 `IDEMPOTENCY_MISMATCH`。重开后第一次发送未知，任务仍为未开始并保留占用。再重开时只 inspect，确认 `not_sent` 后才重发原 event/run/attempt 1 和同一快照哈希。首次发送和确认未送达后的重发均各一次。 |
| 中断恢复、窗口和 24 小时网关边界 | 冻结夹具在 claimed 后、sending 前注入写故障，重启沿用同一 run/attempt；sending 回包晚到且作用域关闭后，磁盘保留 sending，下一次重开仅 inspect。固定时间覆盖 `not_due` 和到达 expiresAt 即过期，正文更新后原快照保留且变为 `stale_input`。回拨隔离网关缓存 25 小时后以同网关键重放，读到 Tasks 当前的取消凭据；相同 dispatchId 异任务或异版本返回冲突。 |
| 取消的 T1.3 边界 | 独立探针阻塞 A 的只读 ready，受理 B，先在 HTTP 取消 A，再释放 ready 并重开。A 保持 cancelled，B 保持原 run/attempt 1 并收到唯一发送。冻结夹具另覆盖 claimed 取消、unknown 持久请求取消且仍占用，以及证明未送达后才转 cancelled。已发实例的精准停止、快速关闭重开及桌面入口按 T1.3/T2.2 接续。 [T1.3](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T1.3-cancel-pending.md) |
| 能力与外部权限 | 运行中 registry 注册三项能力，作用域 execute/read/write，均不外露。真实 CLI 身份 HTTP 调用三项均被拒绝。启用合成 Vault 的本地 MCP HTTP 后，`tools/list` 有其他 27 个工具，三项派遣工具均缺席，逐项直接 `tools/call` 返回错误。桌面伪造规则来源、只读受理由冻结夹具验证拒绝。 |

## 规范轴

- 候选先在独立 JSON 文件原子提交受理，由 taskId 共享队列串行编辑、评论、状态、领取、取消、派遣联动及提醒更新。eventId 队列另外阻止同 ID 跨任务并发竞争。整个领取和对账使用同一 record 内的 run/claim 和已冻结正文。现有 `tasks.runs` 聚合旧语义 run 与新记录投影。
- 在原始 `6b43fce` 已重放 [上一轮并发反例](report02.md)。竞争编辑一条保存、一条 `VERSION_CONFLICT`，并行正文/评论都留在磁盘。底层 `e940403b9ee497ce4c4b1d4015d8b69361ac3db6` 独立核对为同进程、同实际文件路径的条件写队列，未叠加执行，因为本轮已能独立验证 Tasks taskId 临界区。UTF-8 的 HTTP 输入与落盘一致性修补属于 t6n/task02，本冻结差异没有该校验。
- `taskDispatch.acceptRule` 目前是内置进程的服务接缝，真实旧规则尚未消费。旧首次派遣经 `tasks.markDispatched` 会发现新持久占用，旧 `retryRun` 仍可直接进入 `drive`，恢复路径还有已进行中直接通过的旧分支。T5.3/T7.1 切换既有调度、重试与恢复后，才能确立单一执行所有权。定位 `plugins/tasks/src/engine/index.ts:80–137,240–247`、`plugins/automations/src/engine/service.ts:681–695,965–1008`。
- `apps/engine/src/boot.ts:156` 仅传通知与时区，未传 `dispatchExecutor`。T2.1/W6.1 仍需生产 Space/session 绑定、访问权、输入仲裁和持久查询，T2.2/W6.2 精准取消，T3 终态回执和投递，T1.4 新 attempt。共享 Run 持久显示/修复、备份范围和导入恢复属于同包联验。桌面详情立即派遣、待资源和冲突反馈仍需版本化原型确认后的界面验收。 [T2.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T2.1-dispatch-cli.md) · [T7.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T7.2-full-task-journey.md)

## 命令和日志

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 --exclude '**/t54-r3-*.test.ts' plugins/tasks/test packages/contracts/test plugins/automations/test
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test/t54-r3-probe.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test/t54-r3-backup.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test/t54-r3-mcp.test.ts
foreach ($p in 'vendor/cosmokit','vendor/cordis','packages/contracts','plugins/tasks','plugins/automations','apps/engine') { node node_modules/typescript/bin/tsc -p "$p/tsconfig.json" }
git diff --check 6cc99edd0feefe75e601e8aded0e4329fa927f56 6b43fceceee002bd3141648946e1d907c1d9349c
```

三个 t54 测试为临时归档探针，复用冻结 HTTP 夹具。以下为原始运行日志摘录，ID 均为合成值。

```text
suite exit=0
 Test Files  11 passed (11)
      Tests  139 passed | 11 skipped (150)
vendor-cosmokit exit=0
vendor-cordis exit=0
packages-contracts exit=0
plugins-tasks exit=0
plugins-automations exit=0
apps-engine exit=0
T54_R3_REPLAY {"mismatch":"IDEMPOTENCY_MISMATCH","hold":1,"eventId":"evt-2973e170695a4aef14eff00bdb82016cd1a498ce783a8698834aabe1cc96c86e","run":"run-mwokugakguat","attempt":1,"hash":"01dc4138ef0838802b4231c23aba82c9a076f15088aa8946e7a1c6231e4d1c69","dispatches":[1,1],"inspectBeforeRetry":true,"final":"running"}
T54_R3_CANCEL {"cancelled":"evt-a2d4d17482eae1f4daadef95ec66c85a71faeccc47cd50aeeb33db8392db7827","retained":"evt-baf39f2493230711665c4642711e1fcebb39ef7bfad4c302d16c021834a8a829","first":["cancelled",1],"second":["running",1],"sent":1}
T54_R3_QUEUE {"conflict":"VERSION_CONFLICT","merged":["body after",1,3]}
T54_R3_DAMAGED {"read":{"runId":"","attempt":2},"original":{"runId":"run-mwokuhfopmvt","attempt":1},"inspect":{"runId":"","attempt":2}}
      Tests  1 failed | 3 passed (4)
T54_R3_CLONE {"sourceVault":"vault-tof15386xoa0","importVault":"vault-6852mow1j7nl","entry":".huhu\\tasks\\dispatches\\evt-a19c58a00a1b04de0ededba71b532e29aa52ad138473151189883b080c8434d2.json","event":"evt-a19c58a00a1b04de0ededba71b532e29aa52ad138473151189883b080c8434d2","run":"run-mwokw9bisbt7","clone":{"state":"running","sends":1,"runId":"run-mwokw9bisbt7","attempt":1},"source":{"state":"running","sends":1}}
      Tests  1 failed (1)
T54_R3_MCP {"desktop":["tasks.dispatch","tasks.dispatch.cancel","tasks.dispatch.read"],"mcpListed":27,"rejected":["tasks_dispatch","tasks_dispatch_read","tasks_dispatch_cancel"]}
      Tests  1 passed (1)
```

冻结差异检查通过。MCP 直接复跑退出 0。独立探针的两个红灯对应上列身份损坏和导入重放。已关闭本轮四个命令 pane `t7r`、`t7s`、`t7w`、`t7x`。工作区业务文件和用户改动均只读。

## Lead 验收

由 Lead 追加。
