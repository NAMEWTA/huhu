# 任务报告 · #4 W6.0 返工候选复审

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t20
- task — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report02.md
- 执行结果 — done

## 结论

建议在合入 W6.0 前补齐 `messageId` 的 UTF-8 往返约束。上轮 CR/LF 和引号反例均已拒绝，原生暂停与可空会话的导出差异已修复，Node 校验子路径也已与客户端构建隔离。进一步按现有 Vault 的字节写入与回读方式验证时，发现候选仍会签发一个重试时无法去重的 `tasks_consumed` ACK。

### 规格轴

**P3 · 需返工。消费记录接受包含孤立 UTF-16 代理码元的评论 ID。** 在固定 result 的消费记录中把 `delivery.messageId` 设为 JSON 字符串 `"message-fixture\ud800"`，其余字段沿用原样。写入再回读合成 JSON 后，候选运行时 Schema 和导出 Schema 都接受，`createExecutionReceiptAck` 返回 ACK，发送方 `validateExecutionReceiptAck` 返回 true。在调用原有 `appendComment`、把结果用 `Buffer.from(body)` 写成文件、按 UTF-8 回读后，`parseTaskBody` 得到 `"message-fixture\ufffd"`。同一投递记录重试时 `added: true`，第二次回读报「评论 id 重复」。包含合法代理对的 Unicode ID 同路径原样回读，重试 `added: false`。现有回归在内存中解析 Markdown 字符串，所以孤立码元在那一步仍相等。

复核入口为 `packages/contracts/src/execution-receipt.ts:66–72` 与 `execution-receipt-engine.ts:55–74`。生产 Tasks 评论沿 `plugins/tasks/src/engine/service.ts:278–285` 调用 `appendComment` 并提交 `repo.patch`，`packages/vault/src/semantic/repository.ts:68,134–146` 对写入使用 `Buffer.from(next)`、读取使用 UTF-8。去重比较位于 `packages/vault/src/markdown/regions.ts:195–198`。当前切片公开的 Schema 应保证被确认的 ID 在此边界保持相等，修复可用同一套样本比较运行时、JSON Schema 和实际文件写入结果。生产 ID 的分配及唯一性仍归 T3.3，本次用例未触发生产 handler。

### 规范轴

`@huhu/contracts` 根入口保留可在浏览器加载的 Schema 和类型。指纹与可信 ACK 的校验函数移入 `@huhu/contracts/execution-receipt/engine`，包导出条件为 `types` 和 `node`（`packages/contracts/package.json:6–12`）。两个客户端目标在真实包导出解析阶段均拒绝该子路径。旧有 `ids.ts` 仍有浏览器外部化警告，最小客户端产物没有外部导入，`matchesTags`、`normalizeTag` 及回执 Schema 均可用。Node 运行产物复现三个原始 SHA-256。这满足当前的宿主边界，生产 Electron/Web 整体入口仍按各自任务验收。

## 产物与改动

- 审查分支 `impl/huhu-issues-3-10-receipt`，目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`。父提交 `3804140c6c4da026694e2d798b348f1229848d42`，候选及最终 HEAD `9a8225f10937661882efbb4ce3067dd82cf53d7c`。复查父提交至候选的五个文件，逐行读取唯一新增的 `packages/contracts/src/execution-receipt-engine.ts`、全部变更与新增夹具。根锁、Tasks 写入、桌面/Web 装配在此次返工中无差异。业务工作树干净。
- 已核对 `t20/report01.md`、`t19/report02.md`、Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`、`HC_TERMINAL_ID=t20`、topic 和 manifest 的 `t20 / task02.md / active` 指针。报告以同目录临时稿非覆盖发布。
- 临时验证目录为 `C:/Users/cdewta/AppData/Local/Temp/huhu-t20-r2-0643b1c6ea764128bfa688348755817e`。源文件取自同一候选 SHA，复用已安装依赖，网络、远端 Git、真实 Vault、provider 均未介入验证。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 原反例拒绝、合法 ID 重交 | 五个 CR/LF/CRLF 与引号相关样本均得到 `pending / missing_durable_consumption`，导出的消费 Schema 也拒绝。固定 ASCII ID 和含中文、补充平面字符及字面 `&quot;` 的 ID 经过 UTF-8 文件读写保持相同，重试 `added: false`。 | `packages/contracts/test/execution-receipt.test.ts:104–132`、临时 `packages/contracts/test/t20-file-roundtrip.test.ts` |
| 完整文件往返 | 额外的孤立代理码元用例复现同一 ACK 后评论重试的缺口。九个独立探针用例通过预期观测，包含对该缺陷的复现断言。 | 上述临时 `t20-file-roundtrip.test.ts`、`packages/vault/src/semantic/repository.ts:68,134–146` |
| 原生问题双校验 | 对「原生暂停有会话、原生暂停会话为 null、普通问题会话为 null」三个相同 JSON 输入，Zod 运行时与项目 `toJsonSchema` 输出经 Ajv 8.20.0 检查，均得到 `[true, false, true]`。 | `packages/contracts/src/execution-receipt.ts:36–51`、`test/fixtures/execution-receipt-v1.ts:65–78`、临时 `review-build.mjs` |
| 客户端边界 | Vite 8.3.7 按桌面目标 `chrome152` 及 `baseline-widely-available` 构建。以真实包导出装载根包，验证现有标签函数、纯 Schema 及零外部导入。用 Engine 子路径作运行时入口，两目标均在 `module/browser/production/import` 解析条件下报子路径未导出。 | `packages/contracts/package.json:6–12`、临时 `review-build.mjs` |
| Node 指纹及 ACK | Vite `node24` SSR 构建由真实包子路径解析，产物包含 `node:crypto`。Node 24.21.0 执行产物，result、普通 question、原生 question 三个摘要与 `3804140` 的固定值完全相同，同数据重交均得 `duplicate`。现有回归覆盖两段 ACK、错阶段/错版本和接收证据缺失。 | 临时 `review-build.mjs`、`packages/contracts/test/execution-receipt.test.ts` |
| 领域回归及类型 | Windows、Node 24.21.0，临时快照用锁定依赖 Vitest 3.2.7 执行 `run --maxWorkers=1 --minWorkers=1 packages/contracts/test packages/vault/test/markdown.test.ts`，3 文件 49 项通过。初次临时快照漏了 Markdown 测试引用的 Vault index 模块，补齐同一 SHA 的 Vault 源码后通过。锁定 TypeScript 5.9.3 执行 `--noEmit -p packages/contracts/tsconfig.json` 与 `git diff --check 3804140...9a8225f` 均通过。 | 上述临时目录与候选工作树 |

## 阻碍与接续

复审已完成。补齐 messageId 文件编码边界后可针对小范围差异复验。W6.3 的 Agent/适配器仍需验证可信传输、回执重启前后可重交，以及两段 ACK 的持久释放。T3.1 负责原生/普通请求及版本状态投影，T3.3 负责从真实 TaskRun、原始 payload 与稳定 delivery 恢复，验证提交后 ACK 和评论只写一次。T6.4 负责真实两端接线、启停与恢复。完整 Electron/Web 应用、真实 Vault/provider、并发及进程故障验收仍待对应切片。

## Lead 验收

接收复审，确认上轮修复覆盖原样例及两宿主边界。需补完整 UTF-8 文件往返。交 t19/task03 修复，随后复核受影响范围。
