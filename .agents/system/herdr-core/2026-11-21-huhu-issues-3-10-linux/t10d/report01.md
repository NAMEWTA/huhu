# t10d · Mail S4.2 Graph 候选

Lead t3p，worker t10d，`agent-linux` 工作树，分支 `impl/huhu-mail-graph-completion`，基线 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。业务文件与用例均在 `plugins/mail/`。按 Lead 最新交接将候选留在工作树，未暂存、提交或改动上游账本。`hc send t3p` 尝试回报设计时因 Core lock 所在目录只读失败，由 Lead 从本路径收取。

## 生产调用路径

- 打包桌面启动时，Desktop utility process 继承主机环境。Engine 的 `mailOAuthWithBrowser` 调用 Mail 已有的 `createMailOAuth`，然后按现有 `boot → mail.apply → registerMailOAuth` 注入。默认 `HUHU_MAIL_MICROSOFT_CLIENT_ID` 使用原 Exchange IMAP/SMTP 权限。Graph 候选采用一个显式的非秘密主机配置 `HUHU_MAIL_MICROSOFT_PREAUTHORIZED_GRAPH_SCOPES`，值为该客户端已授予的完整 Graph scope，例如 `https://graph.microsoft.com/Mail.Read`，已经获准发信时可一并列出 `https://graph.microsoft.com/Mail.Send`。复用已有 PKCE OAuth 能力、回调和账号修复入口，加 `prompt=none` 仅使用存在的授权和 Microsoft 登录会话，缺授权或会话时返回相应原因。无需新增 Graph 授权页面、公共能力、凭据文件或依赖。
- Microsoft 回执先通过原有 ID token 签名、nonce 和邮箱校验。Graph 路由另要求 Graph audience 与回执、委托 `scp` 同时允许邮件读写或只读。`Mail.ReadBasic` 缺正文权限，`Mail.Send` 单独判定。新凭据先探测 Graph Inbox，探测失败保留旧账号代。Refresh 只申请先前确认过的 Graph 邮件 scope，Exchange 账号继续申请其原有 Exchange scope。Graph token 仍用 Mail 自有的 `ModuleCredentials` 与版本化设置保存。`smtpEnabled` 兼容原发送开关字段，实际投递由账号路由和 protected token 决定。发送权限在刷新中消失时会关闭该开关。
- `mail.sync.refresh` 为 Graph 收件箱拉取 delta，用稳定的 Graph 原生 ID 获取 `messages/{id}/$value`。同一成功轮次先完成分页和该批原文读取，再将消息和 `deltaLink` 一起提交到可重建缓存。分支保留独立的 Graph 和 IMAP 快照。410 或明确的 `syncStateNotFound` 触发新一轮扫描。临时故障、权限拒绝和恢复扫描失败保留已落盘快照。读取原文、正文、附件元数据、对话定位与回复继续走已有 Mail dispatcher 和 MIME 处理。Graph 已读沿用本机覆盖。
- `mail.outbox.submit` 冻结草稿与 Graph 帐号绑定，沿用同一 operation ID、写前认领、投递结果落盘及重开后查询。Graph 用固定 Nodemailer MailComposer 生成含收件人、回复线程头与附件的 MIME，经 `/me/sendMail` 提交。HTTP 202 记作服务端接受，显式拒绝按可确定的未投递记录，丢回执或不确定响应保留 unknown。Graph 认领使用 Graph 凭据，Exchange 认领使用原 SMTP 传输。工作台复用已有路径说明、状态区和横幅。

## 已写用例

- `plugins/mail/test/oauth-engine.test.ts` 中 `production Outlook authorization uses Exchange by default and accepts only explicit preauthorized Graph scopes` 覆盖生产配置的默认值、明确选择和拒绝额外 scope。
- 同文件 `OAuth uses the real dispatcher, callback, module credentials, IMAP and SMTP with isolated issuers` 扩展既有回环套件。使用 Graph 原生 ID、合成邮箱、RSA 签名、回环 HTTP／IMAP／SMTP，覆盖拒绝低权限及错误受众、Graph 探测失败保留 Exchange 账号代、Graph MIME/附件、回复和收件地址、翻页 500/403 与 410 恢复扫描失败保留缓存、恢复扫描成功再提交、失去 `Mail.Send` 后禁止发信、发信回执丢失后重复提交仍单次投递、切回 Exchange 后原 UID 和 SMTP 路径恢复。Graph 夹具位于 `plugins/mail/test/fixtures/graph.ts`。

## 上游依据与实现决定

- 已读取 Lead 放入 `temp/sources/one-mail-reference/graph_api.rs` 的固定 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`，参考 `src-tauri/src/mail/sync/graph_api.rs` 中的受众检查、逐页续取和最终 delta 游标提交。仓库 `evidence/S0.1-source-baseline.md` 记录提交署名 `i`、README 标示 `AGPL-3.0-only`，固定提交根树无独立 LICENSE/COPYING。此次借鉴行为，用 Huhu Gmail/history、IMAP、Outbox 和 MIME 设施实现，没有复制或翻译上游源码。可以将本项写入 `docs/upstream/ledger.md`，引用现有 Mail 来源记录和本次 `graph-mail.ts`、`message-cache.ts`、`graph-send.ts`。 [固定 Graph 源码](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/graph_api.rs) · [许可声明](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/README.md#L221-L225)
- Graph 使用微软文档定义的 delta、MIME 与 sendMail 接口。MIME 使用已固定的 Nodemailer 10.6.0（MIT-0），无新增包或锁变更。 [消息 delta](https://learn.microsoft.com/en-us/graph/api/message-delta) · [游标过期](https://learn.microsoft.com/en-us/graph/delta-query-overview) · [读取 MIME](https://learn.microsoft.com/en-us/graph/outlook-get-mime-message) · [sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)
- 工作台的路径和权限提示在已有组件内更新，继续通过已有状态区域呈现反馈。使用离线缓存的 `modern-web-guidance` 完成 `display status messages` 搜索和 `accessibility` 检索，沿用其动态反馈规则与现有可访问标记。

## 未运行的验证

按任务只写不跑。未运行 Vitest、Playwright/Electron、全仓或插件类型检查、构建、打包、视觉取证，也未连接真实账号。未增 Playwright spec，Graph 的生产 dispatcher/协议端到端用例在上述现有 Vitest 文件中。S4.2 验收项保持待核验。

需要 Lead 核对 `prompt=none` 对现有授权入口的适用性及 Graph token 形态。当前只接收可读取受众与委托 scope 的 Graph token，拒绝无法确认受众的 opaque token。Graph 同步仅覆盖 INBOX，单轮有 200 页、20,000 个变更和 75 秒的上限，超出会保留旧游标并报错。邮件缓存保留现有最近 200 封与 MIME 大小限制。Graph HTTP 202 表示接受，实际最终投递仍由服务商处理。
