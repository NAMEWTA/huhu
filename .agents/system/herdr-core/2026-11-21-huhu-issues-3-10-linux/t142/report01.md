# t142 · Mail 候选只读审查

Lead `t3p`，worker `t142`，任务 `task01.md`，执行状态 `done`。审查基线为派工指定的 `9e854b1c64391c5e0e4ea3fd3bbd07cea0550171`，范围为 `agent-linux` 的 Mail 工作树差异，包含新增的 Graph 同步、发送、夹具及 UPSTREAM，并核对总台账和第三方声明。审查期间 HEAD 推进至 `a1d3fd9a`，两次提交之间没有本次审查涉及的 Mail、台账或所引共享实现差异。下文四项为静态代码发现。建议 S4.2 待签收，先收口三项 P2。S5.2 通知口径等待用户决定，仍未签收。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t142/task01.md) · [Mail 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/spec.md#durability) · [S4.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S4.2-outlook-delta.md#L19) · [批次验收记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L104)

## 规格发现

### P2 · 批量移出时，被裁剪的删除记录会让旧列表少补一封

- 输入与时序。已有 200 封小邮件的正文缓存。下一轮 delta 移出其中一封 A，再返回 201 条未缓存的删除记录。令按 ID 排序被裁剪的那条为 D。独立列表已去掉 A，但仍把 D 排在 199 封存活缓存之后的第 200 位，第 201 位 H 是实际应补入的有效历史邮件。H 在本轮没有变化，因此不出现在 delta 中。
- 代码与影响。`pages` 只保留前 200 条未缓存删除记录，`excluded` 从保留的变更建立。D 因此会占据 `inboxWindow` 的第 200 位，客户端提前返回。D 的 MIME 404 只会丢弃该候选。最终写出 199 封正文、空 `pending` 和新游标。随后空 delta 不触发对账，H 仍打不开。t12f 的单条删除回归已覆盖能进入 `excluded` 的情形。 [裁剪删除记录](../../../../../plugins/mail/src/engine/graph-mail.ts#L229) · [建立排除集合](../../../../../plugins/mail/src/engine/graph-mail.ts#L290) · [列表计数](../../../../../plugins/mail/src/engine/graph-mail.ts#L189) · [MIME 404](../../../../../plugins/mail/src/engine/graph-mail.ts#L255) · [终态写入](../../../../../plugins/mail/src/engine/message-cache.ts#L559) · [单条删除回归](../../../../../plugins/mail/test/oauth-engine.test.ts#L280)
- 必要回归。用回环夹具覆盖超出删除记录上限、旧列表仍含 D、H 在下一页且无 delta 记录的组合。核对继续访问原 nextLink、H 正文可读、D 缺席、缓存恢复为 200 封，并核对失败或预算耗尽时保留原游标或可恢复检查点。

### P2 · 一轮需要核实的邮件较多时，刷新和重启会重复同一批请求

- 输入与时序。沿已提交游标，很快读完两张 delta 页，20 个已缓存邮件每封分别出现 `isRead:true` 和 `isRead:false`。每次单封 GET 均约 4 秒，在 15 秒的单请求期限内。该序列稳定重复。
- 代码与影响。冲突会置 `verify`，取得终态页后，`round` 对所有冲突串行 GET。该阶段没有可提交的继续位置，整轮 75 秒耗尽时直接退出。检查点只记录 delta 页进度。下一次刷新或重启仍从原游标或最后保留的 delta 页开始，再次读取同一批单封结果，始终无法提交新状态。用户可继续查看旧缓存，但该目录在上述响应条件下持续无法更新。 [整轮与单次期限](../../../../../plugins/mail/src/engine/graph-mail.ts#L82) · [整轮期限](../../../../../plugins/mail/src/engine/graph-mail.ts#L131) · [冲突识别](../../../../../plugins/mail/src/engine/graph-mail.ts#L167) · [分页检查点](../../../../../plugins/mail/src/engine/graph-mail.ts#L213) · [串行核实](../../../../../plugins/mail/src/engine/graph-mail.ts#L283) · [缓存检查点](../../../../../plugins/mail/src/engine/message-cache.ts#L550)
- 必要回归。用可控时间或屏障让单封核实跨越一次刷新预算，中途重启。断言可恢复进度继续、必要的单封结果核实完成才提交终态，取消或换代时旧任务不落盘。现有 20 页续跑和 MIME 字节预算续取各覆盖不同阶段。

### P2 · 邮箱切为仅接收后，仍可能用旧 Graph 凭据首次提交邮件

- 输入与时序。Graph 账号勾选发送并认领一封带附件的草稿。投递已取得当前 Graph 凭据，MIME 仍在构建，POST 尚未开始。此时同一账号重新授权并关闭发送，较早的服务端访问令牌仍在有效期内。随后 MIME 构建完成。
- 代码与影响。`withGraphSendCredentials` 在开始构建前检查发送开关和受保护 scope。账号凭据读取固定旧代供当前回调使用，重新授权可在该回调期间独立提交新代。Outbox 的投递信号由插件生命周期与账号移除组成。MIME 构建后的检查只读取该信号，因此旧令牌仍可发出首个 POST，服务接受时发件箱会显示已接受。已开始 POST 后失去回执的情形仍应按现有规则记为 `unknown`。 [旧代凭据固定](../../../../../packages/kernel/src/credentials/module-credentials.ts#L412) · [重授权写入](../../../../../plugins/mail/src/engine/accounts.ts#L241) · [Graph 权限门禁](../../../../../plugins/mail/src/engine/accounts.ts#L321) · [投递信号](../../../../../plugins/mail/src/engine/outbox.ts#L320) · [构建后发出 POST](../../../../../plugins/mail/src/engine/graph-send.ts#L8) · 本地 MailComposer 异步构建（历史位置 `../../node_modules/.pnpm/nodemailer@10.6.0/node_modules/nodemailer/dist/esm/mime-node/index.js`，本次未取得原件） · [仅接收账号验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S1b.3-submit-draft.md#L19)
- 必要回归。在 MIME 构建与首次 POST 之间挂起投递，提交仅接收的新代后放行。断言零 POST、记录明确未投递，同一草稿版本重交返回原操作。对照在 POST 已抵达后丢回执的分支，仍为 `unknown` 且无常规重试资格。

### P3 · 工作台手动刷新会取消自己触发的 Graph 降权后续收件

- 输入与时序。Graph token 即将过期，用户在已打开的工作台发起一次刷新，续期只保留读取权限。准许账号更新事件和客户端账号列表更新先完成，延后 Graph delta 响应。
- 代码与影响。Engine 保存新账号版本并发布 `mail-account`，同一刷新可接续用新凭据读取。工作台收到事件后重新读取账号，`account.revision` 变化让效果清理中止该手动刷新，刷新捕获分支对已中止请求保持静默。用户会看到进度消失，但本次请求没有可见结果。若该请求是最后一位等待者，Engine 的取消门禁也会阻止缓存写入。 [降权发布](../../../../../plugins/mail/src/engine/accounts.ts#L122) · [续期后取代](../../../../../plugins/mail/src/engine/message-cache.ts#L490) · [工作台重读账号](../../../../../plugins/mail/src/ui/MailModule.tsx#L142) · [清理及静默取消](../../../../../plugins/mail/src/ui/MailModule.tsx#L715) · [HTTP 请求信号](../../../../../packages/kernel/src/server/capability-http.ts#L91) · [最后一位等待者](../../../../../plugins/mail/src/engine/message-cache.ts#L674)
- 必要回归。从工作台触发临期续期，让账号事件先于 delta 返回。核对同一次刷新显示新增邮件，写信入口同时更新为不可发送。再覆盖真正换账号或关闭工作台时的取消。

## 已核对的边界

- 小范围补位已依据同轮有效元数据计数，重复 ID 只占一个名额。补位页 500 保留已提交游标与原检查点。合法斜杠及 OData 括号链接通过同源、目录和路线校验，原样保存及续取；异常链接在请求前拒绝。MIME 待办与终态游标同次写入，下一轮先继续待办。缓存实际写入前检查取消、账号 revision 和移除状态。Graph 与 IMAP 各用各的快照及定位。 [分页约束](../../../../../plugins/mail/src/engine/graph-mail.ts#L131) · [待办续读](../../../../../plugins/mail/src/engine/graph-mail.ts#L274) · [写前检查](../../../../../plugins/mail/src/engine/message-cache.ts#L403) · [现有集成用例](../../../../../plugins/mail/test/oauth-engine.test.ts#L1280)
- 发送沿用同版本操作 ID 和持久认领。Graph HTTP 202 记录服务已接受。回执断开或无法确定的状态记录 `unknown`，常规重试只纳入已确认未投递的收件人。当前回环夹具有 Graph MIME 线程头、附件、Bcc 与单 POST 重交断言。Exchange 仍默认按 Exchange 授权，SMTP 核对自己的凭据与地址，原 envelope/DATA 路径仍在。其余所查的阅读、对话定位和本地标读变化没有单列新增发现。 [认领去重](../../../../../plugins/mail/src/engine/outbox.ts#L114) · [重试资格](../../../../../plugins/mail/src/engine/outbox.ts#L262) · [发送分支](../../../../../plugins/mail/src/engine/outbox.ts#L330) · [回执映射](../../../../../plugins/mail/src/engine/graph-send.ts#L18) · [回环断言](../../../../../plugins/mail/test/oauth-engine.test.ts#L1116)
- S5.2 维持未签收。已读取 t120 的时间戳与提前缓存边界、t125 的待决口径、t12f 的补位交付。 t120（历史位置 `t120-report01.md`，本次未取得原件） · t125（历史位置 `t125-report01.md`，本次未取得原件） · t12f（历史位置 `t12f-report01.md`，本次未取得原件）

## 项目规范与未运行的验证

范围内未发现独立的项目规范违规。R-87 的模块说明、总台账与第三方声明相符。本地固定 one-mail 参考与变更记录支持其行为参考用途，Nodemailer 本机发布包的 10.6.0、MIT-0 及 MailComposer export 与登记一致。前端只读核对复用了 Lead 已取回的 JavaScript 指南。 本地上游分页（历史位置 `../sources/one-mail-reference/graph_api.rs`，本次未取得原件） · [模块说明](../../../../../plugins/mail/UPSTREAM.md#L5) · [总台账](../../../../../docs/upstream/ledger.md#L57) · [第三方声明](../../../../../THIRD_PARTY_NOTICES.md#L167)

已阅读 t12p OAuth 回环 4/4 和 t12y Mail 类型检查的既有证据。回环覆盖单条旧列表删除补位、续页失败后重试、模拟 Graph 发信和 Exchange SMTP，两条历史记录均未覆盖本报告的新时序。本轮自行核对了跟踪差异的空白检查。按派工只写本报告，未运行 Vitest、类型检查、E2E、构建、打包或真实账户验证。新候选包、服务端 Bcc 信封投递及 Graph 重启后跨入口认领仍缺本轮运行证据。 [回环运行日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/graph-window-check.log#L8) · [类型检查记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L118)
