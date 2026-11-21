# 任务报告 · #4 W6.0 独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t20
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report01.md
- 执行结果 — done

## 结论

建议 W6.0 返工后签收。候选可按原绑定与指纹识别重交，三组固定样例可在文件回读后分别确认两段 ACK。独立探针确认了一个会影响 Tasks 补送去重的公共契约缺陷，以及一个原生问题的 Schema 导出缺口。

### 规格轴

1. **P2 · W6.0 返工。Tasks 可以确认一个无法按原 ID 补送的 delivery。** `TasksReceiptConsumptionSchema` 用 `nonBlank` 接受 `messageId`，`createExecutionReceiptAck` 在原回执与执行身份匹配时授予 `tasks_consumed`。将固定 result 的投递 ID 保持原样，用合成的 `"message-fixture\nreview"` 作为 `messageId`，签发和发送方 ACK 校验均通过。用同一 ID 和正文调用基线已有的 `appendComment` 后，`parseTaskBody` 回读出 `"message-fixture review"`。再用原 ID 补送，`appendComment` 返回 `added: true`，回读记录“评论 id 重复”。实际去重依赖 Markdown 回读 ID 与输入完全相等，Agent 副本此时已经符合释放条件。W6.0 的消费依据须保证持久投递 ID 能原样经过 Tasks 的评论写入与回读。可独立复核 `packages/contracts/src/execution-receipt.ts:67–71,115–130`、`packages/vault/src/markdown/regions.ts:60,132–143,189–202` 和直接调用方 `plugins/tasks/src/engine/service.ts:278–285`。T3.3 仍负责在持久存储中分配稳定且唯一的 ID，并以崩溃重试验证实际评论只写一次。
2. **P3 · W6.0 导出缺口。原生暂停的会话约束没有进入现有 JSON Schema 导出。** 对固定原生问题只改 `execution.sessionBinding.nativeSessionId` 为 `null`，运行时 `ExecutionReceiptSchema.safeParse` 拒绝。项目的 `toJsonSchema(ExecutionReceiptSchema)` 仍给 question 分支声明可空的 nativeSessionId，且 `native_deferred` 分支没有关联条件。使用本地 Ajv 8.20.0 实测导出的 schema 接受同一 JSON。可独立复核 `packages/contracts/src/execution-receipt.ts:10–18,37–52` 和 `packages/contracts/src/capability.ts:22–25`。现有能力目录消费该导出机制（`packages/kernel/src/capabilities/system.ts:227`）；本提交尚无回执 handler 注册。生产端采用此运行态 Schema 之前，应使具有原生请求的分支也能声明必需的原生会话，或明确内部契约的导出边界，并对同一正常及异常样本比较两种校验结果。

### 规范轴

- **P3 · 共享导出的运行环境边界。** 包根入口由 `packages/contracts/package.json:6–8` 指向 `src/index.ts`，第 4 行把依赖 `node:crypto` 的回执模块加入公共入口。现有 Renderer 有运行时导入（`plugins/tasks/src/ui/TasksModule.tsx:1`、`TaskEditor.tsx:3`），桌面渲染进程关闭 Node 集成（`apps/desktop/src/main/index.ts:123–127`）。锁定 Vite 8.3.7 按 Electron 44.9.1 对应的 `chrome152` 和普通浏览器的 `baseline-widely-available` 各运行最小生产构建。基线和候选的 `matchesTags`、`normalizeTag` 产物均执行成功，候选纯回执 schema 也能执行。候选增加一条来自 `execution-receipt.ts:1` 的浏览器外部化警告，现有 `ids.ts` 已有同类警告。若客户端实际调用 `validateExecutionReceipt`，两个构建的产物均在 `createHash` 处报“is not a function”。当前两个直接回执消费者属于 Engine，未发现现有标签入口的运行回退。#6 G6.2 公共 Workbench 接线应保留纯数据校验与 Engine 指纹校验的宿主边界，并验证最终入口。依据为 `AGENTS.md` 的桌面与 Web 宿主约定、`apps/desktop/electron.vite.config.ts` 的 main/renderer 分装，以及集成工作树 `173baab` 的锁定构建入口。
- 复用方面，`TaskRunAttemptSchema` 抽取前后都使用 `z.number().int().min(1)`，原 frontmatter 格式无语义变化。规范化沿用 `packages/kernel/src/idempotency.ts:15` 的键排序规则，数组保持顺序，哈希涵盖 kind 与原 payload。候选提交未改变工作区依赖图、根锁、宿主或持久化装配。Engine 后续应继续从权威运行/已提交记录取证，公共纯函数根据回读数据的内容判断。

## 产物与改动

