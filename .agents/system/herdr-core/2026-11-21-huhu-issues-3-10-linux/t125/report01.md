# Graph 收件箱的到达证据与 200 封补位

**结论。** S4.2 的分页缺口可以独立修复。S5.2 不宜用第二条 `changeType=created` 游标签收。Graph 的邮件 delta 返回资源状态，目录级读状态变化可以穿透过滤，响应中也没有适用于每一行的创建事件标签。现有全类型 delta 足以实现一个较窄且可验证的规则：完成初扫后，只提醒本轮 delta 确认在 Inbox、且能证明此前的 Inbox 同步从未观察到该原生 ID 的未读邮件。相同或倒序的收件时间不影响判定。[message: delta，过滤例外及响应类型](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0#odata-query-parameters) · [S4.2](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S4.2-outlook-delta.md) · [S5.2](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S5.2-new-mail-notice.md)

**唯一需产品决定的是是否接受“可证实的首次入箱”作为 Graph 新信通知口径。** 这会提醒首次从其他目录移入且满足条件的邮件，也会在旧身份无法排除时静默。曾见过的同一 ID 在本次连续跟踪期间移出又移回保持静默。若必须辨别真实投递与首次移入，或要求证据缺失时也一封不漏，当前目录轮询接口与有限状态无法同时兑现，S5.2 应保持待签收。S4.2 的正文和目录同步仍可推进。[Outlook ImmutableId 的有效范围](https://learn.microsoft.com/en-us/graph/outlook-immutable-id#lifetime-of-immutable-ids) · [Graph 的消息移动语义](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0#methods)

## 为什么单条记录无法判定

Microsoft 的教程示例中，创建过滤流在初扫后只返回两封新增邮件。接口参考同时明确允许目录级移出和读状态变更越过过滤条件，且未承诺读状态例外永远只带 `id,isRead`。一般 delta 契约允许更新包含额外属性。同一条记录跨页或跨轮重复也属合法。首请求的选项已编码进后续不透明链接，不能在旧游标上追加过滤参数来改变其含义。另开一条流需独立初扫，仍缺同一 ID 的事件类型证明。[官方示例 2](https://learn.microsoft.com/en-us/graph/delta-query-messages#example-2-synchronize-messages-in-a-folder-based-on-change-type) · [接口参考](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0#query-parameters) · [delta 资源表示与重放](https://learn.microsoft.com/en-us/graph/delta-query-overview#resource-representation-in-the-delta-query-response)

设本机只保留前 200 封正文。历史 A 中，X 原排第 201，本轮前面一封移出，X 被标为未读。历史 B 中，X 在初扫后刚进 Inbox，收件时间与 A 中 X 相同。若此前已丢弃 X 的身份，两种情况可产生相同的本机缓存、完整资源行、列表行和单封 GET 结果。重新取正文、比较创建或收件时间、ETag、字段数量，均没有提供“在前一个同步状态中 X 是否出现”的证据。哪怕列表先看到 X，再收到完整 delta，这个歧义依然存在。这里说的是公开契约允许这两种客户端观察，并非声称已在租户抓到相同载荷。[上轮两个反例](t120-report01.md) · [Graph 消息属性](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0#properties)

本地 one-mail 固定版本的 `sync_with_token` 遍历 nextLink，取终态 deltaLink 后把消息交给 `apply_messages`；解析只对 `@removed` 单独分支。可复用它的分页提交顺序。Huhu Gmail 的 `messagesAdded` 则是协议直接给出的新增来源，Graph 只能复用其“先决定资格，再取正文、发通知”的处理方式。Outlook 订阅另有带类型的推送契约，还涉及订阅的创建、接收与续期；按未读过滤时，旧邮件改为未读也可产生 Created。本次方案沿用既有轮询设施。[one-mail 本地源码](../sources/one-mail-reference/graph_api.rs#L119) · [固定版本与许可记录](../../plugins/mail/UPSTREAM.md) · [Huhu Gmail](../../plugins/mail/src/engine/gmail-history.ts#L163) · [Outlook 订阅的过滤语义](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview#refine-the-conditions-for-a-notification)

## S5.2 的最小实现

1. **在现有 Graph 快照中保存与已提交 cursor 同代的身份覆盖。** 初扫从第一张 delta 页起，在候选裁剪、正文加载之前处理每个原生 ID，包括第 201 封、缺正文字段、超大正文及移出记录。相同 ID 按大小写精确比较。初扫完成才启用资格判断，初扫和失效重扫均不产生新通知。ID 被删、正文被挤出时仍保留其“见过”证据。收件时间继续用于正文排序。
2. **给覆盖本身设硬上限。** 最小可交付版本可保留最多 400 个不同原生 ID 和一个“完整”位，复用现有两窗口候选的数量级。只要所有原始页完整纳入且未溢出，集合缺项就能证明该 ID 在此前已处理的流中从未出现。首次溢出后置为“不完整”，此后缺项归为未知并静默，直到下一次完整且可覆盖的静默重建。400 是元数据空间预算；证明来自完整翻页和没有丢项。**直接代价是大 Inbox 或长期活跃账号可能持续收不到新信通知。** 若产品接受证据不足静默、但要减少这种情况，可在溢出处将全部已见 ID 转入定长位图，后续以稳定摘要选位、只置位。空位仍严格证明未见，占位或饱和都静默。转换须涵盖旧集合、触发溢出的 ID 及后续原始页；严禁清位或滚动淘汰。这是同一产品规则的容量优化，原验收用例只需精确集合即可。
3. **以轮首已提交的覆盖判定，以本轮 delta 提供正向 Inbox 观察。** 列表可提前缓存 X，既不单独触发通知，也不把 X 写入已提交的 delta 身份覆盖。下轮 delta 出现 X 时，即便已有正文，也检查轮首覆盖。确定未见、最终仍在 Inbox 且非草稿，可赋予一次 `arrival`；历史 H 已在覆盖内，完整更新只改状态。多页重复只判一次，冲突沿用 `lookupMessage` 核实当前目录和已读态。若同轮还出现该 ID 的移出且先后不明，保守地放弃该次资格。收件时间相同或更早、列表与 delta 谁先返回，都不单独改变资格。建议删除 `arrivalWatermark`、按时间写入 `awaitingDelta` 和“完整 delta 未命中正文缓存即新增”的三个推断。[现有判定](../../plugins/mail/src/engine/graph-mail.ts#L274) · [先前实施报告](t11f-report01.md)
4. **跨页和跨 MIME 预算保存资格。** 每张原始 delta 页同时更新本轮待提交的覆盖，轮首覆盖保持冻结。沿用 `progress.next/changes/reconcile` 检查点保存本轮覆盖、溢出位和有界候选资格，恢复时从同一 nextLink 继续。保留原有已缓存变更、额外一窗候选和移出记录的限额。最终保留的确认候选即使先掉出前 200 后补回，仍携带资格；因硬上限确已丢失的正向证据按未知处理。列表不能恢复丢失的事件证据。延后读 MIME 的资格随 `pending[].arrival` 保存，已缓存项走现有 `rows[].added`。仅对最终有可定位正文、公开参与者且有效读状态为未读的项生成待通知 ID，本地标读优先。[分页及 MIME 待办](../../plugins/mail/src/engine/graph-mail.ts#L213) · [裁剪与通知筛选](../../plugins/mail/src/engine/message-cache.ts#L448)
5. **沿用提交、取消和重试边界。** 终态 cursor、覆盖、正文或 MIME 待办、`pendingNotices` 由同一次带 `expectedVersion/beforeCommit` 的 Vault 写入提交，然后发布通知。中途只能保存检查点；分页、冲突核实或对账失败时，不推进已提交 cursor 或发布新资格。单一调用者取消、账号换代或 Vault 失效按现有门禁阻止旧提交；共享刷新仍有有效等待者时沿用现有调度。确认过的 ID 进入覆盖，重放静默；提交后通知失败按已有待办和固定通知 ID 重试。保证限于该缓存与通知存储的保留范围。[Vault 提交与发布](../../plugins/mail/src/engine/message-cache.ts#L403) · [通知 ID 去重](../../packages/kernel/src/notifications.ts#L57) · [账号与原生 ID 定位](../../plugins/mail/src/engine/message-cache.ts#L861)
6. **旧数据静默建立覆盖。** 旧快照仍可读，缺完整覆盖视作未知，不能用 200 封正文或旧时间标记补造基线。首次升级、令牌失效或身份绑定变化时以新版本检查点完成一次静默初扫，新游标与覆盖一起生效。旧版 `progress` 缺少之前各页的覆盖，不能从中段声明完整；旧 `pending[].arrival` 的未投递推断也不能升级为新证据。迁移期间保留可读正文；已经提交的 `pendingNotices` 沿用同绑定、目标仍有效时的既有重试约定。同步途中重启不把未完成的覆盖标为完整。[快照格式](../../plugins/mail/src/engine/message-cache.ts#L86) · [现有检查点与失效恢复](../../plugins/mail/src/engine/graph-mail.ts#L213)

## S4.2 的有效条目分页

先把本轮 `batch.changes` 按 ID 解析一次，完成所有 `verify` 查询。将明确的 tombstone、核实 404、已移出或草稿放入排除集合，保留其余确定的行。把排除集合传给 `inboxWindow`，在 `entries.set` 和数量判断**之前**跳过排除项、非 Inbox、草稿与重复 ID。每页读完若有效唯一 ID 少于 200 且服务仍给出 nextLink，就校验并原样跟随，空页也继续。满 200 或服务正常耗尽才成功。随后用同一批已解析的 delta 行补齐或覆盖列表字段，再按现有排名和字节预算裁剪。确定的正向 delta 仍可补列表漏项。列表过旧时，第一页中的 A 即使还可读取 MIME，也不能占一个名额。[现有列表循环](../../plugins/mail/src/engine/graph-mail.ts#L189) · [现有冲突核实](../../plugins/mail/src/engine/graph-mail.ts#L167) · [Graph 列表分页约定](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0#optional-query-parameters)

保留现行链接边界、循环检测、页数、超时与响应字节限制。若因预算或错误中断且服务还有下一页，保留上次成功状态或检查点供重试；只有服务耗尽才接受少于 200 个有效元数据条目。正文数量仍受现有单封和总字节限额约束。无需增加 `$top`、扩大正文缓存或再取一次冲突对象。

## 待实施后的判定用例

| 输入与顺序 | 应观察的结果 |
| --- | --- |
| 初扫真实列出 201 个 ID，H 排 201；删除 A，同时 H 改未读，返回 H 的完整 delta。列表前 200 仍含 A，下一页才有 H | 请求该 nextLink；A 移除，H 正文可打开，小邮件共 200 封，初扫和本轮均零通知 |
| 在已完成且覆盖完整的基线后投入 X，分别令其收件时间等于或早于已有最新邮件，并保持在最终窗口。分别模拟列表超前与 delta 先到 | 列表单独看到 X 为零次；正向 delta 确认后恰有一次，`mail.notifications.target` 返回正确账号与 X；重放为零次新增 |
| 初扫后同一 ID 改读、改回未读、移出再移回；多页冲突后 GET 确认在 Inbox | 读状态和正文更新，历史 ID 不生成新通知 |
| 201 个增量候选，其中一封暂排 201，后页移除靠前候选；跨检查点、MIME 延后，再重启 | 在既有候选限额内，补回的合格未读新信可定位且仅提醒一次 |
| 身份覆盖溢出、旧快照无覆盖、410 重扫；列表次页失败或循环；提交前取消或换代；通知发出后确认写入失败 | 未知身份及重扫静默；分页失败或旧代不能推进有效游标、发出新通知；已提交待办按同一 ID 重试 |

夹具要把 H 事先放进**实际返回给客户端的初扫 delta 页**。当前 `history-backfill` 与 `between-delta-and-list` 在同一时刻通过 `graph.add` 注入，仅靠时间和名字区分；这样的输入无法证明一个是历史、另一个是到达。保留两者后续返回相同字段形状，才能检验来源判断。[现有夹具场景](../../plugins/mail/test/oauth-engine.test.ts#L1302) · [夹具列表与 delta 各自的数据源](../../plugins/mail/test/fixtures/graph.ts#L52)

## 验证范围

t3p / t125，task01，工作树基线 `4ae7e7e4`。结论来自官方 v1.0 文档、本地固定版本参考、两轮报告和实际工作树的静态核对。本次仅交付分析报告。未运行 Vitest、类型检查、构建、打包、E2E 或真实租户验证，表中各项均为待验收场景。
