# Mail 的协议身份、发送事务与 Vault 边界

<a id="reuse"></a>

## 哪些实现可以复用

本次核查在 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。Issue 的 Huhu 链接固定在 `913264045cee1818497a37a57715c664aa85a1ae`。当前根规则为 AGENTS.md，旧 CLAUDE.md 已移除；编辑器及桌面预览入口已变动。当前无 plugins/mail 或 apps/web。工作台已有桌面注册入口，Web 联验取 #6 实际入口。下表区分当前调用点与拟新增部分。

| 当前代码或来源 | 已查到的行为 | 对 Mail 的影响 |
| --- | --- | --- |
| [Engine boot](../../../../../../apps/engine/src/boot.ts)、[PluginManager](../../../../../../packages/kernel/src/plugin-manager.ts)、[Renderer](../../../../../../apps/desktop/src/renderer/main.tsx) | 每 Vault 一个 Engine，注册内置插件，注入 vaultId/stateDir/files；UI 单独登记。 | 拟新增 @huhu/plugin-mail、manifest、Engine apply 与 UI contribution；在 ctx.effect 下回收。保持 inbox 独立。 |
| [Dispatcher](../../../../../../packages/kernel/src/dispatcher.ts)、[IdempotencyStore](../../../../../../packages/kernel/src/idempotency.ts) | 写/执行按 caller、能力、key 与参数判重，24 小时窗口；boot 指向 runtime/idempotency.ndjson。超时可先于 handler 返回。 | UI 与 CLI 的 key 不能独自防重发。领域记录持久保留，传输层回执只含业务句柄与脱敏结果。 |
| [查询失效](../../../../../../packages/workbench/src/engine-client/query.ts)、[通知](../../../../../../packages/kernel/src/notifications.ts) | ENTITY_CAPS 按实体使当前 Vault 的查询失效，NotificationStore.create 只有 module、title、body。 | Mail 注册事件映射；给实际新邮件增加类型化定位目标并走搜索定位入口。首轮历史导入抑制新信通知。 |
| [VaultFiles](../../../../../../packages/vault/src/write.ts)、[Vault](../../../../../../packages/vault/src/vault.ts)、[数据包](../../../../../../packages/vault/src/package/package.ts)、[Git 分类](../../../../../../plugins/versioning/src/engine/sync.ts) | expectedVersion、路径检查、原子写；只读可能取得临时目录。包逐文件采集，EXCLUDED_HUHU 仅 runtime/cache/ui/history，importPackage 校验并暂存到新目录。Git 的 HUHU_INCLUDE 无 mail。 | 复用字节/路径守卫，补邮件一致快照和子集导入。includeAttachments 对 .huhu 下文件没有通用豁免。Git 保持现有默认边界。 |
| [JSON 入口](../../../../../../packages/kernel/src/server/ingress.ts)、[preload](../../../../../../apps/desktop/src/preload/index.ts)、[宿主设计](../../../../notes/context/workbench.md) | JSON 请求上限 8 MiB，桌面系统文件操作由 preload 承接。VaultIndex 针对现有内容。 | 桌面经 window.huhuHost 选择本机文件，受控导入后使用 attachmentId；Web/外部用 #6 流。邮件搜索建立独立可重建投影。 |

