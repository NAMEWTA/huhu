# t10q · Mail Graph 候选协议修复

工作树 `agent-linux`，分支 `impl/huhu-mail-graph-completion`，基线 `4ae7e7e4`。业务代码和用例留在 `plugins/mail/` 工作区，未暂存或提交。来源文档由 Lead 单独维护。

## 实现

- Outlook 添加和重新授权继续使用 Exchange 的 OAuth scopes、浏览器回调和 ID token 签名、nonce、账号校验。主机上的 Graph scope 配置只允许尝试相同客户端、当前邮箱的既有委托授权。校验 Exchange 身份后，用该邮箱的 refresh token 静默兑换 Graph，验证可信回执 scope，并用 Graph 探测 Inbox。Graph 不可用时走常规 Exchange 添加或修复，修复沿用账号 ID。Exchange 探测也失败时不发布新代。多目录 Exchange 配置保留原路径。配置值无效时 Outlook 授权入口仍可用。
- Graph 首次兑换和续期都使用请求绑定及 token 端点回执判定资源与权限。Graph access token 保持不透明，密封凭据记住资源和探测到的 Inbox ID，现有 Graph 凭据可沿用密封的成功提交见证。Exchange access token 只用于 Exchange。已批准读取但缺发送权限的 Graph 账号显示为仅收件。
- Graph 接受同源同 Inbox 的斜杠和 OData 括号链接，校验 well-known Inbox 或探测到的精确原生 ID，原样保存和请求服务端链接。读 MIME 使用 Inbox 下的消息 URL。分页按轮保存有界检查点，终态才能推进 delta 游标。首扫与 410 恢复可从分页检查点续跑。同一轮候选合并 ID 与增量字段，并剔除已删除、草稿和明确移出 Inbox 的消息。
- Graph 每轮预留整封 MIME 的读取空间，最多 12 MiB。终态 delta 与缓存及待取 ID 同次写入，下一轮先补齐待取正文再请求已保存的游标。同步共享写入在 Vault `beforeCommit` 重新检查账号代、移除与取消。旧轮次未提交时不会发布邮件更新和通知。
- Graph 发送授权变化在新账号代提交后发 `mail-account`，调度接着使用最新账号代。Outbox 区分账号主动关闭发送、受保护 scope 缺少 `Mail.Send`、服务返回 403。403 保留 HTTP 状态及可用的 Graph 错误代码。界面沿用现有状态区域，显示当前 Outlook 路径、Graph 回退原因及发送结果。

## 定向用例

`plugins/mail/test/oauth-engine.test.ts` 复用生产 `createMailOAuth → boot → mail.apply` 装配、dispatcher、回环账号及隔离凭据。增加或更新了以下场景。

- 合法及无效 Graph 主机配置保留 Exchange scopes。同一装配分别处理有 Graph 委托权和只有 Exchange 的账号，后者可同步和回复。检查不透明 Graph 首次 token 和刷新 token、仅基本权限、错误资源回执、Graph 探测拒绝、手动关闭发送以及 Graph 授权失效后的 Exchange 修复。
- 使用真实协议形状的括号 nextLink、可复用的括号 deltaLink、斜杠终态和不透明查询参数。拒绝跨来源或切目录。检查第二页 500／403、410 恢复失败保留缓存、跨轮恢复到终态、重复 ID 的已读状态及移出 Inbox。
- 十封各约 1.4 MiB 的合法 MIME 超出单轮预算，第二轮补齐缓存，随后读取空 delta。写前屏障挂住 Graph 缓存写入，切换账号代后释放，断言旧轮次不写缓存也不发通知。
- 邮箱权限撤销事件回调读取已提交账号定义。Graph 403 保留服务端原因代码。通过桌面附件入口加入二进制附件后验证发送 MIME 中的 Bcc 和附件，并保留回执丢失时的单次投递用例。

## 实现边界

- 既有 Microsoft Graph 授权仍需由服务商对当前邮箱和客户端认可。已存在的 Exchange 账号通过原有重新授权入口尝试切换。当前实现没有后台迁移或 Graph 同意流程。Graph 仍覆盖 Inbox，失败的 Graph 续期沿用需重新授权的账号状态。
- Graph 缓存仍受 200 封和 24 MiB Base64 原文上限约束，超出保留窗口的邮件会按现有缓存规则裁剪。分页检查点保留现有缓存项的变更及该轮已见的最新候选。较旧候选被裁剪后，后续页若移除了窗口内候选，当前轮可能保留少于 200 封。单封超过 2 MiB 或取回时已不存在的邮件不会进入本机缓存。

## 未运行的验证

按 Lead 的当前约束，本轮没有运行 Vitest、类型检查、构建、打包、E2E、安装或真实账号验收。上述用例均为已编写、待 Lead 执行。
