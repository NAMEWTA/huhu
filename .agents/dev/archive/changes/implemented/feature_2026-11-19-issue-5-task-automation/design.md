# #5 从持久接受到一次可见的任务评论

## 现有路径与断点

检查基线为 `feature/issue-fix@9f870c0`，Issue 源码引用为 `main@9132640`，下列路径从仓库根定位。TaskDetail/TaskEditor 与引用、Kernel 权限、preload 已有后续改动，现存的两条 Agent 执行路径与问题 DTO 冲突均在本 checkout 复核。已有能力见 [任务与自动化项目记录](../../../../notes/context/tasks-and-automations.md)；其中旧 supervisor、Safe 与等待语义属于被替换路径。

| Issue 断点 | 读到的现状 | 实施落点 |
| --- | --- | --- |
| P01、P08、P11 | plugins/automations/src/engine/index.ts 的 apply 组装 processWorker，worker.ts 借 agent.launch.resolve 取命令，supervised.ts 的 launchSupervised 自管运行。AutomationsService.runPromptAction 用临时 TaskDto；runTerminalAction 已调用 agent.sessions.launch。 | 保留终端/提醒动作。固定提示词生成实际任务。Agent 执行迁入 #4 的 Herdr session 与回执适配。 |
| P02、P03、P07、P12 | scan.ts 的 classify 用 type/status/tags/processingKey/Space busy；Scheduler.sync 使用 Croner、时区、protect、missedRun。service.activate 先生成 activation 并写 started，无法以同一次发生认领；create 默认 disabled，update 对非 prompt 的正文有限制。当前测试约定无内置规则。 | 复用纯筛选和 Croner；增加 availableAt、window、occurrence、初始化标记和模板/补充指令，编辑器和 handler 同一约定。 |
| P04、P05、P06 | TasksService.runs 和 tasks.runs 注册输出 questions:number，TaskDetail.RunRecords 却 filter/map 并调用 automations.runs.answer。AutomationsService.answerRun 保存后 drive；completeTaskRun 先 setRun，再 commentRun，reconcile 的活动 claim 扫描无法补所有已结束轮次的评论。 | 共享 DTO 分概要/详情，回复先持久接受；任务时间线只消费可重建的 delivery。人工协作独立于 Automations。 |
| P09、P10 | scan 的 usedSpaces 与 service.spaceBusy 按 Space 排斥；claim 按 processingKey 建，正文变化可换 key；confirmDispatched、retryRun 有按当前任务/配置读取的分支。SessionsService.sendComments 有自己的 sending，terminal bridge 也有控制者。 | 任务、输入、资源三种约束各按自己的键承担，由 Tasks 领取、Agent CLI 仲裁。重试只读不可变快照。 |
| 现有写入与授权 | packages/vault/src/markdown/regions.ts、TasksService.addComment/markDispatched、VaultFiles 的 expectedVersion、OperationLog.recover、Vault 的写锁与只读 stateDir；plugins/tasks/src/engine/index.ts 的 originOf、assertAgentAllowed 和 packages/kernel/src/dispatcher.ts 的 authorize。 | 复用区段级写、稳定评论 ID、单文件条件写和内置权限组。现有 desktop-only 创建 Agent 限制改为明确受托范围。Dispatcher 短期幂等不是业务长期凭据。 |

## 结构取舍与唯一写入者

**集中在 Automations 的运行协调**可沿用 rule→run→worker，现成 UI 能很快查到自动化进度；人工回复、原生会话和规则停用后的恢复却会依赖该插件，规则级锁无法表达任务级排他。**按业务事实分属 Tasks、Automations、Agent CLI**，可让任务在停用日程后继续问答，并使人工接管使用同一实例。推荐后者。代价是模块间需持久交接、稳定身份与 ACK，且插件重启要分别恢复。第一个结构仅作取舍比较；用户已经确定唯一执行底座与独立人工闭环。

