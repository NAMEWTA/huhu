# t17c · #8 S3.1／S4.1 Google 与 Microsoft 邮箱授权

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task15.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task15.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report15.md`
- 执行结果 — `done`

## 交付

分支 `impl/huhu-issues-3-10-mail-oauth`。阶段提交 `03b8ccc081eda52435288ce2b3b99ce7bc884195`，父提交 `4f30195345d732ab0e51b974ac9915bcfbefce6e`。唯一开发检出为 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`，提交后工作树干净。变更限 `plugins/mail` 和 #8 验收证据。根锁 blob 为 `b3c2fc9cb809a8acab6d55b003785463165cf37f`。

- Google 可通过系统浏览器授权 Gmail IMAP 和 SMTP。Microsoft 默认走 Exchange IMAP，发送选择开启时申请 SMTP scope。Microsoft 只有 IMAP 时仍可添加为收件专用邮箱。Graph 的 `Mail.ReadBasic` 和其他 Graph 授权分别提示基本权限受限及资源不适用，额外 Graph consent 等待产品确认。 [Google 桌面 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app) · [Gmail XOAUTH2](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol) · [Exchange OAuth](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth) · [Graph 权限表](https://learn.microsoft.com/graph/permissions-reference)
- OAuth 协议、state、nonce、PKCE 和 token 留在 Engine。授权后验证签名身份与输入地址，再用 XOAUTH2 验证当前 IMAP 与目录。新账号选择实际发现的 INBOX，重新授权沿用原 ID 与已选目录。在重新授权保存前复核账号修订及 OAuth 主体。Workbench 显示会话状态及脱敏原因。
- access token 和 refresh token 使用现有 `ModuleCredentials` 保护，刷新按账号合并，以条件事务保存轮换凭据。失效授权显示重新授权。SMTP 以 OAuth access token 登录，并复用 Mail 既有发件队列。已核对固定 one-mail 提交 `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的授权实现。

## Windows 验证

| 场景 | 实际结果 |
| --- | --- |
| 入口、state、PKCE 和重放 | 用真实 Engine dispatcher 走授权能力。默认无配置时两个提供商均不可用。默认 CLI 不能发起，其他 Web 身份无法查询会话。错误 state 交换零次，有效回调提交一次正确 S256 verifier，重放不再接受 |
| 地址、签名、账号和 Vault | 错误地址、nonce、受众、签名或 OAuth 主体保留旧账号及修订。正确重授权沿用原账号 ID。拒绝和超时产生相应状态，取消后的迟到回调无法完成。关闭 Vault 时阻断在途交换，另一 Vault 无法读取旧会话 |
| Exchange、Graph 和实际协议 | 两家都经回环 IMAP XOAUTH2 读取，并经 SMTP XOAUTH2 把 DATA 投递到本地夹具。Microsoft 只有 Exchange IMAP 时为收件专用，Graph 基本权限、Graph 其他权限、缺失 scope 和 IMAP 拒绝呈现独立状态 |
| 刷新、持久化和隔离 | 同账号两个并发操作只续期一次，重启后使用已轮换的 refresh token。永久失效时提示重新授权，公开账号和 Vault 文件未发现测试凭据明文 |

Windows Node `v24.21.0`，Mail Vitest 10 个文件、48 项通过，包含 2 项新增 OAuth 用例。Mail TypeScript、19 个改动代码文件的 oxfmt／oxlint、已提交差异的 `git diff --check` 均通过。按 AGENTS 先检索并读取 Modern Web Guidance 的 `accessibility` 指南，再更新界面。授权进度由 `role="status"` 播报。

[复验步骤与来源](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S3.1-S4.1-mail-oauth.md)

## Lead 接续

1. 在公共 Engine 装配中从 `@huhu/plugin-mail/engine` 导入 `createMailOAuth`，调用 `mail.apply(ctx, api, owner, transport, syncOptions, createMailOAuth(clients, { hostLabel, openBrowser }))`。保留第五参数的 S5 通知配置。当前工作台通过 `mail.oauth.availability` 显示当前 Engine 主机及提供商状态，未配置时禁用授权，API 返回 `not-configured`。
2. 由受信任的 Engine 配置提供 `google.clientId`、注册需要时的 `google.clientSecret`、`microsoft.clientId`。Google 使用桌面客户端和动态端口的 IPv4 loopback 回调。Microsoft 使用支持目标账号类型的原生公共客户端，注册 `http://localhost/mail/oauth/callback`。 [Google 桌面 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app) · [Microsoft 授权码与 PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) · [Microsoft 回调注册](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
3. 给 `openBrowser` 接现有受信任主进程浏览器能力。打开前要求 HTTPS，精确允许 `accounts.google.com/o/oauth2/v2/auth` 和 `login.microsoftonline.com/common/oauth2/v2.0/authorize`，拒绝自定义端口、用户信息及其他目标。配置经进程内传递。实际浏览器打开、打包 Workbench 和在线提供商仍需 Lead 装配后联验。本轮仅使用隔离 Vault、回环发行方及合成邮箱，未注册客户端，SMTP 只发本机夹具。
