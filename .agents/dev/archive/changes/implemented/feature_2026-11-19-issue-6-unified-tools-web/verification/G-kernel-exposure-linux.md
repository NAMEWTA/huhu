# #6 Linux Kernel 能力开放

基线为 `6471329e`。使用 Linux、Node 24.21.0、pnpm 12.10.1、独立 XDG 目录、临时 Vault 和回环服务。两个入口分别使用普通 CLI 身份的实际 HTTP 调用和 Gateway 令牌的 HTTP MCP 会话。

## 交付范围

- 本组新增 38 个可选开放 ID。6 个原有可选项也核对为默认关闭。外部默认不发现，直接调用按同一策略拒绝。
- 6 个 Gateway 管理动作与 5 个 Web 分享和邀请管理动作按 2026-11-21 定案保持仅工作台。批量全开筛掉全部 11 项。
- 13 个通用写入或管理能力要求稳定意图键。包导入导出另带领域 ID、包摘要和不可覆盖目标约束，同样复用 Dispatcher 的持久受理。回执中的看板、Vault 说明与习惯结果只留核对所需的标识和版本。
- 外部数据包只接受包 ID 与恢复 ID。Engine 在 Vault 的父目录下按库实例和受信主体划分专用目录，返回 Engine 本机路径和摘要。恢复仅可读取该主体的已生成或本机放入该目录的包，生成新 Vault ID。专用目录要求父目录可写，工作台仍走原路径选择。
- Health 外部结果使用模块和状态摘要，通知外部列表只包含已知 Kernel 来源。Vault 通用读取拒绝受保护目录和链接，受管文件列表排除 `.huhu`。可对外使用的 Vault 索引代次和元数据版本由 `vault.info({ includeVersions: true })` 返回。

## 用例索引

以下名称和逐 ID 表见报告。Kernel 测试位于 `packages/kernel/test/kernel-exposure.test.ts`。

| 简称 | 实际用例 |
| --- | --- |
| 只读 | `%s 默认关闭 → 开放后只读 → 撤销`，29 个能力 × 2 入口 |
| 持久 | `%s 默认关闭 → 开放后持久去重 → 撤销`，15 个能力 × 2 入口 |
| 批量全开 | `批量全开排除 11 项工作台管理能力，已知名称直接调用拒绝`，2 入口 |
| 冷态健康检查 | `冷态健康检查和诊断仅取快照，查询不会从诊断原文推断私有内容`。`plugins/agent-cli/test/sessions.test.ts` 的实际 Core 探测用例用启动标记证实未拉起 Core |
| Vault 读取边界 | `Vault 范围、二进制和普通文件读取均拒绝受保护对象与库内链接` |
| 通知 ID | `通知只列出可见来源，清理绑定已读 ID，重试与晚到通知互不干扰` |
| 重启回执 | `持久回执跨 Dispatcher 重启保留结果，拒绝异参和已撤权的重试` |
| 专注代次 | `专注只读不结算，计时器代次冲突被拒且同意图只通知一次` |
| 看板恢复 | `看板恢复预览保留原件，提交校验 Vault 与摘要，持久回执只保留修订` |
| 插件启停 / 索引代次 | `插件启停检查版本与完整连带停用集合，索引清理拒绝旧代次` |
| 包导出恢复 | `包导出不接受 Engine 路径，恢复要求摘要，目标隔离且同恢复 ID 无法覆盖` |
| Engine 兼容 | 默认 `vault.info` 跨工作台及 CLI 结果一致，已邀请的浏览器工作台不发现桌面分享控制 |

## 验证输出

| 检查 | 结果 | 本机日志 |
| --- | --- | --- |
| `pnpm typecheck` | 退出 0 | `/tmp/huhu-t23-final-typecheck.log` |
| `pnpm lint` | 退出 0 | `/tmp/huhu-t23-final-lint.log` |
| `pnpm format:check` | 退出 0 | `/tmp/huhu-t23-final-format-check.log` |
| `pnpm knip` | 退出 0 | `/tmp/huhu-t23-final-knip.log` |
| Kernel 与 Core 定向 Vitest，单 worker | 6 文件，147 通过 | `/tmp/huhu-t23-final-related.log` |
| Engine 兼容 Vitest，单 worker | 2 文件，2 通过，筛选跳过 49 | `/tmp/huhu-t23-engine-compat.log` |
| `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` | Node 检查 23 通过。Vitest 1772 通过、3 失败、19 跳过，152 文件通过、3 失败、8 跳过 | `/tmp/huhu-t23-full.log` |
| Vault 暂存清理用例失败后隔离复测 | 26 通过，未复现 | `/tmp/huhu-t23-vault-recheck.log` |

全量运行同时通过 `VITEST_MAX_FORKS=2` 与 `VITEST_MAX_THREADS=2` 限制 worker。未执行 E2E。

## 集成接续

- `apps/engine/src/boot.ts` 当前在 `registerWebShareCapabilities` 前调用指南维护，随后两个公开 Web 工具改变指南的内置内容，刚打开 Vault 即报告 `outdated`。把 `guideRef.current?.maintain()` 移到 Web 能力注册之后、端点就绪之前，再运行 `apps/cli/test/cli.test.ts`。
- `apps/engine/test/tool-access.test.ts:88` 把 `capabilities.list` 作为永久禁止开放的样例。使用仍仅工作台的 `gateway.tokens.create` 代替。相邻的 `capabilities.list` 默认拒绝断言仍适用。
- `packages/vault/test/operations.test.ts:109` 在全量运行中观测到暂存项从磁盘消失时回执尚可见，单 worker 隔离复测通过。全量计数保留这次失败。
