# t10w · Mail Graph 协议返工独审

Lead `t3p`，任务 `t10w/task01`。审查 `agent-linux` 的 `impl/huhu-mail-graph-completion` 工作树，以 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030` 为基线，包含 `plugins/mail/**` 的已跟踪差异和新增 Graph 引擎及夹具。对照 t10d 原任务、t10n 第一轮独审、t10q 返工任务和报告、Mail S4.2 及 11 月 21 日批次决定。建议保留 S4.2 待签收，先收口下列问题。

## 规格发现

### P2 · 终态前裁剪会遗漏最终窗口中的合法邮件，并推进游标

初扫、410 重扫，以及已有游标且本轮增加大量邮件时，每页结束即裁剪未缓存候选至 200 个，检查点也只保存这些候选。前几页出现 201 封小且合法的邮件，后页删除其中最新的一封，原第 201 封此时进入最终的最近 200 封，却已从 `changes` 丢弃。终态直接保存新游标，`pending` 里也没有该 ID。后续空 delta 无法补回。10 封大 MIME 的测试覆盖单轮字节预算续取，20 页恢复测试覆盖检查点续跑，二者均未触发窗口回补。需要在最终目录归属确定后补齐窗口，可沿现有有界对账路径补回被提前裁剪的候选。 [逐页裁剪和终态合并](../../plugins/mail/src/engine/graph-mail.ts#L153) · [持久化游标和待取项](../../plugins/mail/src/engine/message-cache.ts#L544) · [现有预算用例](../../plugins/mail/test/oauth-engine.test.ts#L1156)

### P2 · 同一 ID 的后页局部更新能覆盖移出记录

`pages` 把一条已标记 `@removed` 的记录直接替换为之后到达的任意普通记录。若已缓存邮件先在一页出现删除或移出标记，后页又出现该 ID 的较早 `isRead` 更新，后者缺少目录与时间字段仍可清除移出状态。终态合并对缓存命中只更新已读属性，保留原正文与收件箱归属，随后提交游标。微软明确允许同一项出现在任意页，位置不能证明先后。应对同一 ID 的矛盾记录根据实际 Inbox 归属对账，同时允许真实移回 Inbox。现有测试只对一封邮件合并普通字段，并用另一个 ID 模拟移出。 [delta 合并和缓存命中分支](../../plugins/mail/src/engine/graph-mail.ts#L159) · [现有重复 ID 用例](../../plugins/mail/test/oauth-engine.test.ts#L1080) · [Microsoft Graph delta 顺序和重放](https://learn.microsoft.com/en-us/graph/delta-query-overview#optional-query-parameters)

### P2 · 最后一个手动请求取消时，缓存提交仍可能先于共享同步取消

换代检查已经落到实际写点。Vault 在 `beforeCommit` 后同步创建或替换文件，当前进程内账号 revision 提交无法插进二者之间。移除、清缓存和插件生命周期也直接进入合成信号。剩余缺口在单请求取消：`refresh` 的 abort 监听器先 reject 调用方 Promise，最后一个等待者离开及 `job.controller.abort()` 在后续 `finally` 执行。若 Vault 写回调已排队，且恰好位于请求 abort 与该 `finally` 之间，`beforeCommit` 仍可见未取消的共享信号，旧工作便在请求取消后落盘。应在 abort 监听器同步注销该等待者，并在最后一个等待者离开时同步取消共享作业，保留其他等待者仍可完成的语义。现有屏障用例确实把写入挂起至同账号切代完成后再释放，也断言缓存版本与事件不变；它没有取消请求或覆盖该排队顺序。 [单请求取消](../../plugins/mail/src/engine/message-cache.ts#L636) · [Mail 写前检查](../../plugins/mail/src/engine/message-cache.ts#L401) · [Vault 实际发布](../../packages/vault/src/write.ts#L128) · [换代用例](../../plugins/mail/test/oauth-engine.test.ts#L1178)

### P2 · 完整 Graph grant 被拒时，续期不会尝试仍已获准的读取 scope

续期始终拿上次回执的全部 scope 换 token。若发送授权撤回后，身份端点拒绝含 `Mail.Send` 的刷新，但仅申请原有 `Mail.Read` 仍可成功，`renew` 会把整个账号当作需重新授权，收件也停下来。初次 Graph 兑换已有同资源、去掉 `Mail.Send` 的受限重试，续期没有走这条路径。当前撤权测试让端点直接对完整请求回 `200 scope=Mail.Read`，真实触发了新账号代提交、账号事件和禁止发送。它没有覆盖端点拒绝完整 scope、接受剩余读取 scope 的分支。租户实际返回何种错误仍待实跑；在该确定响应序列下，代码会停掉仍可用的收件。 [升级兑换与续期](../../plugins/mail/src/engine/accounts.ts#L79) · [OAuth 失败映射](../../plugins/mail/src/engine/oauth-provider.ts#L188) · [现有撤权用例](../../plugins/mail/test/oauth-engine.test.ts#L1131) · [Microsoft 刷新授权错误](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#refresh-the-access-token)

### P3 · 收件 HTTP 403 的提示把服务端拒绝归因为缺读权限

同步适配把所有 Graph HTTP 403 归为 `graph-api-permission`，工作台用该值提示读取正文和附件需要 `Mail.Read` 或 `Mail.ReadWrite`，即使受保护回执已具备此 scope。真实服务拒绝的原因无法从结果中获知。出站代码已修好类似问题，403 仅记录服务拒绝和可用 Graph 错误码。收件也应将本机 scope 不足与服务端拒绝区别开。 [Graph 读取的状态映射](../../plugins/mail/src/engine/graph-mail.ts#L126) · [工作台提示](../../plugins/mail/src/ui/MailModule.tsx#L33) · [Graph 发送状态映射](../../plugins/mail/src/engine/graph-send.ts#L18)

## 原发现复核

| 原发现 | 本轮静态结论 |
| --- | --- |
| P1 不透明 Graph 凭据被拒 | 已修。Exchange 回调仍验 ID token 签名、nonce、客户端和邮箱。可信 Microsoft token 端点通过同一客户端、同一邮箱的 refresh token 请求单一 Graph 资源。受保护凭据保存资源来源与有效 scope。Graph 探测确认，Graph 与 Exchange 凭据各走自己的路由。夹具首次和刷新均发不透明字符串，另用低权限和明确 Exchange 回执触发拒绝。 |
| P1 合法 nextLink/deltaLink 被拒 | 已修。斜杠和 OData 括号目录路由都校验同源及同 Inbox，按原链接请求和保存。夹具实际返回括号形 nextLink、下一轮使用的括号形 deltaLink、斜杠终态、保留 `%2B` `%2F` `%3D` 的游标，并断言跨源/换目录时无下一个请求。 |
| P1 Graph 配置挤掉 Exchange 默认入口 | 已修。配置合法或无效时均保留 Exchange 浏览器授权。只有可信回执及 Inbox 探测成功才选 Graph，具备多个已选目录的 Exchange 保留原路径。Graph 失败后以当前 Exchange 凭据重新探测；探测失败发生在 `credentials.save` 之前，原账号代保留。双账号用例在同一装配中真实走两种路线，且同账号可退回 Exchange。夹具覆盖 Graph 拒绝且 Exchange 成功，未直接覆盖双探测失败后的旧 revision、凭据和快照。 |
| P2 MIME 预算吞掉可读邮件 | 字节预算缺口已修。终态游标和待取 ID 同次提交，续跑先取待取 MIME。分页窗口与同 ID 合并仍有上列两个缺口。 |
| P2 换代落盘竞态 | 换代判定已进入同步落盘边界。最后一个请求取消仍有上列竞态。 |
| P2 刷新权限和 403 | 降权成功时保存新定义后发布 `mail-account`，打开的工作台随事件重读，调度接续采用新 revision 和目录。发送 HTTP 403 保留实际状态和服务错误码。刷新授权拒绝分支及收件 403 存在上列缺口。 |

不透明资源归属依赖受信 token 端点、显式单资源请求和 Graph 服务探测。微软规定客户端按不透明值处理服务 access token，并允许在已授权时复用同一用户与客户端的 refresh token 获取另一资源的 access token。当前生产入口仍以成功的 Exchange OAuth 交换作为尝试 Graph 的前提，复用该账号已有 Graph 权限；无 Graph 专属同意流程。 [凭据资源与权限](../../plugins/mail/src/engine/oauth-provider.ts#L128) · [已授权资源选择与 Exchange 回退](../../plugins/mail/src/engine/accounts.ts#L216) · [Microsoft access token](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) · [Microsoft refresh token](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens) · [Graph 消息增量示例](https://learn.microsoft.com/en-us/graph/delta-query-messages#sample-initial-response)

Graph Outbox 保留先落盘认领再投递。请求返回 202 时只记服务端接受，丢回执落为 `unknown`，相同草稿版本返回原认领，未知收件人不进入可重试集合。夹具先收完整 MIME 再断 socket，实际断言二进制附件、Bcc 头、未知状态、同一操作 ID 和单次 POST。重开后的 Graph 认领、跨入口并发提交、Bcc 实际信封分发及服务商投递结果仍须由运行证据确认。 [Outbox 认领与重试过滤](../../plugins/mail/src/engine/outbox.ts#L114) · [Graph 发送及回执](../../plugins/mail/src/engine/graph-send.ts#L5) · [丢回执夹具与断言](../../plugins/mail/test/oauth-engine.test.ts#L1099) · [Microsoft Graph 202 语义](https://learn.microsoft.com/en-us/graph/api/user-sendmail#response)

## 项目规范与未运行的验证

本次静态阅读所见，返工沿用 Mail 专属受保护凭据、Vault 同步写入、Dispatcher、原生 ID、草稿/Outbox 和收件缓存机制。独立快照隔离 Graph delta 游标与 IMAP UID。按任务，来源记录已由 Lead 补齐。只写本报告。测试、类型检查、构建、安装、打包、GUI、Playwright/Electron、协议夹具和真实账号验收均未运行。上述用例仅核对了代码是否触发对应路径，S4.2 保持待签收。
