# 任务报告 · #4 W6.0 独立审查返工

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t19
- task — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report02.md
- 执行结果 — done

## 结论

已修复 `t20/report01.md` 指出的三处问题。Tasks 消费记录校验可原样回读的评论 ID，原生暂停的会话约束进入项目导出的 JSON Schema，指纹和可信 ACK 校验从 Node 专用子路径加载。已核对 `HC_TERMINAL_ID=t19`、本机 Windows Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`）、topic 和 `t19 / task02.md / active` 指针。

## 产物与改动

- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`，分支 `impl/huhu-issues-3-10-receipt`，父提交 `3804140c6c4da026694e2d798b348f1229848d42`，本地提交 `9a8225f10937661882efbb4ce3067dd82cf53d7c`。工作树干净。五个变更文件均位于 `packages/contracts`，根锁、Engine/Renderer 装配、Tasks 生产入口无差异。
- `src/execution-receipt.ts` 从 `@huhu/contracts` 根入口提供 v1 Schema 和类型。`TasksReceiptConsumptionSchema` 拒绝含 CR、LF 或双引号的 `messageId`，这些字符会被 `packages/vault/src/markdown/regions.ts` 的属性写入规则改写。合法 ID 保留原文，包括空格、Unicode 和字面 `&quot;`。`native_deferred` 分支要求非空 `nativeSessionId` 和 `nativeRequestId`。普通问题允许可空的原生会话。
- `src/execution-receipt-engine.ts` 通过 `@huhu/contracts/execution-receipt/engine` 导出 `validateExecutionReceipt`、`executionReceiptIdentity`、`createExecutionReceiptAck`、`validateExecutionReceiptAck`。Node 加载使用 `node` 导出条件，TypeScript 通过 `types` 解析。三个固定 v1 指纹、两段 ACK 和重交预期均通过原测试。
- `test/fixtures/execution-receipt-v1.ts` 补 CR/LF/CRLF、引号和属性边界反例，以及同一组运行时与 JSON Schema 验证输入。`test/execution-receipt.test.ts` 调用仓库现行 `appendComment` 和 `parseTaskBody` 验证回读及去重。按 `zh-modern-web-guidance` 完成模块加载搜索和 `conditional-async-dependencies,js` 取回，本次边界使用构建器的静态包导出条件。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Markdown ID 边界 | 五个反例直接经过现行 Markdown 编码均改变回读 ID，Tasks ACK 均返回 `pending / missing_durable_consumption`。固定 result 的稳定 ID 与包含字面 `&quot;`、Unicode 的 ID 均原样回读。模拟 ACK 丢失，重读消费记录再用同一 ID 补送时 `added: false`，正文与首次写入一致。 | `packages/contracts/test/execution-receipt.test.ts` 的 `Tasks delivery message ID` |
| JSON Schema 与运行时一致 | 使用项目 `toJsonSchema(ExecutionReceiptSchema)`，用 Ajv 8.20.0 的 2020-12 校验器执行生成 Schema。相同三组样例按顺序为原生暂停且会话存在、原生暂停且会话为 null、普通问题且会话为 null。基线导出为 `[true, true, true]`，候选运行时与导出均为 `[true, false, true]`。两种构建目标结果一致。 | `questionSchemaCases` 固定样例，契约测试中的导出分支断言，Vite 构建探针执行 |
| Chromium 和 Web 导入 | 使用集成工作树已安装、根锁固定的 Vite 8.3.7。以 `chrome152`（Electron 44.9.1）及 `baseline-widely-available` 各执行最小 ESM 生产构建。用同一入口导入根包 `ExecutionReceiptSchema`、`toJsonSchema`、`normalizeTag`，基线探针加载父提交回执源码，其余环境一致。每个目标的浏览器外部化提示从两条降为一条，剩余来源为既有 `ids.ts`。候选输出为单 chunk、零外部导入，含 Schema，产物执行通过。另用显式 Engine 子路径作为浏览器入口，两种目标均在包解析阶段拒绝。 | `packages/contracts/package.json`；最小构建使用 `configFile: false`、`write: false`、`minify: false`，记录 `node:crypto` 导入者和输出 `chunk.imports`，执行生成的 ESM。 |
| Engine 导入与稳定指纹 | 同一锁定 Vite 按 `node24` 运行 SSR 构建，Engine 子路径解析成功，输出保留 `node:crypto`。执行产物核对固定 result SHA-256 与预期一致。 | `packages/contracts/src/execution-receipt-engine.ts`、`test/fixtures/execution-receipt-v1.ts` |
| 回归及类型 | `pnpm --config.verify-deps-before-run=false exec vitest run --maxWorkers=1 --minWorkers=1 packages/contracts/test packages/vault/test/markdown.test.ts` 通过 3 文件 49 项（回执 32、契约通用 8、Markdown 9）。`pnpm --config.verify-deps-before-run=false --filter @huhu/contracts run typecheck` 和 `git diff --cached --check` 通过。 | Windows、Node 24.21.0、pnpm 12.10.1、Vitest 3.2.7 |

## 阻碍与接续

本返工范围内无阻碍。W6.3 的 Agent/适配器接收与 #5 T3.3 的 Tasks 持久接收采用 Engine 子路径进行运行绑定、指纹和 ACK 校验。T3.3 负责分配稳定且唯一的 ID，在原有 `TasksService.addComment` 路径验证中断后评论只写一次。T3.1 可从根入口取得问题 Schema。T6.4 仍负责真实接线及重启验收。本次取证覆盖合成 Markdown 往返、包级运行与两种客户端构建目标，完整 Electron/Web 应用、真实 provider、真实 Vault、并发和生产重启保持后续验收。

## Lead 验收

已核对提交及独立复验。需补 UTF-8 代理码元边界，候选未合入。t19/task03 承接。

