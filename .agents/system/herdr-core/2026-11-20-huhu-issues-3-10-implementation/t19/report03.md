# 任务报告 · #4 W6.0 消费 ID 的 UTF-8 往返

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t19
- task — task03.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/task03.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t19/report03.md
- 执行结果 — done

## 结论

已修复 `t20/report02.md` 的 UTF-8 往返问题。消费记录的运行时及导出 Schema 拒绝孤立代理码元，允许合法 Unicode，并保留评论 ID 的原始值。合成 Markdown 写盘回读后，用重读消费记录的 ID 重交，合法 ID 去重成功，孤立高位、孤立低位和反序代理码元均保持待确认。已核对 topic、`t19 / task03.md / active`、`HC_TERMINAL_ID=t19`、Windows Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`）及目标报告路径。

## 产物与改动

- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`，分支 `impl/huhu-issues-3-10-receipt`，父提交 `9a8225f10937661882efbb4ce3067dd82cf53d7c`，本地提交 `5daf048665ea46ae62e60dfbda9beed6459a8868`。工作树干净，差异仅三个 `packages/contracts` 文件。
- `packages/contracts/src/execution-receipt.ts` 的 `messageId` 采用同一条可导出的正则，接受非代理码元或完整高低代理对，保留非空白及 Markdown 对引号、CR、LF 的约束。JSON Schema 校验器有无 Unicode 正则标志均能接受补充平面字符。
- `packages/contracts/test/fixtures/execution-receipt-v1.ts` 增加 ASCII、BMP 和补充平面字符、字面 `U+FFFD`、孤立高位、孤立低位、反序代理码元六组固定用例。`packages/contracts/test/execution-receipt.test.ts` 写入隔离的消费 JSON 和 Markdown 文件，从磁盘读回后用 `appendComment` 和 `parseTaskBody` 核对。Markdown 复用现行 Vault 写入的 `Buffer.from` 与 UTF-8 解码方式。
- 已核对 W6.0、#4 规格、计划、原型确认记录、#5 T3.3 与其原型确认记录。生产写入链路为 `plugins/tasks/src/engine/service.ts` 的 `TasksService.addComment` → `appendComment` → `repo.patch`。`packages/vault/src/semantic/repository.ts` 使用 `Buffer.from(next)` 写入文件，按 UTF-8 回读，`packages/vault/src/markdown/regions.ts` 按原 ID 去重。本切片在共享契约收紧 ACK 前置条件。
- 已按 `zh-modern-web-guidance` 检索 `encode UTF-8 text` 并取回 `js` 指南。本次沿用现有 Vault 的 Node 字节编码，采用可导出的正则表达接受范围。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 修复前复现 | 在父提交加测试后，运行 `pnpm --config.verify-deps-before-run=false exec vitest run --maxWorkers=1 --minWorkers=1 packages/contracts/test/execution-receipt.test.ts -t 'exports message ID patterns\|checks ACK and comment retry'`。八项中五项按预期失败，运行时及导出 pattern 接受无效码元，字节回读已改写 ID，模拟补送会再次追加。 | `Tasks delivery message ID` |
| 实际字节往返 | 写入并重新打开合成消费 JSON 与 UTF-8 Markdown 文件。合法三组的原 ID 与回读完全相等，重交 `added: false` 且正文相同。孤立高位和低位分别回读为 `U+FFFD`，反序回读为两个 `U+FFFD`，这些记录在 ACK 校验时返回 `pending / missing_durable_consumption`。 | 同上，六组文件用例 |
| 导出的消费记录与原生问题 Schema | 通过 `toJsonSchema` 将两个 Schema 导出，锁定 Vite 8.3.7 分别构建 `chrome152`、`baseline-widely-available`，单 ESM chunk 零外部导入，执行产物后以 Ajv 8.20.0 的 2020-12 校验器验证。`unicodeRegExp=true/false` 均与运行时一致，消费记录 11 组为三接受八拒绝，原生问题三组为 `[true, false, true]`。导出 pattern 的双模式比对也留在常规测试中。 | `utf8CommentMessageIds`、`invalidCommentMessageIds`、`questionSchemaCases` |
| 全部相关回归 | `pnpm --config.verify-deps-before-run=false exec vitest run --maxWorkers=1 --minWorkers=1 packages/contracts/test packages/vault/test/markdown.test.ts` 通过 3 文件 55 项（回执 38、契约通用 8、Markdown 9），涵盖三个 v1 固定指纹、两段 ACK 和原生问题。`pnpm --config.verify-deps-before-run=false --filter @huhu/contracts run typecheck` 及 `git diff --cached --check` 通过。 | Windows，Node 24.21.0、pnpm 12.10.1、Vitest 3.2.7 |

## 阻碍与接续

本次修复范围内无阻碍。字节读写用例使用临时合成文件，完整应用、真实 Vault、provider 与生产重启待 W6.3、T3.3 与 T6.4 联验。T3.3 负责实际分配稳定唯一 ID、落盘和补送。

## Lead 验收


固定候选 5daf048 通过独立复验。Lead 核对完整差异与无冲突合入，集成至 1b3b385。集成回归记录由批次 progress.md 跟踪。
