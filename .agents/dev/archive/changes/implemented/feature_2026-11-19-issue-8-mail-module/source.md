# GitHub Issue #8 [邮件模块完整复刻] 以 one-mail 为基线新增 Mail 插件：多邮箱、联系人对话、写信与同步、AI/备份及统一能力

- 原报告 — https://github.com/NAMEWTA/huhu/issues/8
- GitHub 对象 ID — I_kwDOVmq61M8AAAABf4025w
- 状态 — OPEN
- 作者 — NAMEWTA
- 创建时间 — 2026-11-17T01:35:18Z
- 更新时间 — 2026-11-17T06:36:47Z
- 标签 — 

## 正文

# 目标

以 **[zhihui-hu/one-mail][U-REPO] 的实际源码、可达界面和业务规则**为复刻基线，在 Huhu 中新增独立的 **`mail` /「邮件」插件**，完整迁移多邮箱账号管理、按联系人与公开参与者聚合的邮件对话、搜索定位、正文阅读、写信与回复、草稿和发件箱、同步、邮件设置、可选只读 AI 助手及本地备份/迁入能力。

**先复制可复用实现和交互，再做 Huhu 宿主必需的适配。** 保留 one-mail 的操作含义、信息层级、焦点流转和状态反馈；使用 Huhu 的外壳、主题、插件生命周期、Dispatcher 及 Vault；邮箱认证由 Mail 自己管理，按 #9 不接入个人保险箱。不能只模仿截图重画一个普通邮件列表，也不能把另一个独立桌面应用嵌进来充当插件。

本文是本次源码研究形成的**实施 Issue**。以下目标接口、文件落点、修复项与验收项均为待实施要求；本次没有修改产品代码，也没有把静态审查写成真实邮箱联调或桌面点测已通过。

## 0. 固定基线、规范与关联工作

调查日期：**2026-11-17（UTC+8）**。

| 对象 | 固定基线 | 用途 |
| --- | --- | --- |
| Huhu | [`913264045cee1818497a37a57715c664aa85a1ae`][H-COMMIT]，根版本 `0.0.1-rc.4` | 现有实现、工程约束及插件接入基准 |
| one-mail | [`d1be24d5bb83c2da7123b167f119d5abd169b0af`][U-COMMIT] | 复制源、交互和业务规则基准；不能以浮动 main 代替来源锁定 |
| 上游总览 | [README][U-README]、[依赖清单][U-PACKAGE] | 说明产品意图；与源码冲突时按源码事实记录，不能照抄已过期描述 |

实施前必读：

- [CLAUDE.md 的复用优先原则][H-RULES]；[开发资料导航][H-DEV]与[长期知识索引][H-NOTES]。
- 现行[工作台架构约束][H-WORKBENCH]、[设计系统规范][H-DESIGN]及[UI/事件刷新陷阱][H-UI-PITFALLS]。
- 仓库内 [dev-workflow][H-WORKFLOW]、[dev-spec][H-SPEC]、[dev-plan][H-PLAN]；规格与实施记录放 `.agents/dev/changes/<实施日期>-one-mail-plugin/`，不放进技能目录。
- 归档中的旧规格仅作历史依据；例如旧 Tailwind 方案已被现行 Radix 薄封装与分层 CSS 取代，不能用旧文档覆盖当前代码。

