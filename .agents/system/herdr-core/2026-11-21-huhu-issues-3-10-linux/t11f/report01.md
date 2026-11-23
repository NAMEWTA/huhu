# t11f · Graph 状态与通知收口

Lead 为 `t3p`，worker 为 `t11f`，任务为 `t11f/task01.md`。在 `agent-linux` 工作树的 `4ae7e7e4` 上接续已有改动。业务与测试文件限于任务授权的四个路径。

## 实施结果

- Inbox 列表用于补齐窗口及缺失字段。本轮明确的 delta 已读状态、入箱记录和移出标记优先。列表漏项时保留本轮明确的入箱证据，已有缓存继续按原有窗口和容量规则裁剪。缓存行的 delta 省略已读字段时沿用已有状态和本地标读覆盖。 [对账与合并](../../plugins/mail/src/engine/graph-mail.ts#L274) · [本地标读覆盖](../../plugins/mail/src/engine/message-cache.ts#L448) · [Graph delta 状态令牌与分页规则](https://learn.microsoft.com/en-us/graph/delta-query-overview)
- 同一原生 ID 的相容增量合并字段。读状态冲突或移出与普通更新并存时，使用带 ImmutableId 的单封读取核实目录和状态。服务返回 404 或明确位于 Inbox 外时移除缓存。请求失败时保留已发布缓存及游标。冲突标记随新检查点保存，旧格式检查点从原游标重读。 [冲突处理](../../plugins/mail/src/engine/graph-mail.ts#L167) · [检查点](../../plugins/mail/src/engine/graph-mail.ts#L213) · [Get message](https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0) · [Outlook ImmutableId](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- 跨页额外保留一个窗口的候选证据，所以先超出 200 封又因删除补回的未读新信仍能通知。增量对账中，仅由列表看到且收件时间晚于此前已确认时间的邮件随缓存保留待 delta 确认标记。后续 delta 确认后走既有的未读过滤、Vault 写入和通知重试。首次同步与恢复重扫建立时间基线，历史补位按该基线静默处理。 [候选保留](../../plugins/mail/src/engine/graph-mail.ts#L233) · [到达判定](../../plugins/mail/src/engine/graph-mail.ts#L304) · [缓存和通知提交](../../plugins/mail/src/engine/message-cache.ts#L554)

## 回归用例

在 `OAuth uses the real dispatcher, callback, module credentials, IMAP and SMTP with isolated issuers` 中增加断言。覆盖首次同步未读历史不通知、201 封跨检查点补回未读新信、旧列表与明确 delta 冲突、列表漏项、两种方向的普通已读冲突、单封核实失败后游标与缓存版本保留、提前缓存后在下一轮精确通知一次、完整历史更新和增量重放保持静默。保留已有状态、授权及窗体验收断言。 [测试入口](../../plugins/mail/test/oauth-engine.test.ts#L1040) · [201 封与通知](../../plugins/mail/test/oauth-engine.test.ts#L1266) · [冲突和列表超前](../../plugins/mail/test/oauth-engine.test.ts#L1302) · [Graph 夹具](../../plugins/mail/test/fixtures/graph.ts#L12)

## 未运行的验证与限制

- 完成差异静态复核与空白检查。按任务要求，Vitest、类型检查、E2E、构建、打包、安装和真实账号验证均未运行。
- 单封核实读取的是请求时状态。遇到大量冲突或服务限流时，本轮可能在既有超时内失败并保留原游标供重试。
- Graph 全量类型 delta 允许普通更新携带完整属性。列表独有项用收件时间基线判断能否等待确认，收件时间相同或倒序的到达可能漏报。旧缓存可用原最新邮件日期建立基线，旧版本已提前缓存的邮件缺少可恢复的到达来源。
- 每个检查点对未缓存邮件保留最多 400 条正向候选与 200 条移出记录。极端批次中，如果丢弃的候选后来补回窗口，可能仅能用列表补齐其状态和到达证据。
