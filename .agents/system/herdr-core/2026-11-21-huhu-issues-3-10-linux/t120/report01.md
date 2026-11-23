# t120 · Mail Graph 最后增量复核

Lead `t3p`，任务 `t120/task01.md`。复核 `agent-linux` 基线 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030` 上的 Mail 工作树增量，覆盖未跟踪的 Graph 同步实现和夹具。建议 S5.2 保持待签收，S4.2 的窗口补位仍有一个缺口。

## 规格发现

### P2 · 对账提前缓存同时间戳或倒序到达的新信后，后续 delta 静默确认

S5.2 要求初扫历史后再投入新信，只出现新信通知。最小场景只需初扫两封历史邮件，最新一封的收件时间为 `T`。下一轮终态 delta 移除较旧一封，触发 Inbox 对账。在该 delta 返回之后、列表读取之前，投入正文可缓存、仍未读的 X，时间等于 `T`，或早于 `T` 且仍在缓存窗口内。列表先缓存 X。`receivedAt > previousWatermark` 为假，X 没有进入 `awaitingDelta`。随后 delta 返回 X 的完整记录时命中缓存，只写已读状态，`added` 仍为空。游标正常推进，X 有正文却没有通知。Graph 的 `receivedDateTime` 表示收件时间，公开契约未规定它是严格递增的入箱序号。当前夹具把新信时间设为 235、初扫后已确认的最新时间为 229，覆盖了严格递增路径。 [S5.2 验收](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S5.2-new-mail-notice.md#L19) · [到达判定](../../plugins/mail/src/engine/graph-mail.ts#L304) · [通知过滤](../../plugins/mail/src/engine/message-cache.ts#L559) · [现有夹具](../../plugins/mail/test/oauth-engine.test.ts#L1302) · [Graph message 属性](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0#properties)

全类型 delta 的普通更新也可带完整属性。反例是历史邮件 H 在初扫中排第 201，未缓存。删除一封排在 H 前面的邮件，同时把 H 改为未读。如果同轮 delta 带回 H 的完整记录，H 正常补位，但 `!existing && !!change.receivedDateTime` 会把它当作新信发通知。当前夹具先用上一轮列表缓存历史，再返回完整更新，只覆盖了已有正文的分支。将比较放宽为 `>=` 或将全部列表新增项标记为待确认，仍会用普通更新确认历史补位。 [候选分支](../../plugins/mail/src/engine/graph-mail.ts#L310) · [历史夹具的分轮顺序](../../plugins/mail/test/oauth-engine.test.ts#L1338) · [Graph delta 的资源表示](https://learn.microsoft.com/en-us/graph/delta-query-overview#resource-representation-in-the-delta-query-response)

修复方向是沿用 Gmail 把服务端新增证据与状态更新分开、按原生 ID 合并的做法，保留 Graph 现有全类型 delta 和列表对账。Graph 文档提供独立初始化的 `changeType=created` 增量，可先核实目录层已读例外、移回和重放，再用有明确到达语义的结果驱动已有 `pendingNotices`。参数由首请求写入令牌，旧状态游标继续按原链接读取。正文仍限 200 封及现有字节预算。验收用同时间戳和倒序新信、同轮完整历史更新、确认后重放，分别检查通知次数及目标。 [Gmail 的新增证据](../../plugins/mail/src/engine/gmail-history.ts#L163) · [Graph 按类型跟踪示例](https://learn.microsoft.com/en-us/graph/delta-query-messages#example-2-synchronize-messages-in-a-folder-based-on-change-type) · [目录层过滤例外](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0#odata-query-parameters)

### P2 · 新合并排除列表中的已删项后，分页边界少补一封正文

已有 201 封小邮件，缓存最近 200 封。delta 删除其中最新的 A，触发独立列表读取。若列表暂仍返回含 A 的旧前 200 封，并给出指向第 201 封 H 的下一页，`inboxWindow()` 会在 200 个条目处提前返回。新合并正确移除 A，但 H 未进入候选。缓存写出 199 封并提交终态游标，下一轮空 delta 也不会再对账。现有 201 封用例在列表读取前已移除 A，能通过现有路径。应先应用本轮已确认的排除项，再按有效条目计窗口并消费现有 `nextLink`，沿用分页与失败处理。 [列表截断](../../plugins/mail/src/engine/graph-mail.ts#L189) · [排除与候选合并](../../plugins/mail/src/engine/graph-mail.ts#L290) · [终态游标提交](../../plugins/mail/src/engine/message-cache.ts#L559) · [201 封用例](../../plugins/mail/test/oauth-engine.test.ts#L1266) · [Graph 状态令牌](https://learn.microsoft.com/en-us/graph/delta-query-overview#state-tokens)

## 状态、检查点和重放

- 列表对同一 ID 的明确 delta 状态只补缺失字段。已缓存项省略 `isRead` 时保留原状态，后续仍应用本地标读覆盖。普通更新冲突会带 `verify` 跨页，单封请求成功才据其结果提交，对账或单封请求失败保留原游标和检查点。原先列表覆盖明确 delta 状态、按页序决定冲突已读的问题，这一增量已处理。 [冲突合并](../../plugins/mail/src/engine/graph-mail.ts#L167) · [状态应用](../../plugins/mail/src/engine/graph-mail.ts#L290) · [本地标读覆盖](../../plugins/mail/src/engine/message-cache.ts#L448)
- 旧检查点可解析，缺 `mergeVersion` 时从上个已完成的游标重读。无已完成游标时重启初扫，旧恢复检查点的已完成游标失效时重新进入 `delta-expired`。新检查点从已保存的 `next` 恢复，保留 `verify`。旧缓存继续读取，但已提前入缓存且没有到达来源的条目无法由时间基线重建该来源。 [检查点格式](../../plugins/mail/src/engine/graph-mail.ts#L31) · [重读入口](../../plugins/mail/src/engine/graph-mail.ts#L213) · [失效恢复](../../plugins/mail/src/engine/graph-mail.ts#L328) · [缓存格式与兼容默认值](../../plugins/mail/src/engine/message-cache.ts#L86) · [检查点提交](../../plugins/mail/src/engine/message-cache.ts#L542)
- 对仍在缓存且已确认的 ID，正常重放不会再次产生 `added`。待确认标记与游标、待通知 ID 同次缓存提交，通知仍使用 Vault 与本地消息 ID 派生的固定 ID。站内通知仍保留该 ID 时，重复提交沿用已有记录。未发现该重放路径引入重复通知。 [标记消费](../../plugins/mail/src/engine/graph-mail.ts#L310) · [持久化与通知重试](../../plugins/mail/src/engine/message-cache.ts#L415) · [缓存中的标记及通知](../../plugins/mail/src/engine/message-cache.ts#L559) · [通知 ID 去重](../../packages/kernel/src/notifications.ts#L57)

## 项目规范与未运行的验证

范围内未发现独立项目规范违规。已有 t11y 隔离运行记录证实 `oauth-engine.test.ts` 共 3 项通过。两条发现及旧格式检查点兼容判断来自代码与协议文档核对。当前夹具未覆盖上述触发条件或旧格式检查点。 [t11y 日志](../../../../issue-evidence/huhu-2026-11-22/graph-state-check.log#L12)

本轮未运行 Vitest、类型检查、E2E、构建、打包、安装或真实账号验证。
