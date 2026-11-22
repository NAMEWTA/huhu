# #6 SSH 外部开放第一批

本候选以 `314c0bed81d76be1103ff6db4a6e473042ef8940` 为父提交，完成两个库级动作。SSH 静态与运行时目录共有 93 个描述符，12 个可选开放，默认全部关闭。基线的 10 个公共资源与 Exec 作业动作保留原描述符和处理器。t19 剩余的 81 个动作待逐项实施。

| 能力 | 候选元数据 | 对象和意图 | 证据 |
| --- | --- | --- | --- |
| `ssh.settings.get` | 可选开放、默认关闭、read / normal | 仅读取当前 Vault 的连接和传输默认值及修订。 | CLI 和 HTTP MCP 分别验证只授予读取、冷读无文件、热读文件字节不变、撤销后拒绝。 |
| `ssh.settings.update` | 可选开放、默认关闭、write / normal | 复用 Kernel 的持久意图和 SSH 设置的 expectedRevision。结果投影只含设置值与修订。外部更新保存排程默认值，排队中的任务在现有调度时机推进。 | 两个入口分别验证缺键拒绝、同键并发仅一次执行、丢弃应答后同键回读、异参冲突、旧修订冲突、重启回读及撤权后拒绝。 |

## 验证

`plugins/ssh/test/domain-exposure.engine.test.ts` 为 CLI 和 HTTP MCP 分别启动临时 Vault。MCP 使用独立 Gateway 令牌和可恢复逻辑会话。策略测试包含单项修改的修订递增、工具发现、已知工具名直接调用和撤权后回调。81 项保持关闭时均返回 `CAPABILITY_NOT_EXPOSED`，批量预览排除这些项。只读取用例和设置写入均观察到零 Herdr Core 启动、零 SSH 拨号、零凭据列表读取及零主动传输调度。重启的原 HTTP MCP transport ID 返回 404，恢复逻辑会话后读回原操作结果。

