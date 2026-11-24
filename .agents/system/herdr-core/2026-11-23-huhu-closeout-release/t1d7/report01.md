# 已退出 Codex 历史的任务派遣方案

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- terminal_address — `t1d7`，本机默认 Core 0.1.21，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d7/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d7/report01.md`
- 执行结果 — `done`，只读方案核对。工作目录 `/home/wta/projects/huhu`，HEAD 为 `fc43ceef5b64ca1c9a68404c9110a6ca46883034`。共享树另有 Tasks 外部工具入口的并行修改。

## 交付边界

**应交付一条从任务编辑器开始的直接路径。用户选择已退出的 Codex 历史 B，Agent CLI 在受控 App Server 中恢复 B，再把原任务冻结的正文提交给 B 的一个新 turn。** 恢复沿用原 thread UUID 和 rollout，本次打开有新的 Huhu Session、Core 进程代次，可从原任务定位。另一个调用者以相同 dispatchId 重交时取得原回执，任务和输入次数保持不变。W6.1、T2.1 及 C01/C04/C05/C08 已确定行为，可直接实施。当前代码和 W5.2 桌面成绩仍不足以签收这两项。[#4 执行合同](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/design.md#L44) · [W6.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md) · [T2.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T2.1-dispatch-cli.md) · [C01–C08](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/source.md#L567)

| Provider | 生产路径与既有证据 | 建议支持范围 |
| --- | --- | --- |
| Codex | 仅注册 native new/existing；受控 new 调 `thread/start(ephemeral:true)`。W5.2 固定 0.170.0 / 0.171.0 探针在同一隔离资料目录验证了持久 rollout 的 read/fork、重开后的 resume，无模型 turn。 | 受控安装、配置、签名 helper 均通过检查，且原文件、原 cwd 和占用可核实的持久历史可加入 resume。既有 ephemeral run 无文件可恢复。 |
| Claude | 工作台有交互历史恢复/分支。生产 dispatch 没有 Claude 输入接受、绑定和回执 adapter。 | 可预览或前往交互入口。任务显示受控派遣不可用及原因。 |
| Pi | 工作台有按文件身份恢复/分支；T0.1 的 print/no-session 样例观察到 turn/settled 事件。生产 dispatch 没有 Pi adapter。 | 同样显示能力边界。CLI 已安装、OSC blocked、单轮输出、测试注入的 provider 均不足以启用受控 new/existing/resume、回复或停止。 |

证据见 [生产注册](../../../../../plugins/agent-cli/src/engine/index.ts#L146)、[helper 新建](../../../../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs#L471)、[W5.2 实测及限制](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W5.2-native-history-local.md)、[T0.1 实测](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/evidences/T0.1-provider-evidence.md)。

**资料目录决定哪些历史真正可派。** 桌面扫描取 settings/进程 CODEX_HOME 或默认目录；受控 `CodexDispatch.prepare` 要求独立的 `HUHU_CODEX_DISPATCH_HOME`，拒绝默认或全局 CODEX_HOME、其祖先与子目录，以及自定义 provider args/env。直接把桌面的 canResume 映射为可派会产生假阳性。建议首个支持范围为受控私有 home 内已有的持久 rollout，Tasks 目录显式扫描该 home；普通桌面来源仅有交互资格时给出原因。要使普通默认目录历史也可派，需单独实证固定版本能在私有运行配置下按指定原 rollout 恢复并续写同一文件，仍保留原 cwd、权限边界和占用保证。复制/导入文件、fork 或把 helper 切回全局 HOME 都无法满足上述保证。若发布口径覆盖默认目录，必须补这条真实证据；既有同 profile 探针没有覆盖跨 profile。这里选择私有目录为首个能力边界，C04 已允许按实际支持呈现。[Engine 配置](../../../../../apps/engine/src/boot.ts#L307) · [扫描环境](../../../../../plugins/agent-cli/src/engine/index.ts#L538) · [受控 profile 及版本预检](../../../../../plugins/agent-cli/src/engine/codex-dispatch.ts#L108)

## 由现有模块承接的改动

1. **选择并冻结 B。** 扩展 `packages/contracts/src/kinds/task.ts` 的 resume 引用。任务已有 `execution.spaceId/provider` 和 `target.nativeSessionId`；建议增 `historyId/historyRevision` 并绑定选择时的 machineId、spaceRevision。Agent 的可执行目标再含 configurationId，冻结原 cwd、受控 home、binary/helper/config stamp 及有效配置。外部只见不透明引用和允许展示的标签，不接受客户端 file/cwd/profile。旧文件和旧运行仍可读取；裸 UUID 的旧配置显示原值、要求重选，不静默升级到当前碰巧同 UUID 的历史。新写入必须有完整引用。保存选择只编辑任务。[任务 schema](../../../../../packages/contracts/src/kinds/task.ts#L20) · [文件物理身份与 revision](../../../../../plugins/agent-cli/src/engine/history/scanner.ts#L195) · [配置指纹](../../../../../plugins/agent-cli/src/engine/sessions.ts#L619)
2. **Agent CLI 统一来源解析与互斥。** 从 `index.ts` 提取历史选择、`mayBeSameHistory/resuming` 及活动判断，复用 `scanHistory/nativeHistoryCandidates/nativeHistorySourceMatches`。Tasks 只查指定 Space，按合格文件列行。启动前绕过展示缓存，复查原 canonical path、文件实体和 revision、合法且唯一的 UUID（含同 profile 下其他 Space 和 archived_sessions 重名）、原 cwd、Space/revision、配置和读写权限。复用 Sessions.reconcile，在同机单 Vault 内覆盖交互打开与两个任务同时恢复同一来源。可证明原实例已退出且无活动冲突，或有等价可靠证据，才能写入；running/launching/unknown、来源竞争或无法证实退出应返回 busy/不可用。仅看到 JSONL 或新服务器的局部 idle 不能证明另一进程已退出。[历史资格与发起前复核](../../../../../plugins/agent-cli/src/engine/index.ts#L601) · [全资料目录查重](../../../../../plugins/agent-cli/src/engine/history/scanner.ts#L250)
3. **目录每个 resume 行标识一条历史。** 扩展 `plugins/agent-cli/src/engine/{dispatch-capabilities,dispatch-store,dispatch}.ts` 的 target 和目录 schema，给 native Codex 的 modes 加 resume；动作能力按已证实的配置/协议给出。Tasks 的 `agent-dispatch-executor.ready` 现按 mode/space/provider 取第一条行，再拼用户给的 UUID。同 provider 的 A、B 会混选。改为完整身份匹配唯一行，直接冻结该行；已保存的 `DispatchRecord.agentTarget` 只能核对原值。目录改序、B 消失、配置或 revision 改变时给出针对 B 的原因。[占位目录与固定拒绝](../../../../../plugins/agent-cli/src/engine/dispatch.ts#L103) · [当前预检](../../../../../plugins/tasks/src/engine/agent-dispatch-executor.ts#L63)
4. **复用受控启动凭据。** `AgentDispatch.advance` 在副作用前存原 dispatch key、fingerprint、输入摘要和冻结目标，以已有 `dispatch- + launchHash(key)` 作为 requestId。扩展 `SessionsService.prepareLaunch`，只接受服务端生成的受控 Codex resume 计划，保持对额外 prompt、command、env 的限制。目前 controlled 与任何 history 互斥。让 `historyLaunchReplay` 保留受控操作、预期 configurationId、cwd、来源和原 intent，重交先走已有 attempt 的 `findLaunch`。复用原 launch receipt/labels/进程核验，在 Session 中记录历史来源。把 `resuming` 的短暂互斥接到持久的原 dispatch/request/session 占用，覆盖 helper 启动至首次输入之间的空窗，防止其他 existing、交互恢复、人工或 review 抢走首轮。[受控启动限制](../../../../../plugins/agent-cli/src/engine/sessions.ts#L504) · [已有 attempt 的恢复](../../../../../plugins/agent-cli/src/engine/sessions.ts#L406) · [稳定派遣 requestId](../../../../../plugins/agent-cli/src/engine/dispatch.ts#L275)
5. **直接在受控 helper 中选择 thread。** 扩展 `CodexDispatch.prepare/start` 及私有启动计划。在 `codex-dispatch-helper.cjs:main` 的 resume 分支，用同一 App Server 在原 cwd 做 `thread/read`、核对 UUID/canonical path/cwd，再对原标识调固定版本支持的 `thread/resume`，核对返回的 thread、文件实体、目录、有效权限/配置和可接受新轮的状态。防止恢复阶段自动续跑遗留目标或复用未结束的旧 turn。证据不足则不开放该组合。整个恢复阶段不携带任务正文。沿用签名 thread/attempt/address/pid/socket，就绪凭据加上 historyId、选择时 revision 和来源绑定摘要；只有已确认的受控身份才能成为 executionSession。冻结 revision 用于首次 resume 前；恢复自身可能更新文件，之后以原就绪凭据和物理身份对账，避免将自己的写入当作陈旧选择。已有协议 2 的 new/existing/旧凭据继续可读，resume 强制来源证明。工作台的 `--history` 最后会启动交互 TUI；可复用其文件匹配逻辑，不能用这个 TUI 生成任务的接受回执。[交互 helper](../../../../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs#L599) · [签名与 thread 绑定](../../../../../plugins/agent-cli/src/engine/codex-dispatch.ts#L218)
6. **沿原发送路径执行。** 在 `executionSession/writeExecutionInput` 验证原 Session、Core/address、进程代次、来源、thread 和输入 owner。Agent 持久写 sending 后向已认证 socket 提交一次；helper 以完整 execution 写 run-intent、inputSha256 和 clientUserMessageId，然后才发唯一一次带正文的 `turn/start`，并存签名 nativeTurnId。Tasks 校验原 task/run/attempt/dispatch、machine/provider/thread、输入摘要和同一 execution，取得 provider 接受才推进 running、投影系统评论。原生问答、停止、结果和 ACK 复用现有按轮通道。第二种方案“开交互历史再向 existing 发”需要用户额外操作，且无同一受控进程的接受证据，不能签收。上游 `temp/sources/agent-autoloop/worker/agents.ts` 提供 session/resume 输入约定；Huhu 的来源、Core 和回执职责已有实现，无须移植另一套执行器。[发送仲裁](../../../../../plugins/agent-cli/src/engine/sessions.ts#L1394) · [落 intent 和 turn/start](../../../../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs#L316) · [Tasks 接受证据](../../../../../plugins/tasks/src/engine/agent-dispatch-executor.ts#L28)

## 重交、取消与失效

| 故障窗口 | 预期动作 |
| --- | --- |
| 同键并发，或 Core 已运行但 launch 回包丢失 | 相同载荷复用 inflight 和持久原凭据；同键异载荷冲突。只找原 requestId/attempt/labels/进程代次。必须区分“尚无正文写入”和“尚未创建进程”；execution 为空或 receipt_not_found 都不能授权再开进程。 |
| 已恢复、签名 thread 就绪稍晚 | 现有路径可能返回 not_sent，下次 Tasks.ready 重新扫目录会被自己的活动 Session 或已变化 revision 挡住。为冻结派遣保存或按键找回原 requestId/sessionId/attempt；优先按原键 inspect/reconcile。证明同一进程、尚无 sending 意图、任务仍有效时才以同键完成首次提交。普通目标列表继续显示该来源已占用。只读 inspect 不发送正文。 |
| 发送响应、provider 回包或 Tasks ACK 丢失 | Tasks 的 sending/unknown 只 inspect。Agent 核对原签名 run receipt，Tasks 以稳定 receiptId 消费、补 ACK 与唯一评论。若 provider 已收到 turn/start 而 helper 没拿到接受回包，可在固定版本确有按 clientUserMessageId 和 thread 唯一反查 turn 的证据时补证；否则保留 unknown、原目标及占用。超时、相同文本、最后一轮或退出码都不能证明应该重发。 |
| 取消、过期、编辑或任务关闭 | 沿用 Tasks.prepare/beginSending 的任务锁、快照 inputRevision/hash、截止和 cancelRequested。领取前或启动待就绪时确认未提交，取消后正文送达 0 次；已有进程保留原身份。若为确保“恢复就绪但尚未授权正文仍可取消”，可在首个 dispatch 调用只准备绑定并返回明确 not_sent，Tasks 重入 claimed 后在同一原目标上完成最终检查。sending 与取消竞争按既有分界先对账。running 的显式 stop 绑定 execution/stopId/nativeTurnId，以 provider 确认原轮终态为准。迟到结果只补原任务。 |
| Core keep shell、地址复用、Space 重绑或异机 | 比对 Vault/machine、Space revision、Session/attempt、Core/address/generation、来源及 thread/turn。失效或证据不明时不发送/回答/停止替代进程。显式 retry 保留原快照和冻结目标；后续消息/问题关联原 execution，更新 Tasks.dispatch 当前对 resume 丢弃 spaceRevision 的特例。 |

实现接点见 [Tasks 状态机](../../../../../plugins/tasks/src/engine/dispatch.ts#L917)、[取消语义](../../../../../plugins/tasks/src/engine/dispatch.ts#L734)、[原轮停止](../../../../../plugins/agent-cli/src/engine/dispatch.ts#L158)、[native 对账](../../../../../plugins/agent-cli/src/engine/dispatch.ts#L320)、[后续输入](../../../../../plugins/tasks/src/engine/dispatch.ts#L365)。

## Tasks、工具及定时扫描入口

- `plugins/tasks/src/engine/index.ts` 的 `tasks.dispatch.targets` 在 output schema 和 handler 两处裁剪来源字段。两处都要扩展。外部 snapshot 保持单 Space、最少披露、过滤受保护 cwd、无 Core 启动或探测副作用。替换 `validateAgentTarget` 的固定拒绝，保留 caller/开放工具鉴权，核验 create/agentCreate/update/duplicate 的完整不透明引用，派遣时再强复核资格。[目录](../../../../../plugins/tasks/src/engine/index.ts#L180) · [固定预检](../../../../../plugins/tasks/src/engine/index.ts#L438)
- `TaskEditor.tsx` 只列 existing，已有 resume 值仅显示禁用占位。原 select 可按源区分 new、Session 和历史，原生 option 显示 provider、可辨标签和限制，刷新不能改选同 provider 的另一条。选择历史时同步 provider，界面只显示有效配置；切换 Space 或旧资料失效时需显式重选，避免保存时悄悄改成 new。核对 `shared/draft.ts` 的保存/回读和表单校验。共享端只调现有 capability。[编辑器](../../../../../plugins/tasks/src/ui/TaskEditor.tsx#L30) · [草稿](../../../../../plugins/tasks/src/shared/draft.ts#L83)
- `service.ts:112` 对所有 resume 追加 dispatchBlocker，`TaskDispatchPanel` 因而禁用人工派遣。替换为基于结构、来源和资格的原因。自动扫描经 `AutomationsService.allTasks → agentDispatchBlocker → classify → Tasks`；有 Tasks query 服务时会重算 blockers，且仅 existing 跳过普通 cliAvailable 检查。resume 要按受控安装的实际能力，避免 PATH/headless 误拦独立 binary 或假报可用。规则预览、手动派遣及实际执行复用相同目标语义，动态占用仍由 Agent CLI 仲裁。[DTO 阻断](../../../../../plugins/tasks/src/engine/service.ts#L105) · [派遣按钮](../../../../../plugins/tasks/src/ui/TaskDispatchPanel.tsx#L78) · [扫描输入](../../../../../plugins/automations/src/engine/service.ts#L345) · [扫描谓词](../../../../../plugins/automations/src/engine/scan.ts#L101)

## 实施后的验收目标

| 文件 | 场景和断言 |
| --- | --- |
| `plugins/tasks/test/agent-dispatch-executor.test.ts`、`plugins/tasks/test/service.test.ts`、`plugins/automations/test/scan.test.ts` | A/B 同 provider，选择 B 再逆序，核对冻结字段、保存往返、唯一输入、按钮/扫描资格。旧 UUID、重复 UUID、文件替换或移除、Space 配置变化、只读/异机均不能改投。 |
| `apps/engine/test/agent-history.test.ts`、`plugins/agent-cli/test/launch-reconcile.test.ts`、`apps/engine/test/codex-dispatch.live.test.ts` | 用既有夹具建两个已退出的持久 thread；计数 B 的 read/resume/turn/start，断言同一来源、原 cwd、一个新 turn，A 零输入，零新 thread/fork/PTY send。加入错误 UUID/路径、活动旧轮、配置变化、任务与交互同时恢复、首轮被抢、Core 回包丢失和 Engine 重开。 |
| `plugins/agent-cli/test/native-receipts.live.test.ts`、`plugins/agent-cli/test/native-stop.live.test.ts`、`apps/engine/test/task-dispatch.live.test.ts` | 分别丢 dispatch 回包、provider 接受回包、Tasks ACK。可证时恢复原回执，无证留 unknown。并发同键/异载荷，领取前、恢复等待、sending、已接受时分别取消或停止，核对原绑定、后续 turn 未受旧 stop 影响、结果唯一及 Claude/Pi 不可派。 |
| `tests/e2e/workflows/task-journey.spec.ts` 与实际二进制 | 用户从任务编辑器直接选已退出 B、保存、派遣、查看原 Space 实例、问答与结果；再查 A。加入同目标的定时扫描及失效原因。Lead 串行运行 E2E，并用固定 Codex、隔离资料目录及回环模型完成真实 resume 后的首轮，核对前后 rollout 实体、UUID、turn 数和原任务时间线。夹具、实际二进制以及 Linux/Windows 各自证据分别记载。 |

## 未运行的验证

本轮通过 topic/manifest、`hc --skill`、`hc --version`、`git rev-parse HEAD`、源码检索及既有实测记录完成静态核查。唯一交付物为本报告。按任务约定未执行单测、E2E、真实 provider 或协议探针、Electron、类型检查、构建及打包；上表均为实施后的验收目标。

### Modern Web Guidance

我检索了 `select form options` 并完整读取 `forms` 与 `select-menu-interaction`。本轮只交付方案，未改前端代码。

## Lead 验收
已核对当前固定拒绝及现有受控 adapter 边界，接受为实施方案。仅接受分析交付，不表示功能或真实 provider 已验证。后续由 sol/high 实施，保留来源和逐请求对账。
