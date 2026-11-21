# t13g · Codex 原生派遣、提问与结果

**建议先交付一个可从原 Space 定位的受控 Codex 新会话。** 让 Core 启动并标记一个属于该 Huhu session 的适配器进程，由它独占一个 Codex App Server 子进程的双向 stdio。Tasks 仍只调用 Agent 的执行合同。首片只开放通过持久验收的能力，人工 Codex TUI、已有人工实例和历史恢复继续走现有入口。当前可签收的是 Windows 上一次临时线程的协议往返；持久收件、丢 ACK 对账、重启后结果交付和同包工作区旅程均待取证。

分析基线为业务工作树 `3bd2e245d0eff8ffef8eb94f80c6106d73047ba9`。下文业务路径相对该提交，`temp/sources` 和 `temp/issue-baseline` 相对主仓根目录。本轮只读已有材料，未运行 provider 或访问真实会话、凭据。

## 1. 实测给出的边界

| 证据 | 已观察到的事实 | 实施时仍要证明的事实 |
| --- | --- | --- |
| Codex 0.171.0，Windows，t13b 日志第 2–9 行 | `thread/start` 返回 ID；同一 turn 的 `turn/started` 先于 `turn/start` 回包。收到 `item/tool/requestUserInput`（RPC id 为整数 **0**，两个选项），回答后出现 `serverRequest/resolved`，同轮 agentMessage 命中预期正文，随后 turn 为 completed。 | 探针按 thread 过滤且只发一轮，没有重传。日志没有记录持久回读、userMessage.clientId、最终消息 phase、问题 isBlocking 或 Huhu/Core 绑定。不能据此上线恢复、去重或所有消息的终局判定。 |
| 同目录探针源码 | 直接 spawn 指定 exe，`--listen stdio://`，`thread/start.ephemeral=true`，显式 `--enable default_mode_request_user_input`，握手传 `experimentalApi:true`，限制 shell/MCP、使用只读沙箱。 | `v1/InitializeParams.json` 中 experimentalApi 默认 false。部署须记录实际二进制、版本、配置及协商结果，在相同条件下验证各项能力。探针参数不应改写用户全局设置或人工入口。 |
| #5 T0.1 的早期样例 | `codex exec --ephemeral --json --output-schema` 在 Core 中返回过匹配的结构化结果。 | 它与 t13b 是两个独立实验。尚无一次实验同时证明真实 Core 定位、持久原生线程及两段 ACK。 |

可复核 [t13b 原始日志](../../../../../temp/issue-baseline/core-finished/t13b.log)、[实际探针](../../../../../temp/issue-baseline/provider-probe/codex-app-server-probe.cjs)、[本机生成的协议](../../../../../temp/issue-baseline/provider-probe/codex-0.171.0-app-server/) 和 [T0.1 基线](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T0.1-provider-evidence.md)。日志 SHA-256 为 `347219f5fd1ea12b7a9ce0218d911bfee84ecbe18b62995b6f96ad8ac021fd55`。

## 2. W6.1 与 T2.1 的最小接线

**两个调用场景。** 用户在任务页选定 Space、新建 Codex 并派遣。Tasks 保存输入快照、领取 run，以同一 dispatchId 调用 `agent.runs.dispatch`。得到与快照、轮次相符的 providerAcceptance 才进入 running，`linkTask → markDispatched` 幂等写系统评论；“查看 Agent”用返回绑定里的 Huhu sessionId 去原 Space，后台启动不抢焦点。另一位用户在任务详情回答暂停的问题。Tasks 先保存 replyId、requestId/version 和所选答案，Agent 只把它交给仍持有该原生请求的实例。原请求失效就保留答复和现场入口。

