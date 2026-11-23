# 原生回答证明屏障

Lead `t3p`，worker `t10k`，任务 `task01.md`，工作树 `agent-linux`，基线 `4ae7e7e4`。改动已写入工作树。

## 屏障因果链

1. provider 依次在同一 stdout 流写入请求已解决通知、错误线程、错误轮次、错误题目、错误回答及无法配对的 raw 帧，然后发出带进程专属 ID 的 `fixture/noProofFence` RPC。helper 在同一个 readline 处理器里同步处理每一行，按正常协议回复该 ID 的 `-32601`。provider 收到对应错误才记录 `resolution-without-proof-processed`。[Provider 夹具](../../plugins/agent-cli/test/fixtures/codex-receipts-provider.cjs#L115) · [Helper 处理器](../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs#L416)
2. CLI-only、HTTP MCP-only 和已有 MCP/CLI 组合用例在观察到回执日志后监听 Tasks 后台发起的下一次 `agent.runs.answer.inspect`，以 run ID 和 reply ID 匹配回答，等待原调用完成并断言返回 `unknown`。此处已有写入意图，实际 Engine 检查会读签名 ACK；spy 只观察 Dispatcher 调用，保留原实现和结果。随后才检查重复提交和持久状态，并按各用例原有顺序放行匹配证明。[对账观察](../../plugins/agent-cli/test/native-receipts.live.test.ts#L66) · [独立入口](../../plugins/agent-cli/test/native-receipts.live.test.ts#L663) · [组合入口](../../plugins/agent-cli/test/native-receipts.live.test.ts#L363)
3. Engine proof 用例在同一回执屏障后等待真实 `answer.inspect`，断言 `unknown` 且无 ACK，之后照旧关闭 Engine、放行匹配证明、重启并检查 `accepted`。各用例保留原有负向帧、唯一输入与唯一回答断言。[Engine proof 用例](../../plugins/agent-cli/test/native-receipts.live.test.ts#L847)

## 清理

参数化用例在分配临时根后将子目录创建、保护对象和环境配置纳入现有 `try/finally`。任何子目录创建失败都会进入清理。仅在已安装探测 spy 时恢复它。现有嵌套 `finally` 继续负责 Engine、Core 和临时目录回收。[参数化夹具](../../plugins/agent-cli/test/native-receipts.live.test.ts#L468)

## 未运行的验证

按任务要求未运行任何验证，包括 `native-receipts.live.test.ts`、全量测试、类型检查、lint、格式检查、构建、安装、打包和 E2E。未暂存、提交或发送 `hc send`。生产代码未改动。
