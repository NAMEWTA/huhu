# task01.md 执行报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t1k`，本次在登记的替代终端 `t1y` 完成
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/report01.md`
- 执行结果 — done

## 结论

HTTP MCP 初始化后由父 Bearer 与 SDK 句柄共同认证，使用同一 Vault 和令牌初始化的两个会话具有不同的调用主体。SSH 作业、连接尝试、待答、输出游标和领域回执沿用其 owner 校验。通用意图及操作回执通过 Dispatcher 的会话主体隔离。原句柄重连、只消费一次信任答复以及 Engine 重启后不能认领旧作业的行为均由回环 SSH 用例覆盖。stdio 每个进程独立会话，普通 CLI 保留原主体。

## 产物与改动

- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-protocol`，候选 `438f4281a01094fd98a73af40d8a0ae09949be43`，唯一父提交 `f7901b0a6b86910f52d74efac8ec1f438b387a9d`。候选使用临时索引，分支和真实索引保持在基线。
- 证据位于候选的 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G-session-identity-linux.md`。工作树内 `.agents` 为只读挂载，因此通过临时索引加入该文件，工作树业务文件与候选一致。证据副本和日志目录位于 `/tmp/huhu-g6-session-t1y.AThDMs`。
- `packages/contracts/src/capability.ts` 定义会话身份。Kernel `server/mcp-http.ts` 管理与父凭据绑定的 SDK 会话，`dispatcher.ts` 把验证过的会话 subject 用于幂等、回执和能力上下文。SSH 沿用 `public-resources.ts` 到 job、attempt/prompt 和领域账本的 owner 路径。CLI 使用内层 SDK 会话连接 Engine，标准输入正常结束时显式终止该会话。 服务停用会使已绑定的 stdio 会话失效，重新启用后由新客户端进程建立会话。
- 整合测试同步更新了旧的无握手 HTTP MCP 和未绑定的 stdio bootstrap 请求。范围包括 Engine、CLI、SSH 和直接依赖该入口的 Tasks、Automations、Mail、Safe、Agent CLI 测试，以及 SSH E2E 的请求夹具。其他插件业务代码无改动。Safe 夹具各自在普通 HTTP、HTTP MCP、stdio 入口取得其业务证明。

### Engine 装配供 Lead 复核

生产任务扫描在异步等待后会复核调用者，旧复核只认识 TokenTable 中的父主体。全量回归需要这条路径通过，所以候选在 `apps/engine/src/boot.ts` 实际包含两处接线：

1. `automations.apply` 约第 442 行使用已有 `serverRef`，调用 `taskScanPrincipalCurrent: (caller, subject) => (serverRef.current?.hasMcpPrincipal(caller, subject) ?? false) || (caller !== "mcp" && tokens.hasPrincipal(caller, subject))`。保留普通 CLI 和普通 HTTP 主体查询。
2. `startEngineServer` 约第 539 行传入 `vaultInstance: rootIdentity ? JSON.stringify([vault.id, ...rootIdentity]) : vault.id`。现有 `mcpHttp`、`mcpStdioEnabled`、`mcpSignal` 和 `serverRef.current = server` 提供服务生命周期。Gateway 撤销原有的 `TokenTable.removeHash` 会中止父 signal 并清除该令牌的所有子会话，Vault 切换时由已有的 Engine listener close 使整代句柄失效。

## 验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| pnpm typecheck | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/typecheck.log` |
| pnpm lint | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/lint.log` |
| pnpm format:check | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/format-check.log` |
| pnpm knip | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/knip.log` |
| 定向 Vitest，单 worker | 通过 187，失败 0，跳过 5。文件 16 passed ／ 1 skipped (17) | `/tmp/huhu-g6-session-t1y.AThDMs/related.log` |
| 全量 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` | 通过 1667，失败 0，跳过 19。文件 153 passed ／ 8 skipped (161) | `/tmp/huhu-g6-session-t1y.AThDMs/test.log` |

Node 24.21.0，pnpm 12.10.1。测试使用独立的 `XDG_RUNTIME_DIR`。全量命令保留约定的参数形式，另外通过 `VITEST_MAX_FORKS=2` 与 `VITEST_MAX_THREADS=2` 把 Vitest worker 实际限制为 2。未执行 E2E。

## 阻碍与接续

跨重启持久恢复证明留在 C05。证据文件记录恢复握手、Vault/父凭据绑定、原子轮换、撤销及 stdio 本机绑定的剩余设计。当前切片以正常重连可查、重启后旧句柄拒绝及旧作业不能被认领为完成条件。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-22）：通过。候选 `438f4281` 快进到 `impl/huhu-issues-3-10-g6-protocol`，合入集成 `1aa5f3b9`；boot.ts 两处接线保留（hasMcpPrincipal 已含服务启用与会话过期核对）。合入后 Lead 在集成上实跑 native-receipts/dispatch/task-dispatch 三个 live 文件 6/6 通过（含「MCP and CLI dispatch and answer through the same Core session」）。C05 跨重启恢复证明留待后续。
