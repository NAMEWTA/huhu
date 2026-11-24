# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task05.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task05.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report05.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{007-f27,036-f23,035-f12,015-planapi}.md`
- 执行结果 — done（worker 交回）

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `028d9737`，交付 HEAD `a5972baa`。四个独立提交均带 `Refs: #13`。`git diff 028d9737..HEAD --check` 通过。6 个定向测试文件共 62 项通过。测试和基准均持共享锁串行执行，本批测试终端已移除，工作树干净。

### F27 — `80445e50`

- 文件 — `tests/perf/index.bench.ts`。
- 复用 Vitest 和真实 VaultIndex。固定种子 20261124、5,000 篇笔记、50 个目录、每篇 40 段、每批 24 个有明确命中路径的查询。一次预热后每阶段保留 9 个 Linux 样本，记录工作负载摘要、源码提交、实际 Node 版本、Linux/机器、耗时和进程 RSS。根据基线 p95、MAD 和 15% 最小相对余量计算 median 门禁，机器、数据或构建模式不一致时拒绝比较。
- 命令 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest bench --run --project perf tests/perf/index.bench.ts`。基线设置 `HUHU_PERF_OUTPUT=<运行目录>/f27-baseline`。正常对照和正控另设 `HUHU_PERF_BASELINE=<运行目录>/f27-baseline/index-benchmark.json`，正控加 `HUHU_PERF_REGRESSION=query`。
- 基线全量重建 median/p95 为 844.017/893.382 ms，24 次搜索批次为 1.257/1.915 ms。正常对照分别为 883.634/918.748 ms、1.200/1.781 ms，两阶段均通过。正常对照记录于 `20bafbfc`，后续改动只调整此票客户端失效与用例，VaultIndex 基准受测代码一致。正控重复执行同一查询批次七次，搜索 median 9.909 ms，超过 1.915 ms 门禁并使 Vitest 非零退出，命中校验仍通过。
- Linux 主机的原始 JSON/CSV 样本及 p95、方差、采样峰值 RSS 位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task05/{f27-baseline,f27-treated,f27-positive}/index-benchmark.{json,csv}`。数据 10,724,490 B，SHA-256 为 `9026ec7c3109c234dc2b7d7643deeeeff748bd6248ac6318651c5b991662263a`。
- 本轮模式为 Linux Vitest 源码，实际 Electron 版本字段为 null。构建制品与 Electron 性能样本未取。门禁是同机同模式的正常与正控演示，未据此给出生产性能提升比较。

### F23 — `8fc6ee87`

