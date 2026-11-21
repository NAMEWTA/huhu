# task01 · #6 D02 外部 Agent 任务扫描

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t1bw`（本机 Windows Core `wta`）
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1bw/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1bw/report01.md`
- 执行结果 — `done`，成员切片待 Lead 装配

## 结论

按独立审查 report07、#6 D02/G5b.2 和 #5 T5.2/T5.3 交付 `source:"tasks"` 扫描切片。四个专用能力独立开放。`automations.taskScan.create` 和 `.update` 为 write，仅保存停用草稿。`.enable` 和 `.runNow` 为 execute，均核对规则版本。新手动受理要求规则已启用。筛选范围为当前 Vault 的合格既有 Agent 任务，Space、provider 和执行目标取自入选任务原有配置。

`TaskScanOccurrences` 的外部意图身份绑定物理 Vault、认证 `caller/subject` 和 `intentId`。重复提交先查原发生，并核对原规则 ID 和版本。首次受理在配置锁内检查现态、持久化规则和任务输入快照。受理后沿用原数据交 Tasks，停用和删除保留派遣，按原标识查询和单项取消。新意图使用旧版本在写入前失败。相同意图变更规则或版本得到 `IDEMPOTENCY_MISMATCH`。

`AutomationsService.create/update/setEnabled` 提交后同步发布 `entity.changed`，`automations.apply` 的现有订阅重建 Scheduler。专用工具复用这个通知链。真实 Croner 验证观察到下一计划点使用启用版本入队，停用草稿不会安排任务。默认及既有启用规则仍在 Scheduler 中，专用编辑拒绝改写它们的启用版本，原 `holdRestoredInput` 继续筛掉对应任务输入。

预览只消费已有探测结果，返回实际 `ruleVersion`，可拒绝陈旧版本。外部停用和删除要求 `expectedVersion`。保持工作台、提醒和受保护终端的原入口。

## 产物与改动

本机工作树 `D:/Document/code/huhu/temp/issue-worktrees/integration`，分支 `impl/huhu-issues-3-10-automation-tools`，基线 `897cd78aeb89c4eed9b450265bcb4ec8d704f112`。最终 HEAD `1eb37eeac223df29001ab2d3d2b4de216591cd92`。交付时工作树干净，最终变更为 `plugins/automations` 的 5 个源码文件和 1 个定向测试文件。

| 提交 | 作用 |
| --- | --- |
| `b23d6e273d0611edfd162a71b257bb456ee8e04f` | 无探测预览，外部停用及删除要求规则版本 |
| `6e6281033ca2b996f9df4b074ceb59c3e39fa8df` | 外部扫描草稿、独立执行授权、持久意图和跨入口受理 |
| `1eb37eeac223df29001ab2d3d2b4de216591cd92` | 静态登记共享预览/启停/删除/派遣明细，联验真实 Scheduler 与保护边界 |

实现入口为 `plugins/automations/src/engine/task-scan-tools.ts`、`task-scan-occurrences.ts` 和 `service.ts`。目录发现和 handler 共享同一套 Zod schema。八项描述默认关闭，插件停用后保留 schema、scope 和 risk。

## 验证

