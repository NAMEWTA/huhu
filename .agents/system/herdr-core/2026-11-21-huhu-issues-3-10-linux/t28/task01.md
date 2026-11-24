# task01.md #6 领域组 Agent CLI：plugins/agent-cli 的逐项开放

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t28`；worker 内 `HC_TERMINAL_ID` 应为 `t28`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t28/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t28/report01.md`
- Lead 回告方式 — Lead 主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-agent`，HEAD `d7581825`。
- 接续依据 — t19 盘点 `t19/report01.md`（Lead 已验收）：本组各节 「## agent-cli」，以及「读表与实施边界」「双入口验收矩阵」「G8.1 交付条件」「组间交付与 Lead 独占写入」。

## 目标与输入

按 t19 本组各节逐 ID 实施：裁决为“开”的项改为 `exposable: true`、`defaultExposed: false`，按行内 scope/risk 设置，并落实行内“当前守卫 / 意图 / 对象校验及定向验收”；裁决为“闭”的项保持关闭，并在报告中写明理由（引用 t19 行）。注意：

- 只读项必须零业务副作用（不启动 Core/Agent 进程、不拨号、不写业务文件、不发网络请求）。
- “持久”意图项：外部调用要求稳定意图键（CLI `--intent-key`，MCP `_meta["huhu.dev/intent-key"]`）；“领域”项用本模块原有 requestId/operationId 对账；未知结果不自动重放。回执中不得持久化 token、正文、凭据等敏感结果，改用安全投影。
- 现有 `exposable: true` 的同域用户动作（G8.1 段列出的守卫）与新开放项对齐，`defaultExposed` 一律 false。
- 集成已含 Kernel 组（`externalIntentRequired`）、G3.4 扩展命令委托与 C05 HTTP MCP 跨重启恢复（`packages/kernel/test/mcp-recovery.test.ts` 有夹具；恢复后领域写重交返回 unknown，原结果走领域 read 回读）。
- 已合入集成的会话身份（`ctx.subject` 为逻辑会话主体）直接使用，不要改 dispatcher、operation-receipts、server、MCP 适配器、contracts 调用身份；确需改动时停下写清需求交 Lead。
- 只读项零副作用尤其指不启动或拨号 Herdr Core、不启动 Agent 进程（布局读取已由 Lead 在 `fc048b6b` 改为外部调用不启动 Core，沿用）。
- 同时为 Tasks 提供无拨号目标快照（t26 报告「阻碍与接续」第一条）：Tasks 内部调用的 `agent.targets.list`（或等价内部合同）增加显式快照模式，复用 `SessionsService.list(spaceId)` 已存会话与 `AgentDetector.locate` 磁盘检查，未核实 live 资格明示不可用；冷/热夹具核对无进程、拨号、网络与写入。完成后把 `plugins/tasks` 中 `tasks.dispatch.targets` 的 descriptor 改为可开放并复跑 t26 的双入口矩阵用例（这一处 Tasks 改动授权给你）。
- 联验 1 live 用例 `plugins/agent-cli/test/native-receipts.live.test.ts` 必须继续通过（`HUHU_AGENT_LAUNCH_TEST_BIN=<工作树>/apps/desktop/resources/herdr/linux-x64/herdr-core`）。

静态目录（`apps/engine/src/boot.ts` 约 135–149 行的 `declareDescriptors`）和插件注册由 Lead 接：在报告里给出需要 declare/bind 的精确清单（从同一源导出 descriptor 集，不手抄元数据）。若不改 boot 测试无法跑通，可在候选中改最少行并单列。

## 读写范围与产物

- 可写业务范围 — `plugins/agent-cli/**` 的 descriptor、manifest、领域 handler 与同目录测试；`plugins/tasks/src/engine/**` 中仅限 `tasks.dispatch.targets` 的开放与其测试；#6 证据目录。
- 禁止改动 — `apps/engine/src/boot.ts`（除上述最少行）、其他插件、Kernel dispatcher/server/MCP/contracts、`packages/kernel/src/capabilities/**`（Kernel 组在改）、`packages/kernel/src/plugins/**`（扩展组在改）、Vault 包收集器、根锁文件。不 push，不启动子 agent，不碰真实 Vault、凭据或原生 Agent 历史。
- 预期产物 — 候选提交（临时索引方式，父 `d7581825`）、证据 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G-agent-cli-exposure-linux.md`、报告（逐 ID 表：最终 exposable/defaultExposed、scope/risk、意图、校验、测试名）。

## 验收与验证

- t19「双入口验收矩阵」对每个开放 ID 参数化：默认关 → 开 → 撤（CLI 与 HTTP MCP 各一遍，撤销后原连接同名同意图再调被拒、领域计数不增）；只读零副作用计数；对象与并发；“持久/领域”项的同键并发、丢应答、重启各只产生一次效果。保持关闭的项断言外部 `CAPABILITY_NOT_EXPOSED` 且批量全开选不中。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、相关 vitest（`--maxWorkers=1`）通过；全量一律 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`（全机一把锁）。
- HTML/CSS/客户端 TS 如需改动，先按 AGENTS.md 执行 zh-modern-web-guidance 的 search 与 retrieve。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址与任务文件名；manifest 当前行须指向本任务且为 `active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交，在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
5. 2026-11-21 定案见 `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md`。
6. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。
