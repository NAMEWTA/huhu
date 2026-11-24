# task02.md #6 C05 HTTP MCP 跨 Engine 重启的逻辑会话恢复

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t27`。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t27/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t27/report02.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-g6-notes`，HEAD `e3aa1cd4`。
- 接续依据 — 你的 report01 阻碍（Lead 认可）。task01 暂停；本任务完成并由 Lead 合入后，再在同分支接续 task01。

## Lead 授权与范围

Lead 授权你作为本轮共享会话层的唯一写入者，实现 C05：`packages/kernel/src/server/mcp-http.ts`、`packages/contracts/src/capability.ts` 的会话身份类型、`packages/kernel/src/dispatcher.ts` 与 `operation-receipts.ts` 中与恢复相关的最少改动、`apps/cli/src/mcp.ts`（如需）、对应测试；`apps/engine/src/boot.ts` 的服务装配最少行（报告单列）。其他人此时不改这些文件。不改插件业务。

## 设计依据

`.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G-session-identity-linux.md`「跨 Engine 重启恢复」，以及 t19 报告「重启后的 C05 对账」段。要点：

1. initialize 时向客户端另发一次高熵恢复凭据（与 transport 句柄分开），服务器只在当前 Vault 本机受保护运行态（`.huhu/runtime/<machine>/…` 下的现有 runtime 目录，不进 Vault 包、不进 Git）保存其摘要，绑定稳定 Vault 实例、稳定父凭据 ID、逻辑 clientSessionId、授权/撤销代、到期时间与失效状态。
2. 重启后客户端以仍有效的原 Gateway 令牌 + 恢复凭据重新握手，恢复原逻辑会话主体；原子轮换恢复凭据与 transport 句柄，旧恢复凭据立即作废。只能查询既有回执与续用同一意图；结果缺失时保持 unknown，不重新执行。
3. 失效：显式 DELETE、撤父令牌、关闭 MCP 服务、切库/复制到新 Vault、到期均使恢复凭据失效；重启本身不失效。没有恢复凭据的新 initialize 仍得到全新且隔离的会话。
4. 产品默认（Lead 定，报告注明可调）：恢复凭据有效期 24 小时，且不超过父令牌有效期；正常停服与崩溃一视同仁，均可在有效期内恢复。
5. stdio：共享 bootstrap 的 stdio 进程没有可独立核验的本机客户端绑定，本切片只保证同进程会话内的对账，跨重启恢复不提供，报告写明。普通 CLI 的原主体语义不变。
6. 客户端如何携带恢复凭据：沿用 MCP 协议可扩展位（如 initialize 的 `_meta` 字段与响应 `_meta`），在 `/api/v1/mcp` 与 `/mcp` 两个 HTTP 入口一致；CLI 内层 SDK 会话（stdio 转发）不需要。

## 验收

- 你的 report01 复现夹具改为回归用例：同一逻辑客户端重启后恢复，同键同参返回原 operationId、业务效果保持 1 次；未恢复的新会话查不到原操作；用旧恢复凭据第二次恢复被拒（已轮换）；撤令牌、关 MCP、DELETE、到期后恢复被拒；换到复制出的 Vault 恢复被拒；SSH 公共作业重启后恢复的会话可查原作业回执、执行计数 1（复用 `plugins/ssh/test/public-resources.engine.test.ts` 夹具）。
- 恢复凭据原文不进日志、回执、审计、Vault 包与 Git。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、相关 vitest（`--maxWorkers=1`）；全量 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`。
- 候选提交（临时索引，父 `e3aa1cd4`），证据追加到 `G-session-identity-linux.md` 的「跨 Engine 重启恢复」节。报告格式同前，发布后打印路径并停下。
