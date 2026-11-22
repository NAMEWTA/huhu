# #4 W6.2 · 真实 Windows Codex 的原生回答证据

- 终端 `t135`，任务 [task05.md](task05.md)，报告 `report05.md`
- 执行结果 **done**
- 解析修复 `162fa0dc3af5ccf03b20d701a30b2bf02612fa14`，验证基线 `15b34b45c1549d8128aa3787e92f64639ca1335d`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，分支 `impl/huhu-issues-3-10-task-executor`，Git 状态干净

## 真实协议观察

固定 Windows x64 Codex `0.171.0`，SHA-256 `cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7`。探针复用既有本机 Responses SSE 样例的 `response.created`、output item 和 `response.completed` 流程。首次模型响应由回环夹具发出 `request_user_input` 的合成 `function_call`，由真实 App Server 决定是否发题和怎样转交答复。探针使用单独的 `CODEX_HOME`、临时用户目录和 ephemeral thread。代理拦截器拒绝了每轮两次后台目标访问，转发次数为零。每个场景只有两次回环模型请求，未生成会话历史目录。 [既有本机样例](evidence-task02/real-codex.mjs) · [探针源码](evidence-task05/native-answer-probe.mjs) · [四组脱敏摘要](evidence-task05/mode-summary.jsonl)

| 场景 | 所见 |
| --- | --- |
| 与 15b34b4 一致的默认模式 | 模型请求列出了工具，但真实 Codex 执行时返回 `request_user_input is unavailable in Default mode`，没有发出原生问题。 [默认模式日志](evidence-task05/baseline.log) |
| 默认模式加 `default_mode_request_user_input` | 原生请求为数字 RPC ID `0`，原问题 ID `shape`，`itemId` 与合成调用的 `call_id` 一致。答复 `{"answers":{"shape":{"answers":["Circle"]}}}` 后，App Server 发出同 thread 的 `serverRequest/resolved`、原 turn 的普通最终文本及完成事件。回环模型端收到原 `call_id` 的完整答案，App Server 没有工具输出通知。该问题为 `isBlocking:false`、`isOther:true`。 [功能开关日志](evidence-task05/feature.log) |
| 默认模式加功能开关和 `thread/start.experimentalRawEvents:true` | 同一 thread 和 turn 先见带 `name:"request_user_input"` 的 raw `function_call`，继而见提问、作答和关闭。随后 raw `function_call_output` 带同一个 `call_id` 和上面的完整 JSON 字符串，`name` 字段缺失。旧解析匹配零次，新解析匹配一次。 [raw 日志](evidence-task05/raw.log) |
| Plan 模式加 raw 事件 | 同样捕获并匹配一次完整原答复。问题为 `isBlocking:true`、`isOther:true`，即使夹具在工具参数显式给出 `isOther:false`。 [Plan 日志](evidence-task05/plan.log) |

同一发行二进制执行 `app-server generate-json-schema --out <临时目录> --experimental`。问题 schema 要求 thread、turn、item、questions 和 isBlocking。答复 schema 只有 answers。关闭通知 schema 只有 threadId 和 requestId。类型化 `functionCallOutput` 的 schema 要求 name，raw 输出变体允许省略。生成的 `ServerNotification` 联合未列 `rawResponseItem/completed`，但开启 `experimentalRawEvents` 后实际可见。该发行版说明这个 thread 选项供内部使用。相同的临时 thread 和 turn 调 `thread/items/list` 得到 `-32601`，本轮无可用的回读证明。 [发行 schema 投影和通知](evidence-task05/raw.log)

## 修复及保留的门槛

helper 只用同一原 thread 与 turn 内、同一 `call_id` 的已命名 raw `function_call` 为无名输出确定工具归属。保存签名 ACK 仍要求该 `call_id` 等于原生提问题项，完整输出等于已发送的答复，并且同一原生 RPC ID 已关闭。真实回归直接将固定 Codex 的实时帧交给 helper 使用的解析函数。把前序调用移到异 turn 后，同一无名输出无法匹配。固定 Core 的 Engine 回归亦确认，裸关闭通知和无有效前序调用的输出留下零个 ACK，有效帧补齐后可对账，原生回答总数保持一次。 [真实探针](evidence-task05/native-answer-probe.mjs) · [固定 Core 的 Engine 回归](evidence-task05/regressions.log)

生产启动仍采用默认事件流，`structuredReply:false`。现有单题阻塞、非秘密、固定选项的资格检查继续适用，本次真实 App Server 题目的 `isOther:true` 无法通过该检查。已有发送意图的答复缺少可关联证据时仍保持 `unknown`。这次验证签收 raw 事件解析兼容性，当前生产资格下的真实端到端作答仍未获证。 [原生答复合同](report04.md) · [四组脱敏摘要](evidence-task05/mode-summary.jsonl)

## 复跑和清理

从 `agent-lifecycle` 工作树运行下列命令。探针校验 Codex SHA-256，并独立生成临时 schema 和配置。专项四组均通过。固定 Windows Core 0.1.19 的两个测试文件共三项通过。改动文件通过格式、lint 和 Git 空白检查。所有隔离 Codex 进程、回环服务、临时目录和本轮验证窗格均已关闭。 [运行脚本](evidence-task05/verify-all.ps1) · [固定版脚本](evidence-task05/verify.ps1) · [退出状态](evidence-task05/verification-exit.log) · [窗格清理](evidence-task05/cleanup.log)

```powershell
$task = 'D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t135'
$evidence = Join-Path $task 'evidence-task05'
powershell.exe -NoProfile -File "$evidence/verify-all.ps1" $evidence
powershell.exe -NoProfile -File "$task/evidence-task01/vitest.ps1" "$evidence/regressions.log" plugins/agent-cli/test/native-receipts.live.test.ts apps/engine/test/codex-dispatch.live.test.ts
```
