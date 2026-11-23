# DocumentSession 在途写入的统一不变量

Lead `t3p`，worker `t14m`，task01。静态分析基准为 `agent-linux` 的 HEAD `fa5d5c3a`，工作树中的 DocumentSession 为 `b426103e`，EngineClient 为 `c7eef611`。[任务单](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t14m/task01.md) · [t14j 独审](t14j-report01.md) · [t13b 修复](t13b-report06.md) · [t13x 对账分析](t13x-report01.md)

**建议由每个 DocumentSession 持有一笔正在改变文件的写入，从实际提交持续到回执和必要的读盘对账都已处理。** 此期间，哪怕当前缓冲 X 等于上次确认的磁盘 X，也应向切 Vault 发布 `hasUnsaved=true`，自动通知应保留 X。真正的终态只有三种：磁盘已确认且缓冲相同，可以结清；磁盘已确认且缓冲不同，按正常编辑或冲突处理；写入结果仍未知，保留缓冲和草稿，等待明确处置。

## 两条调用链为什么漏掉同一笔写入

| 时刻 | 当前代码 | 用户可见后果 |
| --- | --- | --- |
| 从 X 保存 A，回执前撤销到 X | `setText` 看到同代 `pendingBodyWriteGeneration` 并发布 dirty。构建同一份快照的 `hasUnsavedText()` 只看未知冲突或字节差，此时返回 false。 | 切 Vault 的对话框和提交动作都通过 `collectDirtyDocs` 先 drain 再筛选。漏掉本篇后，其 `keepDraft` 即使正确也没有执行机会。[会话快照与撤销](../../plugins/notes/src/ui/documents/DocumentSession.ts#L173) · [注册](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L55) · [筛选与结算](../../packages/workbench/src/state/flushers.ts#L38) · [切换](../../packages/workbench/src/shell/VaultSwitchDialog.tsx#L38) |
| A 已落盘，保存报错，扣住对账读，外部通知此时到达 | `catch` 先清正文标记并 emit；对账随后推进 `diskRevision`。外部通知见 `X === savedText` 且状态非 saving，调用 `load()`。这笔新读捕获的是推进后的编号。 | 自动读先返回便采用 A，原对账样本失效后重读，已经找不回 X。仅在发现旧读数时等待 `reconcilingWrite` 覆盖不了这个顺序。[保存失败与复读](../../plugins/notes/src/ui/documents/DocumentSession.ts#L368) · [外部事件入口](../../plugins/notes/src/ui/NotesModule.tsx#L67) · [自动重载](../../plugins/notes/src/ui/documents/DocumentSession.ts#L650) · [接纳读数](../../plugins/notes/src/ui/documents/DocumentSession.ts#L248) |

## 最小改动位置

1. **复用串行队列，替换正文专用标记。** 用一个可空的活动写记录代替 `pendingBodyWriteGeneration`。正文通过同文、等价和代数检查后，在发出 `notes.save` 时登记；字段在 `submit` 通过代数检查、即将调用 `archives.update` 时登记。排队快照、字段预检、读请求、草稿写都不登记。字段正常 ACK 后仍要持有记录，直到 `notes.read` 的结果已并入当前正文和排队快照。字段之前的正文保存是同一队列任务里的上一笔独立写入。现有单文件串行约束只需一个活动槽。[正文](../../plugins/notes/src/ui/documents/DocumentSession.ts#L321) · [串行队列](../../plugins/notes/src/ui/documents/DocumentSession.ts#L444) · [字段提交与合并](../../plugins/notes/src/ui/documents/DocumentSession.ts#L478)
2. **登记与结算均须更新订阅快照。** 入槽后立即发布，特别是从干净正文发起字段更新时。当前保存错误通知、切代、新输入或明确重载都不能单独清槽。正常 ACK／字段合并、明确拒绝或对账结束时，在原队列位置完成状态更新、清槽并发布；同步订阅者不应能读到“记录已清、结果尚未接纳”的快照。每个出口都要发布清槽后的最终值，包括普通失败复读同盘的无变化出口。对账发现偏离或仍未知时，先建立 `lateWriteConflict` 再交出保护。过期请求仍返回 false，保留现有副作用守卫。[快照缓存](../../plugins/notes/src/ui/documents/DocumentSession.ts#L167) · [对账接纳](../../plugins/notes/src/ui/documents/DocumentSession.ts#L399)
3. **从同一事实推导调用方需要的判断。** `hasUnsaved = 活动写存在 || lateWriteConflict?.unknown === true || (savedText !== null && text !== savedText)`。活动写即使来自旧代，仍可能改变同一路径。撤销时继续发布可手动再保存的 dirty，空闲撤销立即 saved。该布尔值表示切换前必须结算，不能用作“应当调用 notes.save”的条件。切 Vault 继续用现有两次筛选；`keepDraft` 在队列中等先前写入、按当前代重新比较。正常字段成功且缓冲已随合并更新可直接离开，实际仍有 X 时必须等 X 的草稿回执。保留手动 `flush()` 的每次快照、`untilClean` 的排空，以及 `queuedSaves` 在同代字段成功时的三方重基。[保存门控](../../plugins/notes/src/ui/documents/DocumentSession.ts#L459) · [排空与留稿](../../plugins/notes/src/ui/documents/DocumentSession.ts#L554) · [手动按钮](../../plugins/notes/src/ui/NoteDocument.tsx#L363)
4. **按触发原因控制谁能替换正文。** 自动外部通知遇活动写或待解决的迟到冲突就保留缓冲，让原写入负责结算。普通脏稿仍进入 conflict，普通干净文件照常刷新。自动读在开始前和接纳前都检查会话现状，可复用 `load` 的 `isCurrent` 回调，这也覆盖自动读先开始、字段更新随后送出的顺序。明确确认的重载、`keepMine`、`merge` 继续使用现有读序号和代数仲裁，可在原写尚未返回时更换基线；原写稍后仍须对最新基线核对。把等待整个队列加到公共 `load()` 会卡住现有“先明确重载再释放旧写”的调用顺序。删除通知保留原有的读失效和排队留稿路径。[读仲裁](../../plugins/notes/src/ui/documents/DocumentSession.ts#L213) · [删除通知](../../plugins/notes/src/ui/documents/DocumentSession.ts#L651) · [明确重载正例](../../plugins/notes/test/document-session.test.ts#L754) · [冲突解决](../../plugins/notes/src/ui/documents/DocumentSession.ts#L720)

调用方还有三处需要按这个边界接线。笔记及档案的编码转换完成回调跨越了异步请求，当前根据渲染时的快照决定是否直接 `load()`；应在调用时进入会话的自动刷新判断，并保留未载入、编码转换成功后的首次读取。停放返回的 `reopenDraft` 有意允许重开与持久草稿匹配的脏缓冲，沿用其 revision、draft 文本和取消守卫，再对活动写或迟到冲突走已有留稿路径。普通文本／JSON 查看器的冲突横幅直接比较两个字符串，未知结果且字节相同时会隐藏保留、合并并跳过重载确认；这两个判断应与笔记页一样读 `snap.hasUnsaved`。[笔记转换](../../plugins/notes/src/ui/NoteDocument.tsx#L65) · [档案转换](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L367) · [转换回调时机](../../plugins/notes/src/ui/viewers/EncodingConversion.tsx#L36) · [重开草稿](../../plugins/notes/src/ui/documents/DocumentSession.ts#L639) · [文本冲突横幅](../../plugins/notes/src/ui/viewers/TextFileView.tsx#L95)

| 现有状态 | 修复后由谁负责 |
| --- | --- |
| `pendingBodyWriteGeneration`、`reconcilingWrite` | 前者由活动写记录替代，后者的 Promise 可作为记录内可选的“正在对账”字段。Promise 仅供已失效的读等待本轮对账；覆盖整个未结算期的保护来自活动记录。 |
| `lateWriteConflict` | 保留。队列释放后仍需持有共同祖先和 unknown，支持三方合并、阻止隐式重写并在退出时留稿。已知磁盘且文字相同可没有待保存字节，自动刷新仍须尊重未解决记录。 |
| `diskRevision`、`loadSeq` | 两者都保留。前者让取样期间的写入、条件冲突或对账使旧磁盘读数失效，包括内容版本变回原值；后者裁定多次重载／解决的先后及删除产生的失效。对账观察读序号，自动通知受保护时应在递增序号前返回。 |
| `baselineGeneration`、`inflight` | 前者淘汰失去基线授权的快照，普通成功保存只推进版本；后者提供包含草稿、空操作在内的队尾等待。两者都不能单独说明实际文件写入是否已结算。 |

## 真实 EngineClient 的错误边界

有两条不同的真实路径会得到 `CapabilityError("INTERNAL")`。第一条是 `fetch` 已返回 Response，`res.json()` 读取或解析失败，客户端本地生成 INTERNAL，当前丢弃原异常及来源。第二条是成功解码的 Engine 错误，客户端转交 `error.details`。Dispatcher 在 handler 与取消／超时的竞速中若先中断，会明确返回 `details.outcome = "unknown"`；普通已结束的非业务异常只带 `correlationId`。会话现有判断仅认原始 TypeError、AbortError、TimeoutError，会漏掉上述本地解码失败和服务端明确未知两种情况。[客户端](../../packages/workbench/src/engine-client/client.ts#L53) · [Dispatcher](../../packages/kernel/src/dispatcher.ts#L406) · [错误契约](../../packages/contracts/src/errors.ts#L44) · [会话分类](../../plugins/notes/src/ui/documents/DocumentSession.ts#L94)

**首选在共享客户端为写请求的响应体读取／解析失败补上现有 `details: { outcome: "unknown" }`，保留原 code 和消息。** 正文和已提交字段共同识别这个标记，同时沿用 fetch 拒绝的传输异常判断。字段预检失败不进入文件写结算；已 ACK 后的读盘或查询刷新失败仍以实际磁盘为准。若区分字段 ACK 与查询刷新，可把已有 `submit` 窄化到实际 Engine 调用，把缓存失效留在其后、同一队列任务内。保留 `cause` 有助定位，但匹配异常名、中文报错、HTTP 状态或 `retryable` 都不能恢复丢失的结果语义。[档案调用包装](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L17) · [字段提交](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L378) · [离线异步指南](/tmp/mwg-guide-3235787-1795365728802.md#L229)

- 同代普通服务端失败继续在原位复读。磁盘未变化则保留错误与明确重试条件；磁盘已变则以实读版本核对、保留当前缓冲。正文写后还有索引刷新；字段写后还有身份记录条件写，因此字段即使返回 VERSION_CONFLICT 也可能已经更新正文。仅已有证据证明在正文条件检查被拒绝时，才可直接走正文版本冲突分支。[正文保存顺序](../../plugins/notes/src/engine/service.ts#L578) · [Vault 版本检查](../../packages/vault/src/write.ts#L128) · [字段写后步骤](../../plugins/notes/src/engine/archives/service.ts#L422) · [身份记录](../../plugins/notes/src/engine/service.ts#L90)
- 已标未知或核对读取失败时，即使实读仍为 X，也应维持冲突，挡住排队正文、字段及自动保存；退出留 X 和最近可信版本。若选择“保留我的修改”，重新读取磁盘并由下一次明确保存使用当时版本。HTTP 正常能力响应是在 dispatcher 返回后形成的，破损响应本身不能证明有迟到提交；服务端超时竞速则提供了 handler 可能继续的直接证据。当前客户端每笔会话保存自动取新的幂等键，没有可用于这次会话写的完成屏障。[HTTP 返回点](../../packages/kernel/src/server/capability-http.ts#L94) · [超时与中断](../../packages/kernel/src/dispatcher.ts#L366) · [普通写入的幂等路径](../../packages/kernel/src/dispatcher.ts#L311)
- 若本批次只能改 Notes，保守退路是将已提交写入的所有 INTERNAL 归入未知，保住缓冲。代价是普通服务端 INTERNAL 且复读同盘也需要用户先解决冲突，不能完整保留普通重试体验。共享客户端补标可同时满足两项要求，无需添加错误码、重放机制或服务端协议。

## 最低必要回归与证据边界

1. 沿用 t13b 正在补的两条 t14j 时序。切 Vault 那条要经过真实 `collectDirtyDocs/settleDirtyDocs("draft")` 的筛选，在回执和对账门控处观察 X 仍入选，最后检查草稿 X 和实际版本。自动通知那条把通知放在对账已开始之后，检查自动读不能替换 X、原文件写总计一次。若已有用例覆盖这些断言，直接复用。
2. 加强现有字段正常合并／预检门控用例：以初始干净正文进入字段操作，预检阶段没有活动写；进入 submit 后及正常 ACK 后扣住字段回读时，快照均需结算，此时送自动通知仍保留正文。释放后正常合并，快照恢复准确的 hasUnsaved，排队快照仍吸收字段差异。另可在同一用例先放出自动读、于 submit 后才交付样本，覆盖自动读取的第二次检查。[原字段正例](../../plugins/notes/test/document-session.test.ts#L243) · [原预检门控](../../plugins/notes/test/document-session.test.ts#L336)
3. 用一组真实 `EngineClient` 加注入 fetch 的边界回归，在同代 X→A→X 后让对账读到 X。依次提供截断的 HTTP 200 JSON、合法错误信封带 `details.outcome="unknown"`、普通合法 INTERNAL 带 `correlationId`。前两行断言拒绝排空、退出有 X 草稿且无第二次正文写；最后一行断言没有未知锁，新的明确编辑可成功重试。复用已有门控和成功响应夹具，无需再加一组 FakeEngine 抛 TypeError 的用例。既有跨代明确重载、三方合并、普通失败重试和 65 项基线继续作为兼容证据。[客户端测试夹具](../../packages/workbench/test/engine-client.test.ts#L7) · [现有字段传输测试](../../plugins/notes/test/document-session.test.ts#L468) · [已有 65 项记录](t14j-report01.md)

**未运行的验证。** 本轮按任务单只读源码、调用链和前序报告，仅写本分析。没有运行单测、Electron E2E、类型检查或构建。两条新时序及客户端回归的运行结果由 Lead 后续验收。
