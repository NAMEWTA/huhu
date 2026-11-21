# 任务报告 · #4 W6.0 UTF-8 修复复验

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t20
- task — task03.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/task03.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t20/report03.md
- 执行结果 — done

## 结论

建议合入并签收 W6.0 候选 `5daf048665ea46ae62e60dfbda9beed6459a8868`。已用同一批实际写盘样本复现父提交的缺陷，并确认候选修复。含孤立或错序代理码元的 ID 在运行时和导出 Schema 中都遭拒绝，`tasks_consumed` 保持 pending。合法字符经过 Markdown 的 UTF-8 写入与回读后保持同一 ID，重复投递只留一条评论。原始 v1 指纹及客户端与 Engine 的包导出边界均通过复验。

### 规格轴

`packages/contracts/src/execution-receipt.ts:66–73` 保留非空白、CR/LF 和双引号约束，增加对完整代理对的要求。用上轮的 `"message-fixture\ud800"` 和独立补充的异常组合重做父候选对照。消费记录的 JSON 文件回读保留输入码元，Markdown 按 `Buffer.from(body)` 写入并用 UTF-8 解码后替换孤立码元。父提交的 Schema 与 ACK 判定分别接受并确认这些输入，候选拒绝且返回 `missing_durable_consumption`。探针直接调用 `packages/vault/src/markdown/regions.ts:195–202` 的追加和去重逻辑，沿用 `packages/vault/src/semantic/repository.ts:68,134–146` 的字节编码方式。四组合法 ID（含原样 U+FFFD、BMP、补充平面边界）文件回读后均保留原 ID，重交 `added: false`、正文不变，解析恰有一条评论。

### 规范轴

使用仓库 `toJsonSchema` 的产物，Ajv 8.20.0 的 Unicode 正则模式开启和关闭时均与 Zod 结论一致。浏览器包根仍可载入 Schema 及现有标签函数。采用真实包导出时，Electron 对应的 `chrome152` 和普通浏览器的 `baseline-widely-available` 均在解析阶段拒绝 Engine 子路径。Node 产物可加载该子路径并复现三个固定指纹。规范轴复验通过，范围为公共合同与最小构建入口。

## 产物与改动

- 工作目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`，分支 `impl/huhu-issues-3-10-receipt`。核对候选及最终 HEAD `5daf048665ea46ae62e60dfbda9beed6459a8868`，直接父提交 `9a8225f10937661882efbb4ce3067dd82cf53d7c`。差异仅 `execution-receipt.ts`、`execution-receipt.test.ts`、`fixtures/execution-receipt-v1.ts` 三文件。包导出、Engine 实现、根锁及桌面构建配置与父提交相同。业务工作树干净。
- 已读 `t20/report02.md` 与 `t19/report03.md`，核对本机 Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`、`HC_TERMINAL_ID=t20`、topic、manifest 中 `t20 / task03.md / active` 和同号终稿路径。
- 以 `git archive` 提取两份指定提交到隔离目录 `C:/Users/cdewta/AppData/Local/Temp/huhu-t20-r3-d2447491280b40e7822e5113650744f4`，复用已安装的锁定依赖。合成夹具、探针和构建入口存于该目录，终稿为本任务唯一共享写入。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| UTF-8 字节往返、拒绝与重交 | 对同一固定 result 的 15 种合成 ID 分别写入消费 JSON 和 Markdown 后重新打开。5 个含异常代理码元的样本在父提交为 ACK，候选全部 pending。4 个合法样本回读原样，得到有效 ACK，重交均 `added: false`。CR/LF、引号及全空白也保持拒绝。 | 临时 `packages/contracts/test/t20-utf8-review.test.mjs`。临时根执行 `node ./node_modules/vitest/vitest.mjs run --config independent.config.mjs --maxWorkers=1 --minWorkers=1`，15 项通过。 |
| 可导出的约束 | 把消费 Schema 交由 Ajv 8.20.0 以 `unicodeRegExp=true/false` 各验证，同一批输入与运行时结论相同。两份客户端产物的原生问题样本结果均为 `[true,false,true]`。 | 临时 `review-build.mjs` 及上述独立探针。生产代码约束见 `packages/contracts/src/execution-receipt.ts:36–51,66–73`。 |
| 宿主构建与固定指纹 | 用集成工作树锁定 Vite 8.3.7 构建两个客户端目标，执行零外部导入的最小 ESM，现有标签函数与 Schema 可用，外部化警告仍来自既有 `ids.ts`。显式导入 Engine 子路径时，两目标均报告浏览器条件未导出。Vite `node24` SSR 产物用 Node 24.21.0 执行，result、普通 question、原生 question 的三个摘要与原始固定值完全一致，重交皆为 duplicate。 | 在临时根执行 `node review-build.mjs <集成工作树已安装的 vite 包目录> <已安装的 ajv/dist/2020.js>`。 |
| 领域回归、类型和差异 | Vitest 3.2.7 执行 3 文件 55 项通过，包含三组原始指纹、两段 ACK、UTF-8 文件往返和 Markdown 回归。TypeScript 5.9.3 `--noEmit -p packages/contracts/tsconfig.json` 退出 0。`git diff --check 9a8225f...5daf048` 通过。 | 临时根执行 `node ./node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 packages/contracts/test packages/vault/test/markdown.test.ts`，并对同一快照运行类型检查。 |

## 阻碍与接续

当前 W6.0 可签收。W6.3 负责真实 Agent/适配器的可信传输、持久保管和重启重交。T3.1 负责请求版本与投影，T3.3 负责从实际 TaskRun、原 payload、稳定投递 ID 恢复并只写一次评论。T6.4 负责两端联接、模块启停与恢复。完整 Electron/Web 应用、真实 Vault 和 provider 的运行证据由对应切片补齐。

## Lead 验收


固定候选 5daf048 通过独立复验。Lead 核对完整差异与无冲突合入，集成至 1b3b385。集成回归记录由批次 progress.md 跟踪。
