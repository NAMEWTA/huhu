# #6 HTTP MCP 会话身份与 SSH 所有权

验证机为 Linux，候选基于 `f7901b0a6b86910f52d74efac8ec1f438b387a9d`。用临时 Vault、合成令牌和回环 SSH 服务器验证。

## 会话和回执

- HTTP MCP 的 `initialize` 由 SDK 发放 256 位随机 `Mcp-Session-Id`。Engine 用句柄摘要查表，以经过认证的父凭据、入口和当前服务生命周期核对会话。SDK transport 在进程内持有原句柄。逻辑 ID 与句柄独立，句柄未进入 owner、持久回执或应用日志。 [MCP 2025-11-25 Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management)
- 每个会话最多空闲 30 分钟，总寿命 8 小时。每凭据最多 16 个会话，单监听器最多 128 个。并发上限为每父凭据 32、每会话 8，监听流占一个槽。退出、过期、父凭据撤销、MCP 生命周期结束和 Vault 监听器关闭都会失效。
- Dispatcher 从已验证的 principal 计算 subject。持久意图、操作读回和 SSH 作业及待答沿用现有 owner 校验。SSH 连接仍核对原 `sessionId`、主机和路由修订。普通 CLI 的身份可在进程间用于查询回执。同一 stdio 进程转发能力目录、资源、工具和操作查询时带同一内层会话句柄，标准输入正常关闭时发送 DELETE。 服务停用会使已绑定的 stdio 会话失效，重新启用后由新客户端进程建立会话。
- 同一个会话可用原 Bearer 及句柄重新查询作业，按 SSH 输出字节游标读回。这里采用现有领域回执与游标完成对账。旧传输句柄只在本次 Engine 生命周期有效。

## 验收场景

| 场景 | 检查 |
| --- | --- |
| 同一 Gateway 令牌的 A、B 与另一独立令牌 | A 成功准备并执行回环 SSH 作业。B 和另一令牌对 A 的状态、输出、取消、信任待答和列表均无权。另一令牌携带 A 的句柄得到 404。普通 CLI 和普通 HTTP 也不能凭原作业 ID 查询 A 的领域回执。 |
| 断线、并发与一次性答复 | 主动断开真实 SSE 响应后带原句柄重连，待答仍可读且只能消费一次。作业输出从同一字节游标读出同一页。两个并发启动只执行一次。串用另一个作业的 SSH 连接 ID 被拒，只取消指定作业。 |
| 撤权、关闭、过期、切库与重启 | 缓存工具名仍走当前授权。DELETE、时钟推动超过空闲 TTL、关闭后重开 MCP、撤父令牌和切换 Vault 后都拒绝旧会话。撤令牌结束已有流。原 Vault 重启后用原令牌携带旧句柄得到 404，新初始化也不能认领旧作业，回环 SSH 记录的执行次数仍为 1。 |
| stdio 与普通 CLI 的持久意图 | 两个真实 stdio 子进程使用同一个 Engine bootstrap。每个会话重复提交同一意图返回自身原回执，两个会话的操作 ID 各自独立、互相读不到。HTTP MCP 同样有独立回执。普通 CLI 的重复调用及重启后查询仍命中原操作。 |
| 能力入口和落盘前复核 | Kernel 最小装配验证 `hasMcpPrincipal` 识别实际 Dispatcher subject，并在过期、服务信号及令牌撤销后失效。生产装配的任务扫描在同一会话只受理一次，规则删除仍可对账，重启后的新 stdio 会话无法认领。撤 MCP 服务时，Safe 在途读取返回 401，响应中没有合成秘密。 |

主要用例位于 `plugins/ssh/test/public-resources.engine.test.ts`、`apps/cli/test/cli.test.ts`、`packages/kernel/test/server.test.ts`、`plugins/automations/test/task-scan-occurrences.test.ts` 和 `plugins/safe/test/external.engine.test.ts`。

## 验证输出

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| pnpm typecheck | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/typecheck.log` |
| pnpm lint | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/lint.log` |
| pnpm format:check | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/format-check.log` |
| pnpm knip | 退出 0 | `/tmp/huhu-g6-session-t1y.AThDMs/knip.log` |
| 定向 Vitest，单 worker | 通过 187，失败 0，跳过 5。文件 16 passed ／ 1 skipped (17) | `/tmp/huhu-g6-session-t1y.AThDMs/related.log` |
| 全量 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` | 通过 1667，失败 0，跳过 19。文件 153 passed ／ 8 skipped (161) | `/tmp/huhu-g6-session-t1y.AThDMs/test.log` |

Node 24.21.0，pnpm 12.10.1。测试使用独立的 `XDG_RUNTIME_DIR`。全量命令保留约定的参数形式，另外通过 `VITEST_MAX_FORKS=2` 与 `VITEST_MAX_THREADS=2` 把 Vitest worker 实际限制为 2。未执行 E2E。

