# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t2r
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t2r/report01.md
- 接续终端 — t2t。holder_lost 后按原任务登记及报告路径接续。
- 执行结果 — blocked

## 结论

Mail 逐项开放及工作台一次性批准已提交为候选 `f3e764e80f4f6e4de3a77bdb87120584060345cc`。目录共 53 项，48 项可逐项开放，5 项保持关闭，默认均关闭。工作台可核对和批准原邮件选区。外部工具消费批准时复验逻辑主体、账户、来源和设置。域回执保留安全结果引用或状态。

限并发全仓类型检查、格式检查、Knip 和 3 项离线测试通过。本环境禁止回环监听，双入口、桌面/Web 浏览器验收和全量测试仍缺最终运行证据。完整 lint 的同步子进程调用也被标记为 EPERM。

## 产物与改动

- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-g6-mail`。原 HEAD 与候选直接父均为 `eaa5545ad27524b55eaf9f22db37c39561b0b64f`。
- 候选 — `f3e764e80f4f6e4de3a77bdb87120584060345cc`。通过临时索引写入，已核对业务文件与候选索引一致。证据随候选树收录，当前工作树的 `.agents` 只读。分支由 Lead 验收后接收候选。
- 证据 — `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/verification/G-mail-exposure-linux.md`。
- 装配 — `apps/engine/src/boot.ts` 的 Mail 静态声明改为 `registry.declareDescriptors("mail", mail.mailCapabilityDescriptors)`。其余装配沿用原 Mail 注册调用。`plugins/mail/src/engine/registration.ts` 聚合下表的全部 53 个描述符，注册函数绑定同一组对象。
- 其他源变动位于 `plugins/mail/**`。清单补登记既有的 `mail.sync.status`、`mail.sync.settings`、`mail.sync.setInterval`、`mail.notifications.target` 与 3 个工作台批准能力。未推送。

## 逐 ID 结果

`开 / 否` 表示可逐项开放、初始默认关闭。`闭 / 否` 表示保持关闭。双入口用例名为「Mail 逐项默认关、开放、撤销、领域重交及 AI 一次性批准（CLI／HTTP MCP）」，文件为 `plugins/mail/test/tool-exposure.test.ts`。候选已编译该用例，恢复终端的回环限制使两条入口尚未跑到业务断言。逐项“检查”描述用例覆盖点。

| ID | exposable / defaultExposed | scope / risk | 意图、对象校验及双入口检查 |
| --- | --- | --- | --- |
| `mail.accounts.list` | 开 / 否 | read / high | 无。读 Vault 可见账号与认证状态。待移除详情仅桌面管理。查空目录及重启后账号与修订。 |
| `mail.accounts.previewRemoval` | 开 / 否 | read / high | 无。原账号修订、草稿/投递/缓存影响与 impactKey。查回环和业务写入计数为零。 |
| `mail.accounts.remove` | 开 / 否 | write / high | 账号、修订、impactKey 和删除墓碑。查同一移除重交只产生一次清理。 |
| `mail.accounts.testConnection` | 开 / 否 | execute / high | 领域 requestId。目标、凭据、账号修订固定，setupId 绑定主体。查并发一次 LOGIN 和重启过期。 |
| `mail.accounts.save` | 开 / 否 | admin / high | setupId 和目录集合，修复固定账号修订。查并发一次保存、同令牌另一会话拒绝。 |
| `mail.accounts.cancelSetup` | 开 / 否 | write / normal | setupId。仅释放本人会话，保护已开始保存。查并发及重交。 |
| `mail.accounts.rename` | 开 / 否 | write / normal | 账号和 expectedRevision。查原标签改动和稳定修订回执。 |
| `mail.ai.getSettings` | 开 / 否 | read / normal | 无。读取规范化 URL、模型、设置修订及 Key 状态。查合成 Key 范围内零网络调用。 |
| `mail.ai.verifyConnection` | 闭 / 否 | execute / high | 无。t19「ai-settings.ts」verifyConnection 行将带候选 Key 与目标地址的操作保留桌面秘密编辑。 |
| `mail.ai.saveSettings` | 闭 / 否 | admin / high | 无。t19「ai-settings.ts」saveSettings 行将保存、替换和清除 Key 保留桌面。 |
| `mail.ai.prepare` | 开 / 否 | write / normal | 领域 requestId。固定主体、邮件缓存摘要、账号/设置修订、选区、问题和目的地。查待确认与并发零发送。 |
| `mail.ai.chat` | 开 / 否 | execute / high | 领域 approvalId。工作台签发、主体校验、一次性消费、发送前重校验和状态投影。查自报确认、跨会话、撤销、取消、换设置和并发。 |
| `mail.ai.approvals.review` | 闭 / 否 | read / high | 无。按 11-21 定案与 t19「Mail AI 的确认与待定事项」，可信桌面/Web 读取当前待确认项。 |
| `mail.ai.approvals.approve` | 闭 / 否 | write / high | 同一批准项和展示摘要。按 11-21 定案由可信工作台批准一次。 |
| `mail.ai.approvals.cancel` | 闭 / 否 | write / normal | 同一批准项和展示摘要。按 11-21 定案由可信工作台拒绝。 |
| `mail.conversations.list` | 开 / 否 | read / high | 无。先过滤可见账号、目录和公开参与者，再聚合分页。查密送地址不进入对话。 |
| `mail.conversations.messages` | 开 / 否 | read / high | 无。按账号、窗口和对话身份读公开原邮件。 |
| `mail.conversations.search` | 开 / 否 | read / high | 无。仅扫描公开缓存。外部搜索保持现有内存索引状态。 |
| `mail.conversations.findMessage` | 开 / 否 | read / high | 无。IMAP UIDVALIDITY／UID、Gmail nativeId 或原已发操作位置。 |
| `mail.conversations.sentBody` | 开 / 否 | read / high | 无。账号与可见的已发 operationId。查原已发正文。 |
| `mail.conversations.loadBody` | 开 / 否 | read / high | 无。校验账号、公开目录、源邮件和缓存代次。 |
| `mail.outbox.submit` | 开 / 否 | execute / high | draftId 与草稿修订推导 operationId，原 SMTP 冻结快照。查 lost DATA ack、一次投递和重启。 |
| `mail.outbox.status` | 开 / 否 | read / high | 无。当前可见账号与 operationId，返回本地记录版本。查未知状态与可重试列表。 |
| `mail.outbox.list` | 开 / 否 | read / high | 无。当前可见账号的本机投递记录。 |
| `mail.outbox.retry` | 开 / 否 | execute / high | 由父 operationId、修订和已证明未投递的收件人集合推导。查未知拒绝、明确拒收仅发一次。 |
| `mail.outbox.deleteLocal` | 开 / 否 | write / high | operationId、原本地记录版本及墓碑。查重交、保留防重证据和零 SMTP。 |
| `mail.drafts.list` | 开 / 否 | read / high | 无。Vault 可见草稿的摘要。 |
| `mail.drafts.get` | 开 / 否 | read / high | 无。指定草稿与其附件引用。 |
| `mail.drafts.save` | 开 / 否 | write / normal | 草稿 ID 和 expectedRevision，原来源固定，回执只留草稿修订。查并发创建只保留一个草稿。 |
| `mail.drafts.discard` | 开 / 否 | write / high | 草稿 ID 和 expectedRevision，草稿墓碑保留。查并发与重启。 |
| `mail.drafts.removeAttachment` | 开 / 否 | write / high | 草稿 ID、expectedRevision、已挂接的附件摘要。查并发和重启读取同一修订。 |
| `mail.sync.refresh` | 开 / 否 | execute / high | 领域 requestId，原账号/选中目录与修订、缓存作业。查并发与重交不拨号。 |
| `mail.sync.status` | 开 / 否 | read / normal | 无。读取原邮箱所选目录的已有状态。 |
| `mail.sync.settings` | 开 / 否 | read / normal | 无。读取周期、现有状态及配置版本。 |
| `mail.sync.setInterval` | 开 / 否 | admin / normal | 原配置版本、一次写入和调度代次。查并发与重启状态。 |
| `mail.messages.latest` | 开 / 否 | read / high | 无。按当前已选账号/目录缓存读取。 |
| `mail.messages.loadSource` | 开 / 否 | read / high | 无。明确的账号、目录和本地消息身份，缓存缺失返回 needs-refresh。 |
| `mail.messages.prepareReply` | 开 / 否 | read / high | 无。从原缓存、公开收件人和自有地址生成回复种子。查 Bcc 不进入回复。 |
| `mail.messages.prepareForward` | 开 / 否 | read / high | 无。固定缓存来源和附件摘要。返回转发草稿种子。 |
| `mail.messages.prepareNewTopic` | 开 / 否 | read / high | 无。仅提取缓存的公开参与者。 |
| `mail.messages.loadBody` | 开 / 否 | read / high | 无。解析原缓存正文，缺失返回 needs-refresh。 |
| `mail.messages.markRead` | 开 / 否 | write / high | 领域 requestId、账号修订、缓存的 UIDVALIDITY/UID。查本地与远端状态、一个 IMAP STORE 及重启。 |
| `mail.cache.usage` | 开 / 否 | read / normal | 无。读取可重建缓存与范围版本，供清理预检。 |
| `mail.cache.clear` | 开 / 否 | write / high | 领域 requestId、显式确认与范围版本。查并发、重启、原投递记录和草稿可回读。 |
| `mail.notifications.target` | 开 / 否 | read / high | 无。通知标识绑定 Vault、账号与原 Inbox 消息。 |
| `mail.subset.create` | 开 / 否 | read / high | 无。仅当前 Vault 所选邮箱，内存成包并限制字节。 |
| `mail.subset.preview` | 开 / 否 | write / high | 领域 requestId 和包摘要，短期预检按主体限额和隔离。查并发与过期。 |
| `mail.subset.cancel` | 开 / 否 | write / normal | previewId。本人尚未提交的计划。查并发、可安全重交。 |
| `mail.subset.restore` | 开 / 否 | write / high | previewId、选中邮箱集合和同一个包。按原目标和冲突表复核，原恢复日志与归属保持一致。 |
| `mail.oauth.availability` | 开 / 否 | read / normal | 无。只返回已配置提供商与宿主状态。 |
| `mail.oauth.begin` | 开 / 否 | write / high | CLI／MCP 固定 requestId，原授权 sessionId、主体及修复账号。查两次并发只打开一次浏览器入口。 |
| `mail.oauth.status` | 开 / 否 | read / normal | 无。当前逻辑主体及原授权 sessionId。查等待和重启后的取消状态。 |
| `mail.oauth.cancel` | 开 / 否 | write / normal | CLI／MCP 固定 requestId 与原 sessionId。查重交、取消和重启恢复。 |

## 验证

| 验收要求 | 实际结果 | 证据位置 |
| --- | --- | --- |
| 目录及域回执 | 静态目录 1 项、回执 2 项通过。检查清单一致、默认关闭、同键合并、异参冲突、重启安全投影与未知不重放。 | `/tmp/huhu-t2r-offline-targeted.log` |
| 双入口矩阵 | 实际 CLI／HTTP MCP 用例均在回环夹具建立时收到 `listen EPERM: operation not permitted 127.0.0.1`。恢复后的运行未到业务断言。 | `/tmp/huhu-t2r-mail-exposure.log` |
| 既有 Mail 回归 | 中断前版本 55 项断言通过，IMAP 夹具 EPIPE 导致 Vitest 进程失败。候选添加 readline 错误处理。恢复后混合运行中 14 项通过，11 个回环用例均报监听 EPERM。 | `/tmp/huhu-t2r-mail-regression.log`、`/tmp/huhu-t2r-offline-tests.log` |
| 桌面/Web UI | Playwright 枚举 3 项通过，新增批准交互用例待在支持回环的环境运行。读取实际 Electron 44.9.1 / Chromium 152.0.7977.167。构建尝试在 holder_lost 前中断。 | `/tmp/huhu-t2r-e2e-list.log`、`/tmp/huhu-t2r-desktop-build.log` |
| 类型检查 | 原并行脚本中断。以同样的 vendor 构建及全仓类型检查目标，将工作区并发限制为 2，24 个工作区类型脚本通过。 | `/tmp/huhu-t2r-typecheck-constrained.log` |
| Lint | 直接运行 Oxlint、Stylelint 通过，两项规则样例均产生预期诊断和退出码 1。原 lint 封装和 CSS 颜色脚本里的 Node `spawnSync` 返回 EPERM，完整门禁待复验。 | `/tmp/huhu-t2r-lint-retry.log`、`/tmp/huhu-t2r-lint-equivalent.log` |
| 格式与 Knip | `pnpm format:check` 和 `pnpm knip` 均退出 0。 | `/tmp/huhu-t2r-format.log`、`/tmp/huhu-t2r-knip.log` |
| 全量 | 回环限制已阻止定向真实入口测试。全量套件待回环可用后在共享锁内以 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2` 运行。 | task01 和 Lead 的 worker 约定 |

## 阻碍与接续

- 需要允许本地回环监听以及 Node 同步子进程的验证环境。最终 CLI、HTTP MCP、桌面和 Web、全量与完整 lint 结果均待取得。
- C05 沿用 t26 的 Lead 验收决议。已恢复的 HTTP MCP 原逻辑主体可执行已独立授权的只读对账。领域写入重交由共享层返回 `outcome: unknown`。CLI 可通过原领域标识取得安全回执，短期准备句柄在重启后过期。
- 为使批准在撤权和重新开放后失效，候选以当前工具策略版本为批准的一部分。策略版本改变会要求重新准备。
- Modern Web Guidance 的 search 与 retrieve 已执行，应用细节见候选证据。UI 复用工作台的原生 Dialog、焦点和键盘行为，使用共享工作台调用入口。

## Lead 验收
