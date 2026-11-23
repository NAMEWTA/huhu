# task02.md 执行报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t1k`，执行终端 `t1y`
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/report02.md`
- 执行结果 — done

## 结论

扩展命令可独立声明、发现、配置和撤销。直接调用与 `plugins.commands.run` 都进入对应的 Dispatcher 描述符。Engine 在每步通过本次 IPC 委托检查原调用者的命令与目标权限、扩展当前 grant、Vault、进程和会话状态。父/子操作回执保护已完成的写入，明确未受理的步骤可以持原意图续跑。每日回顾、便携导出和快速剪藏已迁移。

## 产物与改动

- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-extensions`，候选 `c59550289b96fdf6560ad087e0e66fda8af3a52c`，父 `499427bee8976d6e96bf19693f54641f1aa360eb`。临时索引生成候选，分支和真实索引仍指向基线。
- 证据加入候选的 `.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G3.4-extension-commands-linux.md`。工作树 `.agents` 为只读挂载，证据随候选树交付。业务文件和候选一致。日志和证据副本在 `/tmp/huhu-g34-t1y.v2Dcpu`。
- `packages/kernel/src/plugins/command-descriptors.ts` 把外部清单的本地 JSON Schema 子集编译给登记表。 `external.ts` 和 `host-script.ts` 管理逐次 IPC 委托。 `dispatcher.ts` 与 `operation-receipts.ts` 增加经授权的命令转发、可安全暂停的父/子回执和稳定步骤。
- 新增仅工作台可调用的 `plugins.grants.update`，用于缩减或恢复原清单内的授权。更新测试使用已有卸载/安装流程。工作台 UI 无变更。

### Engine 装配供 Lead 复核

候选含 `apps/engine/src/boot.ts` 的三处最小接线，真实 Engine 的停用预配与 CLI/MCP 测试依赖这些接线：

1. `plugins.onRegister` 约第 220 行将 `origin === "external"` 的清单交给 `external.declare(m, pendingInstall)`。内置清单仍走原 `registry.declare`。现有 onInstallConfirmed 和 onUnregister 提供确认及名称回滚。
2. `new ExternalPlugins` 约第 478 行传入 `registry`、`dispatcher: () => dispatcherRef.current!` 与 `vaultInstance: rootIdentity ? JSON.stringify([vault.id, ...rootIdentity]) : vault.id`，移除宿主启动所用的 TokenTable 和 Engine URL。
3. Dispatcher `grantedPermissions` 对外部插件读取 `external.grantsOf(id)`，内置插件沿用 `plugins.permissionsOf(id)`。插件作用域负责释放已绑定的 handler 并关闭进程委托。

## 验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| pnpm typecheck | 退出 0 | `/tmp/huhu-g34-t1y.v2Dcpu/typecheck.log` |
| pnpm lint | 退出 0 | `/tmp/huhu-g34-t1y.v2Dcpu/lint.log` |
| pnpm format:check | 退出 0 | `/tmp/huhu-g34-t1y.v2Dcpu/format-check.log` |
| pnpm knip | 退出 0 | `/tmp/huhu-g34-t1y.v2Dcpu/knip.log` |
| 定向 Vitest，单 worker | 通过 92，失败 0，跳过 0。文件 7 passed (7) | `/tmp/huhu-g34-t1y.v2Dcpu/related.log` |
| 全量 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` | 通过 1680，失败 0，跳过 19。文件 154 passed ／ 8 skipped (162) | `/tmp/huhu-g34-t1y.v2Dcpu/test.log` |

Node 24.21.0，pnpm 12.10.1。测试使用独立的 `XDG_RUNTIME_DIR`。全量命令保留约定的参数形式，另外通过 `VITEST_MAX_FORKS=2` 与 `VITEST_MAX_THREADS=2` 把 Vitest worker 实际限制为 2。未执行 E2E。

## 阻碍与接续

动态登记旧命令的扩展需迁移到 `contributes.commandDescriptors` 与 `handler(args, context)`。支持严格、有界、无外部引用的 JSON Schema 子集。插件进程仍按项目既有本机用户权限运行，委托约束覆盖 Engine 能力调用。跨 Engine 重启的 MCP 原客户端恢复证明沿用 task01 的 C05 边界。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-22）：通过。候选 `c5955028` 快进到 `impl/huhu-issues-3-10-g6-extensions`，合入集成 `5307b88f`。冲突：`dispatcher.ts`/`define.ts` 与 Lead 的 `6471329e`（externalIntentRequired）同处修改，外部意图检查放在命令持久受理前并存；boot.ts 三处接线保留。合并后 dispatcher+external-plugins 43/43。终端 t1y 关闭。
