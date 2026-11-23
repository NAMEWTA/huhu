# #4 W6.2 / #5 T3.2 · Windows 原生回答独立复跑

- 任务 [t13x/task07.md](./task07.md)
- 执行结果 **done**。原生一次回答的 Windows Engine 用例首轮通过，同文件的 W6.3 用例由名称筛选跳过。Vitest 退出 0。
- 冻结候选 `15b34b45c1549d8128aa3787e92f64639ca1335d`，直接父提交 `77a52b6b2a7d92d41ef7fe1dd9a0b3f006d85c90`。
- Windows x64、Node.js 24.21.0、Vitest 3.2.7。真实 Engine 使用固定 Windows Core 0.1.19 和现有合成 App Server。Core 二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。

## 实测

| 场景 | 观察结果 |
| --- | --- |
| 调用者与原问题 | 真实 Dispatcher 拒绝 desktop 调用 `agent.runs.answer` 和 `agent.runs.answer.inspect`，返回 `PERMISSION_DENIED`。夹具在运行时将这两个能力加入内置 Tasks 权限组，再以 `plugin:tasks` 走受信调用。过时问题、错误版本和不同原生 thread 返回 `stale`，不属于选项的答案返回 `unsupported`。当前题在写入前查询为 `not_sent`。 |
| 写入前停用 | 在第二次控制通道认证完成后、实际写入前停用 Agent CLI，待处理调用返回 `PLUGIN_DISABLED`，本机答复意图、helper 写入记录和原生回答均为 0。重新启用后仍可查询到 `not_sent`。 |
| 同题并发一次作答 | 两个受信调用同时选择同一原问题，分别得到 `unknown` 与 `stale`。合成 App Server 只收到一个答复，原 RPC ID 仍为整数 `0`，答复内容与胜出选项一致。只出现一份答复意图和一份写入记录。相同 replyId 改答案返回 `IDEMPOTENCY_MISMATCH`。 |
| 未收到确认与重开核实 | 只有原请求的关闭通知时仍为 `unknown`，签名确认计数为 0。夹具发出的不同 thread、turn、问题项或答案输出同样不足以确认。Engine 停机期间，原 helper 收到匹配的输出并落下 1 份签名确认。重开后检查与重传均返回 `accepted`。原生输入和原生回答总数均为 1。 |
| 后续请求取消 | 原轮随后收到一题，取消前检查为 `not_sent`，取消后检查及提交均为 `stale`。原轮结束后，已签收的前一答复仍可回查。 |

## Provider 假设与覆盖范围

合成 App Server 发出可关联到原 thread 与带类型 RPC ID 的 `serverRequest/resolved`，并能提供同一 thread、turn 和问题项的结构化 `request_user_input` 工具输出，其中完整答案与已提交的选项一致。夹具验证候选只凭这组匹配证明持久确认一次。真实 Codex 是否提供同样完整的同请求关联证据仍待验证，`structuredReply` 能力门槛沿用原配置。

本轮覆盖 Engine 到 Agent/helper 的受控原生作答。Tasks 生产权限组及业务回答接线、详情与抽屉双入口，以及 W6.2 的通用接管／归还／停止属于相应验收范围。运行仅使用合成提供方与本机隔离资源。

## 复跑与清理

- 系统临时目录内建立冻结 Git 归档，应用锁与 Windows 已安装依赖锁一致。102 个工作区链接指向归档源码，297 个第三方链接指向已安装包。复跑前后测试脚本、提供方夹具、生产 helper 和锁文件与候选 Git 对象一致。
- 定向用例用时 6.009 秒，整次 Vitest 用时 17.10 秒，原测试断言与超时均保留。
- 夹具确认隔离 Core 停止，剩余夹具根计数为 0。验证窗格 `t15d` 已在退出后移除，隔离归档已清理。本轮未创建 Git worktree，未修改测试脚本、应用源码或锁文件。

归档根目录下的复跑命令如下。`HUHU_AGENT_LAUNCH_TEST_BIN` 指向经校验的固定 Core，`TMP` 与 `TEMP` 指向一次性夹具目录。

```powershell
node node_modules/vitest/vitest.mjs run plugins/agent-cli/test/native-receipts.live.test.ts -t 'Windows Engine sends one answer to the original native request' --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

依据 [W6.2 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.2-takeover-stop.md)、[T3.2 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T3.2-reply.md) 和 [实施报告](../t135/report04.md)。

## Lead 验收
