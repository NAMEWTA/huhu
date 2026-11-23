# task01.md #6 协议/会话组：HTTP MCP 会话身份与同令牌隔离

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t1k`
- 身份核对 — 本机 Linux 默认 Core，worker 内 `HC_TERMINAL_ID` 应为 `t1k`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-protocol`，HEAD `f7901b0a`（集成最新）。
- 接续依据 — t19 盘点 `t19/report01.md`（Lead 已验收）；t11 审查 `t11/report01.md` 的 P1。完成后 Lead 会在同终端派发 task02（G3.4 扩展命令 caller 传递）。

## 目标与输入

实现 t19 报告「协议/会话组」中 HTTP MCP 会话身份部分（报告里“断线及重连”“当前策略 / 撤销”“接入现有代码”“stdio”“重启后的 C05 对账”“SSH 领域接线”“验收”各段，以及 t11 P1）。要解决的真实缺陷：同一 Gateway 令牌初始化的两个 HTTP MCP 会话共享 subject，A 的 SSH 作业、待答提示与操作回执对 B 可见可操作。

要交付：

1. 在 contracts 与 Kernel dispatcher 中引入服务端生成的逻辑会话身份（与父 credentialId 绑定），HTTP MCP 适配器在 initialize 时建立、后续请求凭 transport 句柄验证；网络断开不失效，显式结束/超时/MCP 停用/切库/撤父令牌失效。复用现有 MCP SDK 的 session 机制（`Mcp-Session-Id`）与现有 Gateway 令牌存储，不另造协议。
2. 操作回执（operation-receipts）、持久意图与 SSH owner 纳入会话维度；同逻辑会话重连可查原回执，换令牌或另一会话不可查；未知结果不自动重放。
3. stdio MCP（`apps/cli/src/mcp.ts`）每个客户端进程一次独立会话；普通 CLI 多次进程调用保留原认证主体。
4. Engine 重启后的恢复证明（报告「重启后的 C05 对账」）：先实现到“正常重连 + 重启后旧会话失效且不可认领旧作业、作业执行计数保持 1”，完整恢复证明若超出本任务，写清剩余设计与位置交 Lead，不要半实现。TTL 用保守默认并在报告列出。
5. SSH 领域接线按报告「SSH 领域接线」段：owner 写入 job/attempt/prompt 与回执查询键，状态/输出游标/取消/信任答复/列表均按 owner 过滤。

`apps/engine/src/boot.ts` 中服务装配、撤销与 `taskScanPrincipalCurrent`（约 428 行）的接线由 Lead 做：你在报告里写出精确接线（文件、位置、代码），并用包内最小测试装配验证。若不改 boot 测试无法跑通，可以在候选里改 boot.ts 的最少行，报告单列，Lead 复核后保留或重写。

## 读写范围与产物

- 可写业务范围 — `packages/contracts/**`、`packages/kernel/src/{dispatcher,operation-receipts,capabilities/define,capabilities/exposure}*` 及共享 policy、`packages/kernel/src/server/**` 与 MCP 适配器、`apps/cli/**`、`plugins/ssh/src/engine/public-*` 与 owner 相关文件、上述各自测试、#6 证据目录 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/evidence/`。实际文件名以代码为准，超出此范围前在报告说明理由。
- 禁止改动 — 插件注册、Vault 包收集器、根 `package.json`/`pnpm-lock.yaml`、其他插件业务。不 push，不改其他分支，不启动子 agent。不碰真实 Vault、真实凭据。
- 预期产物 — 候选提交（临时索引方式，父 `f7901b0a`）、证据 `evidence/G-session-identity-linux.md`、报告。

## 验收与验证

- 自动化测试覆盖报告「验收」段：独立令牌正常作业；同令牌 A/B 会话隔离（状态、输出、取消、信任决定、操作回读）；A 断网用原句柄重连读同一游标仅答一次；换令牌带原句柄被拒；撤权/撤令牌/关 MCP/换库；两个 stdio 客户端隔离；Engine 重启后旧会话不可认领、执行计数 1。复用 `plugins/ssh/test/public-resources.engine.test.ts` 夹具与回环 SSH。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、相关 vitest 文件通过；最后跑一次 `pnpm test -- --maxWorkers=3` 记录计数（Lead 基线 f7901b0a 之前为 1665 通过 / 0 失败 / 20 跳过）。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址与任务文件名；manifest 当前行须指向本任务且为 `active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只在给定范围内写业务产物；协作文件只写自己的报告和同目录临时稿。
4. 提交方式：按 topic「决定与交接」第 2 条用临时索引生成候选提交，在报告给出 SHA，保持工作树与候选一致。测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。本机内存有限：vitest 加 `--maxWorkers=3`，不跑 e2e；另有一名实现者同时在跑测试。
5. 2026-11-21 定案见 `.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md`（含 Gateway 管理动作仅工作台、Mail AI 外部发送需工作台一次性批准）。
6. 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。
