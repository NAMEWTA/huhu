# t10n · Mail Graph 候选独立审查

Lead t3p，worker t10n，任务 task01，主机 wta-ubuntu。审查基线 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`，目标为 `impl/huhu-mail-graph-completion` 工作树中 `plugins/mail/**` 的 17 个已跟踪文件差异及 3 个新增文件。对照 t10d 的 task01/report01、t10b 第 3 项、11 月 21 日批次第 #8 项、Mail S4.2、规格的网络与数据契约、Issue 正文 §5.3、§6、§8 和 S8.1–S8.3。建议 Lead 先退回三项 P1，再安排定向验收。以下判断均来自静态代码与已发布协议资料。

## 规格发现

### P1 · 合法的不透明或加密 Graph token 在发出首个 Graph 请求前被拒绝

- **位置与触发**　`plugins/mail/src/engine/oauth-provider.ts:129–153,178–205`。已批准的 Microsoft Graph 委托授权返回带 `Mail.Read` 的 scope 回执，但 access token 为不透明字符串或加密格式时，`graphClaims` 无法返回三段 JWT 的 `aud/scp`，`mailPermission` 直接报 `wrong-resource`。`accounts.ts:196–204` 的真实 Graph 探测因此不可达。刷新阶段同样检查新旧 access token。即使原来用可解码 token 配置成功，合法刷新结果变成不透明格式也会令账号进入需要重授权。Graph 正向夹具自行签发含 `aud/scp` 的 JWT，覆盖不了此路径。微软要求客户端将 Graph access token 视为不透明字符串，也明确提到消费类 Microsoft 账号可能拿到加密凭据。 [Access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) · [Microsoft 服务 token 格式说明](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow)
- **修法与定向验证**　保存由可信 Microsoft token 交换产生的资源归属及实际已授予 scope，将 Graph 与 Exchange 的申请和使用分别绑定到既有账号及客户端。Graph 资源请求应具有明确来源，使用 Graph 服务端接受回执完成账号探测。保留 ID token 的签名、nonce、身份校验，严格区分 Mail.ReadBasic、正文权限和 Mail.Send。用不透明 token 跑首次绑定、刷新、读正文和发送，并分别覆盖错误资源、只有 Mail.ReadBasic 和只有读取权限。确认错误资源凭据没有跨协议尝试。

### P1 · 拒绝 Microsoft Graph 文档中的合法 nextLink 和 deltaLink

- **位置与触发**　`plugins/mail/src/engine/graph-mail.ts:79–91,111–129` 的路径校验只允许 `/mailfolders/<id>/messages/delta`。Microsoft Learn 的第一组完整消息 delta 示例返回 `/me/mailfolders('<id>')/messages/delta` 形式的两类链接。首轮若收到此形式的 nextLink，会在请求第二页前失败。单页若直接返回同形式的 deltaLink，也会在读取 MIME、写入缓存前失败。新增夹具 `plugins/mail/test/fixtures/graph.ts:3–5,51–58` 始终返回斜杠路径，无法发现兼容问题。 [Microsoft Graph 消息增量示例](https://learn.microsoft.com/en-us/graph/delta-query-messages#sample-initial-response)
- **修法与定向验证**　接受微软返回的两种同源目录路由，同一收件箱按可信 folder ID 绑定，保留原始链接及不透明查询参数。用夹具返回括号形式的第二页与终态链接，并用终态链接进入下一轮。继续覆盖跨来源链接、不同目录、第二页 500/403、410 重扫失败以及重扫成功后原子推进。

### P1 · 主机级 Graph 选项替换了现有 Exchange 授权入口，失败后无法就地走 IMAP

- **位置与触发**　桌面 `apps/desktop/src/main/engine-supervisor.ts:136–145` 将环境传给 Engine，`apps/engine/src/main.ts:22–35,82–94` 调用实际的 `createMailOAuth`。候选确有生产接线。环境变量未设时使用 Exchange。设为有效 `HUHU_MAIL_MICROSOFT_PREAUTHORIZED_GRAPH_SCOPES` 后，`plugins/mail/src/engine/oauth-provider.ts:85–101,201–202` 为所有 Outlook 会话替换 Exchange scope，并拒绝 Exchange 回执。设为无效值则整个 Outlook issuer 缺失。现有添加与修复使用同一入口，`plugins/mail/src/engine/oauth-sessions.ts:197–208,253–256,321–340` 一律按该 issuer 发起。没有浏览器登录会话、账号没有此前的 Graph 委托授权，或仅部分账号满足条件时，Graph 会话失败，用户在同一主机无法正常添加或修复 Exchange。即使另有可用 Exchange grant，现有 Graph 账号在原环境也无法退回。测试改写了内存 issuer 才实现退回（`plugins/mail/test/oauth-engine.test.ts:1059–1067`）。
- **决定与修法**　`prompt=none` 在微软侧禁止交互登录或同意提示，沿用现有按钮也未新增 Graph consent 页面。这部分符合暂缓新同意体验的边界。批次同时要求保留 Outlook IMAP 的完整闭环。主机上的 scope 配置仅表达可以尝试此前已批准的授权，不能证明某个账号当前可用。建议保留默认 Exchange 的添加与修复，按账号在可信的已有授权上下文中尝试取得 Graph 凭据，成功探测后再切代。已有同一客户端、同一用户的受保护 refresh token 可评估静默兑换其此前批准的资源权限。Graph 不可用时保留旧账号代并报告原因，只用独立的 Exchange 凭据走 IMAP/SMTP。使用同一生产装配、两个不同权限的合成账号和缺 SSO 会话场景核对，途中无需修改 issuer。 [批次决定](../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md#2026-11-21-产品选择定案) · [Microsoft 授权码流程](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) · [Microsoft 刷新凭据](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)

### P2 · MIME 总量限制会跳过可读取的邮件并提交新游标

- **位置与触发**　`plugins/mail/src/engine/graph-mail.ts:30–34,134–170`。在已有有效游标的收件箱一次收到 10 封约 1.95 MiB 的邮件，每封均低于 2 MiB 上限。前 9 封读入后，第 10 封因超过本轮 18 MiB 总量被跳过。随后 `plugins/mail/src/engine/message-cache.ts:436–475,525–545` 可以保留更旧的小邮件并发布新游标。下一轮返回空 delta 时，被跳过的正文没有补取入口。单件 2 MiB 和最多 200 封是既有边界，这个触发是在最近窗口内、单件合规的邮件被永久跳过，直至删除缓存或重扫。另有独立的进度边界，首次或 410 恢复整箱分页若固定超过 200 页或 20,000 条，常规重试会从同一起点再次达到上限。
- **修法与定向验证**　区分单件明确超限与本轮尚未读取，沿用既有批次/重扫思路。超出单轮预算时先完成有界、可续的读取或暂存待取原生 ID，只有缓存和游标能一致推进才发布。初扫及 410 恢复也需要能收敛的窗口或续取方式。用 10 封单件合规邮件、旧的小邮件及下一轮空 delta 验证缺口能补齐。模拟跨页出现同一 ID 并核对最终收件箱归属及已读状态，Graph 不保证记录出现顺序。 [Microsoft Graph 分页合并及重放](https://learn.microsoft.com/en-us/graph/delta-query-overview#resource-representation-in-the-delta-query-response)

### P2 · Graph 账号换代可与旧同步的落盘交错

- **位置与触发**　`plugins/mail/src/engine/message-cache.ts:394–400,410–415,478–487,540–545` 起初和写入前检查账号 revision，但只把缓存文件的 `expectedVersion` 交给 Vault。 `packages/vault/src/write.ts:112–119,128–153` 分开排队，并在缺少 `beforeCommit` 时异步替换。账号修复走 `plugins/mail/src/engine/accounts.ts:225–240` 的账号锁及凭据发布，未持有草稿/缓存写入锁。若 Graph 缓存写已通过前置检查，账号修复先提交新代，再由旧同步完成缓存替换，事后检查会拒绝调用结果，已落盘的旧快照仍能被 `mail.sync.status` 及正文入口读到（`message-cache.ts:804–839`）。这是共用缓存写法已有的竞态，本次 Graph 与 Exchange 的切换也会经过它。
- **修法与定向验证**　沿用 Vault `beforeCommit`，在实际提交位置检查账号代、移除和取消状态，或让缓存发布与账号改代使用同一提交边界。令旧同步通过现有写前检查后停在替换前，同时完成同账号修复或切换，再释放旧轮次。核对旧轮次既不改磁盘、也不发通知，新代按自身快照与游标继续。

### P2 · 刷新撤销 Mail.Send 后，已打开的工作台可能继续显示可发送

- **位置与触发**　`plugins/mail/src/engine/accounts.ts:90–99` 刷新时保存 `smtpEnabled: false` 和新 revision，没有发布账号变化事件。`plugins/mail/src/engine/sync-schedule.ts:135–139` 检测到 definition 变化直接继续下一个账号。`plugins/mail/src/engine/message-cache.ts:410–415,781–787` 的手动同步成功只发布邮件/邮箱缓存变化。工作台 `plugins/mail/src/ui/MailModule.tsx:135–164` 通过 `mail-account` 事件刷新账号，缓存事件仅刷新邮箱数据，定时主动重取也仅在阅读或搜索时启用。若写信窗口保持打开且没有阅读/搜索，`plugins/mail/src/ui/MailComposer.tsx:350–364,425–434` 仍可能使用过期账号状态。后端会阻止投递，用户要到点击发送或其他操作刷新账号才看到实际限制。
- **修法与定向验证**　从现有账号事件入口在权限变化完成提交后发布 `mail-account`，让调度器重新取得当前代。用只读 Graph 凭据、刷新中丢失 Mail.Send 和账号手动关闭发送三种场景分别检查 UI 与工具结果。 `plugins/mail/src/engine/graph-send.ts:23–24` 把任意 403 都解释为缺 Mail.Send，`plugins/mail/src/ui/MailOutbox.tsx:94–95` 又用此推断覆盖真实服务端拒绝。除非有可信权限证据，建议显示 Graph 拒绝发送和可获得的原因，区别账号关闭发送、权限缺失和其他拒绝。 `MailOAuthControls.tsx:15–21` 的通用 `permission-missing` 也应按资源显示，例如 Graph 请求无需提示 IMAP 权限。

## 项目规范与合同核对

- **P2 来源记录待补**　候选只有 worker 报告中的出处。Issue 正文 §10–11 要求把上游固定提交、原文件、Huhu 落点、许可和适配方式写入总台账、第三方声明及 Mail 来源记录。建议在 `docs/upstream/ledger.md` 和 `THIRD_PARTY_NOTICES.md` 添加相同的 Graph 行，按原 Issue 的记录安排在 `plugins/mail/UPSTREAM.md` 补对应入口。记录 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的 `src-tauri/src/mail/sync/graph_api.rs` 为行为参考，列出 Huhu 的 `graph-mail.ts`、`message-cache.ts` 与 `oauth-provider.ts`。本次阅读所见是复用 Huhu TS 缓存、原生 ID 与 Graph HTTP 契约，未识别出直接带入的 Rust 源码。保留 README 的 AGPL-3.0-only 声明及该提交无独立 LICENSE/COPYING 的事实。 `graph-send.ts` 对照微软 sendMail 文档，更新已有 Nodemailer 10.6.0（MIT-0）条目，注明 Mail 复用同一导出的 MailComposer，依赖与锁文件未变。 [one-mail 固定源码](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/graph_api.rs) · [上游许可段](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/README.md#L221-L225) · [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)
- **账号与缓存**　`account-definition.ts:49–63` 的凭据目标保留既有 IMAP 绑定，仅对 Graph 加路由。`accounts.ts:48–55,189–240` 通过 Mail 专属 `ModuleCredentials` 和期望 revision 提交，Graph Inbox 探测失败先退出，旧账号未被覆盖。Graph 与 IMAP 在 `message-cache.ts:84–94,165–173,525–550` 使用独立快照、原生 ID 与游标，Graph MIME 使用同源 `messages/<id>/$value`，再进入既有原文、正文、附件元数据和回复逻辑。普通分页失败与 410 后重扫失败发生在 `publishSync` 前，保留旧快照。Graph 本地已读覆盖不执行 IMAP STORE。未在差异中发现新增 Safe 依赖或凭据通过公开返回值输出。 [Graph 不可变 ID](https://learn.microsoft.com/en-us/graph/outlook-immutable-id) · [Graph MIME 文档](https://learn.microsoft.com/en-us/graph/outlook-get-mime-message)
- **发送与 S8**　`outbox.ts:114–154,262–276,285–368` 沿用草稿 revision 操作 ID、先落盘认领、按记录查询与限制重试。Graph 发送另查 Mail.Send，绑定客户端、主体和地址，请求丢回执为 unknown，重复 submit 读既有认领，unknown 收件人不进入普通 retry。Graph 202 表示请求被接纳，逐收件人字段不能解读为已投递。`graph-send.ts:5–29` 以 MIME 携带回复头和附件，夹具只断言回复 To/In-Reply-To，并未实际断言发出附件字节、主动密送的传输及投递后可见性。S8 复用已有 Dispatcher 和权限门，`mail.oauth.status` 回执与 `mail.sync.refresh/status` 返回路径。外部 `mail.accounts.list` 的精简输出依旧只有 `smtpEnabled` 没有路由（`registration.ts:23–33,76–91`），当前客户端要另外查询同步状态。可以补非秘密的实际/缓存路径与发送状态，保持 token 和 OAuth 主体不出现在外部列表。 [Graph 202 语义](https://learn.microsoft.com/en-us/graph/api/user-sendmail#response)

## 未运行的验证

本次只读取、对照并写报告。未启动 Vitest、tsc、依赖安装、构建、打包、Playwright/Electron、完整 E2E 或视觉取证。未访问真实账号，未运行协议夹具，未触碰冻结 integration，未启动子代理。t10d 的用例和旧候选的既有执行结果不计作本次候选通过。

Lead 定向复验可先用 `plugins/mail/test/oauth-engine.test.ts` 检查上述触发，记录各轮 request、缓存版本和唯一提交次数。补 Graph 出站 MIME 中的 To/Cc/Bcc、References 和合成附件字节，人工核对 202 正常响应、丢回执、重开后重复提交及跨入口并发共享一份认领，网络请求只发生一次。S8.1/S8.3 另需真实 Web/CLI/MCP/API 权限入口与第二设备会话读回，S8.2 的 Web 附件流仍沿用其专门验收。S4.2、S8 及合法生产凭据路径均保持未签收。