| 验收 | Windows 隔离 Vault 中的观察 | 日志 |
| --- | --- | --- |
| 第一个切片 | 2 个文件通过 49 项，覆盖预览零探测、版本冲突、缺版本拒绝和队列保留。 | [verify01-preview.log](verify01-preview.log) |
| 最终自动化回归 | 6 个文件通过 75 项，其中发生相关 21 项。CLI 验证默认关闭、草稿幂等和编辑、过期版本与活动规则拒绝，模板/终端及外部环境和 Space 入参拒绝。停用插件后 8 个描述仍可查询。 | [verify01-final-automations.log](verify01-final-automations.log) |
| 真实 Scheduler | 专用创建和更新期间原 2 个作业保留。启用后新作业实际在下一个计划点持久化 1 个有效派遣，恢复保留任务为 `held-after-restore`。停用和删除后经 2 个计划点新增发生为 0，原派遣仍在，执行替身收到 0 次输入。 | [verify01-final-automations.log](verify01-final-automations.log) |
| CLI、MCP HTTP、实际 MCP stdio、HTTP Bearer | MCP HTTP 两次并发同意图，删除规则及重启后 stdio 重交，共用 1 个发生、1 个派遣和 1 次 Tasks 执行替身输入。HTTP/stdio schema 一致。两个 HTTP Bearer 使用同一键各获独立发生，派遣为 0。探测等待中撤销 Bearer 后新增发生为 0。工具撤权后原公开入口拒绝读回。 | [verify01-final-automations.log](verify01-final-automations.log) |
| 受理失联与重开 | 在发生落盘后、任务受理前注入失败，经真实 CLI 重交仅补原名单，得到 1 个派遣。换意图使用旧版本、同意图改输入、外部尝试直接启动或伪造派遣字段均被拒绝。 | [verify01-final-automations.log](verify01-final-automations.log) |
| Windows Core 回归 | `6e628103` 的 2 个现有真实本机 Core 文件通过 4 项。随包 Core 0.1.19，3 项使用合成 provider 验证原生派遣与回复，1 项验证受保护终端及 CLI/MCP。新扫描的网关测试使用 Tasks 执行替身。 | [verify01-core.log](verify01-core.log) · [verify01-core-version.log](verify01-core-version.log) |
| 静态检查 | Automations TypeScript 检查退出 0，`git diff --check` 通过。 | [verify01-final-types.log](verify01-final-types.log) |

复跑入口为 `node node_modules/vitest/vitest.mjs run plugins/automations/test --pool forks --maxWorkers 1` 和 `node node_modules/typescript/bin/tsc --noEmit -p plugins/automations/tsconfig.json`。Core 回归对 `plugins/agent-cli/test/native-receipts.live.test.ts` 与 `apps/cli/test/approved-terminal.test.ts` 使用同一 Vitest runner，`HUHU_AGENT_LAUNCH_TEST_BIN` 指向 `D:/Document/code/huhu/temp/issue-baseline/packaged-3bd2e24-win-x64/win-unpacked/resources/herdr/win32-x64/herdr-core.exe`。

## Lead 装配

1. 在 [Engine 静态目录](/D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:137) 的 `CapabilityRegistry` 初始化区登记 `registry.declareDescriptors("automations", Object.values(automations.taskScanToolDescriptors))`，同一插件原有终端描述继续登记。`taskScanToolDescriptors` 已由 `@huhu/plugin-automations/engine` 导出。
2. 在 [Engine Automations apply](/D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:401) 的 options 注入 `taskScanPrincipalCurrent(caller, subject): boolean`。通过 [Engine TokenTable](/D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/src/boot.ts:181) 核对当前认证 caller/subject。`caller === "mcp"` 时还核对 `gatewayTokens.mcp().enabled`。MCP HTTP 传入 API Bearer 时保留认证得到的 `http` 身份。专用工具会在首次落盘前和回读时重新执行此回调及 Vault 工具选择检查。
3. 两项装配一起接入。未传回调时，四个专用 handler 保持未安装，四个既有公共 handler 走相同 schema 的现有装配方式。成员测试用真实 Engine 和 Dispatcher，以测试装配提供静态登记与鉴权回调。合入后用实际 TokenTable 回调重走默认关闭、撤权和跨入口受理。

## 范围余项

完整 #6 D02 仍包含外部 Agent 模板规则，以及外部终端规则的草稿、编辑和启用。已获本机批准的终端手动路径保有原行为。成员验收覆盖 CLI、MCP、HTTP、真实 Scheduler 和既有 Windows Core 测试，桌面 UI 联验与安装包由 Lead 集成验收。

## Lead 验收

待核验。
