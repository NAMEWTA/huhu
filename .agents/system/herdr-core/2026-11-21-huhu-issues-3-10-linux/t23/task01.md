# task01.md #6 Kernel 管理组：Kernel 能力逐项开放

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t23`
- 身份核对 — 本机 Linux 默认 Core，worker 内 `HC_TERMINAL_ID` 应为 `t23`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t23/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t23/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-g6-kernel`，HEAD `499427be`。
- 接续依据 — t19 盘点 `t19/report01.md`「Kernel」与「双入口验收矩阵」「G8.1 交付条件」各段（Lead 已验收）。

## 目标与输入

按 t19 报告「Kernel」组逐 ID 实施 `packages/kernel/src/capabilities/{health,home-dashboard,home,package,system,vault,web-share}.ts` 的开放，结合 2026-11-21 定案（`.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md` 末节）：

- **保持仅工作台（`exposable: false`，报告写明依据定案）**：Gateway 管理动作 `gateway.mcp.update`、`gateway.tokens.create`、`gateway.tokens.revoke`、`gateway.update`、`gateway.policy.update`、`gateway.audit.clear`、`web.share.start`、`web.share.stop`、`web.invitations.get`（含可兑换链接）、`web.invitations.create`、`web.invitations.revoke`。
- **可开放（`exposable: true`、`defaultExposed: false`，按 t19 行内 scope/risk、意图与对象校验）**：其余 Kernel 行，包括只读的 `gateway.get`、`gateway.tokens.list`、`gateway.policy.preview`、`gateway.audit.list`、`gateway.check`、`web.share.status`、`web.invitations.list`，以及 health、home、home-dashboard、package、system 中非 Gateway 项、vault 各项。
- 每项落实 t19 行内“对象校验及定向验收”：例如 `vault.readRange/readBinary` 阻止链接与受保护路径、`vault.managedFiles` 过滤 `.huhu` 私有状态、`notifications.*` 固定原 ID 集合、`vault.exportPackage` 不接受任意 Engine 目标路径（改为快照/下载句柄或受限目标，说明你的选择）、`vault.importPackage` 禁止覆盖当前库或其祖先。
- “持久”意图项：确认 dispatcher 对外部调用者要求稳定意图键（t19「G8.1 交付条件」中 `dispatcher.ts:147` 与 NEEDS_IDEMPOTENCY 的说明）；admin 项对外开放时也要防重复。通用 receipts 持久化结果的，涉及 token/邀请/正文的改用安全投影。
- health 的 Herdr Core 只读已由 Lead 在 `fc048b6b` 改为不启动 Core；你只核对并补冷启动测试。

协议/会话组（t1k）在另一个分支改 `packages/kernel/src/{dispatcher,operation-receipts}` 和 server/MCP 适配器。你**不改** dispatcher、operation-receipts、server、MCP 适配器与 contracts 的调用身份类型；如确需改动，停下写清需求交 Lead。

## 读写范围与产物

- 可写业务范围 — 上述 7 个 `packages/kernel/src/capabilities/*.ts` 文件及其单测、Kernel 测试夹具；`packages/workbench/src/` 中仅限管理页为显示新开放项必须改的文案（若需要，先按 AGENTS.md 读取并执行 zh-modern-web-guidance 的 search 与 retrieve）。#6 证据目录 `evidence/G-kernel-exposure-linux.md`。
- 禁止改动 — `apps/engine/src/boot.ts`（静态目录与装配由 Lead 接；在报告给出需要 declare/bind 的精确清单）、插件、Vault 包收集器、根锁文件、上述协议组文件。不 push，不启动子 agent，不碰真实 Vault/凭据。
- 预期产物 — 候选提交（临时索引方式，父 `499427be`）、证据、报告（逐 ID 表：最终 exposable/defaultExposed、scope/risk、意图、校验、测试名）。

## 验收与验证

- t19「双入口验收矩阵」的默认关 → 开 → 撤、只读零副作用、对象与并发三类场景，对每个开放 ID 至少有 CLI 或 HTTP 入口的参数化测试；保持关闭的 Gateway 管理项断言外部调用 `CAPABILITY_NOT_EXPOSED` 且批量“全部开启”选不中。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、相关 vitest 文件通过；最后 `pnpm test -- --maxWorkers=3` 记录计数。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址与任务文件名；manifest 当前行须指向本任务且为 `active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交，在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。本机内存有限：vitest 加 `--maxWorkers=3`，不跑 e2e。
5. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。

## 补充（Lead）

- 全量测试一律 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`（全机一把锁，另一名实现者共用）；定向 vitest 用 `--maxWorkers=1`。
- 协议/会话组 task01 已合入集成（HTTP MCP 会话身份），本分支基线已包含；同时另一名实现者正在做 G3.4 扩展命令（`packages/kernel/src/capabilities/external-plugins.ts`、`packages/kernel/src/plugins/**`），你不要改这两处。