| 落点 | 基线行为 | 建议的最小改动 |
| --- | --- | --- |
| `plugins/agent-cli/src/engine/sessions.ts` 的 prepareLaunch、freezeLaunch、executionSession、`launch-binding.ts` | prepareLaunch 给非 shell 选 interactive；executionSession 核验 terminal，再固定返回 nativeSessionId=null。Core 代次来自 attemptId、Core 身份、address、createdMs、PID。 | 增加仅受控 new 能选的内部启动形态。冻结配置包含该形态、实际程序/适配器版本、argv 和选定设置。沿用持久 launch request、Core hello/labels/进程核验，启动独立 helper。helper 在同一启动尝试的私有通道返回 thread/start 的 thread.id，绑定成功再准许第一次 turn/start。 |
| `dispatch.ts` 的 DispatchProvider、advance、observe；`dispatch-store.ts`、`input-ownership.ts` | provider 只有 ready/acceptance。正文固定进 writeExecutionInput → terminal.send；该函数拒绝非空 nativeSessionId。默认 providers 为空，targets 给所有目标的 structuredReply/Result/cancel 固定 false。 | 在现有仲裁点把“核代次→同步占权并落发送意图→唯一一次写入”交给选定传输；给原生适配器加 submit 与只读 inspect。保留旧 Core 写入分支。记录区分 PTY 写入与 native RPC 提交，版本化读取旧 schema 1，更新 `dispatch-capabilities.ts` 的投影，勿把 stdio 成功记成 core_written。能力按目标、绑定、模式和验证版本给出。 |
| 新增 `plugins/agent-cli/src/engine/codex-app-server/` 下的 helper/协议处理；注册在 `engine/index.ts` | `registerDispatch` 只信任 plugin:tasks；现有 Windows 合成 provider 已覆盖 Core 发送、busy、丢写回包及代次变化。 | helper 用 Node 管道握手 initialize → initialized。客户端响应按 id 关联，服务端 request 先按 method+id 分流，通知独立处理；两方向的 id 可重号。缓冲早于 turn 回包的问题和结果，待完整绑定核准后交付。helper 私有端点限定本用户/本实例，重连验证启动凭据和实例代次；Core PTY 只展示这个 helper 从实际协议生成的可读现场。 |
| `plugins/tasks/src/engine/dispatch.ts` 的 TaskDispatchExecutor、finishSending/linkTask，`dispatch-store.ts`、`index.ts` | executor 是可选注入，返回值只有 accepted/not_sent/unknown；仅把状态置 running 不能提供原现场定位。 | 生产 executor 用既有 `agent.targets.list / agent.runs.dispatch / inspect`，保存已冻结 target、Space/revision、execution 和 provider 接受凭据。先核 target、run/attempt/dispatch 和 inputSha256 再推进。禁止降级到另一个 provider/Space、另开实例或 shell。 |

**身份如何联结。** Agent 保管一条可回读的映射：Vault、machine、Space、Huhu session、Core id/address/processGeneration、helper 实例代次 → 经该 helper 从实际 Codex 会话取得的 threadId。将 threadId 填入 `ExecutionBinding.sessionBinding.nativeSessionId`，每轮另存 dispatchId、runId/attempt、输入摘要、客户端消息标识 → turnId、原生 itemId。turnId 不塞进 sessionId；pane 只是观察者。首次绑定应在派遣和生成回执之前完成，避免从 null 到 threadId 改变已签收的 execution。活体写入要求两侧代次同时相符；已落盘的旧绑定仍能核验历史回执，不能据此获得对新进程的输入权。客户端、PID、cwd、标题、终端地址各自单独都不足以重建这条链。

**Windows 与人工使用。** 保留 `agent.sessions.launch`、`catalog.ts` 的 interactive 与 `agent.history.resume` 的显式 `codex resume <id>`，沿用历史扫描、目录和占用检查。受控路径把经过验证的原生 exe 与 argv 分开传给 spawn，`shell:false`、`windowsHide:true`、独立 stdin/stdout；不将 JSON、正文或回答拼进 shell，避免 ConPTY 回显、换行、ANSI 和日志混流。探测到 .cmd/.bat 或自定义 wrapper 只说明人工启动有候选；若无法按冻结配置确定等价的受控程序，标为不可用。打包时验证 helper 入口及其子进程可执行，沿用受控派遣现有的额外 env 限制。helper 的 stdout 给同一 Core terminal 展示只读状态和问题，关闭 pane 仅 detach；断开 Engine 时 helper 可独立落回执，重连须对上原实例。保留 `terminal-bridge.ts` 的 controller/observer 和 review 仲裁，受控只读现场不宣称支持原生交互接管。helper 核实绑定 turn 完结并持久化回执后才可释放任务输入权，不能一直等长寿命 App Server 进程退出。普通 TUI 只有在另行验证同一运行中的 thread、输入权和原生控制通道后才能列为 existing；历史条目能手工恢复也不等于 `agent.runs.dispatch(mode=resume)` 已取得资格。

## 3. 首个派遣 ACK 丢失时怎样查证

