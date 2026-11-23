# t117 · Mail Graph 第二轮独审

Lead `t3p`。基线 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`，审查 `agent-linux` 中 `plugins/mail` 的工作树差异，包含未跟踪的 Graph 引擎、夹具及来源记录。依据 `t10w/report01.md`、`t10x/task01.md`、`t10x/report01.md` 与 S4.2。建议 S4.2 保持待签收。 [S4.2 验收](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S4.2-outlook-delta.md#L19)

## 规格发现

### P2 · Inbox 对账可以覆盖本轮明确的 delta 状态，随后消费游标

任一邮件删除或候选被裁剪，就会用独立的 Inbox 列表完全替代 `batch.changes`。例如本轮 delta 对已缓存且没有本地已读标记的 A 明确返回 `isRead:true`，另有 B 的移出触发对账。若列表返回 A 的旧 `isRead:false`，A 会保存为未读，同时提交已覆盖 A 更新的 delta 游标。若列表遗漏实际仍在最近 200 封内的 A，代码也会直接删除其缓存。初扫同样会丢掉列表遗漏的明确入箱项。后续空 delta 会保留错误状态。这是可从两组响应静态推导的结果。Microsoft 约定 delta token 对应本轮快照，独立的列表请求没有这个快照约束。现有夹具只在需要同 ID 对账时制造矛盾，缺少「B 触发对账、A 的明确更新与列表冲突」的断言。应保留本轮对无歧义 ID 的目录和已读证据，并在推进游标前解决必须核实的冲突。 [整批替换及删除](../../plugins/mail/src/engine/graph-mail.ts#L244) · [缓存状态](../../plugins/mail/src/engine/message-cache.ts#L446) · [游标提交](../../plugins/mail/src/engine/message-cache.ts#L560) · [现有移回用例](../../plugins/mail/test/oauth-engine.test.ts#L1083) · [Microsoft delta 快照](https://learn.microsoft.com/en-us/graph/delta-query-overview#state-tokens) · [Inbox 列表 API](https://learn.microsoft.com/en-us/graph/api/mailfolder-list-messages?view=graph-rest-1.0)

同一已缓存 ID 的两条普通更新也有顺序依赖。较新的 `isRead:true` 在前页、较旧的 `isRead:false` 在后页时，合并保留 `false`，两条记录都没有移出标记便不会触发对账。微软说明同一项可以出现在任意页。应覆盖这组反序输入，并保留现有本地已读覆盖语义。 [delta 合并及对账条件](../../plugins/mail/src/engine/graph-mail.ts#L191) · [本地标读](../../plugins/mail/src/engine/message-cache.ts#L454) · [Microsoft delta 分页顺序](https://learn.microsoft.com/en-us/graph/delta-query-overview#optional-query-parameters)

### P3 · 对账提前缓存的新信会丢失通知

有活跃 Graph 缓存时，未读新信 X 若在本轮终态 delta 返回之后、Inbox 列表读取之前到达，对账可先缓存 X。X 尚未出现在 `batch.changes`，所以本轮 `arrival` 为 `false`。下一轮 delta 正式返回 X 时已命中缓存，只更新读取状态，仍无通知。201 封用例中，先被裁掉再补回的 `window-0` 同样失去到达标记，测试将这些新邮件全部标为已读，无法覆盖这一分支。修复时需保留新到邮件的去重依据，同时维持初扫和历史补位的通知语义。 [候选裁剪](../../plugins/mail/src/engine/graph-mail.ts#L196) · [到达标记](../../plugins/mail/src/engine/graph-mail.ts#L249) · [通知过滤](../../plugins/mail/src/engine/message-cache.ts#L554) · [窗口用例](../../plugins/mail/test/oauth-engine.test.ts#L1257) · [既有通知验收](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S5.2-new-mail-notice.md#L19)

## 上轮 4 P2 与 1 P3 复核

| 上轮问题 | 静态结论 |
| --- | --- |
| 201 封跨分页后删除最新一封 | 已补齐该用例中的正文。`reconcile` 跨检查点保留，终态重新取前 200 个有效 Inbox 条目。达到分页上限、链接异常、HTTP 或解析错误时从读取层抛出，终态写入尚未开始，原 cursor 和检查点仍在。夹具断言 HTTP 500 后版本不变并可重试补回，页数耗尽仅有代码证据。 [有界对账](../../plugins/mail/src/engine/graph-mail.ts#L151) · [缓存提交](../../plugins/mail/src/engine/message-cache.ts#L540) · [回归用例](../../plugins/mail/test/oauth-engine.test.ts#L1257) |
| 同 ID 移出后出现旧局部更新，或实际移回 | 已覆盖指定顺序。任一移出会触发对账，列表缺该项时移除正文，实际移回时按同一原生 ID 恢复。全量列表覆盖无关 delta 状态仍有上述 P2。 [目录合并](../../plugins/mail/src/engine/graph-mail.ts#L191) · [移出与移回用例](../../plugins/mail/test/oauth-engine.test.ts#L1063) |
| 最后一个刷新等待者取消后的提交 | 已关闭。abort 监听器同步注销等待者，最后一位同步取消共享作业；Vault 在实际同步创建或替换前检查信号与账号代。仍有等待者时作业继续。夹具在 Vault `beforeCommit` 内取消，覆盖版本、游标、事件和存活等待者。 [等待者](../../plugins/mail/src/engine/message-cache.ts#L665) · [写前检查](../../plugins/mail/src/engine/message-cache.ts#L401) · [Vault 发布](../../packages/vault/src/write.ts#L128) · [回归用例](../../plugins/mail/test/oauth-engine.test.ts#L1211) |
| 完整 Graph 授权被明确拒绝时续期停掉读取 | 已关闭。仅明确 token 拒绝进入同资源、同 refresh token、去掉 `Mail.Send` 的一次重试；断线或无法解码的响应走原网络错误。降权提交后发账号事件，默认 Exchange 浏览器授权入口仍在。 [续期和权限提交](../../plugins/mail/src/engine/accounts.ts#L79) · [错误分类](../../plugins/mail/src/engine/oauth-provider.ts#L182) · [回归用例](../../plugins/mail/test/oauth-engine.test.ts#L1153) |
| 收件 403 误报本地读取权限不足 | 已关闭。受保护回执缺读取 scope 时给本地权限提示。服务 403 经缓存同步返回「Microsoft Graph 拒绝访问收件箱，已同步邮件仍可查看」，工作台显示能力错误文案。夹具覆盖已有读权限、服务拒绝和原缓存保留。 [本地校验](../../plugins/mail/src/engine/accounts.ts#L329) · [错误映射](../../plugins/mail/src/engine/message-cache.ts#L540) · [工作台](../../plugins/mail/src/ui/MailModule.tsx#L739) · [回归用例](../../plugins/mail/test/oauth-engine.test.ts#L1075) |

## 项目规范与未运行的验证

本轮范围内未发现独立的项目规范违规。改动沿用 Mail 的受保护凭据、Vault 写前检查、缓存与通知机制，Graph 游标继续和 IMAP UID 隔离。仅写本报告。Vitest、协议夹具、类型检查、E2E、构建、打包、安装、GUI 和真实账号验收均未运行。
