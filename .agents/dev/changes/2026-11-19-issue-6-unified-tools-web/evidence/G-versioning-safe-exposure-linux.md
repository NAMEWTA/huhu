# #6 Versioning 与 Safe 外部开放

本切片以 `9aedbdf5017916915d0514ece25a393445cd6457` 为父提交。t19 逐项裁决开放 17 个 Versioning 动作和 `safe.audit.list`，各自的 scope 和 risk 见任务报告。原有 5 个 Versioning 读取工具默认关，并校验历史路径与归属、Git 仓库和内容路径。两节均无裁决为闭的 ID。

## 双入口证据

`plugins/versioning/test/domain-exposure.engine.test.ts` 为 CLI 和 HTTP MCP 分别创建隔离 Vault 和 Git 仓库。CLI 用实际命令入口。HTTP MCP 用独立 Gateway 令牌和逻辑会话。

- 23 项分别验证目录的 scope、risk、默认选择，外部发现、直接调用拒绝、单独开放、业务结果及原会话撤权后的拒绝。测试校验策略 revision 递增，已撤权回执也被拒。停用 Versioning 保留静态目录、选择及描述符对象，启用后同名工具恢复。
- 11 个持久意图动作缺键时拒绝。每项并发提交相同意图两次，丢弃一个应答，再以同键重交并回读 operation。重启后 CLI 沿用相同身份，HTTP MCP 原句柄返回 404 后通过 C05 恢复同一逻辑会话，两端均读到原回执。领域动作 `sync.auth.configure` 用输入 `operationId` 和当前 HTTPS 目标及认证 revision 对账。CLI 重启读到原认证摘要，恢复的 MCP 写重交返回 unknown，使用 `sync.auth.get` 回读领域 revision。两类重交均校验 Git/业务文件及网络请求计数。
- Git 的显式暂存和撤销暂存绑定独立仓库、HEAD 及索引摘要。提交从已核对的索引生成提交树，以原 HEAD 更新引用。Git 工具差异读取要求单个经校验的文件路径。对象回归包含仓库指向外部目录、内部路径、旧索引、错误仓库身份、错误历史条目、旧配置 revision、错误 remote/HEAD/认证 revision。
- 只读项的文件摘要和回环远端请求计数保持一致，Herdr Core ensure 为零。历史读取时比较影子仓库文件。其他行排除文件监视器为此前写操作补记的历史。冲突摘要、同步配置、认证状态、同步状态与 Safe 审计还校验 Git 命令计数不增。冲突内容绑定会话及两端 HEAD，从对应的本地对象读取。
- 回环远端提供真实 Git HTTP fetch。预览 fetch 后读取远端引用，pull 按固定目标取得新文件。独立生成的冲突文件分别验证读取、逐块解决和取消，用旧会话取消时保留新会话及 HEAD。既有 Safe 整代同步与真实 Git HTTPS fetch/push 回归保留。
- Safe 审计以当前保险箱实例、锁定代次及调用者证明约束。验证同令牌不同 MCP 会话拒绝、锁定代次变化拒绝、limit 和动作元数据。通用意图和 Git 认证领域回执均检查合成正文、密码、用户名、令牌、Git 提交说明和冲突文本无明文。

## Lead 装配

- 声明一次 `registry.declareDescriptors("versioning", versioning.versioningCapabilityDescriptors)`。插件 apply 使用同一批描述符 bind，原注册入口即可。manifest 补列 `conflicts.{list,read,resolve,cancel}`。
- Safe 沿用 `registry.declareDescriptors("safe", safe.safeCapabilityDescriptors)` 和已有 `catalogDeclared: true` 绑定。manifest 已列 `safe.audit.list`。候选 boot 只增加 Versioning 的静态声明一行。
- 两个旧 desktop HTTP 预览用例改用 workbench 已用的 `{ write: true }`，随 `sync.preview` 从 read 调整为 execute，覆盖只读 Vault 及缺失认证的原结果。

## Linux 门禁记录

- 中断前并非完整结束的全量日志在 `/tmp/huhu-t2q.uzXWAj/full.log`。其中本组 5 个双入口与停用目录测试均通过。同目录定向日志记录了认证 6 项、历史 12 项、冲突 11 项、Safe 整代同步 7 项、Safe 外部入口 3 项与 C05 3 项通过。旧定向回合的 1 项失败为文件监视器的背景历史索引变化。后续全量日志中的本组矩阵使用修正后快照规则。
- 中断前全量还记录了一项需 Lead 更新的跨组断言。`apps/cli/test/cli.test.ts:463–465` 仍以 `safe.audit.list` 断言不可开放。该 ID 是本次明确开放对象，测试可改用仍为 `exposable: false` 的 `gateway.tokens.create`。
- 恢复后的定向 Vitest 67 项通过，54 项止于环境权限限制。其中 29 项无法监听回环地址，25 项无法启动 Git 子进程。并行类型检查在内存接近耗尽时中断，静态门禁与限并发复测结果见报告。