## 跨 Engine 重启恢复

跨重启恢复证明留给后续 C05 切片。应在 Kernel MCP 认证适配层和当前 Vault 的本机受保护运行态中增加可轮换的证明摘要，绑定稳定 Vault 实例、稳定父凭据 ID、逻辑会话 ID、授权代、到期和失效状态。重启握手核验仍有效的原令牌与证明，原子轮换恢复证明和 transport 句柄，恢复原逻辑 owner 后只查询既有回执。缺少结果时保留 unknown，并继续用 SSH 领域账本核实。还需要决定正式停服时的对账窗口，以及为共享 bootstrap 的 stdio 提供可独立核验的本机客户端绑定。

### C05 实施与 Linux 复验

HTTP Gateway 客户端从首次 `initialize` 的结果读取 `result._meta["huhu.dev/session-recovery"]`。重启后，客户端以原 Bearer 向任一 HTTP MCP 路径发送新 `initialize`，把恢复凭据放到 `params._meta` 的同名字段。客户端采用响应返回的新凭据和新 `Mcp-Session-Id`。两个凭据用途不同，旧恢复凭据只可消费一次。无恢复字段的 initialize 生成独立逻辑 ID。共享 bootstrap 的 stdio 和普通 CLI 沿用各自的身份合同。 [MCP 2025-11-25 元数据扩展](https://modelcontextprotocol.io/specification/2025-11-25/basic/index#meta) · [HTTP 会话管理](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management)

- 现有 Vault 写者锁提供单写者。`Vault.runtimeDir/mcp-recovery.json` 只保存恢复凭据摘要、Vault 目录实例、稳定父凭据 ID、逻辑会话 ID、MCP 配置代次和截止时间。文件通过独占暂存、flush 和原子 rename 发布。POSIX 下校验文件所有者和权限并同步目录。恢复字段进入 SDK 前从请求中取出。
- 默认从初次签发起有效 24 小时，由 `recoveryAgeMs` 控制，轮换沿用原截止。每次握手重新验证父令牌，目前 Gateway 令牌有效至撤销。关闭 HTTP MCP 或改变 transport 时，配置和新代次一起原子写入。显式 DELETE 清除恢复记录，父令牌撤销后认证即失败。正常 Engine 关闭与重启间隔可以恢复。复制 Vault 目录会改变本机实例。
- Dispatcher 先复核当前工具授权，再按原 owner 和意图匹配回执。恢复的 transport 可通过当前授权执行读操作。写调用只有已匹配的通用持久回执可直接回放，缺失、未完成或已暂停的操作返回 unknown，写 handler 不执行。SSH 公共作业由领域读入口查询原持久作业状态，进程内 stdout 已过期，保留原游标和截断信息。
- 恢复响应若在原子轮换后丢失，旧凭据仍作废。客户端没有收到替代凭据时无法恢复该逻辑主体。此处的失败策略保留旧凭据的一次性。

| 验收 | Linux 观察 |
| --- | --- |
| 回归红灯 | `mcp-recovery.test.ts` 在基线首次 initialize 缺少恢复凭据。原 task01 回环在重建服务后用新会话同键再写，效果从 1 增到 2。 |
| 通用持久回执 | 同一会话并发同键同参只执行一次，从 `/mcp` 受理后经 `/api/v1/mcp` 恢复，读取和重放使用原 operationId。未恢复的新会话无法查询原回执。同键异参得到 `IDEMPOTENCY_MISMATCH`，工具撤权后回执查询和重放均拒绝。 |
| 失效和缺失结果 | 同旧凭据两个并发恢复仅一个成功。错父凭据、旧凭据、显式 DELETE、到期、关闭再启用、撤令牌和复制 Vault 均拒绝恢复。只有 accepted 记录时查询与同键调用保留 unknown，持久日志和副作用计数保持原值。 |
| SSH 与数据外流边界 | `public-resources.engine.test.ts` 从重启后的原主体读取终态和输出游标。回环 SSH 执行一次。恢复凭据原文和 transport 句柄未写入恢复文件、操作账本或审计。用真实 Vault 运行数据包导出及默认 Git 状态检查，均未收录恢复文件。 |

Node 24.21.0、pnpm 12.10.1。隔离 `XDG_RUNTIME_DIR`。先后运行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check` 和 `pnpm knip`，均退出 0。相关 Vitest 单 worker 共 84 项通过。全量以 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` 运行并用 Vitest 环境变量将 forks/threads 均限制为 2，1782 通过、19 跳过，156 个文件通过、8 个文件跳过。日志在 `/tmp/huhu-g6-c05.irlFMN/`。