1. **写前。** Agent 保存完整 dispatch 键、冻结目标、输入摘要、原生 thread 和唯一稳定的 clientUserMessageId；helper 在调用 turn/start 之前独占并持久记录该键的发送意图。Agent→helper 也按同键同载荷返回已有记录，异载荷冲突。helper 若在“发送意图已落盘”后崩溃，即使实际可能未写，也只准 inspect。thread/start 自身若丢回包，仅从该 helper 已绑定的创建证据恢复；拿不到原 threadId 时停在启动待核实，不从全局 thread/list 或最近 cwd 猜测。
2. **正常收件。** 在原连接上用请求 id 将 `turn/start` 响应的 turn.id 绑定到本次确切输入并持久化。也处理先到的 `turn/started` 与 userMessage item；裸 started、transport.write 或 Core 启动不足以单独证明哪份输入被接受。若只是 Huhu 首次响应丢失，按原 dispatchId 回读已持久的 providerAcceptance 即可。
3. **原生响应也丢了。** 先读取 helper 的发送/事件日志。需要查询 Codex 时，用映射中的**确切持久 threadId** 调 `thread/read`，再用 `thread/turns/list(itemsView:"full")` 跟完 nextCursor；也可对候选 turn 用 `thread/items/list(threadId,turnId)` 完整翻页。`thread/read(includeTurns:true)` 是 schema 记录的兼容读法。核对真实 turn.id、userMessage.id、**userMessage.clientId**、content 与冻结输入（按原编码和内容类型取摘要），以及原执行归属。若已知 turnId 同时核它。只有本版持久夹具证明这种 ID 映射能保存、读回，且查到唯一吻合证据，才补签原运行的接受凭据；仅回读，不为查证启动新轮或自动 resume。
4. **没有服务端幂等保证。** 本机 `v2/TurnStartParams.json` 和 `TurnSteerParams.json` 接受可空的 clientUserMessageId；`v2/ThreadReadResponse.json` 的 UserMessageThreadItem.clientId 也是可空且非必需。t13b 只送过一次固定值，未记录它的回显。可将它作为关联候选，无法据此重发 turn/start、turn/steer，或声称相同 ID 只会执行一次。
5. **unknown 的边界。** 离线、超时、管道断开、写后插件停用、记录损坏、进程/adapter 代次或地址复用、持久 thread 不可读、分页不完整、空历史、clientId 缺失/重复、内容不匹配或只有相同文本/相邻时间，均不得把可能送达的输入改为 not_sent。保留原 dispatch、输入占用与待核实原因；只重试检查。发送前可证明从未跨过写边界的调用才可回 not_sent；明确占用回 busy、同键异载荷回 conflict、未经支持的模式在写前回 unsupported。已有正确绑定的持久 outbox 可继续重交原回执，查无活体不是删除历史的依据。

## 4. 原生问题、结果及两段回执

