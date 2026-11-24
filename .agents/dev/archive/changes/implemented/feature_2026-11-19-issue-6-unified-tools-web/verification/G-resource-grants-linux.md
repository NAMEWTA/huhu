# Q6-3 按已保存主机授权

工具策略文件仍为 `formatVersion: 1`。可选的 `resources["ssh.hosts"]` 保存该 Vault 中已保存主机的稳定 ID，缺省为空集。工具选择与资源选择共用策略修订、预览和一次原子写入。只允许工作台修改主机选择。已有浏览器邀请会话可保存主机选择，桌面仍可同时保存工具与主机选择。外部调用即使获得 `gateway.get` 也看不到主机选择。

## 调用行为

- `CapabilityContext.toolResourceIds` 每次读取当前策略。SSH 先验工具开关，再验目标和所有跳板的选择，最后核对原连接归属、路由修订或待答元组。列表先过滤可见对象。口令、本机凭据状态和 SSH 作业输出不写入授权策略或操作回执。
- 已受理作业的领域记录保存原路由涉及的主机 ID。回执、输出分页和待答在每次外部读取时复权。撤销主机后同一 MCP 会话仍可访问其他已授权对象，原主机的尝试、作业、输出及回执均拒绝访问。已受理的远端作业沿用自己的生命周期。外部工具入口不发放工作台终端 WebSocket。
- 有资源守卫的工具绕过通用请求结果缓存。通用扩展命令步骤目前没有资源复权回执接口，有资源守卫的工具暂不作为其代理目标。
- 有稳定 `intentKey` 的 SSH 连接核验和作业准备使用领域回执。同键重试核对同一主体与原主机授权。失去原连接或无法确认时返回 unknown，保持拨号和命令计数。既有不带域意图键的连接核验调用仍能在活动尝试期间归并。域回执旧记录若缺主机绑定，只在能够核对旧终态及当前路由时读取，缺失目标的旧中断记录失败关闭。

## 工作台和入口验收

- `packages/workbench/src/gateway/SshHostGrants.tsx` 在 MCP 工具目录提供主机选择。原生复选框含可见标签，选择后用提交按钮显式保存。通过当前策略修订检查并发冲突，跨端用工具策略变更事件回读。
- `tests/e2e/ssh/settings.spec.ts` 提供 `SSH settings reflect the shared gateway policy and provide redacted client samples` 与 `SSH host grants are editable from desktop and invited browser workbenches`。两项由 Lead 在 Electron 和受邀浏览器工作台串行执行。
- `plugins/ssh/test/public-resources.engine.test.ts` 为 CLI 与 HTTP MCP 分别验证同一组 12 个主机相关工具。验证默认关闭、单项工具授予、空资源集合、仅 A 可见、切到 B 后原调用拒绝、同键与丢应答、恢复会话与原作业状态、撤权后旧输出游标及回执拒绝。只读成员的 SSH 拨号、Herdr Core ensure、凭据访问计数均为零，目录文件版本一致。测试同时验证旧策略读取、无效主机拒绝、原子选择及并发修订冲突。
- 本批新增 `ssh.hosts.directory` 和 `ssh.hosts.list` 可选开放。目录仅显示获准主机及相应分组祖先，列表来自便携定义的最小投影。两项在静态与运行时均默认关闭。原 10 个公共 SSH 资源与 Exec 动作接入主机授权。

恢复后单文件 Vitest 通过，详见 `/tmp/huhu-t3q-task02-vitest.log`。全仓静态门禁、全量测试、构建、打包、CLI 自启动和 E2E 由 Lead 验证。