- 文件 — `apps/engine/src/boot.ts`；`packages/contracts/src/events.ts`、`packages/kernel/src/capabilities/vault.ts`、`packages/vault/src/index/vault-index.ts`；`packages/workbench/src/{engine-client/query,resources/useReferenceIndex}.ts`、`packages/workbench/test/engine-client.test.ts`；`plugins/notes/src/engine/{index,service}.ts`、`plugins/notes/src/ui/NotesModule.tsx`、`plugins/notes/test/document-events.engine.test.ts`；`tests/e2e/perf.spec.ts`。
- Notes 保存合并为一条带路径、版本、writeId 和可用索引增量的文件事件。工作台使用带修订的 `vault.indexSnapshot`，邻接修订原位替换文件元信息，跳修订、外部结构变更或活动请求交错则走现有刷新合并。对外的 `vault.indexEntries` 保留原数组合同。目录改动触发树刷新，标签改变才刷新 Notes 列表和标签，文件正文事件仍刷新对应文档、反链、最近修改，以及相关的领域投影。服务端复用稳定排序，首页最近笔记从按路径读取 mtime。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/workbench/test/engine-client.test.ts`，32 项通过。5,000 条合成路径在真实 QueryClient 中复现旧事件组合的 2 次整树刷新，对应两份结果 610,002 B。新事件无整树刷新，增量本身 114 B。该数据只含序列化数据，未加 HTTP 或 WS 协议开销。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/notes/test/document-events.engine.test.ts`，2 项通过。真 Engine 的 Markdown 与 HTML 保存事件只有一次，索引增量与真快照一致，另一会话的脏正文仍遵守冲突规则。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/vault/test/vault-index.test.ts`，22 项通过。含外部创建、改名、删除、超限和后台重建期间竞态。
- Lead 执行 `tests/e2e/perf.spec.ts` 中「F23 大库正文保存记录路径树 RPC、字节和交互耗时」。5,001 篇笔记的真实桌面 RPC/字节、长任务和交互耗时对照待跑。用例预留 `HUHU_F23_BASELINE=1` 作为旧版记录模式。

### F12 — `7196bfdc`

- 文件 — `plugins/mail/src/engine/{conversations,mail-projection,message-cache,outbox-storage}.ts`、`plugins/mail/test/conversations-engine.test.ts`。
- 收件快照、已发记录继续作为事实来源。本地可重建投影在权威写入后生成，以文件身份和时间戳校验新鲜度。列表、分页和通知定位使用元信息，按账号修订复核后共享去重、联系人排序、未读计数和定位索引。出站继续以逐地址真实接受结果投影，坏快照或坏出站记录可独立跳过。已缓存正文提取按 MIME 摘要复用，缺索引或内容变化时再从事实来源构建。投影存于包导出排除的 `.huhu/cache`。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/mail/test/conversations-engine.test.ts`，1 项多场景本地 IMAP 回归通过。实际监测已预热分页读取原始邮箱快照和出站记录次数为 0。覆盖跨账户重复 RFC ID、部分投递、定位、重启后搜索复用、缺投影重建，以及损坏的快照和送达记录隔离。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/mail/test/sync-engine.test.ts`，2 项通过，含本地 IMAP 断线恢复和通知精确定位。
- 扩展复核 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/mail/test/outbox-engine.test.ts`，候选和基线 `028d9737` 均为 13 通过、同名 7 失败。失效用例涉及 ZIP 导入的写入注入屏障和现有投递终态注入。原始输出位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1hs/task05/f12-outbox-{candidate,baseline}.txt`。这些用例仍未通过。
- Lead 执行 `tests/e2e/workflows/mail.spec.ts` 中「Web 邮件往来按接受者分组，逐地址显示结果并回到原投递记录」「新邮件通知从桌面铃铛定位到原账号的邮件并交接焦点」「工作台命令从首页打开邮件缓存搜索并交接焦点」。
- 旧邮箱缺投影时首次查询需从原快照恢复。打开单封邮件继续沿用现有权威快照读取。真实 Gmail、Graph 与外部邮件服务性能未验证。

### PlanAPI — `a5972baa`

- 文件 — `packages/contracts/src/{automation-plan,index}.ts`、`packages/contracts/test/automation-plan.test.ts`。
- `@huhu/contracts` 公开计划、来源、运行归属、发生、效果、过期修订和任务活动查询类型及校验 schema。Cron 与 FollowUps 的中心/来源共用稳定 `planId/revision`，发生保留原接受时间、冻结输入与执行代次。区分用户暂停、执行受阻、未受理与已受理未知，并可按原 operationId/occurrenceId 查询。Task 样例复用执行绑定的公开字段，省略 Core 传输地址。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/contracts/test/automation-plan.test.ts`，3 项通过。含 #16 中心与来源身份一致、F29 旧修订零受理及同一未知发生重查、缺冻结输入或时间的受理记录校验失败。
- 本次交付范围为共享合同与可运行样例。正式目录、调度、UI 和生产接线由 F29、#16 消费，当前没有对应的 Playwright 用例。

### 未运行项

- 待 Lead 逐包类型检查 `@huhu/contracts`、`@huhu/kernel`、`@huhu/vault`、`@huhu/workbench`、`@huhu/engine`、`@huhu/plugin-notes`、`@huhu/plugin-mail`，并执行上列 Playwright 用例。未运行构建、打包、全量测试、全仓 lint、knip 或视觉截图。新增客户端代码沿用 ES2023。

## 阻碍与接续

无实施阻碍。F23 的真实桌面旅程对照待 Lead 执行。PlanAPI 交 #16 与 F29。

## Lead 验收

- Lead 2026-11-24：F27/F12/PlanAPI 通过；F12 类型错误由 Lead 修；F23 E2E 失败、outbox 回归（F01）转 task06。
