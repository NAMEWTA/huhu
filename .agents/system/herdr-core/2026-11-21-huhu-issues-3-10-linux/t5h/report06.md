# #8 S4.2 Outlook 已授权账号的 Graph 增量与 MIME 正文

| 交接项 | 记录 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux` |
| Core / Lead / worker | `wta-ubuntu` / `t3p` / `t5h` |
| 任务文件 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task06.md` |
| 报告文件 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report06.md` |
| 核对基线 | Huhu `18857911f240b7aeb4ede89317f0a9afee733dcc`，下文仓内路径、符号和行号均指该对象 |
| 执行结果 | `done`，只读架构核对。下列新增接口、测试和通过条件供实施，本轮未执行测试。 |

**固定候选没有受控的存量 Graph 凭据装配入口。** 现有 Outlook 账号可通过 Exchange IMAP 收信，另有 Exchange SMTP 权限时可回复。S4.2 可以先在隔离 Vault 内用绑定到既有 Outlook 账号的合成 Graph 授权，贯通 Engine 刷新、分页、原文缓存、打开正文和回复。生产入口继续按现有授权走 IMAP。接通真实 Graph 的前提是宿主能为同一账号提供受信、按资源隔离的委托授权。新增 Graph consent 的产品选择仍归 S4.1。[S4.1](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S4.1-microsoft-consent.md) · [S4.2](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S4.2-outlook-delta.md)

## 当前 Engine 和账号实际能做什么

| 固定候选入口 | 核对结果 |
| --- | --- |
| `apps/engine/src/boot.ts:97,280`、`plugins/mail/src/engine/registration.ts` | 宿主传入可选的 Mail OAuth runtime。Mail 负责账号、授权会话、草稿/outbox、消息缓存、同步调度、会话视图、删除与卸载。已有正常入口为 `mail.sync.refresh/status`、`mail.messages.loadBody` 和 `mail.conversations.loadBody` 等。宿主配置 Microsoft clientId 可以开启 OAuth 流程，不能据此判断某一账号已有 Graph 授权。 |
| `account-definition.ts:18–64`、`accounts.ts:48–133,154–224`（下文未写目录的 Engine 文件均位于 `plugins/mail/src/engine/`） | 可移植定义 format 1 保存 provider、email、label、auth、IMAP/SMTP 端点、smtpEnabled、所选目录和 OAuth 身份。所选目录包含 INBOX。OAuth 绑定只有 clientId、包含 issuer 的 subject、固定 `route:"imap"` 及可选 personal 标志。设备侧 `ModuleCredentials` 的 mail 模块使用 `account-password`，目标包含邮箱、协议目标、clientId 和 subject。密封材料有 access、refresh、until、scopes、smtp 及可选会话提交记录。恢复账号定义会清除此用途的材料。没有 Graph 资源、独立绑定或 Graph 专属续期入口。 |
| `oauth-provider.ts:59–82,98–159,180–212`、`accounts.ts:saveOAuth` | Outlook 请求 OIDC、offline_access 及 Exchange 的 IMAP.AccessAsUser.All、SMTP.Send，刷新时只请求相应 Exchange scope。保存前验签 ID token、issuer、clientId、nonce 及用户身份，再由 IMAP 发现目录。对于新授权，缺少 scope 回执会失败。Graph Basic 回执会产生 `graph-metadata-only`，Graph Mail.Read 回执会产生 `wrong-resource`，二者均不会创建账号。普通账号设置、便携恢复、OAuth 修复都不能交入一份既有 Graph 授权。 |
| `accounts.ts:247–291`、`gmail-history.ts:74–190`、`message-cache.ts:375–487` | Gmail 有独立的 API 端点、账号校验、INBOX 初扫、history 分页和 raw MIME 下载。缓存写入保留绑定、原生 ID、原文与游标。权限或认证问题有特定 IMAP 回退，临时故障另行处理。Outlook 不进入此分支，收信、标读和 IDLE 使用 IMAP。Gmail 可复用的是账号代、取消、缓存提交、正文解析及草稿路径；其 profile/historyId、标签、ID 正则和 base64url raw 响应仅适用于 Gmail。 |
| `message-cache.ts:24–85,154–181,801–821`、`conversations.ts:31,134,213` | 缓存支持旧 format 1 IMAP 和 format 2 的 IMAP/Gmail 快照。消息、会话定位和同步状态均只有已有传输分支。打开正文的调用者提交 accountId、folder、localMessageId，Engine 检查可见性，从当前快照取原文，解析后复查内容和账号，成功时返回 sourceDigest。启用第三种来源须一起扩充严格 schema、来源映射、状态显示和会话分支。 |

既有 Windows 证据记录了仅 Exchange IMAP 收信、追加 SMTP 后一次真实回环投递、IMAP 正文中断保留旧快照，以及 Graph-only 回执被拒。证据中的 Graph 请求数为零。它可以作为默认传输的回归基线。项目验收要求两种传输各自收、读、回复，并检查增量失效与权限错误。[既有 IMAP 验收](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S4.2-outlook-imap.md) · [规格](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md) · [设计待决项](../../../../../temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-8-mail-module/design.md)

## 上游复用依据

项目指向的本机 `temp/sources/one-mail` 在本次环境中缺席。本次通过只读 GitHub 按项目锁定的 `d1be24d5bb83c2da7123b167f119d5abd169b0af` 直接读取四个 Rust 文件，逐项与 Huhu 固定对象对照。

- `graph_api.rs:21–65,111–152` 按账号与 INBOX 取游标，跟完 nextLink，在末页取 deltaLink，再把消息和游标交给 apply_messages；401 时最多强刷后重试一轮。`sync/mod.rs` 把可重试错误返回给调度器，其他 Graph 错误可尝试 IMAP。可沿用整轮提交和错误分流，Huhu 回退前还要确认同一账号有独立 Exchange 授权。[Graph 同步](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/graph_api.rs#L21-L152) · [路由及提交](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/mod.rs#L233-L250)
- 上游把 Mail.ReadBasic 与 Mail.Read 合并作增量准入，在客户端解 JWT 检查 Graph audience，把 Graph ID 压成 stable_uid，列表保存 bodyPreview。正文定位会把 UID 转 u32；标读命令已有 API 游标保护。Huhu 应保留 Graph 原生字符串，并让有正文权限的分支直接取 MIME。凭据的目标资源由受信获取方证明，Graph 服务验证 access token；客户端将其视为不透明值。若实际移植 Rust 代码，应依项目现有 UPSTREAM 与许可台账记录原路径和版本。[上游 ID 映射](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/graph_api.rs#L155-L204) · [上游正文定位](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/body/mod.rs#L93-L119) · [上游标读](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/commands/data/messages/mod.rs#L144-L151) · [Microsoft 访问令牌合同](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)

## 凭据与传输选择合同

建议在现有 Mail 账号服务内增加一个**可选的 Engine 内部授权提供方**。测试宿主可装入该提供方；生产默认缺省。调用形状可为 `withGraphReadGrant(accountId, accountRevision, signal, operation)`。它核对当前 Vault 实例、Outlook OAuth 定义、clientId、issuer/tenant 与 subject、目标邮箱、Graph 资源以及委托权限回执。操作在 Engine 内借用短期材料，外层只得到可用能力、受限原因或同步结果。单独的用途和本机凭据绑定避免覆盖 Exchange 密封材料。声明的邮箱、ID token 的 aud=clientId、一个自报 scope 的 bearer 均不足以完成上述绑定。首片仅覆盖公共云、已登录用户自己的 INBOX。

| 已确认的材料 | INBOX 刷新、正文及回复行为 |
| --- | --- |
| 只有现有 Exchange，或运行时未提供 Graph 授权 | 直接走已配置 IMAP，Graph HTTP 为零。保留目录、UIDVALIDITY、UID 和现有 SMTP 条件。普通账号不因未启用可选 Graph 而收到重新授权提示。 |
| 已绑定 Graph 委托 Mail.Read 或已授予的 Mail.ReadWrite | 选择 Graph delta 与 MIME。最低正文权限为 Mail.Read。只使用读取能力。回复可进原有草稿；只有同一账号独立通过 Exchange SMTP.Send 及既有发送检查时，outbox 才投递。Mail.Send 不赋予 SMTP 权限。其他已选目录继续走各自的 IMAP 同步。 |
| Graph Mail.ReadBasic | 可跟踪基础属性，不能取得正文、预览或附件。最小片只交付完整可读路径：有可用 Exchange 时使用 IMAP 并显示“Graph 仅基础权限”；仅有 Basic 时报告正文受限，MIME 请求为零。如以后开放基础列表，需要单独的“仅元数据”缓存状态。 |
| 目标资源不符、权限缺失、身份不符、授权撤销 | 记录对应的受限原因，拒绝以可疑令牌发送请求。跨账号或 Vault 绑定错误终止该次 Graph 操作。合法同账号的独立 IMAP 可依路由规则另行完成同步，并在状态中标明实际路径。没有该授权则保持受限。 |
| Graph 网络中断、429、5xx、次页或正文失败 | 保留已提交快照和游标，呈现可重试原因。429 尊重 Retry-After 并受整体重试预算约束。401 仅允许同一 Graph 授权提供方刷新一次并复验；连续 401 表示授权失效。403 根据可信回执及服务错误区分许可不足与策略拒绝。不以通用 HTTP 错误推断受众。 |

Microsoft 委托 Mail.ReadBasic 可调用消息 delta，但权限定义排除了正文、预览、附件；GET message 的通用许可表还要结合请求的属性解读。只读片不申请新 scope，不使用 application-only 或共享邮箱权限。[Graph v1.0 delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0) · [Mail.ReadBasic](https://learn.microsoft.com/en-us/graph/permissions-reference#mailreadbasic) · [节流](https://learn.microsoft.com/en-us/graph/throttling)

账号服务的兼容细节有两处。第一，当前 `syncMailbox` 会先调用 `ensureOAuthAccess` 续期 Exchange。应先读取定义和账号代，按操作选择资源，再调用相应资源的续期；否则可读的 Graph 账号会被失效的 Exchange 材料挡住。第二，生产装配将来须提供可复验的资源与身份来源、独立续期/撤销及清理合同。修复同邮箱但身份变化、迁移设备、恢复备份或删除账号后，旧授权和旧快照不能重新激活。定义、便携导出、UI 与日志均不承载令牌；沿用账号串行、版本比较与取消机制。新 consent 不在本片范围。

## INBOX 从增量到正文的最小切片

1. **首轮与续传。** 由 Engine 发起 `GET /v1.0/me/mailFolders/inbox/messages/delta`，初次明确选择所需属性，如 id、changeKey、receivedDateTime、subject、isRead。Graph 原生 ID 区分大小写；每次请求附 `Prefer: IdType="ImmutableId"`。按服务返回的完整 nextLink 续页、deltaLink 续轮，保持查询不变，不解析 token。附加授权前检查 HTTPS、配置的 Graph origin、版本、邮箱及目录范围，拒绝跨域重定向、循环和不合规链接。deltaLink 和分页链接仅在 Engine 内使用。[Microsoft v1.0 分页合同](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0) · [Outlook 不可变 ID](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
2. **合并和窗口。** 以 Vault、账号身份绑定、传输、目录和原生 ID 识别条目；localMessageId 由这些字段稳定派生，服务端 ID 原样保留。处理新增、修改、移出目录及 `@removed`，重复变更幂等，局部响应保留未返回字段；状态有歧义时按绑定目录复核成员资格。首轮遍历至末页，再按接收时间和稳定次键取最近 200 封用于本地窗口。窗口边界删除且无替补资料时重新枚举受影响目录。大目录可分批暂存进度，资源上限或取消只结束本次工作，不能把未完成分页当作成功。续做暂存须绑定账号代、目录和起始游标，过期后丢弃。
3. **原文。** 只对窗口内新消息或内容可能变化的条目取 `GET /v1.0/me/messages/{id}/$value`。路径段按原生 ID 编码；变更与取正文之间如有移动或删除，须复核目录归属。响应是 MIME 字节流，流式检查现有每封 2 MiB 限额及本轮总量，确认单封超过限额时记录该 ID 的“正文过大”状态，列表可用，正文与引用操作返回受限；一次传输意外中断则回滚本轮。这样单封大邮件不会永久堵住收件箱。JSON 正文、摘要、截断字节或空原文均不能作为可读原文发布。首片沿用 Gmail 的预取方式，再由现有 `parseMessageBody` 生成文本、不受信 HTML 和附件描述。打开邮件只读当前原文缓存；解析失败、账号代改变或原文摘要已变，沿用现有错误或 needs-refresh。此选型保留离线打开及现有附件、远程图片授权语义。[Graph v1.0 获取 MIME](https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0)
4. **发布与恢复。** 为 Outlook 增加可区分 active 传输的版本化快照，保留旧 format 1/2 读取。Graph 分区持有绑定、目录、原生 ID、原文、已读覆盖以及末页 deltaLink。IMAP 分区独立持有 UIDVALIDITY/UID。全轮和所需原文准备齐后，在现有串行写入中复核账号代、授权代、取消信号和缓存版本，一次发布消息及末页游标，再通知、刷新索引。失败、竞争写、换 Vault/删除期间不得由旧任务发布。服务明确返回失效（如 410 或 syncStateNotFound）时只重建该账号目录的 Graph 快照，重建失败保留旧版；切回 IMAP 使用其独立快照。仅在新传输成功发布后改变实际传输状态。[Microsoft delta 重放与重置](https://learn.microsoft.com/en-us/graph/delta-query-overview)
5. **从缓存打开与回复。** 扩充 `cachedSummary`、`receivedTarget/receivedLocation`、会话行、定位校验及前端同步状态中的 Graph 分支。现有账号/目录/localMessageId 读取合同继续有效。列表和会话须落到同一 MIME 摘要；从原文走现有 prepareReply/forward、草稿和 outbox，回复的 In-Reply-To/References 取邮件 Message-ID，Graph ID 仅用于定位，原信 Bcc 不进入回复。Graph 标读沿用本地覆盖，回执 remoteSynced=false；观察到服务端 isRead 和本次写回确认是两个不同事实。调度使用现有周期刷新，Graph INBOX 不挂 IMAP IDLE。状态返回实际传输、范围、窗口及必要的回退或重扫原因，不暴露 deltaLink。

## 后续实施的定向验收

使用现有 `plugins/mail/test/oauth-engine.test.ts`、`sync-engine.test.ts`、合成 issuer、IMAP/SMTP 夹具与隔离 Vault，新增受控回环 Graph 服务。经真实 dispatcher 调用上述能力。记录实际端点、请求数、账号/目录、提交前后可见版本和 SMTP 夹具收件人；测试数据只含合成令牌与邮件。

| 场景 | 验收观察 |
| --- | --- |
| 两种成功账号 | Graph Mail.Read + 独立 Exchange SMTP 与原有 Exchange IMAP + SMTP 各收一封，经列表及会话打开同一原文并回复。核对全文、附件、同一账号、信封收件人、线程头和各一次 SMTP DATA。前者走 delta、MIME，后者 Graph 调用为零。只有 Graph 读权限时可建草稿，SMTP DATA 为零。 |
| 授权装配 | 覆盖无提供方、Basic、错误资源、错误 Vault/账号/tenant/client、缺失回执、已撤销和刷新拒绝；核对具体原因、实际回退和 MIME 请求数。合法的合成不透明 Graph token 可用。Exchange 续期失败时 Graph 仍独立可读；升级、恢复、删除均不复制或串用密钥。 |
| 分页与增量 | 合成初扫至少两页、随后新增/修改/移除、空页带 nextLink、同 ID 跨页重放、大小写不同及需 URL 编码的 ID、超过 200 条且跨页乱序。断言最后一页才提交，可重启续轮，增量只下载需要的 MIME，不能复用 Gmail history 或 IMAP UID。 |
| 失败与恢复 | 次页 5xx、循环或跨源链接、429、401、403、MIME 中断、截断及 410 后重扫再失败。另测单封超限仍能同步后续邮件、受限项不能打开。核对失败轮的旧快照/游标仍对应，外部 origin 收到的授权请求为零；恢复后只提交一次，不重发历史到达通知。 |
| 缓存与正文身份 | 相同原生 ID 出现在不同账号、读到半途取消/删号、同账号重绑、切换 active、旧 format 1/2 重开、加载正文期间原文更新、只改 isRead、消息移出。断言无跨账号/目录读取、旧缓存不会绕过新授权状态，旧定位返回 needs-refresh，本地标读不被旧同步覆盖。 |
| 正文与发送权限 | multipart/alternative、HTML-only、合成附件、外链图片、无 Message-ID、恶意或异常 MIME 单独核对。打开正文自动远图请求为零；附件和草稿取自实际原文。Graph 读取不调用 Graph sendMail 或写标读。Gmail 和非 INBOX 目录保持现有路由。 |

**交付界线。** 本轮核对固定 Git 对象、固定上游源码和 Microsoft 官方接口文档，仅发布本报告。未访问个人凭据，未向 OAuth 或邮件服务发请求，未运行构建、测试或 E2E。模拟链路通过后可记录“受控 Graph 适配器可用”；真实账号支持仍须取得可审计的正式授权提供方，并另行核验宿主装配。

## Lead 验收

由 Lead 追加。
