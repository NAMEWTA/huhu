# t10x · Mail Graph 第二轮收口

Lead 为 t3p，执行者为 t10x，任务为 t10x/task01.md。工作树为 agent-linux，派工基线为 4ae7e7e4。代码改动限于 plugins/mail。未暂存、提交或修改 integration。

## 实现证据

- Graph 在 delta 分页裁剪候选后保留对账标记，旧分页检查点也会补做对账。终态在推进游标前查询当前 Inbox，按收件时间取得最多 200 个非草稿条目。同一 ID 出现删除与局部更新时，使用当前目录归属和读取状态生成缓存结果。Inbox 分页沿用同源、同 Inbox 的链接约束，最多读 20 页。查询失败或未能确定窗口时保留已有游标和检查点。MIME 仍通过有界读取和待取队列处理。 [Graph 分页与对账](../../plugins/mail/src/engine/graph-mail.ts#L151) [游标与待取项保存](../../plugins/mail/src/engine/message-cache.ts#L545)
- 刷新请求 abort 时同步注销等待者。最后一个等待者退出时立即取消共享作业，让 Vault 的 beforeCommit 拒绝本轮写入。仍有等待者时继续共享作业。 [同步取消](../../plugins/mail/src/engine/message-cache.ts#L637)
- Graph 续期复用已有静默兑换逻辑。完整 scope 被 token 端点明确拒绝时，使用同一 refresh token、同一 Graph 资源和移除 Mail.Send 后的已授予 scope 重试一次。成功后通过现有账号代提交处理发送权限变化。断线仍走原有网络错误。Microsoft 浏览器 OAuth 默认入口走 Exchange，Graph 兑换基于已有授权。 [Graph 授权兑换](../../plugins/mail/src/engine/accounts.ts#L79) [续期授权拒绝处理](../../plugins/mail/src/engine/oauth-provider.ts#L190) [Microsoft 刷新授权文档](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#refresh-the-access-token)
- 本地缺少读取 scope 会收到对应权限提示。Graph HTTP 403 则显示「Microsoft Graph 拒绝访问收件箱，已同步邮件仍可查看。」工作台使用现有 Banner 显示能力错误文案。 [本地 scope 检查](../../plugins/mail/src/engine/accounts.ts#L330) [服务拒绝文案](../../plugins/mail/src/engine/message-cache.ts#L540) [工作台错误处理](../../plugins/mail/src/ui/MailModule.tsx#L739)

## 已编写的回归用例

用例通过 OAuth uses the real dispatcher, callback, module credentials, IMAP and SMTP with isolated issuers 进入生产 Mail 装配。Graph 夹具分别提供 delta 页和当前 Inbox 清单。 [用例入口](../../plugins/mail/test/oauth-engine.test.ts#L280) [Graph 夹具](../../plugins/mail/test/fixtures/graph.ts#L59)

- 已有 Graph 读取授权时服务返回 403，断言服务拒绝文案与原缓存。删除标记后到达旧局部更新，正文继续不可用。实际移回后恢复正文。 [403 和目录归属](../../plugins/mail/test/oauth-engine.test.ts#L1063)
- 续期断线只发出一次完整 scope 请求。完整 scope 返回 invalid_scope 后只重试一次 Graph 读 scope，收件继续，发送权限通过已提交的账号代撤回。 [续期和降权](../../plugins/mail/test/oauth-engine.test.ts#L1153)
- Vault 实际写回调内 abort。单等待者场景核对版本、游标、事件与通知。两个等待者场景核对共用一次 Graph 请求、存活等待者成功以及缓存更新。 [写入回调与取消](../../plugins/mail/test/oauth-engine.test.ts#L1211)
- 201 封邮件跨分页检查点后删除最新一封。先注入 Inbox 查询失败并核对检查点与游标，再重试取得最终 200 封并读取补回的最旧正文。下一轮空 delta 保留该邮件。 [最终收件窗口](../../plugins/mail/test/oauth-engine.test.ts#L1257)

## 未运行的验证

依据派工，本轮未运行 Vitest、类型检查、E2E、构建、打包、安装、GUI 或真实账号验证。回归用例待 Lead 执行。

## Modern Web Guidance

我检索了 display status messages 并取得 accessibility。沿用带 alert 语义的现有错误 Banner，只更新动态反馈文案。指南要求 “Announce dynamic errors via live regions”。