| 事实与持久位置（拟议归属） | 唯一写入者 | 允许的派生视图 |
| --- | --- | --- |
| 任务业务状态、输入配置、正文与可见评论，Tasks 下的任务 Markdown | Tasks；markDispatched 在实例接受本轮后以 runId 幂等推进 | 看板三列、详情时间线；评论到达不改变业务输入身份 |
| TaskEvent 接受记录、task 领取/hold、请求版本、快照、task-run、delivery | Tasks；内部记录位于持久 vault.stateDir 的 tasks 域，复用现有 task-run 语义实体和存储设施。人工 run 的 ruleId 可为空；定时 run 保留 occurrence 引用 | 运行页和自动化详情读取同一 run，索引或内存事件可重建 |
| 规则、模板、时区/窗口、一次性 timer、occurrence 或手动 invocation、初始化/删除事实 | Automations；激活记录保存当时配置、已接受 task/event ID、跳过原因和推进状态 | 扫描统计与下次时间；接受成功即可结束激活，不等待 Agent 工作完 |
| session 容量、输入 owner、进程代次、发送凭据、待交 Tasks 的回执 | Agent CLI；Core 与 provider 各自保有真实终端/原生事实 | Agents 列表和 inspect。执行合同由 [#4 设计](../feature_2026-11-19-issue-4-agent-cli/design.md) 唯一维护 |
| 基础条件写、日志、能力权限、作用域和唤醒 | Kernel/Vault 提供通用机制 | SQLite、定时器内存和订阅均不能单独证明已发送 |

以 SQLite 单事务保存所有调度和评论可减少跨文件窗口，但会把不可重建的业务事实藏进索引，并且无法回滚 CLI。推荐小范围、可重放的文件接受记录，沿用单 Vault/Engine 写入模型。现有 OperationLog 可能回滚局部文件步骤或标 needs_attention，所以“接受记录”需先独立原子提交，后续物化操作可以重放；不可把已发生的外部副作用放进可回滚组。要承担的成本是确定性 ID、逐条修复和版本冲突处理，不引入通用事件溯源平台。

## 两种调用与持久边界

1. **定时模板建任务。** Automations 在本地已授权规则的 09:00 到期点创建 occurrence，包含 ruleId、scheduledForUTC、ruleVersion、模板/指令快照和预留 taskId。先提交发生事实再推进计划，用同 taskId 创建一次真实任务并调用拟议 tasks.dispatch，传来源、taskId、期望业务输入版本、eventId 和目标。Tasks 返回稳定 dispatch/event 及接受状态，Automations 记关联并完成本次激活。若创建后断电，以原 taskId 补派；若明确拒绝或配置失效，返回可修原因，不换 Space 重建。筛选既有任务时先冻结本次入选的 taskId、输入身份和每项处理结果，重入按原名单补齐；下一次扫描再评估新任务。
2. **从运行抽屉回答原问题。** 以获准的当前用户调用拟议 tasks.reply，输入 taskId/runId、requestId/version、sessionBinding、replyId 和选中的消息。任务详情调用同一 handler。先在 task 临界区校验原请求仍 open/绑定有效，将原文或不可变引用、指纹和关联操作原子落盘；只在此后返回“已保存待发送”。busy 等空闲，退回确定错误时可修复，发送情况待核实则只 inspect。两个入口同时回答同版本，原键同内容取原结果、同键异内容冲突、不同键的后一个得到问题已回答/版本冲突。普通业务回答创建有 parentRunId 的下一轮；原生 deferred 回答继续原轮且必须 provider 支持。受信回执只写原 task/run。已关闭任务不再自动派遣，过期回答可由用户另存普通评论。

## 接受、领取与取消的守卫

| 对象 | 状态转换与观察点 |
| --- | --- |
| TaskEvent | pending → claimed → handled。handled 须已有轮次结果或原生暂停的持久确认。确定未发的暂时错误可回待派；可能已发标 unknown；取消、过期留记录。 |
| TaskRun | queued → launching → running → succeeded / failed / cancelled；不确定可转 unknown 后对账。普通问题可以 succeeded + needs_input；原生暂停则 suspended，得到原生确认后继续原 run。 |
| Request | open → answer_accepted → processing → resolved，另有 expired/cancelled/superseded。回复已保存时仍展示待处理，只有原生确认或后续有效回执才结束。 |
| Delivery | pending → sending → delivered，保存稳定 ID、目标、版本、payload/引用、attempt、nextAttemptAt 和错误。已知未发可退避，确认丢失要核查。 |

- **接受并冻结。** 在 taskId 的本机串行临界区覆盖读、校验、写入，检查尚未物化的接受记录。规范化 eventId/dispatchId/replyId 与消息/配置身份，保存来源、预期版本、目标、选入消息、不可变 payloadRef/hash、待补齐的评论/run/request 变更。同一逻辑派遣来自并发规则和人工时，只有一个有效接受占位，其他来源获得原关联或已受理原因。外部编辑仍需 expectedVersion；仅评论/区段外变化可在新文件版本上重新应用，执行输入变化记 stale_input。恢复先投影未完意图，再开放该任务领取。
- **领取并启动。** 在同一临界区重验任务可执行、目标、输入版本、任务占用及资源约束。确定唯一 run/attempt、冻结正文和执行配置（去敏，秘密只保留所属模块配置标识及版本）、claim 和 dispatch 关系；先落盘再调用 Agent CLI。释放任务锁后进行外部 I/O，每个迟到响应回写时再核对 run/attempt/绑定与取消意图。agent.runs.dispatch “已受理”与 provider 接受本轮输入分别持久化。因 task 已有活跃/未知 run，更新 inputHash 不能取得第二把锁。不同 task 从不合并上下文；一个 session 的输入由 Agent CLI 最后仲裁。
- **重试。** API 重传保持同 payload、dispatchId、快照、attempt 和原凭据，可跨重启及 24 小时。用户明确重做已证实停止的失败执行，先核对任务仍可运行、旧 attempt 无副作用在途，再以原 run/快照追加新 attempt 和与其唯一关联的派遣意图。要执行修改后的正文须重新接受新输入。外部写入是否生效无法判定时维持 unknown；不以缓存过期、PID 消失、空列表、地址相同或 lease 超时释放占用。
- **取消。** 待领取时将事件持久置 cancelled，使领取 CAS 失效。领取已开始则先记录 cancelRequested，重新读取发送凭据；确定未发送可结束，可能已发则经 #4 精确绑定的 cancel/inspect。已被人工接管、已换代或有其他任务占用时不发送中断，保留解释及原轮对账入口。取消重传读原结果；迟到的已完成回执仍按原轮记录，取消/停止成功以真实状态决定。关闭业务任务取消其未发送意图与未来跟进，已运行实例由独立停止动作处理。收起视图只 detach，关闭终端 pane 按 #4 展示终止影响。
- **并发配额。** 任务排他、全局/规则活跃容量、真实资源键与 session 输入权分别检查。等待回答释放执行槽，保留原请求和上下文绑定；多条规则不能分别透支共同容量。按可执行时间、接受时间和稳定 ID 排序，有界领取；busy 等唤醒，断电靠持久记录恢复。跨机同步记录标出 machineId，未知执行由所属机器核实。
- **规则秘密与恢复。** 规则拥有加密配置和版本，任务接受记录只引用所属配置身份。运行时以受限调用把环境交给 #4；配置已删/轮换、单次秘密在重启丢失时显示需要补配，只在重新核实执行事实后接受新的显式意图。Git、数据包、普通规则查询、命令、任务和评论逐一验证去敏，密钥与密文分开。清理 Core 的终端环境由 #4 负责，回执交接和运行历史保留。对外工具使用同一 handler；以调用者实际授予的执行权限和原来源为准。

## 输出交接及崩溃恢复表

| 已知最后事实 | 恢复者与可执行动作 | 用户能检查的证据 |
| --- | --- | --- |
| 接受记录已写，回复评论、请求状态、event 或 claim 未齐 | Tasks 以确定 ID 补齐物化，重放前拦截同 request/version 的后续回答。未关联 run 的 pending 才能领取。 | 回复一次、关联一个 event；请求显示已接受、未处理。 |
| 已领取或已建立 run，尚未证明 CLI 创建 | Tasks 复用快照和同 dispatch 查询 #4 的长期凭据。唯一可证实未发送才续发，若 run 已生成则绑定原实例。 | 同 run/attempt 的凭据链，未知时显示等待核实。 |
| 输入可能已写入，未确认；keep 恢复 shell 或被人工接管 | Agent CLI 核验实例/代次和 provider 原生状态。没有证明时不重投；需现场处理或获准原生恢复后显式重绑。 | 不向替代 shell 注入正文，不出现第二个进程/重复回答。 |
| 适配器已有结果，Agent CLI 或 Tasks 离线 | 适配器先保存 receipt；Agent CLI 持久记录并重交同 receiptId，直至 Tasks 保存 TaskRun、payload 和可重建 delivery 后 ACK。ACK 丢失重交同身份。 | 单一业务结果；没有可恢复回执的 provider 只显示待核实。 |
| Tasks 已记结果，尚未建 delivery；或评论写成功、送达标记没写 | 从回执重建固定 deliveryId/messageId；提交原任务评论，按稳定 ID 去重后标 delivered。权限、暂时写错可退避；不可判定发送另记 unknown。 | 时间线最终只出现一次，期间可查失败原因/尝试次数，CLI 调用数不变。 |
| 发生记录已落盘，任务、提醒或游标只完成部分 | Automations 按 occurrence/子动作 ID 与预留 taskId 补齐；终端命令沿用同 requestId 对账，通知缺可验证确认时保留未知。推进游标不抹除未完成项。 | 同定时点只有一次有效任务/派遣，显示接受、跳过、合并或未确定的效果。 |
| 文件损坏、外部改写、只读/切 Vault、任务被删除 | 暂停受影响记录，保留最后事实及原绑定；只读拒绝接受，停用释放订阅但持久记录保留，切 Vault 取消旧代次回调。输入记录不被当空，删除的任务不重建。 | 文件问题可定位，恢复不会重跑已完成事项、越 Vault 送达或丢失未确认结果。 |

## 来源、许可与宿主

Huhu 复用 VaultFiles/OperationLog、Markdown 区段写、ClaimStore.create、HoldStore、Croner 11.0.0（MIT）和任务 UI。claim 的 wx 回退或损坏记录须演练中断。agent-autoloop 本轮取默认分支 `main@d1ec2d8e48de`，本地 LICENSE 为 MIT。下表的 kernel/worker 路径按该 checkout 核对；Issue 固定提交保留历史出处。Core 源码、Huhu 打包锁与实际运行环境的区别见 [#4 设计](../feature_2026-11-19-issue-4-agent-cli/design.md)。[批次源码清单](../feature_2026-11-19-huhu-issues-3-10/sources.md) · [Huhu 来源台账](../../../../../../docs/upstream/ledger.md)

| 上游位置与职责 | Huhu 的移植单位及证据 |
| --- | --- |
| kernel/decide.ts 的 ingest、claimNext；kernel/query.ts 的 jobOf | Tasks 的接受、按 taskId 领取与上下文快照。用重复来源、竞争领取、正文变化验证。 |
| decide.ts 的 applyReceipt、answer、scheduleReview、tick | Tasks 问答/回执与 Automations 到期/跟进。测双答、回执重交及改期。Croner 继续负责 cron。 |
| decide.ts 的 nextCard 及 delivered/failed 分支；worker/worker.ts 结果交接 | Tasks delivery 与 #4 的可重交执行回执。断在回执、评论和 ACK 之间验一次可见。 |
| worker/agents.ts 的 adapter 与 kernel/store.ts 的提交边界 | 取输入/原生绑定/回执及先提交的语义，宿主落到 Agent CLI/Vault 文件。独立 spawn、SQLite facts、外部 host/worker 与渠道插件不移入。 |

实施时记录精确源文件头、导入闭包、本地目标、修改、迁入测试与 NOTICE。文章仅作产品背景。桌面/Web 的控件复用 Huhu 设计系统；当前 DateTimePicker 的 datetime.ts 以设备本地 Date 转 ISO，不能直接表达远端规则时区。共享输入传墙钟值、IANA zone 及歧义选择给同一时区解析能力，Engine 统一给出 UTC 边界，界面标明规则时区。已检索并取得 forms、dialog、accessibility、coordinate-global-events。桌面锁 Electron 44.9.1/Chromium 152.0.7977.167，在实际 appInfo 核验；Web 按 Baseline Widely available，Temporal 未达该范围。若客户端本地解析，检测 Temporal 并按指南按需加载 temporal-polyfill；也可直接消费 Engine 的解析结果以免两端换算分歧。测试浏览器设备与 Engine 不同时区及原生缺失分支。[Electron 发布记录](https://releases.electronjs.org/release/v44.9.1) · [Temporal 支持](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal) · [Huhu 视觉规范](../../../../notes/context/design-system.md)

## 待产品选择

> 2026-11-21 用户采纳本表全部推荐项，定案见[批次决定](../feature_2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md)。


以下两项仍待选择。规则停用与删除的确定行为见[时间规格](spec.md#何时自动派遣)，队列的单项取消由 Tasks 负责。

| 前提与问题 | 选项、建议与代价 | 阻塞范围 |
| --- | --- | --- |
| 用户保存已启用规则的编辑后，下一次日程何时生效 | 保持原启停状态并显示接下来三次触发（推荐，已接受发生保持原快照）；或保存变更即暂停，需用户重新启用（便于复查，会漏掉计划触发）。 | [T5.5](tasks/T5.5-edit-schedule.md) 的编辑提交和文案；调度身份可先实现。 |
| 某地墙钟时间在 DST 缺口不存在或在回拨时有两个 instant，用户在编辑器输入这一时间 | 推荐缺口提示另选，重叠展示两个 offset 供选择并预览 UTC；也可按已说明的自动顺延/择早策略立即解析。前者多一步，后者会替用户决定时刻。Cron 定时发生仍按锁定 Croner 实测，occurrence 以 UTC instant 去重。 | [T4.1](tasks/T4.1-available-at.md) 的歧义输入、[T5.5](tasks/T5.5-edit-schedule.md) 的预览说明；正常时区窗口、只读筛选可先做。 |
