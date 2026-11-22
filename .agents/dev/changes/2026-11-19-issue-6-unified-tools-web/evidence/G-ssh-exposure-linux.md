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
