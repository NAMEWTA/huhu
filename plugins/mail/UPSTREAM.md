# Mail 来源与适配记录

Mail 的已有参考条目见 [总台账](../../docs/upstream/ledger.md) R-55、R-58–R-61、R-64、R-66，以及 [第三方声明](../../THIRD_PARTY_NOTICES.md)。它们分别覆盖正文与已读、账号管理、回复和发送、删除、转发、会话和搜索。

## Graph 同步与 MIME 发送候选（R-87）

参考 one-mail 固定提交 `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的 [src-tauri/src/mail/sync/graph_api.rs](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/graph_api.rs)，用于核对 Graph 分页、原生邮件 ID 与最终 delta 游标提交行为。该提交 README 声明 AGPL-3.0-only，根树没有独立 LICENSE/COPYING。没有复制或翻译其 Rust 源码。

Huhu 落点为 `src/engine/graph-mail.ts`、`message-cache.ts`、`oauth-provider.ts` 与 `accounts.ts`。同步、缓存、账号修订和凭据复用 Huhu 既有设施；Graph HTTP 契约以 Microsoft Graph 官方文档为准。此处只记录来源，不代表候选通过验收。

`src/engine/graph-send.ts` 复用已锁定 Nodemailer **10.6.0** 的 `nodemailer/lib/mail-composer` 发布接口构造 MIME，与既有 SMTP 路径共用依赖；许可为 MIT-0，作者 Andris Reinman。未新增依赖或复制该包源文件。发送复用 Huhu Outbox 的认领、结果记录与未知结果处理；Graph `202 Accepted` 只表示服务接受请求，不表示收件人已收到邮件。

协议参考：[消息 delta](https://learn.microsoft.com/en-us/graph/delta-query-messages)、[不可变 ID](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)、[MIME 读取](https://learn.microsoft.com/en-us/graph/outlook-get-mime-message)、[sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)。
