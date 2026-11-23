# #4 W6.3 与 #9 P4.1 · Windows 独立复跑

任务 [t13x/task06.md](./task06.md)。

## W6.3 原生回执与两阶段 ACK

**阶段结果通过。** 候选 `77a52b6b2a7d92d41ef7fe1dd9a0b3f006d85c90`。Windows x64、Node.js 24.21.0、Vitest 3.2.7，实测 Core 0.1.19，二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。既有 `native-receipts.live.test.ts` 首轮 1 项通过，Vitest 退出 0。用例 11.697 秒，整次 21.85 秒。

| 观察点 | 独立实测 |
| --- | --- |
| 持久化与第一阶段 ACK | 合成 App Server 的提前帧到达时，原 turn 尚未核准，Agent 没有待交回执。原生输入获签收后，第一次 `agent_received` 被夹具丢弃，实际已有 1 份 Agent 原件、0 份 helper ACK。重开后回读同一 receiptId、执行绑定及摘要才写出匹配的 `agent_received`。 |
| 第二阶段 ACK 丢失 | 将 helper 副本移出待交目录后，Agent 仍可从自己的持久原件投递。接收器已保存并回读 1 份原回执与可重建的消费记录，首次 `tasks_consumed` 被丢弃，Agent 的消费确认文件仍为 0。重开后逐字核对重投原件，错误摘要保持待交，只有匹配 ACK 才写出消费确认。 |
| 重交与原轮 | 同一个问题回执一共投递 3 次，结果回执来自同一原执行。最终消费 2 份唯一回执，继续重开后没有新增投递。合成 App Server 记录 1 次原生输入、0 次问题回答。 |

本段验证真实 Engine 和固定 Core，原生 App Server 与下游 Tasks 接收器为已有合成夹具。实际业务消费端与真实 provider 能力属于各自验收范围。 [W6.3 规格](../../../../dev/changes/2026-11-19-issue-4-agent-cli/tasks/W6.3-durable-receipt.md) · [实施报告](../t135/report03.md)

归档、Vault 与私有凭据目录均在一次性 Windows 系统临时目录内。归档锁与已安装依赖匹配，102 个工作区链接指向归档，297 个第三方链接指向现有包。夹具确认隔离 Core 停止，剩余夹具根计数 0。验证窗格 `t153` 和归档已清理。此小节在启动 P4.1 验证前写入。

```powershell
node node_modules/vitest/vitest.mjs run plugins/agent-cli/test/native-receipts.live.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

## P4.1 Versioning 自有 Git 认证与旧引用

**阶段结果通过。** 候选 `f5a92e68df2ba655e9c888ddb9e61460cd69a4aa`，直接父提交 `8ee7643d83cadcae1f19e991ff1ae83d0657fe6e`。Windows x64、Node.js 24.21.0、Vitest 3.2.7、系统 Git `2.47.1.windows.2`。新认证文件 3 项通过，整次 37.89 秒，其中实际 HTTP 和 HTTPS 用例分别为 13.621 和 13.128 秒。另定向复跑旧 Safe 引用，1 项通过、20 项由筛选跳过，整次 5.33 秒。两条 Vitest 命令均退出 0。

| 观察点 | 独立实测 |
| --- | --- |
| 回环 HTTP/HTTPS 与 Safe 独立 | 桌面工作台经真实 Engine 配置 Versioning 自有凭据，系统 Git 对合成回环仓库执行 fetch/push。HTTP push 在 Safe 未初始化时通过，Safe 锁定和停用后 HTTP pull 均通过。HTTPS 使用夹具自行签发并在临时仓库信任的证书，pull 和 push 均通过，服务端 Git 树可回读提交文件。 |
| 绑定目标切换 | 更换 Git 仓库或端口后返回 `GIT_AUTH_FAILED`，新目标没有收到旧认证。HTTPS 切换协议或主机后状态为 `needs-reconfiguration`，原服务的请求计数保持原值。为当前目标重新配置凭据后可推送。规范化用例覆盖默认端口、仓库路径、嵌入认证材料和歧义路径。 |
| 重定向与权限 | 从原回环服务重定向到另一服务或同服务的另一仓库时，替换目标未收到请求。CLI 调用配置能力得到 `CAPABILITY_NOT_EXPOSED`，Web 经 Dispatcher 得到 `PERMISSION_DENIED`。过期版本提交得到 `VERSION_CONFLICT`。 |
| 取消、拒绝和 ASKPASS 清理 | 回环 403 产生的错误摘要未包含合成令牌。取消进行中的认证操作后，服务端连接关闭，捕获到的该次 ASKPASS 文件在夹具检查期限内消失。随后一次正常 pull 通过，所有捕获的 launcher 路径均已不存在。 |
| 明文排除 | 校验普通设置、能力目录、临时 Git 配置、共享幂等记录、该次 Git 调用的 argv 与传入环境、ASKPASS 文件和错误摘要。所检查位置未出现对应用户名或令牌。夹具设置的 curl trace 路径未生成文件，推送树未包含模块凭据目录。 |
| 旧 Safe 引用 | 既有 VaultSync 合成引用解析器被调用一次，真实 Git 经一次性 ASKPASS 向回环服务提交了预期 Basic 认证。临时配置保留原 `safe://` 引用，连接失败摘要未包含合成秘密，捕获的 launcher 所在目录已删除。 |

归档和测试 Vault 均在一次性 Windows 系统临时目录。为 Git 子进程指定本轮临时配置文件，停用系统配置回退并清除继承的代理变量。依赖锁与 W6.3 的归档锁同为 Git 对象 `03c864cafb3cc7a0d3b096f55d12bc98f4cf203b`，运行前后对象一致。后置检查确认 P4.1 的夹具根计数为 0，验证窗格 `t154` 已在退出后移除，归档已清理。 [P4.1 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks/P4.1-git-authentication.md) · [实施报告](../t12p/report05.md)

```powershell
node node_modules/vitest/vitest.mjs run plugins/versioning/test/remote-auth.engine.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
node node_modules/vitest/vitest.mjs run plugins/versioning/test/sync.test.ts -t '保险箱凭据：经一次性 GIT_ASKPASS' --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

## 总结

执行结果 **done**。W6.3 已先写入本报告并告知 Lead，再开始 P4.1。两个阶段共 5 项既有测试通过。本轮范围为合成 Windows Engine 数据路径、固定 Core 协议、回环 Git 操作及旧引用兼容。真实 provider、业务消费端、P4.2 自动恢复同步与实际 SSH remote 属于后续验收范围。本轮未修改应用源码、锁文件、本机 Git 配置或分支，未创建 Git worktree。

## Lead 验收