在当前工作区核对 Huhu 的包清单、NOTICE 及本地参考源码。当前 editor 直接声明 Tiptap，DOMPurify 在锁文件和 NOTICE 中可见，新增 Mail 使用时要声明自己的直接依赖。工作区已有 Tiptap 核心 3.22.3（MIT）、DOMPurify 3.3.3（MPL-2.0 或 Apache-2.0）、React、Radix、TanStack、Zod、fflate、node:sqlite。one-mail 写信所用 Tiptap 依赖范围为 ^3.23.4，先验证扩展/API 和邮件 HTML 输出能否共用版本，勿直接复制 lockfile。针对尚缺的协议职责，查 npm 发布元数据得到候选 ImapFlow 2.12.1（MIT）、Nodemailer 10.6.0（MIT-0）、MailParser 3.14.5（MIT）。它们是研究候选，实施时再锁定实际安装版本、许可证、资源限制和取消能力。MailParser 的 streaming parser 与 HTML 净化承担不同职责。[仓库 NOTICE](../../../../../../THIRD_PARTY_NOTICES.md) · [MailParser](https://nodemailer.com/extras/mailparser)

### 上游开发基线

2026-11-19 在 [one-mail 本地检出](https://github.com/zhihui-hu/one-mail/tree/d1be24d5bb83c2da7123b167f119d5abd169b0af/.) 核对 `origin/main` 与 `git ls-remote --symref origin HEAD`，均为 `d1be24d5bb83c2da7123b167f119d5abd169b0af`。本次恰与 Issue 历史固定值相同。实施时以[批次来源清单](../../../../changes/2026-11-19-huhu-issues-3-10/sources.md)和当时默认分支检出重新对照 §10、§14 的路径；保留作者和许可记录。只引入授权范围内的源码，用户界面沿用 Huhu 的视觉与措辞。当前核对限源码，真实账号与协议运行见 S9 的证据要求。

| 本地默认分支源码 | 核查结果与移植落点（拟议） |
| --- | --- |
| src/components/account/account-form-types.ts、src/components/conversations/conversation-message-content.tsx | 18 个命名 kind 和 custom；resolveProviderPreset 专门处理 111.com/email.cn。正文用 IntersectionObserver 和单封图片策略。分别复用到 mail/shared/providers、mail/ui/message；表单和 Engine 校验共用预设。 |
| src-tauri/src/commands/data/conversations.rs、src/lib/desktop-api.ts | collect_conversations 在分页前取账号全集、收件/本机 sent、筛选及公开参与者；适配到 Mail 本地投影。桥接表有 createForwardDraft、草稿/本地发件删除。转发草稿接到真实 UI，收件操作不外推。 |
| src-tauri/src/mail/sync/{gmail_api,graph_api}.rs、mail/body/mod.rs、commands/data/messages/mod.rs（后三者同在 src-tauri/src） | API 用 stable_uid 转本地数值，正文路径用 u32 转 UID；Graph 查 audience/scope、deltaLink。已读有 FLAGS 确认及 read_state_override。迁移同步算法，替换错误的正文定位。 |
| src-tauri/src/mail/smtp.rs、commands/data/compose.rs、oauth/crypto.rs、commands/backup/native.rs、commands/data/settings.rs（相对 src-tauri/src 的短路径） | 原发送有 token 刷新重试；草稿支持引用附件。OAuth 加密使用 database_key 派生值，原生备份把 database_key 写入 onemail_backup_metadata。设置中的远端备份返回未移植错误。仅参考其备份边界与发送故障。Huhu 写新格式，认证留在模块的本机绑定中。 |

README 第 223 行声明 AGPL-3.0-only，固定树未见独立 LICENSE/COPYING；Huhu 根 package 声明 GPL-3.0-or-later。S0 对复制和翻译分别记录原路径、作者、固定版本、适用声明、目标路径、改动、验证入口。实际分发时保留原声明，核对组合、网络使用与对应源码提供方式，独立核对图标/品牌/第三方依赖；落到 plugins/mail/UPSTREAM.md、docs/upstream/ledger.md、THIRD_PARTY_NOTICES.md 和可用源码链接。授权未清的素材先用 Huhu 现有图标承载同一语义。[固定 README](https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/README.md) · [AGPLv3 §13](https://www.gnu.org/licenses/agpl-3.0.html#section13)

## 两种结构

| 候选 | 协议状态及故障所有者 | 真实代价 |
| --- | --- | --- |
| A · Mail 在现有 TS Engine 内执行，按提供商分适配器 | Mail 统一维护账号代、取消、草稿及发送事务；协议库完成 IMAP/SMTP/MIME，Gmail/Graph 适配使用原生 ID。调用者只带本地 ID。 | 必须逐函数移植 Rust 的同步、错误和聚合规则，并用固定输入对照；可直接复用 Dispatcher、Vault 与现有进程生命周期。 |
| B · 抽离 Rust 邮件核心，Engine 通过窄接口调用 | Rust 持有协议连接与解析，Engine 持有授权、Vault 与投递登记。须定义进程中断后结果如何查询以及连接如何退出。 | 保留更多协议算法，但上游 AppState/DB/Tauri command 耦合需要剥离，增加三平台二进制、取消与发送跨进程提交成本。 |

推荐 A。只有 S0 在同一组同步、正文及中断发送样例上证明 B 的移植量显著更小，并能使用现有原生交付机制时才修订。两案均使用 Huhu 设计系统、单能力目录和单 Vault 生命周期。

<a id="operations"></a>

## 两个调用从入口到结果

**搜索定位 Gmail 邮件并标读。** 桌面搜索或已获开放权的 CLI 输入查询与分页，mail.conversations.search 返回 accountId、localMessageId、摘要和定位信息。mail.messages.loadBody 只接当前 Vault 的本地消息 ID，先读缓存，再根据 locator 选择 provider，以账号自有认证取内容。返回状态、内容、附件元数据及实际来源；账号失效提示重授权，权限不足或错代后返回受限/已失效。UI 确认可见另调 setReadState，IMAP 校验远端后提交，API 本地覆盖返回 remoteSynced=false。同步和正文从未把 RFC822 ID 或散列当传输地址。两个账号出现相同 RFC822 ID 时各自取回对应正文。

**同一封草稿在桌面与 MCP 同时发送。** 输入 draftId、expectedRevision、调用 key。入口分别检查插件、能力开放/调用者、Vault 可写性。Mail 重新校验账号可发、收件人、附件归属/完整性、草稿版本，在持久事务内认领唯一的 (vaultId, draftId, revision)，冻结投递内容、RFC822 Message-ID 和接收者，生成 operationId。其它调用返回同一 operationId；版本冲突返回当前版本且无网络动作。SMTP 只由认领者执行；outbox.status 按 operationId 返回已知逐人结果、时间和后续可做的动作。普通结果和公共聚合均不带认证秘密或他人密送信息。

| 发送故障窗口 | 持久结论 | 重试与恢复 |
| --- | --- | --- |
| 草稿版本/附件校验失败，或发送意图尚未可靠落盘 | 原草稿可编辑，尚未提交 | 修复或保存新 revision。禁止先发信后申请操作 ID。 |
| 远端明确拒绝且无收件人接受 | failed，记录错误阶段、拒收范围 | 可显式重试同一业务意图，写新 attempt。 |
| DATA 已确认，部分 RCPT 被拒绝 | 已接受集合与拒收集合分别保存 | 仅对确定拒收者建新尝试。DATA 最终结果未知时，已通过 RCPT 的地址仍属未知。 |
| 提交可能发生，回执丢失、取消、崩溃或成功后写盘失败 | 保留意图与已有事实，遗留 sending 恢复为 unknown | 提供查询、查看本机或服务商记录及人工处置；不因 OAuth 刷新、CLI 重试或备份恢复而自动重发。明确重新投递须提示重复风险并关联原尝试。 |

<a id="storage"></a>

## 数据与提交顺序

| 所有者 | 稳定身份、写入与生命周期 |
| --- | --- |
| Mail 账号与认证 | accountId 稳定，配置 revision 与认证版本绑定；替换先写本机受保护的新版本、核对原 revision 后提交配置，再清理失去引用的旧版本。并发刷新按账号合并；服务商已轮换而断电未能保存，只标为需重授权。删除/停用先停止网络、失效旧代；在途发送先对账或留可查的投递结果，清理仅限该账号。密钥后端由 [#9 设计](../feature_2026-11-19-issue-9-safe-accounts/design.md) 负责。 |
| Mail 消息与同步器 | localMessageId 稳定；每条保留零至多个有证明的来源定位。IMAP 绑定 accountId/folder/UIDVALIDITY/UID，API 绑定 provider/accountId/nativeId。RFC822 ID 仅作同账号关联，无 ID 不猜合并。游标与缓存同代，单账号单飞、多账号有限并发；每页记录持久入缓存后推进相应游标。UIDVALIDITY 换代废弃该目录定位与游标，遇失效 history/delta 对账；不同传输的定位和游标不串用。 |
| Mail 持久区 | 拟在 stateDir/mail 保存配置、本机草稿、发件操作/结果、本地覆盖、受管附件。附件先暂存并验证后发布引用；未提交时旧版本仍完整，垃圾回收只清无持久引用且无在途导出的对象。发件状态与草稿 revision 同一串行边界提交。 |
| 可重建缓存 | stateDir/cache/mail 保存远端副本、正文、索引、相应游标；运行态负责句柄、取消与 IDLE。可离线搜索已有范围。擦缓存不影响持久区；只读通过原 Vault 读历史，后台不得用 scratch 创建一个看似成功的持久状态。建议只读时关闭后台同步，仅允许用户主动、既有认证可用、协议确认无标读副作用的正文读取（IMAP 用 PEEK）；若需要轮换令牌则提示改用可写模式。所得正文仅存本次临时缓存。 |
| Huhu package / Versioning | 备份时 Mail 固定一致的持久版本和附件集，整 Vault 与子集都取同一快照；文件 SHA 仅证明字节完整性。整包新空目录恢复后送入对账，子集显式映射冲突、暂存后再发布，遇中断回退此次提交。区分可恢复资料、缺失附件、待重授权；包括复制到同机的新 Vault。Git 不自动同步邮件缓存、发送状态或认证。 |

恢复入口先识别 Huhu 包类型和当前版本，再校验范围、大小、哈希、归属和引用。其他类型在预检结束并保全目标。新格式携带的文件以受管对象定位；发送中且无法确定结果的操作恢复为 unknown，草稿和已发事实保持原状态。Web 文件流由 #6 提供。

<a id="hosts"></a>

## 两端阅读界面

桌面锁定 Electron 44.9.1，对应 Chromium 152.0.7977.167；Web 按 Baseline Widely available。已 search/retrieve HTML 净化和表单指南。指南列出 Sanitizer API 从 Chrome 146 可用，Web 仍属 Limited availability。推荐特性检测后采用原生安全接口或成熟 DOMPurify 回退，同一份邮件元素/属性与 URL 策略覆盖两条路径。在内容接触可联网的 DOM 以前剥离远端资源地址、CSS URL、表单和活动内容；受控渲染无 Node/preload 权限。单封资源放行只给经策略检查的资源，原文查看也受同一边界。未来用网络请求记录和两端实际运行验证。桌面已有 pickOpenPath/pickSavePath；当前 preload 没有通用 openExternal，main 的 setWindowOpenHandler 拒绝新窗口。为用户主动打开的安全外链和 OAuth 系统浏览器流程补窄宿主能力，限定协议与来源。Web 经宿主抽象独立启动。[Electron 44.9.1](https://releases.electronjs.org/release/v44.9.1)

<a id="open"></a>

## 待决定的产品选择

> 2026-11-21 用户采纳本表全部推荐项，定案见[批次决定](../../../../changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md)。


下列建议尚待用户选择。协议和存储事实由实施者采证。新格式数据范围见[规格](spec.md)。

| 问题与前置条件 | 选项及建议 | 阻塞范围 |
| --- | --- | --- |
| Huhu 新格式 Mail 子集恢复到已有同地址账号时如何解决冲突？ | 建议预检列出双方，默认跳过，允许显式保留为独立账号。可选逐项映射，但需定义消息、附件及投递事实的合并规则。任一路径均不覆盖既有本机认证。 | 仅 S6b 的同地址提交；空目标恢复和无冲突验证可先行。 |
| 是否追加 Graph 专属授权以覆盖默认 Outlook 账号？先核对 Huhu 应用登记、可申请 scope、测试租户。 | 推荐先保留 Outlook IMAP 完整闭环，已有合适 Graph token 的路径按能力验证。增加独立 Graph consent 可扩大 API 覆盖，需承担双受众 token 的授权、撤销及恢复成本。 | S4 新授权体验；现有 scope 判断、IMAP 回退和 Gmail 独立。 |
