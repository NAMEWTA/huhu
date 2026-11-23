# Linux 已批准 sh 的丢回包诊断

任务 `wta-ubuntu / t8t / task01.md`，Lead `t3p`。执行结果为 `done`（只读诊断）。依据 integration 提交 `d0f50bbb` 的实现、Lead 的实际运行日志和 #4/#5 规格。本文是本次唯一产物。

**第一次 `terminal.run` 已创建外层 host，Linux 已批准的 sh 在该故障路径上尚未启动。** 实际 CLI 日志证实原 runId、activationId 保持一致，解除故障后 12 秒内仍为 `unknown`。未启动的判断来自可核对的分支和私有协议。日志没有记录内层进程计数。原 broker 在首次核验失败时已经撤销，之后再给这个实现更多时间，也没有向同一 host 交付的执行入口。建议保留第 183 行的最终成功断言，修复活 Engine 短断后的原尝试接续。重启后应依据私有交付边界和已持久化的证明给出结果。[真实失败日志](../../../../../temp/issue-evidence/huhu-2026-11-22/linux-approved-live.log)

## 已确认的调用链

| 阶段 | 在此能证明的事实 |
| --- | --- |
| CLI/MCP → Automations | `externalRun` 校验工具开放、规则批准及修订。原意图决定唯一 run 和 activation，记录绑定本机 owner、调用方、grant 及修订。提交前生成 `autorun-${runId}`。同意图重传直接读原记录，只有首次调用进入凭据 lease 和私有启动。定时对账（默认 5 秒）或启动对账按原 requestId 从 Agent 会话列表取事实。见 `terminal-environment.ts:465–499`、Automations `service.ts:533–590,789–831`、`index.ts:339–347`。 |
| Agent → Core | `launchNative` 先启动本次 broker，保存 session、attempt UUID、Core 身份、公开 host argv 摘要和 `nativeStatus=pending`，再调用一次 `terminal.run`。其 argv 是 helper 路径、host 模式、本次 broker 交会标识及进程身份，`keep:false`，无内层命令或私有 env。测试先 await 真实 Core 创建，再抛响应丢失，且同时阻断 `terminal.list`。见 Agent `sessions.ts:680–708`、CLI 测试第 47–55 行。 |
| Core → 私有交付 | Agent 先用创建回包或同 Core 唯一标签匹配验证 cwd、argv 和进程绑定，再由 `inspectHost` 验证实际 host。之后才可能调用 `native.use → broker.start`，向 broker 私有 stdin 提交一帧。故障使控制流停在第 708 行，`finally` 在第 746 行撤销 broker。此分支从未调用 `broker.start`。 |
| broker → sh | broker/host 核验对端及目标。host 接受帧后，broker 从私有 stdout 报 `ISSUED_ONCE` 并向 host 放行。Linux supervisor 用固定的映像和目录 FD 启动子进程，`cmd.Start()` 成功后发回启动字节，broker 才能报 `RUNNING`。host 转送内层退出码。协议中的消费、启动、退出分别有独立意义。见 `native-pty.ts:247–272`、`protocol_linux.go:208–238,312–320`、`protocol.go:82–110`、`console_linux.go:131–146,188–198,276–309`。 |
| 后续查询 | `findLaunch` 和 `reconcile` 只应用快照。即使找回同一个 host，`applySnapshot` 对任何尚未取得 `started` 的原生尝试都保留未知，避免把外层退出当作 sh 的结果。Automations 定期通过 `agent.sessions.list` 结算，原 CLI 的轮询自身不会再次调用 Agent 启动。见 Agent `sessions.ts:768–784,852–871,1194–1206` 和 Automations `service.ts:708–739`。 |

