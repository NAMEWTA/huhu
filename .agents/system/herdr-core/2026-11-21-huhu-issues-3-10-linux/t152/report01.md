# t152 · Mail 两项恢复缺口复核

Lead `t3p`，worker `t152`，任务 `task01.md`，执行状态 `done`。基准为 `impl/huhu-mail-graph-completion` 的 HEAD `fa5d5c3acfbfdbeb49b2e55e41048160ecac7537`，目标为 `agent-linux` 当时的 Mail task04 未提交差异，包含 Graph 网络代码、回环用例和工作台 E2E 的直接调用链。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t152/task01.md) · [原审查](t14s-report01.md) · [实施报告](t144-report04.md)

## 规格轴

- **原 P3 · 旧 Graph 作业续页并接走新刷新，复现场景已关闭。** OAuth 重授权成功后发布 `mail-account`，消息缓存按账号和新路径取消旧作业。若新刷新先看到已提交的路径，也会在合流前检查并取消旧作业。同一收件箱的新等待者加入新作业，沿账号串行队列等前一作业退出后按 Exchange 发起请求。Graph fetch 和缓存提交门禁收到同一个取消信号。t14z 红灯复现了挂起连接未取消、旧 nextLink 被请求及新刷新失败，t151 的同场景回环通过。用例在发起新刷新后才检查取消，无法独立锁定账号事件触发的取消。 [OAuth 事件](../../plugins/mail/src/engine/oauth-sessions.ts#L286) · [事件取消](../../plugins/mail/src/engine/message-cache.ts#L427) · [合流及串行](../../plugins/mail/src/engine/message-cache.ts#L686) · [Graph 请求信号](../../plugins/mail/src/engine/graph-mail.ts#L105) · [回环断言](../../plugins/mail/test/oauth-engine.test.ts#L687)
- **原 P3 · 切为只接收后点击重试才知道原因，原场景已关闭，工作台实跑待验。** MIME 构建后、首次 POST 前读取同账号当前定义。Graph 发信关闭产生 `permission-missing`，投递方将其写为 `not-delivered` 和 `graph-send-permission`。普通 revision 冲突、过期、取消或移除走原门禁，服务端 Graph 403 仍保留 HTTP 状态。同版重交复用操作，已 POST 后丢回执仍是 `unknown` 且无重试收件人。工作台查源草稿的当前发件账号，仅在发信开启且本机凭据已配置时呈现可重试的收件人。账号事件更新账号列表，恢复后重新显示入口。Engine 用例已断言零 POST、历史原因及权限恢复后原收件人的资格。 [POST 门禁](../../plugins/mail/src/engine/accounts.ts#L342) · [发送边界](../../plugins/mail/src/engine/graph-send.ts#L18) · [结果落盘](../../plugins/mail/src/engine/outbox.ts#L372) · [重试资格](../../plugins/mail/src/engine/outbox.ts#L262) · [账号事件](../../plugins/mail/src/ui/MailModule.tsx#L142) · [工作台门禁](../../plugins/mail/src/ui/MailOutbox.tsx#L36) · [权限回归](../../plugins/mail/test/oauth-engine.test.ts#L767) · [丢回执回归](../../plugins/mail/test/oauth-engine.test.ts#L1473)
- **自身续期正例保留。** Graph 续期降掉发信能力时，账号仍走 Graph 收件路径，路径比较不会撤掉本轮作业。同步在续期完成后读取本轮 revision。工作台手动刷新按 Engine、账号 ID、目录和组件生命周期清理。账号事件更新 revision 后仍能完成同一请求。E2E 断言 Graph 使用续期凭据、只发一次手动同步、显示新邮件并停用该邮箱的发信入口。切换账号和关闭邮件标签另有取消断言。 [续期写入](../../plugins/mail/src/engine/accounts.ts#L146) · [收件作业](../../plugins/mail/src/engine/message-cache.ts#L517) · [工作台请求](../../plugins/mail/src/ui/MailModule.tsx#L716) · [工作台 E2E](../../tests/e2e/workflows/mail.spec.ts#L220)

### 新发现

**P3 · 恢复发信后，同一投递详情仍提示当前凭据缺少 Mail.Send。** 保持权限失败记录打开，在另一工作台重新授权并恢复发送。账号事件更新列表后，原收件人的重试控件恢复。上方提示只读取历史 `row.reason`，仍声称「Microsoft Graph 未授予当前凭据 Mail.Send 权限。」用户同时看到当前权限不足的提示和可用的重试。历史失败原因应明确指向原投递时刻。同一处也会在源草稿已丢弃时折叠重试，原点击后可见的「源草稿已丢弃」说明变得不可达，页面没交代恢复入口消失的原因。两种表现均由当前渲染条件直接得出。 [工作台门禁](../../plugins/mail/src/ui/MailOutbox.tsx#L36) · [历史权限提示](../../plugins/mail/src/ui/MailOutbox.tsx#L118) · [重试控件](../../plugins/mail/src/ui/MailOutbox.tsx#L133) · [草稿丢弃](../../plugins/mail/src/engine/drafts.ts#L245) · [恢复场景](../../tests/e2e/workflows/mail.spec.ts#L310)

**E2E 断言缺口。** 发件箱用例用一次 `count/isEnabled` 采样断言只接收时无法重试，采样可能早于新增的 `mail.drafts.get` 返回。应等草稿查询就绪后核对门禁。恢复阶段断言原收件人可选且按钮可用，未点击提交、检查服务端收件人或核对恢复后的提示。真实重授权和首次 POST 暂停点由 OAuth 回环覆盖。工作台夹具用真实续期触发降权，以替换凭据并发布账号事件模拟恢复。 [E2E 断言](../../tests/e2e/workflows/mail.spec.ts#L299) · [恢复夹具](../../tests/e2e/workflows/mail.spec.ts#L207) · [OAuth 回环](../../plugins/mail/test/oauth-engine.test.ts#L754)

## 规范轴

定向范围内未发现独立规范违规。收件修复沿用现有作业、等待者、串行队列和 Vault 写入边界。账号事件订阅由插件作用域负责释放，事件入口已按 `id` 是否存在收窄。发件修复沿用认领和结果 schema 的可选原因字段，旧投递记录可继续读取。工作台沿用 EngineClient 查询和账号事件。 [插件作用域](../../packages/kernel/src/context.ts#L74) · [事件入口](../../plugins/mail/src/engine/message-cache.ts#L440) · [结果 schema](../../plugins/mail/src/engine/smtp.ts#L10) · [工作台查询](../../packages/workbench/src/engine-client/react.tsx#L76)

## 既有证据与未运行验证

- t14z 修前两条失败。t151 修后 OAuth 9 项与 Outbox 20 项，共 29 项通过。t151 的类型诊断对应可选 `event.payload.id`，当前代码已有非空分支。批次记录随后补有 t153 Mail 包和差异 E2E 类型检查退出码 0，t154 的 23 文件格式与 lint 通过、Playwright 可加载 13 项。 [修前日志](mail-recovery-red.log) · [修后日志](mail-recovery-check.log) · [后续类型日志](mail-recovery-types.log) · [格式与用例列表](mail-recovery-lint.log) · [批次记录](../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/evidence/linux-final-acceptance.md#L196)
- 本轮只读复核，未运行 Vitest、类型检查、格式检查、Playwright、构建或打包。工作台四条 Graph E2E（自身续期、切换账号、关闭标签、恢复重试）均待当前候选实跑。新包和 GUI 未验收。S5.2 新信口径仍待用户决定。 [工作台用例](../../tests/e2e/workflows/mail.spec.ts#L220) · [S5.2](../../.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S5.2-new-mail-notice.md)
