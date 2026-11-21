# #4 W6.2 / #5 T3.2 原生暂停的一次作答

- 终端 `t135`，任务 [task04.md](task04.md)，报告 `report04.md`
- 执行结果 **done**
- 本地提交 `15b34b45c1549d8128aa3787e92f64639ca1335d`，直接父提交 `77a52b6b2a7d92d41ef7fe1dd9a0b3f006d85c90`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-task-executor`，Git 状态干净

## Agent 和 helper

- 新增私有 `agent.runs.answer`（execute，handler 负责幂等）和 `agent.runs.answer.inspect`（read），均只信任 `plugin:tasks`。请求为 `{ execution, requestId, requestVersion, nativeRequestId, replyId, answer }`，结果为 `{ status }`，取值 `accepted | not_sent | unknown | stale | unsupported`。
- 发送前使用 W6.1 的认证管道并重新核验原 Vault、机器、Core、PID、进程代次和 Tasks 输入权。helper 以 W6.3 已持久化的原 thread、turn、带类型的 RPC ID 和问题项核对当前请求与选项。过期、被新题替代或被争用的请求返回 `stale`，无效选项返回 `unsupported`，同一 replyId 异内容返回 `IDEMPOTENCY_MISMATCH`。
- Agent 先在本机 Vault 的原生控制目录持久记录答复指纹。helper 再落本代次的签名发送意图，然后按原 RPC ID 向同一 App Server 发送一次 `{ id, result: { answers: { [questionId]: { answers: [answer] } } } }`。重放按原指纹查证。`not_sent` 要求本机未认领且同一活体 helper 确认原问题仍开放、答复从未越过发送边界。已认领但尚无确认的重放保持 `unknown`。
- 确认同时要求原 thread 的带类型请求 ID 已关闭，以及原 thread、turn、问题项出现同次 `request_user_input` 的结构化工具输出，完整答案与所选值一致。两项都成立后 helper 才持久生成签名确认。取消、轮次关闭、其他线程或问题项的迟到通知和不匹配答案均不足以生成确认。

## Windows 验证

| 场景 | 实测结果 |
| --- | --- |
| 私有权限、原绑定和选项 | 真实 Engine 拒绝 desktop 调用两个入口。过时题、错误版本和异 thread 返回 `stale`，非选项返回 `unsupported`。当前题的只读预检返回 `not_sent`，意图与发送记录仍为空。夹具运行时 Automations 已停用。 |
| 停用与并发 | 第二次连接认证完成、写入前停用 Agent，返回 `PLUGIN_DISABLED`，意图和原生回答均为零。恢复后两次可信并发调用返回一个 `unknown`、一个 `stale`。合成 App Server 只收到一个原 RPC ID 为整数 `0` 的答复，原轮的 `turn/start` 输入仍为一次。 |
| 迟到通知、丢确认及重启 | 裸 `resolved`、异 thread／turn／问题项和错误答案产生零个确认，重传和检查保持 `unknown`。Engine 停机期间 helper 收到原请求的匹配输出并落盘。重开后两个入口均认出原答复，原生回答总数仍为一。新题在取消前检查为 `not_sent`，取消后检查和提交均为 `stale`。 |

- 固定 Windows Core 0.1.19，SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。8 个回归文件通过，71 项通过、6 项按原条件跳过。Contracts、Agent CLI 和 Engine 类型检查通过。改动文件通过 oxfmt、oxlint 与 Git 空白检查。各隔离 Core 和本轮验证窗格均已关闭。 [检查输出](evidence-task04/verification.log) · [专项日志](evidence-task04/live.log) · [回归日志](evidence-task04/regressions.log) · [验证命令](evidence-task04/verify.ps1) · [验证退出状态](evidence-task04/verification-exit.log) · [窗格清理](evidence-task04/cleanup.log)。
- 验证使用一次性 Vault、隔离 Core 和合成 App Server。证据覆盖合成协议中的同请求输出关联。真实 Codex 是否输出可关联的完整同请求证据仍待验证，目标的 `structuredReply` 继续沿用原能力门槛。Lead 负责将两个能力接入内置 `agent.task-input` 权限组并完成 Tasks 接线。W6.2 的接管／归还／停止和 T3.2 的双 UI 入口属于这次 Agent/helper 作答切片之外。 [T3.2](../../../../dev/changes/2026-11-19-issue-5-task-automation/tasks/T3.2-reply.md) · [原生协议分析](../t13g/report01.md)。