- **问题归属与作答。** `ToolRequestUserInputParams.json` 要求 threadId、turnId、itemId、questions、isBlocking。每个 question.id 在本次请求内定位，外层 JSON-RPC request id 可为整数 0 或字符串。helper 记录原连接代次、带类型的 RPC id、thread/turn/item 和 question.id，映射成稳定的业务 requestId/version 及非空 nativeRequestId。后者是路由凭据，单独拿一个旧数字无法回答。T3.1 仅将可证实属于原任务且仍开放的阻塞请求投影成 native_deferred；只有 blocked / waitingOnUserInput 时给“前往现场”。对签入任务抑制 `waiting.ts` 的独立 Human 待办，独立人工终端沿用原兜底。
- **T3.2 与 T3.4。** Tasks 在两个入口用同一 request/version 接受一次 replyId；多题在同一 RPC 下按各 question.id 保存，收齐后由原 helper 一次发 `{id, result:{answers:{[questionId]:{answers:[…]}}}}`。首片可只支持已验证的单题选项；其他形态（含秘密回答、无法区分的工具审批）只到现场处理。`serverRequest/resolved` 只含 threadId/requestId，答复或请求清理均可触发。结合本地发送状态、原请求及可验证后续事实判断，证据不足只标已失效或送达待核实；断线不得在新连接重放旧 id。普通业务问题回复用 parentRunId 开新轮；普通评论只讨论，显式补充只送用户选中消息的快照，不映射成批准。[官方 App Server 事件与请求清理语义](https://developers.openai.com/codex/app-server/)
- **结果归属。** 在已绑定 thread/turn 中保存 `item/completed.agentMessage` 的 item.id、text、phase，并等同轮 `turn/completed.turn.status`。明确的 final_answer 加 completed，或该受控运行已验证的终局业务输出契约，才能产出 result；commentary、partial_answer、delta、未知 phase 或多个候选不能靠取最后一行定结果。若采用 `turn/start.outputSchema`，先校验业务结果及允许的 kind；失败/中断保留原状态，有明确失败事实才签 failed，静默不签 no_update。结果正文可作产物，不能自行指定 execution/receiptId 或授权回答。未观察到终局的，保留待核实。
- **W6.3 / T3.3。** 复用 `packages/contracts/src/execution-receipt{,-engine}.ts`。helper 将原生证据与完整 ExecutionReceipt 先落自己 outbox。每条业务回执的 receiptId 在首次产生时固定，按原 execution、turn/item/问题身份和 kind 查重，payloadSha256 由既有函数生成。同 ID 异载荷隔离，不能改 ID 掩盖冲突。Agent 在受信入口按本地 expectedExecution 调 validateExecutionReceipt，持久保存原文和待交记录，回读后才 createExecutionReceiptAck(agent_received)。Tasks 持久保存原 payload、绑定和可重建的 deliveryId/messageId，回读后给 tasks_consumed；发送方用 validateExecutionReceiptAck 核 stage、身份、hash 后结束各自的待交。Tasks 以固定 messageId 补一条原任务评论，完成权留给用户。任一 ACK 丢失，都只重交**原回执**，既不重新作答，也不重跑 Codex。问题或结果早于 Tasks 记下 running 时先入待交，绑定就绪后再消费。

## 5. 替代方案与交付次序

| 候选 | 可复用的部分 | 对本任务的取舍 |
| --- | --- | --- |
| Core 管理 helper，helper 私管 App Server stdio（推荐） | Huhu 已有启动/仲裁/定位；Orca 原生帧分流、问题注册及历史分页 | 多一个需要打包并可重连的 helper，但能把原生生命周期、Core 现场和离线 outbox 固定在同一实例。首版现场是受控观察视图，完整人工接管和 W8.2 要另外验。 |
| 让 Core 内的原生 TUI 和适配器连接同一受控 App Server | 有机会直接看到厂商原生 UI，人工接管体验更完整；官方另有 WebSocket 监听传输 | 要先证明本机版本的 TUI 可选中并观察同一个活 turn，解决多客户端请求归属、输入仲裁、端点访问和重连。t13b 的单 stdio 客户端没有覆盖这些条件。[官方传输说明](https://developers.openai.com/codex/cli/reference/) |
| 沿用 Automations 的 headless worker 或给普通 TUI 配旁路 App Server | 能较快得到 exec JSONL、退出状态和独立历史 | worker 提前 markDispatched、按轮启动 supervisor，解析终端文本并在 answerRun 后续轮运行；旁路实例也可能拥有另一条 thread。两者都缺少指定 Core 现场的同轮请求所有权。只保留既有人工/历史入口，新的 Tasks 输入不可双发。 |

**复用依据。** 在 `temp/sources/orca@8bc232f5/src/main/codex/`，可定向复查 `app-server/codex-app-server-{connection,record-dispatch}.ts` 的 NDJSON 分流，`structured/turns/codex-structured-turn-start.ts` 的入队、回包关联，`structured/prompts/codex-prompt-registry.ts` 的连接内回调归属，以及 `structured/threads/codex-structured-thread-history-pages.ts` 的 cursor/full 读取。其 scripted fixture 主动 echo 客户端 ID，不能充当 Codex 服务端去重证据。`temp/sources/agent-autoloop@d1ec2d8/plugins/codex/agent.ts` 提供 exec/JSONL 与续轮对照。`temp/sources/herdr-core@c751780` 可查 Windows 实现，产品锁与 Windows 基线是 Core **0.1.19**，调度器 **0.1.21**。实际复制上游代码时补 `docs/upstream/ledger.md` 和许可记录。业务回归入口为 `plugins/agent-cli/test/{dispatch.live,launch.live,launch-reconcile,waiting}.test.ts` 与 `packages/contracts/test/execution-receipt.test.ts`。

**交付先后。** 先用受控协议夹具验 W6.1 的身份、一次写入、异载荷、断线与先到通知；下一次获得实机授权后，在隔离持久 thread、新 Vault、锁定 Windows Core 上丢掉首次 turn/start 响应，重开后凭完整分页核对原 turn、userMessage.clientId、内容及一次执行，并测同文不同 dispatch、无 clientId 和两条匹配均不能误签。再接 T2.1 的 provider 确认及原 Space 定位，同时按 W6.0 样例独立做 W6.3 生产端和 T3.1–T3.4 消费端；T6.4 合测两次丢 ACK、插件重启、切 Vault，记录一个 turn、一份结果和一条评论。T7.1 在相关 T1–T6 路径齐备后，一次迁移 manifest、handler、首页/详情/运行抽屉与工具，清除旧 claim、supervisor/PID/heartbeat、提前 markDispatched 和 automations.runs.answer 写者，验证停用 Automations 仍可派遣/回答、外部工具默认关闭且内部回执可达。最后由 W8.3 联编；W8.2 与 T7.2 以同一个安装包 SHA、独立临时 Vault 各自签收。W8.2 录下原 Space 多栏定位、关 pane 后回原任务、断线重连、人工 TUI 新建与显式历史恢复、viewer 与输入权，按任务矩阵补齐桌面/Web/SSH、DPI 和性能。未经持久实机验证的 existing/resume、取消、接管及平台仍标为待验证。

基线复核：交付时共享分支 HEAD 已前进到 1316cf8。对比 3bd2e24，本文引用的 Agent CLI、Tasks、Automations、回执合同、Core 锁及指定任务文件均无差异。报告结论仍以任务指定提交为准。