定向运行 `domain-exposure.engine.test.ts`、`preferences.engine.test.ts`、`public-resources.engine.test.ts`，12 项通过。公共入口回归使用回环夹具，覆盖便携主机投影、同令牌双会话隔离、信任待答单次消费、路由修订变化和作业未知结果。公共入口回归沿用原测试范围。仓库 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip` 均通过。Knip 给出已有的 `tests/parity-ok/compare.spec.ts` 冗余 entry 提示。

## Lead 接续

`apps/engine/src/boot.ts` 已声明 `registry.declareDescriptors("ssh", Object.values(ssh.sshCapabilityDescriptors))`，现有 `ssh.apply` 绑定其中的 `settingsGet` 和 `settingsUpdate`。本批复用这两处装配。

Q6-3 已定案从同一 Gateway 策略按已保存主机选择和撤销。目前工具策略只有按能力名索引的布尔选择，调用授权和回执读取还没有主机选择输入或检查。后续接入现有策略中的主机授权读写，再由 SSH 沿用可移植定义、当前逻辑主体、路由修订和所有权校验实施剩余动作。主机授权撤销须覆盖旧句柄及已登记的操作回读。当前公开资源和作业入口已有主体与路由校验，仍需接入主机选择来完成 Q6-3。

## 续批 Q6-3 与主机目录

`d89c5e04` 后续候选完成按已保存主机授权、工作台双端配置和首批两项 SSH 读取。静态及运行时可选工具现为 14 个，默认关闭。先前 10 个公共 SSH 入口均接入资源级实时授权。两个新增读取入口见下表。其余 79 个待逐项实施的动作保持默认且不可选，详见 Core 主题 `t2y/report02.md`。

| 能力 | 候选元数据 | 验收 |
| --- | --- | --- |
| `ssh.hosts.directory` | true / false，read / normal | 当前主机选择、便携定义、分组祖先过滤。未选主机及其分组无法枚举。 |
| `ssh.hosts.list` | true / false，read / normal | 当前主机选择、脱敏便携投影，不读取本机凭据状态。 |

[资源选择实现及测试](G-resource-grants-linux.md)

## 主机管理

本批的父提交为 `10ebb272cc63d682db8242b2544f24ff74c0d6f8`。四个现有能力可逐项授予，默认关闭。外部调用使用 JSON 输入里的稳定 `intentKey`。Workbench 沿用原操作及返回值。

| 能力 | scope / risk | 外部可执行范围与结果 |
| --- | --- | --- |
| `ssh.hosts.organize` | write / normal | 按目录版本和所涉主机的路由版本移动、置顶或组内排序。目标分组必须可见。只返回目录版本。 |
| `ssh.hosts.configure` | admin / high | 按原主机和路由版本编辑已授权主机。地址、端口、登录用户、跳板与认证类型维持原绑定。支持原认证类型的凭据保留、清除和适用的内联凭据替换。本机身份文件路径替换由工作台处理。只返回主机 ID 和新修订。 |
| `ssh.hosts.copy` | admin / high | 按版本复制已授权来源及其原路由。新 ID 独立保存凭据配置，主机授权仍需工作台选择。只返回新主机 ID 和修订。 |
| `ssh.hosts.remove` | admin / high | 按原主机和路由版本移除未被引用的配置及其凭据。检查跳板、工作区模板、转发、监控和活动工作台连接。重复删除按原意图对账。 |

领域回执以 Vault 实例、可信调用主体、能力名和意图键定位，保存原目标及跳板的稳定 ID。重试时重新读取授权。凭据值由现有本机凭据保护保存的 Vault 级 HMAC 密钥生成输入摘要，仅凭回执无法离线校验凭据猜测。回执只有摘要、原主机绑定及最小结果。已完成的 CLI 意图可以在重开 Vault 后查回原结果。恢复的 HTTP MCP 会话对写调用沿用 C05 的 unknown 响应，现有读取可核对最新状态。

单文件 `plugins/ssh/test/public-resources.engine.test.ts` 的 14 项用例通过。主机管理矩阵分别走真实 CLI 与 HTTP MCP，检查发现、默认关闭、单项选择、同键并发、旧版本、未授予的跳板与分组、复制独立凭据、引用约束、撤权和重启。夹具只用回环、隔离凭据保护和合成输入。E2E 及共享门禁由 Lead 验证，见 `t2y/report03.md`。

## 连接、信任与执行审计

Task04 首批以集成提交 `adb5ff2d` 为父。下列四项可逐项授予，均默认关闭。外部入口复用现有网关身份、可移植主机定义、探测记录与作业控制。工作台使用原有查询和取消流程。

| 能力 | scope / risk | 外部授权与结果 |
| --- | --- | --- |
| `ssh.connections.status` | read / normal | 仅返回本主体的未过期核验及作业连接记录，按当前目标和全部跳板授权、原路由修订过滤。 |
| `ssh.knownHosts.list` | read / high | 只读取当前完整获准路由所对应地址与端口的密钥类型和指纹。 |
| `ssh.exec.cancel` | execute / high | 用原 `jobId`、`hostId` 和 `routeRevision` 核对调用主体、作业及完整路由。已请求停止的作业重复取消不再次发送信号。 |
| `ssh.audit.list` | read / high | 读取当前主体和路由的当月核验及作业结果。按本机 Vault 实例隔离历史，只返回时间、主机 ID、动作和结果。 |

审计写入沿用 SSH 审计格式并存于本机 Vault runtime。只读入口无 SSH 拨号和凭据访问。审计摘要尽力写入，持久写入失败不改变原 SSH 操作结果。旧的全局主机断线、工作台 SSH 命令执行、持久信任变更和涉及 Engine 本机路径的 SFTP 操作保持关闭。

定向 `plugins/ssh/test/public-resources.engine.test.ts` 16 项通过。CLI 和 HTTP MCP 矩阵覆盖默认关闭、逐项选择、主体隔离、跳板撤权、路由修订变化及零拨号和凭据访问。Exec 用例覆盖错误路由、重复停止、跨主体拒绝及审计重启读回。另更新 `tests/e2e/ssh/settings.spec.ts` 的工具发现、零拨号和撤权断言，E2E 待 Lead 验证。逐项结果见 Core 主题 `t2y/report04.md`。

## 监控配置与缓存样本

以 `bfdf2c70` 为父。两个读取能力可选开放，默认关闭，均为 read / normal。可见面板须包含获准的完整主机和跳板链。读取样本时检查当前面板修订，只返回与采样时连接路由修订相同的有界缓存。外部视图包含状态与汇总指标，省略连接 ID、其他订阅者、信任待答及底层错误。工作台保留原运行控制与视图。

CLI 和 HTTP MCP 使用回环已有工作台采样，验证冷读、跳板撤权、面板版本、待答隔离、旧路由样本隐藏和独立撤权。定向 `public-resources.engine.test.ts` 18 项通过，无新增 E2E spec。

## 转发规则和运行摘要

两个读取能力可选开放，默认关闭。规则列表核对已保存规则所绑定的端点及完整授权路由。运行列表额外核对规则修订与实际连接代的主机修订，只返回既有监听位置、连接类型和流量计数。CLI 与 HTTP MCP 验证零拨号冷读、待答隐藏、既有监听的摘要、跳板修订变化和撤权。定向 `public-resources.engine.test.ts` 20 项通过。

## 工作区模板

模板列表及模板保存、删除可逐项开放，默认关闭。列表核对完整授权路由及原目标绑定，省略登录命令。保存及删除按意图键、完整的新旧主机路由和原模板版本提交。外部保存保留现有主机上的原命令，禁止提交命令或重绑端点。结果仅含原操作的确认。工作区运行保持独立。

CLI 和 HTTP MCP 验证命令脱敏、原值保留、拒绝命令输入、跳板授权、版本冲突、幂等并发、删除重放和撤权，观察到零 SSH 拨号。定向 `public-resources.engine.test.ts` 22 项通过。