**Windows 对照。** 这里应比较外部批准 PowerShell。它走 `agentProtectedTerminal.launch`，在发 Core RPC **之前**由 `ProtectedLaunch.issue` 注册短寿命票据。回包失联且无法列举不会立即撤销这张票，原 helper 可自行领取，核验目录后运行命令，输出经遮蔽，退出码传给包装进程。代价是 Core argv 含可一次使用的旧式票据。Linux 显式 sh 走 `launchApprovedShell`，公开交会参数单独不足以领取凭据。Windows 交互式原生环境也会走 `launchNative`，应与 Windows 批准规则分开验收。[旧票据服务](../../../../../temp/issue-worktrees/integration/plugins/agent-cli/src/engine/protected-launch.ts#L94) · [Windows 规则既有验收](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/E07-approved-terminal.md)

**测试判定。** `starts.length` 计外层创建。把这个数解读成 sh 已执行一次，是错误的阶段假设。第 183 行在短断解除后要求原意图最终成功，并继续检查实际命令输出，这项产品要求成立。第 174–182 行在前两个 CLI 调用返回后，才撤去 Core 注入，因此只在原 RPC 内循环等列表可用会耗尽票据期限。第 222–224 行覆盖已成功记录的重开，不能证明交付途中的重启。#4 要求区分本地接受、进程创建和实际结果，#5 要求原 requestId 对账，单次秘密丢失后依据原执行事实处理。[#4 规格](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/spec.md#L22) · [#4 设计](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/design.md#L49) · [#5 设计](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/design.md#L44)

## 建议给 t86 的实施边界

1. **让原 Agent 尝试拥有 broker。** 在 SessionsService 内按本 Vault 的 requestId、sessionId、attemptId 管理有限寿命的活动尝试。首次核验失败先让上层拿到原运行的 `unknown`；同一尝试继续以有界退避读取只读快照，到原截止时间为止（当前 JS broker 24 秒、Go 协议 30 秒，从创建计时）。后台工作自行推进，不依赖新的外部工具调用；恢复/列表入口仍可保持只读。复用 `sameCore`、全套 launch labels、`verifyTerminal` 和 `inspectHost`。只向同代唯一可核验的 live 原 host 交付。地址提示和已有 binding 必须一致，歧义、换代、spawn_pending、空列表、替代 shell 均不能触发交付。成功核验后保存原进程 binding，host 已绑定与内层已启动仍是两项事实。并发续查共用一个执行者，所有异步结果落盘前重读 attempt 和阶段；清理时只移除自己的 owner。
2. **由 Automations 按需提供一次领取函数。** 当前 `prepareApprovedShell` 的闭包捕获了 `input.env` 对象；它来自 `Object.fromEntries(values)`，即使 `ModuleCredentials.use` 在 finally 清 Map，这个副本也会继续存活。把这个闭包塞进后台表会超出原 lease 的使用期。建议分离“已受理且待核对”和“私有交付已结束”的生命周期。Linux 私有调用传非秘密计划、已批准名字和进程内一次性回调；首次就准备好接续，但只在 host 验证完成后由 Automations 在原 owner/grant 的上下文中取用指定修订。复用 `authorizeExternal`、原 `validate` 和 `store.use`，在实际 consumer 中重验开放、grant ID、规则/Space/目标/环境修订及名字，再在**该次 lease 内** await 唯一的 broker 提交。运行时同样检查 argv/cwd 中不含保护值，保留 helper 复核和同 FD 执行。计划和等待表不保存明文、可领取 token 或值的散列。等待 host 时释放 `withRuleConfiguration` 队列；领取处可以串行校验，避免初次调用持同一队列等待重入。轮换或撤权先于交付即停止。已交付的请求只读原回执。
3. **保留取消和关闭的所有权。** 现在 `invokeApprovedTerminal` 的 finally 在未开始 settle 时删除 `runAbort`；`withRule` 结束也会移除规则控制器。让 Automations 在收到初始 unknown 后仍持有这个 run 的取消句柄，直到后台结束，再把既有 settle/reconcile 接回。保留 `runAbort` 时第 793 行会跳过定时结算，故完成回调必须显式启动 settle，或在解除占用后触发一次 reconcile。收到取消、Vault/插件关闭、权限失效或原 broker 到期均结束等待并释放资源；写回前核对活动 attempt 和生命周期，杜绝迟到回调复活。Core 视图短断允许恢复，原请求无需新建 host。无需改公共工具、Core 或 Go 私有协议。t86 的原可写范围不含 Automations 和私有服务注册；这两处需要 Lead 协调单写者。
4. **在现有 LaunchReceipt 写清交付边界。** 用带版本或可辨识的新阶段表示“尚未向 broker 写入私有帧”。在任何可能写入私有 stdin 前，先原子保存“开始交付”与本次 host binding，落盘失败则停止。保留 `nativeConsumed`，私有 `RUNNING` 才置 `started`，可信 `START_FAILED` 写原 attempt 的 `failed`。从现有记录结构扩展即可。禁止复用会清空 attempt 的 `confirmNotCreated` 来表达“外层已建、内层未启动”。旧版 `nativeStatus=pending` 和缺少 `nativeConsumed` 都不足以证明未发送（私有帧、消费回执、落盘之间有崩溃窗口）。所有状态写入须单调；同一身份的私有确认可以推进未知，公开文本和 host 成败不能跨越启动回执门槛。
5. **选择理由。** 仅延长同步等待会被夹具和规则串行队列挡住。改成 Windows 式预发可领取票据会改变 Linux 的核验顺序与 Core 可见信息。保留原 broker、推迟领取只需扩展已有私有调用和本地尝试记录。若产品额外要求跨进程找回“已执行但 Engine 未存下 RUNNING”的事实，需要由原受信 helper 保存并重交绑定 attempt/host 的脱敏回执，直到接收 ACK；现有 broker 私有 stdout 无此能力。本次已知短断可沿用现有协议处理。

## Engine 重启、到期及恢复后的判定

| 最后能证实的状态 | 原请求的可展示结果与动作 |
| --- | --- |
| 新格式明确仍在等 host，写前记录从未转入交付 | 原 Engine 已结束，其一次性领取函数和 broker stdin 不可接续。原 run 可记录“内层未启动，授权交付已结束”，保留 attempt 和 ID。活 Engine 等待到期、已撤权或取消且证明尚未写帧，同理。只在已证实无内层副作用后由新的显式意图启动。回收孤立外层 host 前单独验证身份及终态；失败记录仍要能完成原有 `hasEnv/release` 清理，外层记录未找回时保留清理待办。 |
| 新格式已写“开始交付”、仅持有消费回执，或旧格式 pending | 保持 `unknown`，保留已知消费事实。即使 host 消失、超时、退出 0，或 Core 文本出现启动标志，也不能证明内层结果。不得新发帧、取新值或启动第二个进程。 |
| 有私有明确未启动回执 | 原 run 失败，保留已消费标志（如有）。若 Agent 写入 `failed`，Automations 下轮应能结算为失败；保留原 attempt 禁止重投。 |
| 已持久化 `started` 且有准确绑定 | 按原 Core、labels、cwd、argv、地址、创建时间、PID 核验。仍活可报 running，原 host 已退出且有退出码才进入既有 shell 结算，0 成功，非零失败。失去可靠终态继续待核实。已结算原 run 在重开后仍返回原结果。 |

## 关键回归与验证状态

- **真实 CLI/MCP/Core 保留原注入。** 真实 `terminal.run` 返回后丢包、阻断 list、先取得相同 ID 的 unknown；短断内关闭故障后，原 sh 执行且原 run 成功。在批准的夹具命令内向隔离目录追加一条固定无秘密记录，预先建立文件，在解除故障前断言 0 行，完成及同意图并发重传、重开后断言 1 行。另核对本意图外层创建一次、私有交付一次。保留遮蔽、目标目录、轮换、变更意图、跨调用身份、撤权及归档隔离断言。源码还显示原生遮蔽文本为 `[REDACTED]`，当前规则测试第 187 行期望 `***`；该断言本次没有跑到。对齐规则输出契约时可在原生 masker 对已批准规则选择替换文本，以免改写普通用户输出里的字面文本。[CLI 测试](../../../../../temp/issue-worktrees/integration/apps/cli/test/approved-terminal.test.ts#L172) · [原生遮蔽](../../../../../temp/issue-worktrees/integration/native/agent-pty/mask.go#L113)
- **分开测试启动后丢回包。** 若用例声称“sh 已经执行，调用者没有获知”，将这个注入点放到已实际执行且私有 `RUNNING` 及绑定已保存之后，例如包装私有 Agent 返回给 Automations 的响应。一旦允许对账，应从原会话恢复结果，内层仍只有一行。另在私有消费后屏蔽 `RUNNING`，即使夹具实际写了一行且外层退出 0，Engine 没有持久启动证明时仍须返回 unknown。两项独立于上一项。
- **阶段与所有权。** 加入切 Engine 于写帧前、写前标志后但 ACK 前、`ISSUED_ONCE` 后及 `started` 落盘后四个断点。覆盖 legacy pending、空/多匹配/代次变化、授权撤回/轮换、取消、超期及取消与迟到核验竞争。分别断言原 run/session/attempt 不变、票据最多一次、无第二 host、无成功误判、关闭后无延迟写入。用独立合成值检查 Core argv/env/restart 数据、Agent 尝试 JSON、审计、回执和归档；不把 marker 写入计数文件。
- **已核对的运行证据。** Lead 的 `linux-pty-build.log` 和 `linux-pty-live.log` 分别记录 Go 构建/测试和 normal、host-crash、changed-file 通过；`linux-session-check.log` 记录 31/31。t86 的报告记录定向 TypeScript 复查通过。以上结果覆盖各自的层次。[t86 报告](../t86/report01.md) · [会话测试日志](../../../../../temp/issue-evidence/huhu-2026-11-22/linux-session-check.log)
- **未运行的验证。** 本诊断未重新运行 CLI、Go、Playwright、打包或全仓检查。恢复设计、重启断点和独立内层计数属于待实现验证项。当前候选的真实 CLI 第 183 行仍有失败记录。

## Lead 收取
诊断与当前代码、t8r 实测一致，保留最终成功与真实命令次数验收。采用原 broker 有限续查、交付时重新验证原授权与同修订凭据 lease、明确写前阶段的方向。待 t8k 交回 Automations 文件后，t86 新任务统一实施 Agent 与 Automations 的接续；不扩大公开能力。
