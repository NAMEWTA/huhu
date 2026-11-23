# task01.md #6 领域组 Mail：plugins/mail 的逐项开放

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t2r`；worker 内 `HC_TERMINAL_ID` 应为 `t2r`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/report01.md`
- Lead 回告方式 — Lead 主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-mail`，HEAD `eaa5545a`。
- 接续依据 — t19 盘点 `t19/report01.md`（Lead 已验收）：本组各节 「## mail」及「Mail AI 的确认与待定事项」，以及「读表与实施边界」「双入口验收矩阵」「G8.1 交付条件」「组间交付与 Lead 独占写入」。

## 目标与输入

按 t19 本组各节逐 ID 实施：裁决为“开”的项改为 `exposable: true`、`defaultExposed: false`，按行内 scope/risk 设置，并落实行内“当前守卫 / 意图 / 对象校验及定向验收”；裁决为“闭”的项保持关闭，并在报告中写明理由（引用 t19 行）。注意：

- 只读项必须零业务副作用（不启动 Core/Agent 进程、不拨号、不写业务文件、不发网络请求）。
- “持久”意图项：外部调用要求稳定意图键（CLI `--intent-key`，MCP `_meta["huhu.dev/intent-key"]`）；“领域”项用本模块原有 requestId/operationId 对账；未知结果不自动重放。回执中不得持久化 token、正文、凭据等敏感结果，改用安全投影。
- 现有 `exposable: true` 的同域用户动作（G8.1 段列出的守卫）与新开放项对齐，`defaultExposed` 一律 false。
- 集成已含 Kernel 组（`externalIntentRequired`）、G3.4、C05 HTTP MCP 跨重启恢复（`packages/kernel/test/mcp-recovery.test.ts`）以及 Tasks/Automations、Notes/Inbox/Guide、Agent CLI 三个领域组（双入口矩阵写法可参考 `plugins/notes/test/domain-exposure.engine.test.ts`、`plugins/agent-cli/test/tool-exposure.test.ts`）。
- 已合入集成的会话身份（`ctx.subject` 为逻辑会话主体）直接使用，不要改 dispatcher、operation-receipts、server、MCP 适配器、contracts 调用身份；确需改动时停下写清需求交 Lead。
- Mail AI 外部开放按 2026-11-21 定案（`decisions-2026-11-21.md` 末节）与 t19「Mail AI 的确认与待定事项」：外部 `mail.ai.prepare` 只创建待确认请求（固定选择范围、片段与问题摘要、模式、目标服务/模型、账号及设置版本，不发送正文）；用户在桌面或 Web 工作台一次性批准后，`mail.ai.chat` 才发送；未批准保持待确认或可取消；工具自报 `confirmed:true`、自报账号或单持 approvalId 一律无效。沿用 Automations 本机终端规则批准的现有模式（查 `plugins/automations/src/engine/terminal-environment.ts` 与其工作台 UI）。`mail.ai.getSettings` 脱敏查询可逐项开放；接受候选 Key 的 verify/save 保留桌面秘密编辑（闭）。结果只供阅读或采纳为可编辑草稿，发信另需独立授权。
- 工作台批准界面需要改 `plugins/mail/src/ui/**`：先按 AGENTS.md 执行 zh-modern-web-guidance 的 search 与 retrieve（桌面经 `window.huhuHost`，Web 按 Baseline Widely available）；复用现有对话框/确认组件，不新增设计语言。
- t19「切片回归」：Mail 验未确认时零发送、SMTP 未知不重复。使用回环 IMAP/SMTP/AI 夹具（`plugins/mail/test/fixtures/**`），合成正文与合成 Key，断言回执、审计、日志、事件、包内均无明文。

静态目录（`apps/engine/src/boot.ts` 约 135–149 行的 `declareDescriptors`）和插件注册由 Lead 接：在报告里给出需要 declare/bind 的精确清单（从同一源导出 descriptor 集，不手抄元数据）。若不改 boot 测试无法跑通，可在候选中改最少行并单列。

## 读写范围与产物

- 可写业务范围 — `plugins/mail/**`（engine、ui、测试）；#6 与 #8 证据目录（`.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/evidence/`）。
- 禁止改动 — `apps/engine/src/boot.ts`（除上述最少行）、其他插件、Kernel dispatcher/server/MCP/contracts、`packages/kernel/src/capabilities/**`（Kernel 组在改）、`packages/kernel/src/plugins/**`（扩展组在改）、Vault 包收集器、根锁文件。不 push，不启动子 agent，不碰真实 Vault、凭据或原生 Agent 历史。
- 预期产物 — 候选提交（临时索引方式，父 `eaa5545a`）、证据 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/evidence/G-mail-exposure-linux.md`、报告（逐 ID 表：最终 exposable/defaultExposed、scope/risk、意图、校验、测试名）。

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