- 审查工作目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`，分支 `impl/huhu-issues-3-10-receipt`。基线及 merge-base 为 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`，候选及最终 HEAD 为 `3804140c6c4da026694e2d798b348f1229848d42`。候选差异为五个 contracts 文件，最终工作树干净。一次直接运行锁定 pnpm 的尝试自动附加了 pnpm 自身的 25 行锁元数据，已核对新增内容和索引版本后恢复该文件。最终类型检查直接调用已安装的锁定 TypeScript 5.9.3。
- 核对 `HC_TERMINAL_ID=t20`、本机 Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`）、topic、manifest 中 `t20 / task01.md / active` 及终稿路径。结果文件写入本任务目录，合成夹具和构建输出在独立 Windows 临时目录。
- 已读实现者 `t19/report01.md`，对照 #4 W6.0/W6.3、#5 T3.1/T3.3、双方设计与原型确认记录。直接消费者中，Agent 的 `SessionsService.doLaunch` 先保存 session 再把 Vault/Space/session/launch 打标签（`plugins/agent-cli/src/engine/sessions.ts:204–228`），`waiting.ts:106–113` 当前处理 Core blocked 和发生标识。Tasks 当前 `tasks.markDispatched` 仅接受 Automations（`plugins/tasks/src/engine/index.ts:161–170`），`tasks.comments.add` 将内部调用者给出的 ID 传给现有评论写入（同文件 :195–211）。Automations 旧路径先记录 run 再尝试评论（`plugins/automations/src/engine/service.ts:652–669,701–706`）。这些入口界定下一片接线责任。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 1. 绑定一致的 result | 固定 result 首次为 `new`，JSON 回读的全文产生同一 SHA-256 与执行身份。 | `packages/contracts/test/execution-receipt.test.ts:18–22` |
| 2. 绑定一致的 question | 普通与原生暂停固定样例均通过。缺原生请求或原生会话、越界 requestVersion 或普通问题携带原生请求字段均遭运行时校验拒绝。JSON Schema 导出差异见 P3。 | 同文件 :18–22、:50–64 |
| 3. 第一道 ACK | Agent 无相符的接收回读时 pending。保存并回读原回执后才有 `agent_received`，发送方仅释放适配器副本。 | 同文件 :72–78、:117–136 |
| 4. 第二道 ACK | Tasks 缺原记录或缺消费投影时 pending，接收文件与消费投影均读取后才出 `tasks_consumed`。该 ACK 校验通过后释放 Agent 副本。 | 同文件 :138–157 |
| 5. 同回执重交及重建 | 三组 `wx`/flush 文件样例均丢弃两个阶段的首次 ACK。重读原回执和投影后仍为 duplicate。原回执提供 kind、payload 与目标绑定，投影提供同一指纹和 deliveryId/messageId。固定样例能重建，跨当前评论编码的 ID 反例见 P2。 | 同文件 :91–164 及 `test/fixtures/execution-receipt-v1.ts` |
| 6. 同 ID 异内容 | key 换序仍去重。改正文尾空格、kind 或选项顺序均报 `receipt_conflict`。 | 同文件 :24–31 |
| 7. 跨绑定 | Vault、task、run、attempt、dispatch 及 session 七个字段分别改值后被拒。两种 ACK 同样拒绝不同执行身份。 | 同文件 :34–48 |
| 8. 错版本及错 ACK | 回执或 ACK 内版本不同均遭拒。阶段、receiptId、SHA-256 不符时不能释放。 | 同文件 :50–69 |
| 9. 无持久依据 | 单独提供摘要、布尔标记、错版本回执、错执行绑定、错 delivery 关联、空 messageId 均 pending。样例的 `execution` 来自写入的合成消费投影，真实 TaskRun 与 delivery 是否都提交仍由 T3.3 的存储联验判定。 | 同文件 :72–87、:110–115、:144–153 |
| 回归、类型检查和改动范围 | Windows、Node 24.21.0。候选原样复制到临时目录，复用锁定 Vitest 3.2.7、Zod 4.6.7。用 `node <vitest>/vitest.mjs run --maxWorkers=1 --minWorkers=1 --reporter=verbose` 执行两文件 29 项通过。用 `node <typescript>/bin/tsc --noEmit -p packages/contracts/tsconfig.json` 执行类型检查通过。`git diff --check bf3942e...3804140` 通过。 | `packages/contracts/test`、`packages/contracts/tsconfig.json` |
| 独立探针 | 临时用例执行 Markdown 往返和 Ajv 导出比较，均复现上述差异。锁定 Vite 8.3.7 以命名导出作为最小构建入口，构建后执行 JS。现有标签函数及纯 Schema 可用，直接调用含 Node SHA-256 的校验失败。 | 临时目录 `huhu-t20-4790993f685f41ed9aa42e42eaf38c7d`，`packages/contracts/test/t20-probe.test.ts`、`vite-probe.mjs`。可按两个 finding 中的输入和入口独立重做。 |

## 阻碍与接续

审查已完成。建议返工后复查 messageId 持久化往返及原生暂停的导出行为。W6.3 仍需在真实 Agent/适配器存储验证重启、鉴权和两个 outbox 的释放。T3.1 负责请求版本和有效问题投影，T3.3 负责原 TaskRun、payload 和可重建 delivery 的提交、原评论只写一次与目标删除的处理，T6.4 负责两端实接与启停恢复。插件未接线，因此本次没有运行真实 provider、Vault、完整安装包或浏览器 UI。浏览器证据为匹配构建版本的最小生产依赖图及其产物执行。#4/#5 原型界面的版本确认与生产行为验收继续按各自记录进行。

## Lead 验收

收到独立审查。核对基准和候选范围，确认列出的三处复核结果可对应直接消费者及两端环境。返工由 t19/task02 接续，完成后交本审查会话复查。