关联 **[#6：统一工具与 Web 入口重构][H-ISSUE6]**：邮件所有用户级操作需要进入同一公共能力目录，按用户选择向 MCP、CLI、通用 API 开放。#6 目前是待实施目标，不能假称完整静态目录、统一批量设置、Web 上传下载已经存在。邮件业务可先开发；外部能力完整性与 Web 联动验收应与 #6 的实际接口对齐。无需等待 SSH、Agent CLI 等其他重构才能开发邮件领域。

## 1. 强制复用顺序与已完成的检查

严格按用户指定的顺序评估：

1. **Huhu 当前已有实现。** 已核对插件注册、贡献式 UI、Dispatcher、MCP/CLI、Vault、通知、查询失效、备份和样式规范，具体复用点见第 5 节。Safe/SecretUse 是旧实现事实，按 #9 不作为 Mail 的运行依赖。
2. **`temp/sources` 中的成熟实现。** 当前 Git 树没有该目录，且 [`.gitignore`][H-GITIGNORE] 忽略 `temp/`；这只能说明远端无法核验，不能断言用户本地没有。实施第一步必须检查本地已有来源，记录项目、提交和采用/未采用原因；已有 one-mail 时先核对其版本，再按固定基线补齐。
3. **现有成熟开源依赖或框架。** 优先复用 Huhu 的 React、Radix、TanStack Query/Table/Virtual、Zod、DOMPurify、SQLite/FTS、fflate 等；协议层评估 ImapFlow、Nodemailer、MailParser；富文本写信优先迁移 one-mail 已采用的 Tiptap。
4. **GitHub 上的优秀项目。** 本次主复刻源已经明确为 one-mail；不另挑一个邮箱产品替换其交互。
5. **基于成熟方案的小范围适配。** 包括 Tauri 调用替换、样式映射、凭据接入、数据落点和已确认的业务断点修复。
6. **确无合适实现时才自研。** 必须留下已检查对象、缺口、选择理由和最小新增范围，不能跳过前五步直接设计新底座。

**禁止新增第二套插件加载器、服务发现、邮件专属 MCP Server、独立 HTTP Server、全局事件总线、跨模块密码库、全局应用数据库、通用任务队列或通用 Agent 框架。** 同时不能为了“复用”直接跨插件 import 私有实现，或者把尚不存在的 `api.service('scheduler')`、`api.backup` 当成已有设施。

## 2. 复刻范围：按当前可达代码定义

### 2.1 产品范围

| 功能 | one-mail 当前实际行为 | Huhu 交付要求 | 主要来源 |
| --- | --- | --- | --- |
| 多账号 | 全部账号、提供商分组、折叠、未读与异常状态、刷新、编辑、删除 | 完整迁移账号流程和状态，账号数据按 Vault 隔离 | [账号栏][U-ACCOUNTS]、[添加账号][U-ADD] |
| 主工作区 | 账号栏 → 联系人/多人参与者列表 → 对话流 | 保留信息层级、可调整分栏、窄屏返回与焦点逻辑 | [工作区][U-WORKSPACE]、[联系人列表][U-CONTACTS] |
| 会话聚合 | 合并收件缓存与本机已发；按公开参与者归组 | 原规则移植，包含去重、自己地址排除、Bcc 隔离 | [聚合实现][U-CONVERSATIONS] |
| 搜索与时间过滤 | 主界面全部/今天/昨天/近三天，默认今天；跨账号本地搜索和定位 | 保留实际筛选与搜索语义，接入 Huhu 快捷键和命令入口 | [会话状态][U-CONVERSATION-HOOK]、[搜索][U-SEARCH] |
| 阅读 | 视口按需加载、失败重试、长文/引用/签名折叠、原文、远程图片策略 | 完整阅读闭环，修复 API ID 到正文加载的断点 | [正文组件][U-CONTENT]、[HTML][U-HTML]、[正文后端][U-BODY] |
| 写信与回复 | 右下非模态富文本浮层、扩大/还原、发件账号、To/Cc/Bcc、本地附件；内联回复/回复全部/新话题 | 复刻两种写信入口及其语义，不用纯文本框替代成熟编辑器 | [写信窗口][U-COMPOSER]、[对话区][U-PANE] |
| 转发 | 后端和 TS 草稿生成已有，当前主 UI 未找到可达入口 | 复用已有生成逻辑，补齐转发入口与调用连接 | [TS 适配表][U-API]、[草稿后端][U-COMPOSE-ENGINE] |
| 草稿/发件箱 | 本地草稿、发送状态、继续编辑、失败重试、删除本地记录 | 保留行为，补稳定发送身份与 unknown 结果处理 | [发件箱][U-OUTBOX]、[SMTP][U-SMTP] |
| 同步 | IMAP、Gmail history、Graph delta 尝试/回退，IDLE、周期校准、进度和错误 | 移植实际同步策略，接入 Huhu 生命周期；如实显示所用路径和回退原因 | [同步路由][U-SYNC]、[后台][U-BACKGROUND] |
| AI | 用户主动触发的只读聊天、邮件总结、待办提取、回复起草 | 保留为可选邮件助手，AI Key 由 Mail 自己管理；不自动操作邮箱 | [AI 实现][U-AI] |
| 本地备份/迁入 | `.onemail` SQLite 快照及旧 `.sqlite`/`.sql` 导入 | 保留用户能力，适配 Vault 备份和 Mail 自有认证资料；旧格式只作转换输入 | [原生备份][U-BACKUP]、[Huhu 数据包][H-PACKAGE] |

### 2.2 必须公开记录的上游缺口

以下不是理由不做复刻，而是防止将“文档声称/字段存在”误写成“可以直接复制的成品功能”：

- **接收附件下载尚未完成**；当前可见附件主要是名称列表，后端保存元数据。基线必须保留附件展示；若本轮追加下载，应明确列为额外闭环增强并补实现、引用和验收，不能放一个不可用的下载按钮。[U-CONTENT] [U-ORIGINAL]
- **收件邮件删除、归档、移动、星标没有找到完整主 API/UI 链路**；草稿和发件箱本地记录删除已经存在，两者不能混淆。[U-API]
- **WebDAV/S3 远端备份方法直接返回未迁移错误**，不迁入假开关或假成功。[U-SETTINGS]
- **本地草稿不等于服务端 Drafts，同步所得 Sent 不等于本机 sent 记录**；没有证据证明 SMTP 成功后已完整 APPEND 到远端 Sent。[U-COMPOSE-ENGINE] [U-SMTP]
- **README 的 IMAP 已读未回写、同步间隔未接入、主 UI 未读/星标/7 天筛选描述已不能作为当前事实**；实际代码见第 4、6 节。
- **全局 `externalImagesBlocked` 设置当前没有被正文渲染消费**；正文模式切换和单封图片放行已生效。不能把一个已保存字段当成已完成的隐私策略开关。[U-CONTENT] [U-ORIGINAL]
- 缓存时间窗口、开机启动、自动更新等不能凭设置字段认定生效；只迁移已接线的邮件行为。宿主级启动/更新/语言/主题由 Huhu 管理，不在 mail 中建立第二套。

本 Issue 的“完整复刻”以本节的真实功能集及必要适配为边界；不暗中扩展为 Exchange EWS、POP3、日历、通讯录、群发平台、企业邮件服务器或完整规则引擎。

## 3. 邮箱适配清单与授权流程

### 3.1 全量迁移 18 个提供商预设 + 自定义

下表来自固定提交的 [`account-form-types.ts`][U-PROVIDERS]，是**源码预设清单**，并不表示本次已用每家真实账号验证。实施时一并迁移相应中文提示、授权说明链接、凭据名称、默认值和可编辑规则。

| 提供商 | 默认凭据方式 | IMAP 默认值 | SMTP 默认值 |
| --- | --- | --- | --- |
| Gmail | Google OAuth；高级选项为应用密码 | `imap.gmail.com:993` TLS | `smtp.gmail.com:465` TLS |
| Yahoo | 应用密码 | `imap.mail.yahoo.com:993` TLS | `smtp.mail.yahoo.com:465` TLS |
| 阿里邮箱 | 客户端专用密码 | `imap.aliyun.com:993` TLS | `smtp.aliyun.com:465` TLS |
| 阿里企业邮箱 | 密码/企业客户端专用密码 | `imap.qiye.aliyun.com:993` TLS | `smtp.qiye.aliyun.com:465` TLS |
| 189 | 密码 | `imap.189.cn:993` TLS | `smtp.189.cn:465` TLS |
| 搜狐 | 独立密码 | `imap.sohu.com:993` TLS | `smtp.sohu.com:465` TLS |
| QQ / Foxmail | 授权码 | `imap.qq.com:993` TLS | `smtp.qq.com:465` TLS |
| 腾讯企业邮 | 密码/客户端专用密码 | `imap.exmail.qq.com:993` TLS | `smtp.exmail.qq.com:465` TLS |
| 网易 163 | 授权码 | `imap.163.com:993` TLS | `smtp.163.com:465` TLS |
| Outlook / Hotmail | Microsoft OAuth | `outlook.office365.com:993` TLS | `smtp.office365.com:587` STARTTLS |
| 新浪 | 授权码 | `imap.sina.com:993` TLS | `smtp.sina.com:465` TLS |
| 139 | 客户端密码 | `imap.139.com:993` TLS | `smtp.139.com:465` TLS |
| 21CN | 密码 | `imap.21cn.com:993` TLS | `smtp.21cn.com:465` TLS |
| 完美邮箱 | 专用密码 | `imap.88.com:993` TLS | `smtp.88.com:465` TLS |
| iCloud | 应用专用密码 | `imap.mail.me.com:993` TLS | `smtp.mail.me.com:587` STARTTLS |
| AOL | 应用密码 | `imap.aol.com:993` TLS | `smtp.aol.com:465` TLS |
| Yandex | 应用密码 | `imap.yandex.com:993` TLS | `smtp.yandex.com:465` TLS |
| Mail.ru | 应用专用密码 | `imap.mail.ru:993` TLS | `smtp.mail.ru:465` TLS |
| 自定义 IMAP/SMTP | 用户配置凭据 | 自定义主机、端口、TLS/STARTTLS/none | 可关闭发送；否则自定义主机、端口、安全模式 |

补充规则：

- 完美邮箱的 `111.com`、`email.cn` 主机切换按原 `resolveProviderPreset` 迁移。
- `provider-metadata.ts` 将 `126/yeah` 归为网易图标类别，不代表服务器预设已自动适配这些域名。通过自定义服务器接入；若扩展自动识别，必须作为明确补充并验证，不能凭图标映射宣称支持。[U-PROVIDER-META]
- 预设并非强制覆盖用户配置。编辑自定义主机、端口、SMTP 开关及安全模式后，不应被重新选中账号悄悄重置。
- 保留上游支持的安全模式；默认使用预设 TLS/STARTTLS，none 是显式配置项，不得在连接失败时静默降级或关闭证书校验。
- 提供商预设建立一份规范数据源供表单和 Engine 校验消费，避免 UI 与后端各维护一套不同的邮箱列表。

### 3.2 添加、编辑与修复账号

复刻「选择提供商 → 填邮箱/账号标签/凭据 → OAuth 或连接测试 → 选择可同步目录 → 保存 → 初次同步」；同时覆盖编辑、重新授权、错误修复和删除。[U-ADD] [U-FOLDERS] [U-ACCOUNTS]

- 非 OAuth：允许发现 IMAP 文件夹，`INBOX` 必选；不可 SELECT 的服务器节点不可选择。更改账号、凭据、主机、端口、安全模式后，失效旧发现结果和在途请求。
- OAuth：保持系统默认浏览器授权、PKCE、state 校验、取消/超时、账号一致性校验、refresh token 更新及失败后重授权路径。原 UI 没有同样的文件夹选择器，不能做出“可选但无效”的表单。
- OAuth 会话明确授权浏览器和回调监听所在主机。桌面沿用 Engine 本机回环授权；CLI/MCP 返回可查询状态和实际完成方式。LAN Web 不能把 Engine 的 localhost 当作调用设备的 localhost；对齐 #6 提供真实可完成的路径，或明确引导在 Engine 本机完成本次授权，不能只返回一个跨设备失效的回调 URL，也不为此另建 OAuth 网关。
- Huhu 使用自己的 Google/Microsoft 客户端配置及回调注册；Client ID 可放非秘密配置，客户端秘密及 token 由 Mail 自己管理并加密保存。不得把上游默认 Microsoft 应用身份当作 Huhu 永久身份，或者承诺未配置 Client ID 即可完成 Gmail OAuth。[U-OAUTH-PROVIDER]
- 客户端身份未配置、用户拒绝、授权邮箱不符、令牌失效、服务商关闭 IMAP/SMTP、连接超时、文件夹不可用分别反馈真实原因，保留可修复入口。
- 删除本地账号前说明将清理哪些配置/缓存/本地草稿和发件记录；不删除服务商账号或远端邮件；仅清理此 Mail 账号专属、已无引用的本地认证资料，不操作用户个人 Safe 条目或其他邮箱账号凭据。

## 4. 必须复刻的交互与用户故事

### M-01：进入邮件工作区与切换账号

左侧保留「全部账号」和按提供商折叠的账号组；选择账号自动展开所属组。账号行保留图标、名称、未读数、同步/异常状态，未读数 hover 后变刷新入口，同步中显示旋转反馈；右键提供刷新、修复/重试、编辑、删除。全部账号不能出现不适用的编辑/删除。[U-ACCOUNTS]

账号栏与内容区保持可调整分栏，上游账号栏默认 260px、最小 220px；在 Huhu 窄窗内应合理收缩并保留返回路径，不出现不可操作的横向挤压。通过工作台贡献模块承载，不能再套一个 OneMail 桌面标题栏和顶级应用导航。[U-WORKSPACE]

### M-02：按人/公开参与者查看往来

中栏展示头像、参与者、未读角标、最后消息摘要和相对时间；保留邮箱复制的 hover/键盘焦点入口、列表分页及窄屏选择后的返回行为。[U-CONTACTS]

复刻聚合函数的语义，而非只画相似 UI：[U-CONVERSATIONS]

1. 合并远端邮件本地副本与本机已发记录；排除删除/隐藏/草稿及 trash/junk/drafts 文件夹。
2. 使用账号与 RFC822 Message-ID 去重；同一封跨文件夹邮件和本机 sent 可补全参与者信息。不同账号的邮件不能仅按 Message-ID 粗暴合并。
3. 将 From/To/Cc 规范化，排除自己已配置的所有邮箱，按公开参与者集合生成个人或多人会话。
4. **Bcc 只作为私有投递信息，不进入公开会话参与者、标题或回复全部收件人。** 仅 Bcc 的本机发件可从发件箱查看。
5. 先完成本地历史聚合再分页，不能先截取少量邮件导致联系人排序或会话历史缺失；可用索引增量维护等价结果，不能为照抄实现而每次全量扫描造成卡顿。

### M-03：时间筛选、跨账号搜索和消息定位

主时间筛选保持**全部/今天/昨天/近三天，默认今天**。时间边界使用 Huhu 当前时区与日期组件，不另设邮件专属全局时区。[U-CONTACTS] [U-CONVERSATION-HOOK] [H-WORKBENCH]

搜索覆盖本地缓存的主题、发件人/参与者、摘要与已缓存正文，区分缓存范围和远端完整邮箱。保留 250ms 防抖、分页、上下键、回车、Esc、搜索结果高亮及账号来源；不受当前单账号过滤限制。[U-SEARCH]

选择结果后切换其账号、清空阻碍定位的筛选、切到全部时间，滚到指定消息居中并短暂高亮。邮件模块内的 `Cmd/Ctrl+K` 必须与 Huhu 命令系统协作：由现有快捷键/命令入口分派，不能重复注册全局监听导致两个弹窗一起打开。通知定位复用同一目标模型。[U-CONVERSATION-HOOK] [U-PANE]

### M-04：阅读正文、原文与已读状态

- 普通进入会话定位最新消息；历史消息按时间正序显示并区分收/发方向；离开底部显示返回最新按钮。
- 正文进入视口才按需加载，保留 skeleton、失败重试、默认长文折叠、引用/签名折叠及原文查看。只有正文可用且用户实际看到相应消息时，触发该封邮件的已读更新。
- 纯文本/HTML 正文显示模式切换，以及原文查看、正文转换保留成熟处理逻辑；外部链接经 Huhu 宿主外链能力打开。
- HTML 默认拦截远程图片和外部资源，允许对当前邮件显式加载，不能一次放行导致其他邮件同时请求外部资源。
- 已读需明确 `remoteSynced`。IMAP 远端确认失败不能静默报成功；Gmail/Graph 当前本地覆盖行为必须明确显示，不能伪称已回写服务商。[U-CONTENT] [U-HTML] [U-READ]

### M-05：内联回复、回复全部、新话题与转发

复刻对话底部内联回复及右键引用回复。右键菜单关闭后焦点进入输入框；展示实际发件账号、To/Cc、回复目标。**内联回复沿原邮件所属账号；新话题和富文本写信允许选择发件账号。** 多人会话默认 reply_all，排除自己地址并去重；保留 Reply-To、In-Reply-To、References 的业务语义。[U-PANE] [U-COMPOSE-ENGINE]

「新话题」不沿用旧回复链；「转发」复用上游草稿生成函数和正文处理，并补足目前缺失的主 UI 入口。转发/回复的附件行为按真实内容来源明确展示，不能因为有附件名就假装附件已被携带。

### M-06：富文本写信、附件、关闭保存与发送

保留右下非模态浮层、扩大/还原、发件账号、To、多地址输入、按需展开 Cc/Bcc、主题、富文本工具栏、链接、本地附件选择/去重/移除、保存草稿和丢弃。关闭有内容窗口应保存草稿；保存失败保留内容并反馈，不能关闭后丢稿。[U-COMPOSER]

Huhu 的 Markdown 编辑器不能直接代替邮件富文本编辑器；优先迁移上游 Tiptap 配置及发送 HTML/纯文本生成规则，只替换 UI 外壳、主题和宿主调用。[U-PACKAGE] [H-EDITOR-PACKAGE]

发送使用明确选中的账号与收件人；无 SMTP 配置的接收专用账号可阅读但不能误显示可发送。附件文件失效、超限、鉴权失败或部分收件人拒收要显示真实状态，不能无声丢附件或把未投递写成 sent。

### M-07：草稿和发件箱

保留列表/详情、打开刷新、选中项恢复、草稿继续编辑、发送中/已发送/失败、失败说明、重试及删除本地记录。补充第 8 节规定的 `unknown`，恢复应用后不得自动重复发送。[U-OUTBOX] [U-SMTP]

### M-08：可选 AI、邮件设置与备份入口

保留邮件总结、提取待办、起草回复及自由对话。AI 默认关闭、用户主动选择邮件内容并发起；明确向配置服务发送哪些内容。模型输出是文字或待用户采用的草稿，不能调用邮件工具、发送/删除或修改状态。邮件正文作为不可信内容处理，不能改变助手权限。[U-AI]

复刻 OpenAI-compatible Chat Completions 接入与连接验证：远端服务使用 HTTPS 和 API Key；localhost/loopback 可用 HTTP 且不携带 Key。AI 配置归 Mail 自己所有，API Key 按第 5.3 节保存；连接测试与原错误反馈完整，不为邮件新增通用 Agent 或跨模块凭据服务。外部 Agent 通过授权 `mail.*` 操作，与该只读邮件助手是不同调用场景。[U-AI]

设置放入 Huhu 插件设置贡献，保留已生效的同步周期、纯文本/HTML正文模式、单封邮件远程图片放行、AI连接与数据管理。上游全局远程内容开关目前未接入渲染；若在 Huhu 保留该开关，必须接通并验证明确的作用范围，否则不展示无效开关。Huhu 当前没有的全局语言切换/自动更新不在 mail 内重建；WebDAV/S3 未实现项不作为可操作功能。备份和旧数据迁入按第 9 节处理。

## 5. Huhu 架构接入与最小改动边界

### 5.1 插件身份与已有基础

新增 `plugins/mail`，包名 `@huhu/plugin-mail`，manifest id 为 `mail`，显示名称为「邮件」。现有 `inbox` 保持「快速捕获 → 任务/笔记/档案」语义，两者并存。[H-INBOX]

| 层 | 必须复用 | 待增加/适配 |
| --- | --- | --- |
| 插件生命周期 | PluginManager/Cordis、`ctx.effect` | manifest、`apply`、启停和取消；停用释放连接/timer/订阅 |
| 注册与发现 | Engine boot 的 `plugins.register` | mail manifest 与 engine 入口登记；不另写扫描加载器 |
| 模块/设置/命令 | ContributionRegistry | `ui/index.tsx` 贡献 mail 页面、设置、命令；首页卡片仅在本次有明确用途时增加 |
| 内部互用 | `api.provide/service/call` | 邮件公共服务或能力；不访问其他插件私有文件 |
| UI/API/MCP/CLI | `defineCapability` + Dispatcher + 现有适配器 | 统一 `mail.*` schema/handler、权限分组、说明和输出 |
| UI 数据刷新 | 现有 EngineClient、TanStack Query、事件失效 | mail 实体与事件映射，Vault ID 隔离和停用清理 |
| 凭据 | 成熟本机加密机制与已有配置/原子写基础 | Mail 自有账号认证、OAuth 刷新及 AI Key 保存，见 5.3；不调用 Safe 服务 |
| 持久化 | Vault 路径守卫、原子写、`vault.stateDir` | mail 配置、持久草稿/发件记录、独立可清缓存 |
| 通知 | NotificationStore 注入模式 | 新邮件通知；精准定位需补类型化 target，现成只有模块级目标 |
| UI 与样式 | `@huhu/ui`、主题 token、CSS layers | 邮件业务样式及少量缺失交互，沿用 `mail-` 前缀 |
| 备份 | `vault.exportPackage/importPackage`、fflate、校验机制 | 邮件子集适配/旧 one-mail 导入；不自造通用备份平台 |

对应当前代码：插件生命周期 [H-PLUGIN]、服务门面 [H-CONTEXT]、能力定义 [H-CAPABILITY]、调度执行 [H-DISPATCH]、贡献注册 [H-CONTRIBUTIONS]、Engine 注册 [H-BOOT]、Renderer 登记 [H-RENDERER]、权限表 [H-PERMISSIONS]、查询失效 [H-QUERY]、MCP [H-MCP]。

### 5.2 后端选择：复制业务规则，复用现有运行环境与协议库

默认采用 **Huhu 现有 Engine/TypeScript + 成熟邮件协议依赖**：

- 直接迁移 one-mail 的 TS 类型、预设、纯函数、React 业务组件及成熟交互逻辑。
- IMAP 优先 [ImapFlow][D-IMAP]；SMTP/MIME 发送优先 [Nodemailer][D-SMTP]；接收 MIME 解析优先 [MailParser][D-MIME]。选定版本及许可写入 lockfile 和来源记录，不能手写 IMAP/SMTP/MIME 解析器。
- Rust 里的增量同步、会话分组、回复、错误分类等按原函数逐项适配，记录原路径→新路径→语义保持/修复项。跨语言移植应如实称为适配，不宣称“全部原样复制”。

这不是根据技术偏好重写：上游邮件核心直接依赖 `AppState/db::open`、Tauri AppHandle/command/event、应用数据目录与独立密钥体系，尚不是可直接引入的独立 crate。[U-STATE] [U-TRANSPORT] [U-OAUTH] [U-BACKGROUND]

实施 S0 可用小型验证比较「剥离 Rust 核心」与上述路线的实际适配量。如果保留 Rust 能显著减少改动，且可复用 Huhu 现有原生进程交付模式、服从 Mail 凭据归属及 Vault 边界、无需第二宿主体系，允许选择 Rust；先记录证据、接口与三平台打包代价。不能在未检查成熟依赖前先造 Rust worker/RPC 基础设施，也不能只为保留语言而连同 Tauri 应用整体引入。

### 5.3 Mail 自有账号认证：不依赖个人保险箱

**2026-11-17 按 #9 调整：Safe 只保存网站/APP 的个人登录资料；Mail 在添加/编辑账号、OAuth 授权/刷新和邮件 AI 设置中直接维护自己的认证资料。** 不为 Mail 扩展 `secretUse` 的写接口、不使用 `safe://` / `allowedModules`、不声明 `mail -> safe` 硬依赖、不订阅 Safe 锁定/解锁恢复连接。

- 由统一的 Mail 账号/认证 handler 承接桌面/Web/MCP/CLI 创建、更新、测试连接和删除。非 OAuth 直接填邮箱密码或应用专用密码；OAuth 的首次授权、refresh token 轮换及失效后的重授权都归 Mail，不能只让 UI 能写凭据。
- 使用 #9 确定的轻量本机加密方案与成熟实现，按邮箱/用途隔离 Mail 内部记录。非秘密配置和需持久化的密码/token/AI Key 分开；普通账号/设置查询只给已配置状态、认证方式与有效错误，不返回明文。不建立公共凭据注册中心、额外邮件主密码或插件授权矩阵。
- 省略密码/Key 的更新表示保留，显式替换与清空含义明确；新账号或更新失败需保留原有效资料并清理本次无主记录。OAuth 刷新使用同一账号服务的串行/原子写边界，保存新 token 成功再发布状态，不能把认证更新藏在缓存或直接跨插件写文件。
- Safe 未初始化、锁定或停用不影响 Mail；Mail 自身停用、切换 Vault、用户删除账号、认证失效和本机加密钥匙不可用才按各自真实状态停止或暂停相应网络操作。已缓存邮件与可写 Vault 中的本地草稿仍可用，不能因认证失效删除草稿。
- 在途 SMTP 被中断时保留已知结果或 unknown，不直接当作可自动重试的失败。释放连接和可清理的秘密引用，避免无限缓存失效 token；JavaScript 字符串不承诺物理零化。
- 备份/导出和新设备恢复按第 9 节说明是否需重新授权；不把本机保护的密文与裸密钥一起同步到 Git。Safe 中用户主动记录的邮箱网站登录账号，与 Mail 实际协议认证资料是两个独立用途，不自动互相更新或删除。

### 5.4 UI 与宿主差异必须显式适配

- one-mail 的 Tauri 新账号窗口、`window.api/invoke/listen` 改为 Huhu 已有对话框/页面、能力调用与事件订阅；步骤和反馈保留。Huhu 单实例/单 Vault/单 Engine 原则不变。
- 一般控件复用现有 Dialog、Popover、DataTable、Combobox、ChoiceSwitch/Segmented、DateTimePicker。账号/联系人与对话流保留业务布局，不能为了统一控件强制改成数据表；真正表格用 Huhu DataTable。
- 使用 Huhu 四套主题及明暗模式；不引入 Tailwind、next-themes 或第二套全局 reset。插件 CSS 位于 `plugins/mail/src/ui/`，层序遵守 `theme,tokens,base,vendor,components,shell,modules`；第三方 Tiptap 必要样式按现有规范收敛，禁止大量无层覆盖。
- 日期、状态颜色、焦点、减少动效、密度、响应式行为服从现行设计规范；不能改变 one-mail 操作含义来减少实现量。
- 分栏偏好按 Vault/插件保存；业务数据不另塞全局 localStorage。现有 Huhu 明确有意不做的应用级功能，不借邮件迁移重新引入。
- 上游托盘的写信、全部同步、邮件设置和打开邮件工作区映射 Huhu 既有命令入口；显示/隐藏主窗口、退出、单实例和系统托盘生命周期归 Huhu 宿主，不创建第二托盘应用。[U-BACKGROUND]

## 6. 同步、远端身份与已读语义

### 6.1 分离三类消息标识，修复 API 正文断点

静态核对发现：上游 Gmail/Graph 把原生字符串 ID 散列成 i64 `uid`；正文加载却统一转 u32 并走 IMAP UID FETCH。API ID 既可能转换失败，也可能误指向另一条 IMAP UID，不能按原样复制。[U-GMAIL] [U-GRAPH] [U-BODY] [U-TRANSPORT]

目标至少区分：本地稳定消息 ID、`source/transport`、提供商原生字符串 ID、IMAP 的 account/folder/UIDVALIDITY/UID、RFC822 Message-ID。后者用于邮件关联，不取代协议定位。

- Gmail/Graph 同步所得消息按对应 API 读取正文和 MIME/附件元数据。
- IMAP 按账号、文件夹、UIDVALIDITY、UID 定位；UIDVALIDITY 改变时只重建受影响文件夹的可重建缓存和游标，不误删本地草稿/已发记录。
- 保留 Gmail history/Graph delta 游标、分页与失效后的重新对账；不得将散列 UID 当可逆提供商 ID。
- 正文解析采用成熟 MIME 库；保留编码、多部件、Reply-To、引用链与原文来源。

### 6.2 Gmail/Outlook 路径不能写成不加条件的承诺

按上游同步路由保留 API 优先尝试、错误分类和 IMAP 回退；可重试故障不能不加判断就切换 transport 并重建身份。[U-SYNC]

Microsoft 默认 OAuth 申请 Outlook IMAP/SMTP scope；Graph 检查要求 Graph audience 与 Mail.Read/ReadBasic。因此 **Outlook OAuth 成功不等于 Graph 可用**。必须返回/展示实际 `syncPath`、fallback 原因；如本轮补 Graph 授权，明确是新增适配，分别管理所需 token audience/scope，不能拿同一错误 audience token 到处重试。[U-OAUTH-PROVIDER] [U-GRAPH]

上游接受 `Mail.ReadBasic` 仅表示元信息路径可能可用；该权限不包含正文、正文预览和附件。完整阅读须验证 `Mail.Read` 等足够授权；不足时返回具体受限项和修复入口，不能把元信息同步当成完整 Graph 验收。既有 Outlook IMAP fallback 可作为默认完整路径。[D-GRAPH-PERMISSIONS]

### 6.3 复刻真实 IMAP 同步和后台策略

- 初始最近 200 封是初扫/补偿窗口，不是本地缓存永远只能 200 封；后续按 `last_uid`、远端标记及 reconciliation 更新。历史未同步范围必须可见，不声称已经拥有远端全部邮件。[U-IMAP]
- 保留必选 Inbox 与用户选定目录、同账号防重入、多账号有限并发、IDLE 与周期校准、重连/退避、手动刷新及进度。
- 同步周期当前代码已读取 `sync_interval_minutes`，不能沿用 README 的“未实现”描述；改设置后应实际影响调度。[U-BACKGROUND]
- 接入 Huhu `ctx.effect`、AbortSignal 和事件系统；不把版本插件私有 AutoSync 直接 import 成邮件调度器，不建立新的通用队列平台。
- 账号删除、切换 Vault、插件停用、应用关闭时停止任务和连接；旧任务晚到结果不能写进新账号/新 Vault。首次导入历史避免发成千上万条“新邮件”通知。

### 6.4 已读语义保留并诚实反馈

上游现有 IMAP 流程为：检查 UIDVALIDITY → STORE Seen 标记 → FETCH FLAGS 验证 → 提交本地状态；在途同步通过 read-state override 防止回滚。Gmail/Graph 游标路径当前只更新本地并返回 `remoteSynced:false`。[U-READ]

本轮至少保持以上能力与反馈；API 远端写回如追加实现，必须按各提供商授权与接口独立验证，不能只把返回值改为 true。批量/可见消息标读不得因搜索预加载而将所有未读消息消掉。

## 7. 数据归属、缓存和文件边界

以下为拟新增落点，实施时复核 Huhu 文件 API 和实际权限后落地；统一从 `api.vault.stateDir` 派生，禁止手拼 `<root>/.huhu`。[H-WORKBENCH] [H-WRITE]

| 数据 | 建议位置/归属 | 生命周期 |
| --- | --- | --- |
| 非秘密账号、文件夹选择、邮件偏好 | `<stateDir>/mail/` 的版本化 JSON | 按 Vault 持久化，原子写；仅关联 Mail 私有认证记录，不保存明文密码/token 或 `safe://` |
| 邮箱密码、OAuth refresh/access token、AI Key | Mail 自有认证资料 | Mail 负责创建、更新、刷新和删除；需持久化的值按第 5.3 节加密，备份按第 9 节明确可恢复边界 |
| 本地草稿、已发记录、发送操作、仅本地状态覆盖 | `<stateDir>/mail/` 持久领域文件 | 不可重建；清缓存、重建索引、重新同步不能删除 |
| 草稿引用的附件快照/受管理文件 | mail 持久附件目录 | 与草稿/发送记录关联；明确引用计数或清理条件，不依赖随时失效的用户绝对路径 |
| 远端邮件头、正文、附件缓存与搜索投影 | `<stateDir>/cache/mail/` | 可重建，空间限制、按账号清理；不能包含唯一草稿副本 |
| 同步游标、连接状态、临时下载 | mail 运行态/缓存中明确分类 | 游标与对应缓存同代失效；本机运行状态不跨设备直接恢复为活动连接 |
| 来源锁定与差异说明 | `plugins/mail/UPSTREAM.md`、`docs/upstream/ledger.md` | 随代码版本维护 |

邮件外部事实来自服务商，用户本地草稿/已发记录来自持久文件；SQLite 只承担可重建缓存/索引，不照搬独立应用数据库作为全部唯一真源。复用 Huhu 已采用的 `node:sqlite`/FTS 技术或评估过的成熟索引实现；现有 VaultIndex 面向 Markdown，不能假称它已自动索引邮件，也不默认把所有邮件写成笔记。

只读 Vault 下应通过已有 Vault 文件入口或必要的只读存储适配读取原 Vault 中的持久 mail 数据和现有缓存，不能把临时 `stateDir` 当成历史数据库。临时路径仅用于可丢状态；不得将发送、账号修改、草稿保存等操作悄悄落到其中并宣称永久保存。使用现有 `api.vault.files.readOnly`，在 Engine/能力 handler 与后台入口拒绝持久写入、远端发送/标记修改及导入提交，并在 UI 明确原因；不能只禁按钮而让 CLI/MCP 或自动标读绕过。按需远端读取和临时缓存的允许范围单独明确，不混入持久证据。

### 7.1 附件与 HTML

当前 Engine JSON RPC 请求上限为 **8 MiB**；`vault.readBinary` 的最多 10 MiB base64 预览也不是大文件通道。[H-INGRESS] [H-BINARY]

- 本地添加附件复用现有系统选文件能力，邮件业务仍经 Dispatcher。保存对话框目前有 ZIP 过滤器硬编码，涉及邮件文件保存时只做必要的参数泛化。[H-DESKTOP]
- 外部能力使用 attachmentId、受 Vault 路径守卫的相对路径或限定用途的上传句柄，不能原样开放任意宿主 `localPath` 读写。
- 如 #6 Web/外部附件需要流式传输，在现有共享 HTTP 服务增加受鉴权、大小限制、取消和相应 capability 权限约束的最小通道；不新起文件服务，不把大附件 base64 塞进 RPC。
- 保留原 HTML 的资源阻断与单封放行交互；优先复用 Huhu 已有 DOMPurify 依赖并适配邮件策略。MIME 解析不等于 HTML 净化；消息内容不可访问 Node、preload、应用 DOM 或内部认证信息。覆盖危险协议、事件属性、CSS URL、表单、iframe、内联资源和路径穿越用例。[U-HTML] [H-EDITOR-PACKAGE] [D-MIME]
- 接收附件元数据不是实际本地附件；没有下载实现时只显示事实，不生成虚假的成功文件路径。

## 8. 发送事务与统一公共能力

### 8.1 SMTP 外部副作用

复用 Dispatcher 已有幂等、取消和 unknown 处理，并在 mail 领域补稳定的发送操作身份：同一草稿 revision/发送操作从 UI、CLI、MCP 同时触发只能有一个活动发送。RFC822 Message-ID 保持稳定，但不能把它当作 SMTP 服务端保证去重的证明。[H-DISPATCH] [H-IDEMPOTENCY] [U-SMTP]

状态至少区分 `draft / sending / sent / failed / unknown`；实际名称可统一，但语义不能丢。

- SMTP 明确接受才可记 sent；明确未发送失败才允许常规重试。
- 部分收件人明确接受、部分拒绝时，持久化 accepted/rejected 等逐收件人结果，以 partial 或等价结构表达；不能标为整体未发送。重试只针对确认未接受的范围并记录新尝试，避免重复提交给已接受收件人。
- 服务器可能已接受而回执丢失、进程崩溃或本地 sent 落盘失败时，记录 unknown、已知事实和操作 ID，提供查询/人工处理；不得自动重发。
- 恢复应用或导入备份后，sending/unknown 不自动变成待发队列；用户重试应知道潜在重复投递。
- 重试复用原草稿和业务身份；修改收件人/正文后形成新 revision，不能用旧幂等结果掩盖新内容。
- OAuth 刷新仅对适合的认证失败重试；不能把一次可能已接受的 SMTP 提交当认证重试再发一遍。

### 8.2 能力目录：同一业务 handler 服务全部入口

以 [one-mail `desktop-api.ts`][U-API] 为原 API 语义索引，逐项登记到 Huhu。下列名称是**建议目标契约**，不是声称当前已有；实施可调整命名，但不能遗漏已承诺的用户操作。

| 能力组 | 建议覆盖 | 关键约束 |
| --- | --- | --- |
| `mail.accounts.*` | list/get/create/update/remove、连接验证、discoverFolders、重新授权 | 普通输出不含秘密；删除含明确本地清理范围 |
| `mail.oauth.*` | begin/status/cancel、授权回调的内部完成处理 | 返回可跟进的授权会话；回调验 state/PKCE，不提供可伪造的任意 complete 工具 |
| `mail.conversations.*` | list/messages/findMessage/search | 账号、时间、分页、公开参与者和定位信息完整 |
| `mail.messages.*` | stats/get/loadBody/setReadState | native ID/transport 正确，返回本地与远端状态 |
| `mail.compose.*` | createReplyDraft/createForwardDraft、saveDraft、send | 草稿 revision、To/Cc/Bcc、引用链与发送操作身份 |
| `mail.outbox.*` | list/get/edit/retry/delete/status | 本地记录语义、失败与 unknown 可查询 |
| `mail.attachments.*` | 草稿附件的登记/移除、接收附件元数据 | 真实文件引用与边界；下载能力仅在完整实现后加入 |
| `mail.sync.*` | startAll/startAccount/status，受控取消 | 无重复同步、结果可观察，不把长任务一直挂在普通 RPC 超时内 |
| `mail.settings.*` | get/update、缓存统计及明确范围的清理 | 持久数据不可清；设置实际生效 |
| `mail.import.*` / 邮件备份适配 | 格式预检、转换导入、进度/结果、邮件子集导出恢复 | 复用宿主数据包基础，来源格式与目标格式区分 |
| `mail.ai.*` | getSettings/verifyAndSave/clear/chat | 只读助手；AI 配置及秘密由 Mail 自管，普通设置读取脱敏，内容主动发送 |

能力定义需有插件归属、真实读写/执行分类、用途说明、输入输出 schema、错误/恢复信息、取消及副作用语义。`loadBody` 可做缓存读取和按需远端读取，但**不得隐式将邮件标已读**；UI 另调 setReadState。读取目录与调用结果中不泄露 token、密码或 Bcc 到公开参与者。

UI 使用现有 EngineClient/查询缓存；CLI 复用 `huhu call <capability>`；MCP 由现有适配器生成。用户级邮件发送/账号管理不能被硬编码永久仅桌面可用；是否对外开放由统一工具配置决定，而非 mail 再建一张白名单。OAuth 用户同意、文件选择与协议业务分开，MCP/CLI 可发起并查询授权流程，不伪称能够替用户静默授权。[H-MCP] [H-ISSUE6]

新增 mail 权限组和 schema 时更新真正的权限表/注册点，不能只写 manifest。插件停用后 UI 贡献和运行 handler 不可用；#6 完成后静态目录和用户选择保留。邮件新增实体发事件的同时更新 `ENTITY_CAPS`，防止“后端改了，列表不刷新”。[H-PERMISSIONS] [H-QUERY]

## 9. 备份、旧数据迁入与 Git 同步

### 9.1 复用现成数据包，不误称现成支持邮件子集

Huhu 已有 `vault.exportPackage` / `vault.importPackage`，基于 fflate、`huhu-package.json`、路径/大小/SHA 校验及暂存目录完成。**当前导入恢复到新空目录，不能原地覆盖现有 Vault；当前实现也没有邮件子集模式。**[H-PACKAGE-CAPS] [H-PACKAGE]

邮件设置保留数据导出/恢复入口：

- 整 Vault 备份直接复用现有能力和数据与存储页面。
- 仅邮件备份/恢复复用现有压缩、manifest、哈希、路径守卫和暂存完成机制，增加有边界的邮件子集适配；不得把不兼容的 Huhu 数据包命名为 `.onemail`，并声称可直接由原应用恢复。
- 受管草稿、本地已发记录、发送事务及草稿附件必须可恢复；远端缓存和运行连接按明确策略排除/重建。
- 现有数据包逐文件读取和 SHA 校验不等于邮件业务事务快照。导出时利用邮件自身写入串行边界、暂停相关变更或建立稳定副本，确保账号/草稿/附件引用/发送状态属于一致版本；验证引用完整性。备份不承诺远端邮箱快照，恢复仍须对账，不能仅凭 ZIP 可解压宣称完整。
- 邮件普通备份/配置导出不包含明文 token、密码或本机加密钥匙。按 #9 选择的本机加密保存方案明确凭据能否跨设备恢复；默认在新设备要求重新授权/填写密码并显示待绑定状态，不将无法解密的本机密文声称为可用认证。邮件账号、草稿和其他持久资料可独立恢复，不以个人 Safe 的原主密码为前提；如另有用户主动选择的加密凭据导出，必须明确其保护和恢复方式，不直接复制裸密钥。

当前导出排除 `.huhu/runtime/`、`.huhu/cache/`、`.huhu/ui/`、`.huhu/history/`，但**没有排除 `.huhu/mail`**；`includeAttachments:false` 对 `.huhu` 内受管数据也不能想当然生效。实施需明确邮件附件和缓存的收集规则并验证；整 Vault 导出也须取得上述一致的邮件领域快照，不仅新增目录后就声称“符合备份规范”。[H-PACKAGE]

### 9.2 one-mail 原生格式是转换输入

保留从 `.onemail`、兼容 OneMail `.sqlite`、旧 `.sql` 迁入的用户路径，复用上游格式识别、结构/版本/完整性检查及迁移规则。采用预检→显示账号和数据范围/冲突→暂存转换→提交结果的流程；不覆盖现有 Vault，不执行任意 SQL，不将外部备份变成任意文件写入入口。[U-BACKUP] [U-BACKUP-MOD]

- 账号 ID、文件夹 ID、消息 ID、草稿及附件引用建立映射；同地址账号冲突由明确导入策略解决，不静默合并不同认证身份。
- 上游草稿附件备份可能只有原机器 filePath 和元数据，没有附件字节。预检列出可恢复、缺失、待重新绑定的附件；不得按不可信备份里的绝对路径自动读取宿主文件。缺失项保留提示，经用户重新选择或受控目录定位后迁入受管目录，不能宣称恢复 SQLite 就恢复了全部附件。[U-COMPOSE-ENGINE] [U-BACKUP]
- 来源密码/OAuth 数据只有在用户授权且能够按来源机制解开时，才经 Mail 自有认证 handler 重新加密保存；缺失、损坏或不可迁移的凭据标记需要重新授权。失败清理本次暂存/新建数据，不能破坏已有账号资料，不写入个人 Safe。
- 来源原生备份包含明文恢复密钥元数据，不能当作完整加密容器照搬；不得把主密钥写入新备份文件名或邮件明文配置。[U-BACKUP]
- 迁入的本机 sent/草稿/本地覆盖不能放入可清缓存；发送中或结果未知的记录不自动发送。
- 即使远端邮件已不存在，用户选择保留的导入历史也要明确其持久归属，不能把仅存于旧备份的唯一内容当作“随时可从服务器重建”。

### 9.3 Git 同步与邮件协议同步分开

Huhu 当前 `.huhu` Git 同步采用白名单，尚没有 mail；**不是新增文件就自动同步**。[H-GIT-SYNC]

本轮默认不把邮件正文缓存、草稿附件、发送事务、OAuth 游标和机器运行状态加入 Git 自动同步。账号非秘密配置/本地草稿未来如需跨设备同步，须通过现有 versioning 明确选择、冲突及账户绑定语义，不能暗中扩大白名单或造成另一设备重复发送。备份恢复与 Git 自动同步不是同一个开关。

## 10. 源文件 → Huhu 目标映射与出处要求

下表目标路径为拟新增/修改位置，具体拆文件可按实施粒度调整。**每一组复制都必须保留来源、固定 commit、原路径、目标路径、原许可证、修改说明和验证入口。** 除总台账外，在 `plugins/mail/UPSTREAM.md` 保存可追溯差异；不能只写“参考 one-mail”。

| one-mail 来源 | 迁移内容 | Huhu 拟落点/方式 |
| --- | --- | --- |
| [account-form-types.ts][U-PROVIDERS]、[provider-metadata.ts][U-PROVIDER-META] | 18+1 预设、提示、图标归类、域名规则 | `plugins/mail/src/shared/providers.ts`；一份配置源，必要校验适配 |
| [account-list.tsx][U-ACCOUNTS]、[add-account-dialog.tsx][U-ADD]、[imap-folder-selector.tsx][U-FOLDERS] | 账号管理、连接/目录发现、修复流程 | `plugins/mail/src/ui/accounts/`；业务逻辑复制，控件/调用替换 |
| [mailbox-workspace-view.tsx][U-WORKSPACE] | 内部分栏与工作区组织 | `plugins/mail/src/ui/MailModule.tsx` 及子组件；复用 Huhu 外壳 |
| [conversation-workspace][U-CONTACTS]、[use-conversations][U-CONVERSATION-HOOK]、[conversation-pane][U-PANE] | 联系人、会话、分页、焦点、内联回复 | `plugins/mail/src/ui/conversations/`；保留状态语义 |
| [global-search-dialog.tsx][U-SEARCH] | 跨账号搜索、键盘与精确定位 | `plugins/mail/src/ui/search/`；接入宿主命令与查询 |
| [conversation-message-content][U-CONTENT]、[mail-html.ts][U-HTML]、[original-message-view][U-ORIGINAL] | 懒加载、折叠、正文/原文、资源阻断 | `plugins/mail/src/ui/message/`；复用 DOMPurify并保留策略 |
| [mail-composer][U-COMPOSER]、[use-mail-composer][U-COMPOSER-HOOK]、[outbox-panel][U-OUTBOX] | 富文本浮层、草稿、发件箱、转发生成接线 | `plugins/mail/src/ui/compose/`、`outbox/`；保留 Tiptap成熟用法 |
| [desktop-api.ts][U-API]、[shared types][U-TYPES] | 原业务 API 语义与 TS 类型 | `plugins/mail/src/shared/`、`src/engine/index.ts`；替换 Tauri bridge，不保留第二总线 |
| [conversations.rs][U-CONVERSATIONS]、[compose.rs][U-COMPOSE-ENGINE] | 聚合、去重、参与者、回复链和草稿规则 | `plugins/mail/src/engine/conversations/`、`compose/`；逐函数适配并做语义验证 |
| [sync/mod.rs][U-SYNC]、[imap.rs][U-IMAP]、[gmail_api.rs][U-GMAIL]、[graph_api.rs][U-GRAPH] | 增量同步、API路由、错误及游标 | `plugins/mail/src/engine/sync/`、`providers/`；成熟库承接协议，修复原生 ID |
| [transport][U-TRANSPORT]、[body][U-BODY]、[smtp][U-SMTP] | 连接、MIME解析、正文读取与发送 | `plugins/mail/src/engine/providers/`、`messages/`、`send/`；不自写协议 |
| [oauth][U-OAUTH]、[provider.rs][U-OAUTH-PROVIDER] | OAuth流程、PKCE、刷新、重授权 | `plugins/mail/src/engine/oauth/`；应用身份改Huhu，凭据归Mail自有管理 |
| [background.rs][U-BACKGROUND] | IDLE、周期同步、状态事件、通知 | `plugins/mail/src/engine/sync/`；挂接Huhu生命周期和通知 |
| [AI][U-AI] | 主动触发、只读分析、连接验证与错误 | `plugins/mail/src/engine/ai/`、`ui/ai/`；不复制全局Agent/keyring |
| [backup][U-BACKUP]、[backup/mod.rs][U-BACKUP-MOD] | 旧格式识别、数据检查、转换与进度 | `plugins/mail/src/engine/import/`、`backup/`；复用Huhu数据包基础 |
| [settings.rs][U-SETTINGS] | 实际生效邮件偏好 | mail设置贡献；移除未接线占位，不复制全局设置系统 |

Huhu 必要修改点：`apps/engine/src/boot.ts`、`apps/desktop/src/renderer/main.tsx`、相关 package/workspace exports、`packages/kernel/src/permissions.ts`、`packages/workbench/src/engine-client/query.ts`、Mail 私有认证保存与生命周期、需要的宿主文件对话框参数和共享传输/数据包适配。其他核心改动必须对应本 Issue 的实际消费者与证据，不能顺带整体重构。

## 11. 许可证与分发来源记录

one-mail 固定提交的 [README 许可证段][U-LICENSE] 声明 **AGPL-3.0-only**；本次完整目录树未发现独立 LICENSE/COPYING 文件，package/Cargo 清单未提供独立 license 字段。Huhu 当前根 package 声明 **GPL-3.0-or-later**。[H-PACKAGE-ROOT]

这不能被写成 MIT 复制，也不能把适配后的上游代码简单重标为 Huhu GPL。GPLv3/AGPLv3 对组合有明确条款；应保留各自适用的声明，并落实组合分发及适用网络交互的对应源码提供要求，尤其与 #6 的 Web/MCP 交付对齐。[D-AGPL] [D-GPL]

实施 S0 完成来源与许可记录：

- 保存上游许可声明、适用条文、作者/文件版权信息和固定 commit，不虚构上游存在的 LICENSE 文件。
- 更新 `docs/upstream/ledger.md`、`THIRD_PARTY_NOTICES.md` 和 `plugins/mail/UPSTREAM.md`；复制/翻译适配仍记录来源，不能认为改语言/样式就消除出处要求。
- 核对依赖、提供商图标和品牌素材各自的许可/使用范围；产品名称为 Huhu 邮件，提供商图标只作身份说明。
- 对实际组合和发布制品明确许可标识、源码范围及可访问入口。不能仅把代码放入插件目录就假设义务被隔离，也不在未明确组合方式时机械改写全仓已有版权。

## 12. 实施切片与依赖

一次最终整合交付可以包含多次提交/PR；每个切片交付一个可验证的用户行为，文档和失败路径随该切片完成。不得把“底层完成、UI以后补”标成完整复刻。

| 切片 | 可见交付 | 真实依赖 | 完成证据 |
| --- | --- | --- | --- |
| S0 来源与适配定案 | 核验 temp/sources、锁定源、逐文件映射、许可与TS/Rust适配决策、当前交互基线 | 无；本地来源核验为实施前置 | 来源/差异表、必要小验证结论、截图计划，不伪称产品完成 |
| S1 首个真实IMAP闭环 | 启用mail→添加账号并保存Mail认证→目录发现→同步→读取正文→写信→发件记录 | S0 | 可控IMAP/SMTP环境和一个真实授权账号记录；重启保留草稿 |
| S2 联系人/多人对话与搜索 | 完整三段布局、聚合、分页、筛选、跨账号搜索定位、内联回复、富文本浮层与转发入口 | S1稳定的领域契约；UI可用固定数据并行制作，最终接真实handler | 对照one-mail截图和操作录像、Bcc/跨账号/焦点语义验证 |
| S3 Gmail完整链路 | Google授权、刷新/API或IMAP、正文按正确ID加载、回复发送、状态说明 | S1；与S4可并行 | 自有Client ID与真实测试账号联调记录；失败/取消路径 |
| S4 Microsoft完整链路 | Outlook授权、scope/audience判断、IMAP回退与可用Graph路径、正文/发送 | S1；与S3可并行 | 实际transport及回退证据；不能用OAuth成功替代Graph验证 |
| S5 后台同步与生命周期 | IDLE/周期校准/退避/通知；Mail停用、认证失效、切Vault、离线恢复 | S1；结合S3/S4整合各provider | 无残留连接/重复通知/跨Vault写入；间隔设置实际生效 |
| S6 数据迁入、备份与恢复 | one-mail旧数据迁入、邮件子集/整Vault备份入口、草稿附件与unknown恢复 | S1持久模型；S2用于核对迁入会话 | 格式/冲突/损坏/路径/回滚验证；恢复后不重复发信 |
| S7 可选邮件AI与设置 | 连接测试、只读助手、内容选择、Mail自有密钥配置、实际设置与错误 | S1，阅读UI契约 | 主动调用证据；未启用不传邮件；无工具写入权限 |
| S8 统一外部能力 | mail全部用户操作通过相同handler由CLI/MCP/API选择开放，附件边界一致 | 各对应业务切片；#6实际接口是完整外部验收的前置 | 能力覆盖表、关闭/开启/停用验证、UI/CLI/MCP同结果 |
| S9 最终整合 | 三平台构建/主路径、主题与响应式、来源文档和实际限制全部对齐 | S1–S8 | 代码/行为/交互/来源四方面验收；真实账号未验证项逐项列明 |

并行时给 accounts/credentials、sync/provider、UI、backup/import 等范围指定唯一写入者；公共 schema、ID模型、事件和发送状态先统一，避免各实现者分别造模型。计划不要求额外建立复杂任务平台或新的 CI 工作流。

## 13. 验收与关闭条件

### 功能与交互

- [ ] 独立 mail 插件可启停，现有 inbox 语义与功能不被替换。
- [ ] 18个提供商预设及自定义配置全部迁移；别名/图标与真实服务器支持边界写清。
- [ ] 添加、编辑、目录发现、OAuth取消/重授权、异常账号修复和删除形成完整路径。
- [ ] 账号分组/折叠/hover刷新/右键、联系人与多人会话、筛选、分页、窄屏返回保留上游操作逻辑。
- [ ] 收件+本机sent合并、跨目录去重、自己地址排除、Bcc隐私、公开参与者归组按原语义验证。
- [ ] 搜索跨账号且能定位具体消息；快捷键不与宿主竞争，右键引用回复后焦点正确。
- [ ] 正文视口加载、失败重试、折叠/原文、纯文本/HTML模式切换及单封远程图片控制可用；全局开关如保留已真实接线，不会预加载就把整箱标读。
- [ ] 内联回复/回复全部/新话题、富文本浮层、发件账号、Cc/Bcc、附件、草稿关闭保存、丢弃、发件箱完整可用。
- [ ] 转发原逻辑通过真实UI入口可达；没有将未实现的远端删除、云备份或附件下载伪装成成品。

### 协议、数据与副作用

- [ ] IMAP、Gmail API、可用Graph路径分别验证“同步→正确正文→回复/发送”；不可用路径明确回退/限制，不以散列UID冒充远端定位。
- [ ] UIDVALIDITY改变、游标失效、分页、初扫窗口、远端删除/标记对账不会串消息或误删本地持久数据。
- [ ] IMAP已读回写有服务器确认；API仅本地状态时明确反馈，刷新不会无声覆盖用户操作。
- [ ] 同账号同步不重入，离线/超时/认证错误有可恢复状态；修改间隔实际影响后台任务。
- [ ] 重复点击、UI/MCP/CLI并发、SMTP回执丢失、进程重启和本地提交失败不会无提示重复发送；unknown可查询。
- [ ] 密码/token/AI Key由Mail自管并加密保存，OAuth刷新正确更新，普通查询/日志不返回秘密；Safe未初始化/锁定/停用不影响邮件认证与同步，Mail停用/认证失效/本机密钥不可用的状态分别明确。
- [ ] 清缓存/重建搜索不删草稿、已发本地记录、仅本地覆盖、导入唯一历史或发送事务；只读Vault不假保存。
- [ ] 附件受大小/路径/归属限制；大数据不突破JSON RPC限制，外部能力不能任意读取宿主文件。
- [ ] 邮件HTML无应用权限，恶意内容、远程图片、CSS资源和危险URL用例验证通过。
- [ ] one-mail导入与Huhu恢复分别验证，账号冲突/损坏/取消可回退；恢复后不自动发送；备份不明文携带秘密和恢复主密钥。
- [ ] 插件停用/切Vault后连接、任务、订阅清理，晚到结果不污染新Vault；通知和查询能正确定位/刷新。

### 工程、来源与验证证据

- [ ] 所有用户级邮件能力有对应UI/CLI/MCP/API覆盖表；与#6接口一致，无第二权限表/服务/事件总线。
- [ ] 使用Huhu现行主题、token、CSS层及命名；所有主题明暗模式、窄屏、键盘、焦点和减少动效核对。
- [ ] `pnpm lint`、`pnpm typecheck`、相关 Vitest/Playwright、实际打包所需现有检查通过；按真实风险增加有意义验证，不照抄上游测试工具链或堆砌实现镜像测试。
- [ ] 直接迁移上游有价值的业务样例/断言；协议集成用可控测试服务，真实邮箱矩阵记录环境、日期、账号类型、认证方式、实际同步路径、通过/受限/未测状态，凭据不进入证据。
- [ ] 三平台至少有构建/安装冒烟与明确的真实UI验证记录；未取得的真实账号/平台证据列明，不能用mock或静态分析替代“已验证”。
- [ ] 对照截图/录像覆盖账号添加、主界面、单人/多人、搜索定位、长文/原文、写信/转发、草稿/失败、OAuth错误、备份恢复和AI；允许主题不同，不允许核心交互被简化。
- [ ] `UPSTREAM.md`、来源台账、NOTICE、许可与对应源码入口、使用说明、账号配置/限制、公共能力说明、数据目录和恢复说明全部同步。

**关闭本 Issue 的条件：**约定功能集已经在 Huhu 真实插件内接通，必要适配和已知断点有证据验证，来源可以精确追溯；不能以创建目录、菜单、静态页面、能力名称或通过类型检查替代完成。

## 14. 引用索引

正文链接均对应上述固定提交。实施时若更新基线，须同步更新差异、映射与验证证据，不只修改仓库首页链接。Huhu 已有[复制来源台账][H-LEDGER]是新增来源的正式归属。

[H-COMMIT]: https://github.com/NAMEWTA/huhu/commit/913264045cee1818497a37a57715c664aa85a1ae
[U-COMMIT]: https://github.com/zhihui-hu/one-mail/commit/d1be24d5bb83c2da7123b167f119d5abd169b0af
[U-REPO]: https://github.com/zhihui-hu/one-mail
[H-ISSUE6]: https://github.com/NAMEWTA/huhu/issues/6
[H-RULES]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/CLAUDE.md
[H-DEV]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/AGENTS.md
[H-NOTES]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/index.md
[H-WORKBENCH]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/context/workbench.md
[H-DESIGN]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/context/design-system.md
[H-UI-PITFALLS]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/dev/notes/errors/electron-e2e-and-ui-pitfalls.md
[H-WORKFLOW]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/skills/dev-workflow/SKILL.md
[H-SPEC]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/skills/dev-spec/SKILL.md
[H-PLAN]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.agents/skills/dev-plan/SKILL.md
[H-GITIGNORE]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/.gitignore
[H-INBOX]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/inbox/huhu-plugin.json
[H-PLUGIN]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/plugin-manager.ts#L64-L128
[H-CONTEXT]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/context.ts#L47-L107
[H-CAPABILITY]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/capabilities/define.ts#L11-L68
[H-DISPATCH]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/dispatcher.ts
[H-CONTRIBUTIONS]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/contributions.ts
[H-BOOT]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/engine/src/boot.ts
[H-RENDERER]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/src/renderer/main.tsx
[H-PERMISSIONS]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/permissions.ts
[H-QUERY]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/engine-client/query.ts#L7-L31
[H-MCP]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/mcp.ts
[H-WRITE]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/vault/src/write.ts
[H-INGRESS]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/server/ingress.ts#L1-L3
[H-BINARY]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/capabilities/vault.ts#L159-L172
[H-DESKTOP]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/src/main/index.ts
[H-IDEMPOTENCY]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/idempotency.ts
[H-PACKAGE-CAPS]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/capabilities/package.ts#L51-L95
[H-PACKAGE]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/vault/src/package/package.ts
[H-GIT-SYNC]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/versioning/src/engine/sync.ts#L55-L83
[H-PACKAGE-ROOT]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/package.json
[H-EDITOR-PACKAGE]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/editor/package.json
[H-LEDGER]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/docs/upstream/ledger.md
[U-README]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/README.md
[U-PACKAGE]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/package.json
[U-ACCOUNTS]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/account/account-list.tsx
[U-ADD]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/account/add-account-dialog.tsx
[U-FOLDERS]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/account/imap-folder-selector.tsx
[U-WORKSPACE]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/features/mailbox/mailbox-workspace/mailbox-workspace-view.tsx#L98-L160
[U-CONTACTS]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/conversations/conversation-workspace/index.tsx
[U-CONVERSATION-HOOK]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/conversations/use-conversations.ts
[U-PANE]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/conversations/conversation-workspace/conversation-pane.tsx
[U-SEARCH]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/conversations/conversation-workspace/global-search-dialog.tsx
[U-CONVERSATIONS]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/commands/data/conversations.rs#L259-L386
[U-CONTENT]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/conversations/conversation-message-content.tsx
[U-ORIGINAL]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/conversations/conversation-workspace/original-message-view.tsx
[U-HTML]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/mail/mail-html.ts
[U-COMPOSER]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/mail/mail-composer/index.tsx
[U-COMPOSER-HOOK]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/features/mailbox/use-mail-composer.ts
[U-OUTBOX]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/mail/outbox-panel.tsx
[U-COMPOSE-ENGINE]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/commands/data/compose.rs
[U-API]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/lib/desktop-api.ts#L39-L129
[U-TYPES]: https://github.com/zhihui-hu/one-mail/tree/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/shared/types
[U-PROVIDERS]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/components/account/account-form-types.ts#L48-L489
[U-PROVIDER-META]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src/shared/provider-metadata.ts
[U-SYNC]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/mod.rs
[U-IMAP]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/imap.rs
[U-GMAIL]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/gmail_api.rs
[U-GRAPH]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/sync/graph_api.rs
[U-BODY]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/body/mod.rs#L49-L120
[U-READ]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/commands/data/messages/mod.rs#L123-L221
[U-TRANSPORT]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/transport/mod.rs
[U-SMTP]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/mail/smtp.rs
[U-OAUTH]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/oauth/mod.rs
[U-OAUTH-PROVIDER]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/oauth/provider.rs
[U-BACKGROUND]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/background.rs
[U-STATE]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/state/mod.rs
[U-AI]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/ai/mod.rs
[U-BACKUP]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/commands/backup/native.rs
[U-BACKUP-MOD]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/commands/backup/mod.rs
[U-SETTINGS]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/src-tauri/src/commands/data/settings.rs
[U-LICENSE]: https://github.com/zhihui-hu/one-mail/blob/d1be24d5bb83c2da7123b167f119d5abd169b0af/README.md#L221-L225
[D-IMAP]: https://imapflow.com/docs/
[D-SMTP]: https://nodemailer.com/smtp
[D-MIME]: https://nodemailer.com/extras/mailparser
[D-AGPL]: https://www.gnu.org/licenses/agpl-3.0.html#section13
[D-GPL]: https://www.gnu.org/licenses/gpl-3.0.html#section13
[D-GRAPH-PERMISSIONS]: https://learn.microsoft.com/en-us/graph/permissions-reference#mailreadbasic

## 评论

无评论。
