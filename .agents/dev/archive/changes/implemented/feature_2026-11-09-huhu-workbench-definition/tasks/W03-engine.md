# W03 Engine 与能力管线

## W03.1 contracts 包

- 目标：能力请求/结果、错误、事件、插件清单的 zod 模式与类型可被所有包使用。
- 依据：[interfaces](../interfaces.md) §1、§3、§5；[architecture](../architecture.md) §5（清单字段）。
- 前置：W01.1。
- 位置：`packages/contracts/src/{capability,errors,events,plugin-manifest,ids}.ts`。
- 复用：无。
- 实现要点：错误码枚举与 `HuhuError` 工厂；事件联合类型；`ids.ts` 生成与校验实体 id（data-model §3）；导出 zod → JSON Schema（`z.toJSONSchema`）供 `capabilities.list` 与 MCP 使用。
- 异常：无。
- 测试：模式往返与非法输入单元测试。
- 完成：其他包可导入；JSON Schema 导出覆盖所有模式。

## W03.2 Cordis 内核与插件管理器

- 目标：Engine 内以 Cordis 加载插件，启用/停用时贡献与资源自动释放。
- 依据：architecture §5（生命周期）；[plugins](../modules/plugins.md) §2 行为。
- 前置：W03.1。
- 位置：`vendor/cordis`、`vendor/cosmokit`、`vendor/timer`、`packages/kernel/src/{context,plugin-manager}.ts`。
- 复用：R-05。
- 实现要点：`HuhuContext` 扩展 Cordis Context：`huhu.defineCapability`、`huhu.call`、`huhu.events`、`logger`、`vault`；插件管理器读取 `plugins.json`、按 `dependsOn` 拓扑启用、记录状态（active/disabled/failed）、发布 `plugin.stateChanged`；停用时先在 Dispatcher 标记拒绝再 dispose。
- 异常：`apply` 抛错 → failed 且作用域回滚；依赖缺失 → 不启用并说明；循环依赖 → 清单校验失败。
- 测试：插件注册的定时器、事件监听、能力在停用后全部不可用的单元测试；失败回滚测试。
- 完成：两个测试插件可互相依赖地启停。

## W03.3 Dispatcher、权限与幂等

- 目标：所有能力调用经同一管线。
- 依据：interfaces §1、§4；security §1。
- 前置：W03.2。
- 位置：`packages/kernel/src/{dispatcher,capabilities/define,permissions,idempotency,gateway-audit}.ts`。
- 复用：无（自研，见 reuse §3）。
- 实现要点：按 interfaces §1 的 8 步实现；`AbortSignal` 传入 handler；幂等记录内存 + ndjson；能力开放状态读取 `plugins.json.capabilityExposure`。
- 异常：handler 超时（默认 60 秒，可由能力声明覆盖）→ `INTERNAL` 并记录；客户端断开 → signal abort。
- 测试：每一步失败路径的契约测试；同 key 重放返回同结果；同 key 不同输入 `IDEMPOTENCY_MISMATCH`。
- 完成：契约测试覆盖 interfaces §3 中与管线有关的错误码。

## W03.4 HTTP/WS 服务、令牌与 Renderer 客户端

- 目标：Renderer 通过 HTTP 调用 `vault.info`（W04 前返回占位数据）并接收事件。
- 依据：interfaces §6；security §1–2。
- 前置：W03.3。
- 位置：`packages/kernel/src/server/{http-app,ingress,ws-events}.ts`、`packages/workbench/src/engine-client/{client,query,events}.ts`。
- 复用：R-03。
- 实现要点：Hono 路由 `/api/v1/call`、`/api/v1/capabilities`、`/ws/events`、`/healthz`；Bearer 校验（`timingSafeEqual`）、Origin/Host/转发头策略、请求体上限；事件 `seq` 与补发缓冲（1000 条）、`resync`；客户端封装 React Query（查询键 `[vaultId, capability, input]`），事件到达时按 `entity.changed` 等失效对应查询；断线指数退避重连。
- 异常：Engine 不可达 → 外壳 Banner“工作台引擎未连接”并自动重试；令牌错误 → 401 后要求 Main 重新提供令牌。
- 测试：集成测试 401/403/413；事件补发与 resync；客户端失效逻辑单元测试。
- 完成：ACC-PL-08（HTTP 部分，令牌与 Origin）在 Engine 层通过。

## W03.5 Engine 进程、监管与关闭顺序

- 目标：Main 为窗口 fork Engine，崩溃可重启，关闭按顺序进行；无界面模式可单独运行。
- 依据：architecture §3（实例与端点、启动与关闭顺序）。
- 前置：W03.4。
- 位置：`apps/engine/src/{main,boot,shutdown}.ts`、`apps/desktop/src/main/engine-supervisor.ts`、`apps/desktop/src/preload/index.ts`（`engine()`、`onEngineState`）。
- 复用：R-02。
- 实现要点：utilityProcess 与 `ELECTRON_RUN_AS_NODE` 两种启动；ready 消息携带端口与 Renderer 令牌；端点描述文件写入与删除；崩溃时通知 Renderer 并提供“重启引擎”；窗口关闭时发送关闭请求并等待（上限 15 秒后强制结束）。
- 异常：端口占用重试随机端口；启动失败把结构化错误返回启动页。
- 测试：E2E 杀死 Engine 进程 → 界面显示已停止 → 重启恢复；集成测试关闭顺序（关闭中写调用返回 `ENGINE_CLOSING`）。
- 完成：上述测试三平台通过。

## W03.6 CLI 骨架

- 目标：`huhu --version`、`huhu call vault.info --json` 可用，能连接已运行的 Engine 或自行启动无界面 Engine。
- 依据：interfaces §6 CLI。
- 前置：W03.5。
- 位置：`apps/cli/src/{main,connect,commands/call}.ts`。
- 复用：R-04。
- 实现要点：Vault 定位（`--vault` 或向上查找 `.huhu/vault.json`）；读取端点描述；无 Engine 时启动并等待；输出与退出码约定；无界面 Engine 空闲 60 秒退出。
- 异常：端点描述存在但进程不在 → 删除陈旧描述后启动；连接超时退出码 3。
- 测试：集成测试：有桌面 Engine 时 CLI 复用；无 Engine 时 CLI 启动后 Engine 自动退出。
- 完成：测试通过；`huhu --help` 不需要 Vault。
