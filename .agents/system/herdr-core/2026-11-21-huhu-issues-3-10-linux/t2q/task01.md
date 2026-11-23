# task01.md #6 领域组 Versioning / Safe：plugins/versioning、plugins/safe 的逐项开放

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t2q`；worker 内 `HC_TERMINAL_ID` 应为 `t2q`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2q/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2q/report01.md`
- Lead 回告方式 — Lead 主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-g6-versioning`，HEAD `9aedbdf5`。
- 接续依据 — t19 盘点 `t19/report01.md`（Lead 已验收）：本组各节 「## versioning」「## safe」，以及「读表与实施边界」「双入口验收矩阵」「G8.1 交付条件」「组间交付与 Lead 独占写入」。

## 目标与输入

按 t19 本组各节逐 ID 实施：裁决为“开”的项改为 `exposable: true`、`defaultExposed: false`，按行内 scope/risk 设置，并落实行内“当前守卫 / 意图 / 对象校验及定向验收”；裁决为“闭”的项保持关闭，并在报告中写明理由（引用 t19 行）。注意：

- 只读项必须零业务副作用（不启动 Core/Agent 进程、不拨号、不写业务文件、不发网络请求）。
- “持久”意图项：外部调用要求稳定意图键（CLI `--intent-key`，MCP `_meta["huhu.dev/intent-key"]`）；“领域”项用本模块原有 requestId/operationId 对账；未知结果不自动重放。回执中不得持久化 token、正文、凭据等敏感结果，改用安全投影。
- 现有 `exposable: true` 的同域用户动作（G8.1 段列出的守卫）与新开放项对齐，`defaultExposed` 一律 false。
- 集成已含 Kernel 组（`externalIntentRequired`：持久项同时设 `idempotency: "durable"` 与 `externalIntentRequired: true`）、G3.4 扩展命令委托、C05 HTTP MCP 跨重启恢复（夹具 `packages/kernel/test/mcp-recovery.test.ts`；恢复后领域写重交返回 unknown，原结果走领域 read 回读），以及 Tasks/Automations、Notes/Inbox/Guide 两个领域组（可参考 `plugins/notes/test/domain-exposure.engine.test.ts` 的双入口矩阵写法）。
- 已合入集成的会话身份（`ctx.subject` 为逻辑会话主体）直接使用，不要改 dispatcher、operation-receipts、server、MCP 适配器、contracts 调用身份；确需改动时停下写清需求交 Lead。
- t19「切片回归」：Versioning 核对原 HEAD 和 remote 身份；Safe 验锁定代次及审计无秘密。Safe 只有 1 项待裁决（见「## safe」），其余已是专有流程，保持原状。Git 远端认证凭据属 Versioning 模块自有（#9），外部调用不得读取或回显凭据。P8.3 Safe 整代同步已合入，`sync.preview/run` 开放时沿用其快照检查。
- 联验 2 相关：Safe 锁定后 Versioning 模块自有认证仍按自身状态工作（`plugins/versioning/test/remote-auth.engine.test.ts` 已有用例，保持通过）。

静态目录（`apps/engine/src/boot.ts` 约 135–149 行的 `declareDescriptors`）和插件注册由 Lead 接：在报告里给出需要 declare/bind 的精确清单（从同一源导出 descriptor 集，不手抄元数据）。若不改 boot 测试无法跑通，可在候选中改最少行并单列。

## 读写范围与产物

- 可写业务范围 — `plugins/versioning/**`、`plugins/safe/**` 的 descriptor、manifest、领域 handler 与同目录测试；#6 证据目录。
- 禁止改动 — `apps/engine/src/boot.ts`（除上述最少行）、其他插件、Kernel dispatcher/server/MCP/contracts、`packages/kernel/src/capabilities/**`（Kernel 组在改）、`packages/kernel/src/plugins/**`（扩展组在改）、Vault 包收集器、根锁文件。不 push，不启动子 agent，不碰真实 Vault、凭据或原生 Agent 历史。
- 预期产物 — 候选提交（临时索引方式，父 `9aedbdf5`）、证据 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/evidence/G-versioning-safe-exposure-linux.md`、报告（逐 ID 表：最终 exposable/defaultExposed、scope/risk、意图、校验、测试名）。

## 验收与验证

- t19「双入口验收矩阵」对每个开放 ID 参数化：默认关 → 开 → 撤（CLI 与 HTTP MCP 各一遍，撤销后原连接同名同意图再调被拒、领域计数不增）；只读零副作用计数；对象与并发；“持久/领域”项的同键并发、丢应答、重启各只产生一次效果。保持关闭的项断言外部 `CAPABILITY_NOT_EXPOSED` 且批量全开选不中。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、相关 vitest（`--maxWorkers=1`）通过；全量一律 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`（全机一把锁）。
- HTML/CSS/客户端 TS 如需改动，先按 AGENTS.md 执行 zh-modern-web-guidance 的 search 与 retrieve。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址与任务文件名；manifest 当前行须指向本任务且为 `active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交，在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
5. 2026-11-21 定案见 `.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md`。
6. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。
