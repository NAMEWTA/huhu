# 任务报告 · #6 C05 HTTP MCP 跨 Engine 重启的逻辑会话恢复

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t27
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t27/task02.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t27/report02.md
- 执行结果 — done

## 结论

同一 HTTP MCP 逻辑会话可用原 Gateway 令牌和恢复凭据跨 Engine 重启恢复。回环验收从 `/mcp` 受理写入，经 `/api/v1/mcp` 恢复后读回原 operationId，同键同参重试仍只有一次业务写入。新建独立会话无法查询原回执。SSH 公共作业以恢复后的主体读回原终态，回环命令只执行一次。

## 产物与改动

- 候选提交 — `a98b3079543c612a3abea69b22575bd8ab1c3897`，父 `e3aa1cd4e55f676c9a76048acba96d21c25f278b`。
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-g6-notes`。通过临时索引生成候选，源码与测试同候选精确一致。工作树 HEAD 仍为父提交。
- 证据已追加到候选的 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/evidence/G-session-identity-linux.md`「跨 Engine 重启恢复」。工作树的 `.agents` 挂载只读，通过临时索引写入同一路径。
- `mcp-http.ts` 使用 initialize 的 `_meta["huhu.dev/session-recovery"]` 接收及签发恢复凭据。Gateway 客户端在没有旧 transport 头的新 initialize 中提供原 Bearer 和上次恢复凭据，再使用响应轮换后的凭据及 `Mcp-Session-Id`。旧凭据及相同主体的在用会话均不能再次恢复。默认期限从首次签发起为 24 小时，由 `recoveryAgeMs` 调整，轮换沿用原截止。Gateway 令牌当前有效至撤销，每次恢复均先验证父凭据。共享 bootstrap 的 stdio 仅有进程内对账。
- `McpSessionPrincipal.recovered` 将恢复状态传给 Dispatcher。先检查现行授权，再匹配原主体、能力、意图键和输入。已完成的通用回执可回放，缺失、accepted、paused 保持 unknown。恢复态可调用已授权的读接口，例如 SSH 作业回读。普通 CLI 沿用原主体和持久意图合同。
- 额外的最小共享层接线是 `server/http-app.ts` 为两条路径提供统一的 Gateway HTTP 会话，以及 `gateway-tokens.ts` 在同一次原子文件更新中保存服务配置和持久代次。关闭后再启用仍拒绝旧恢复凭据。另格式化了基线中未通过 oxfmt 的 `server/capability-http.ts` 发现函数，行为保持原样。
- Engine 装配单列为 `apps/engine/src/boot.ts` 一行。向当前可写且有目录实例标识的 Vault 注入现有 runtime 目录和配置代次读取函数。插件业务代码和回执磁盘格式保持原样。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 基线红灯 | 新回归在首次 initialize 缺少恢复凭据处失败。原 task01 夹具重启用新会话同键重试得到新 operationId，写入从一次变两次 | `/tmp/huhu-g6-c05.irlFMN/red.log`、t27/report01.md |
| 同键、重启、授权与副作用 | 同会话并发只写一次，恢复后原 ID 与旧结果相同，新会话查不到。异参冲突，当前工具撤权后回执查询和重试拒绝。缺失或只保留 accepted 的回执保持 unknown | `packages/kernel/test/mcp-recovery.test.ts` |
| 身份、失效与轮换 | 错父凭据、旧凭据、并发使用旧凭据的第二次尝试、显式 DELETE、到期、禁用重开、父令牌撤销、复制 Vault 均被拒绝 | 同上及 `plugins/ssh/test/public-resources.engine.test.ts` |
| SSH 与秘密落盘 | 恢复主体读回已退出作业及输出结束游标。缓存输出按既有 SSH 合同过期。回环执行计数 1。运行态、操作账本、审计均找不到合成凭据原文。真实隔离 Vault 导出包和默认 Git 状态均不包含恢复状态文件 | 同上；复制 Vault 拒绝用例另单独重跑，`/tmp/huhu-g6-c05.irlFMN/copied-vault.log` |
| typecheck、lint、format:check、knip | 全部退出 0 | `/tmp/huhu-g6-c05.irlFMN/gates-final.status` 及对应 `*-final.log` |
| 相关 Vitest 单 worker | 8 个文件、84 项通过 | `/tmp/huhu-g6-c05.irlFMN/targeted-final.log` |
| 全量共享锁，2 workers | 156 个文件通过、8 个文件跳过。1782 项通过、19 跳过，退出 0 | `/tmp/huhu-g6-c05.irlFMN/full.log`、`full.status` |

Node 24.21.0、pnpm 12.10.1，测试使用隔离的 `XDG_RUNTIME_DIR`。执行全量的命令为 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`，同时用 Vitest 环境变量将 forks/threads 限为 2。

## 阻碍与接续

交付无阻碍。按 task02 约定，task01 暂停至 Lead 合入候选。轮换提交成功后若响应丢失，旧凭据保持失效。没有收到新凭据的客户端会失去该逻辑会话的恢复机会。跨平台文件系统行为在本轮 Linux 范围内验证。

## Lead 验收

由 Lead 在验收后追加。

Lead 验收（2026-11-22）：通过。候选 `a98b3079` 快进到 `impl/huhu-issues-3-10-g6-notes`，合入集成 `ecc1bd93`；boot.ts 一行接线保留（仅可写 Vault 注入本机 runtime 目录）。worker 全量 1782/0/19。
