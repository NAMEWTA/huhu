# t14s · Mail 边界修复独立复核

Lead `t3p`，worker `t14s`，任务 `task01.md`，执行状态 `done`。基准和复核时的 HEAD 均为 `fa5d5c3a`。范围为 `agent-linux` 的 Mail 工作树差异、三个新增 Graph 源码或夹具文件、Mail E2E、来源登记及直接调用方。仅写本报告，SSH 暂停项在范围之外。 [派工文件](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t14s/task01.md)

**结论**　三项原 P2 的复现场景均已关闭。原 P3 的工作台自取消问题已在源码关闭，浏览器验收待运行。新增两项有可见影响的静态 P3，分别涉及重授权后的旧同步作业，以及发件箱在发送权限已关时仍提示立即重试。S5.2 通知语义单独待决。 原审查（历史位置 `t142-report01.md`，本次未取得原件） · 实施报告（历史位置 `t144-report02.md`，本次未取得原件）

## 规格轴

### 原四项的关闭依据

| 原项 | 关闭依据与证据 |
| --- | --- |
| P2 · 裁剪未缓存删除记录后，旧列表只补到 199 封 | **关闭，已有红绿回环证据。** 裁剪保留所有已缓存 ID、按大小写精确顺序裁剪未缓存删除记录，并跨页累计最早被省略的 ID 下界。已知移出的 ID 直接排除。旧列表中可能丢失删除证据的候选，经单封 GET、ID 和当前目录核对后才占用 200 封配额。用例删除 1 封缓存邮件并追加 201 条未缓存删除。补位页先返回 500，原 200 封和原游标保持，重试沿 nextLink 补足 200 封且历史本地 ID 能打开正文。覆盖范围为小正文窗口。 [裁剪和下界](../../../../../plugins/mail/src/engine/graph-mail.ts#L265) · [计数和继续翻页](../../../../../plugins/mail/src/engine/graph-mail.ts#L212) · [回归](../../../../../plugins/mail/test/oauth-engine.test.ts#L582) |
| P2 · 批量冲突核实跨预算后重放同一批 GET | **关闭，已有跨 Engine 重启的红绿回环证据。** 50 秒软预算保留已核实元数据和移出结果，离 75 秒硬期限留有单请求余量。核实阶段检查点携带待提交的 deltaLink，写入原可读快照的 `progress` 并保留原 `cursor`，下次跳过已核实的 ID。列表阶段另保存已接受条目、当前页剩余条目和 nextLink，旧分页检查点走已提交游标重新建立删除证据。回归使用 20 个冲突 ID 和可控时钟，核对重启前原显示状态、重启后未重访已完成 ID，完成时才提交终态并更新已读。列表阶段跨预算重启的分支有源码依据，现有日志未直接覆盖。 [检查点 schema](../../../../../plugins/mail/src/engine/graph-mail.ts#L35) · [核实及恢复](../../../../../plugins/mail/src/engine/graph-mail.ts#L327) · [缓存提交](../../../../../plugins/mail/src/engine/message-cache.ts#L570) · [回归](../../../../../plugins/mail/test/oauth-engine.test.ts#L626) |
| P2 · MIME 构建期间重授权关闭发送，仍可能首次 POST | **关闭，已有红绿回环证据。** Outbox 用认领时的账号身份核对当前发件人。凭据回调检查受保护的实际 scope 和发送开关，MIME 构建后同步核对同一 revision、移除状态、取消和凭据有效期，随后立即调用 POST。门禁失败由已认领操作记录为未投递。同版重交仍返回原操作号。POST 已到回环服务而回执丢失的独立用例仍得到 `unknown`、空常规重试清单，同版重交无新增 POST。当前门禁以完整 revision 为准，因此仅改显示名也可让构建中的投递以未投递结束。 [权限门禁](../../../../../plugins/mail/src/engine/accounts.ts#L342) · [POST 边界](../../../../../plugins/mail/src/engine/graph-send.ts#L5) · [认领及去重](../../../../../plugins/mail/src/engine/outbox.ts#L114) · [结果落盘](../../../../../plugins/mail/src/engine/outbox.ts#L347) · [零 POST 回归](../../../../../plugins/mail/test/oauth-engine.test.ts#L687) · [回执丢失回归](../../../../../plugins/mail/test/oauth-engine.test.ts#L1422) |
| P3 · 工作台手动刷新会被自身触发的降权事件取消 | **源码关闭，工作台 E2E 待跑。** Engine 先续期并提交降权，再取本轮 revision 和新读取凭据。`mail-account` 仍重读账号和发件能力，手动请求的清理条件为 Engine、账号 ID、目录和组件生命周期。账号 revision 单独变化保留同次请求。换账号会换对应组件，换目录会改变效果依赖，关闭邮件标签会卸载组件。清理信号经 EngineClient 和 HTTP 传到共享同步，最后一个等待者离开才取消作业。三条 E2E 分别断言降权后同次请求继续、切账号取消、关标签取消。 [续期与事件](../../../../../plugins/mail/src/engine/accounts.ts#L146) · [读取本轮版本](../../../../../plugins/mail/src/engine/message-cache.ts#L498) · [账号事件](../../../../../plugins/mail/src/ui/MailModule.tsx#L142) · [请求清理](../../../../../plugins/mail/src/ui/MailModule.tsx#L715) · [HTTP 信号](../../../../../packages/kernel/src/server/capability-http.ts#L91) · [共享等待者](../../../../../plugins/mail/src/engine/message-cache.ts#L695) · [E2E](../../../../../tests/e2e/workflows/mail.spec.ts#L212) |

S4 的 Graph/IMAP 路径分开保存快照和定位。已有回环记录覆盖默认 Exchange、仅有适用授权时使用 Graph、Graph 下一页失败重试、410 重扫、403 反馈、Graph 原生 ID 正文与回复，以及回到 Exchange 后的 SMTP。S5.1 的调度读取续期后的定义和目录，`more` 会安排下一轮接续。写入使用文件版本和同步 `beforeCommit`，检查 job 信号、移除状态和账号 revision。现有测试已在 Graph 终态写入前完成同账号切回 Exchange，断言旧缓存版本、事件和通知均保持，并在旧任务退出后验证 Exchange 刷新。账号移除、Vault 关闭、清缓存和最后一个等待者取消均有相应作业信号。 [独立快照](../../../../../plugins/mail/src/engine/message-cache.ts#L86) · [调度](../../../../../plugins/mail/src/engine/sync-schedule.ts#L134) · [写入门禁](../../../../../plugins/mail/src/engine/message-cache.ts#L411) · [同步发布](../../../../../packages/vault/src/write.ts#L128) · [换代写入回归](../../../../../plugins/mail/test/oauth-engine.test.ts#L1647) · [S4.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S4.1-microsoft-consent.md) · [S4.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S4.2-outlook-delta.md) · [S5.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S5.1-sync-schedule.md)

### 新发现

**P3 · 同一邮箱重授权切回 Exchange 后，旧 Graph 作业可继续请求，并接走新发起的刷新。** 让同一收件箱的 Graph delta 页挂起，期间从工作台完成该邮箱的重授权，使当前路径变为 Exchange。若旧请求随后返回 nextLink，旧作业仍会使用已固定的 Graph 凭据请求下一页。revision 只在持久化前核对，重授权提交没有取消该作业的信号。若在旧作业退出前从另一入口刷新同一收件箱，即使入口提供了正确的新 revision，仍会加入按账号和目录定位的现有作业，等到旧 Graph 完成后收到 `mailbox-changed`，随后需要再次刷新才会走 Exchange。旧作业的写入门禁仍有效。现有用例把屏障设在网络结束后的写入点，并在旧作业退出后才发起 Exchange 刷新，因此覆盖的是拒绝写回。S5.1 的失效作业停止发起网络操作在这一步仍有缺口。建议以真实路径切换触发旧作业退出，区分本轮开始时自身续期产生的新 revision，并在下一页请求前挂屏障验证新入口不接旧任务。 [授权提交](../../../../../plugins/mail/src/engine/accounts.ts#L245) · [旧代凭据固定](../../../../../packages/kernel/src/credentials/module-credentials.ts#L412) · [Graph 续页](../../../../../plugins/mail/src/engine/graph-mail.ts#L259) · [版本门禁](../../../../../plugins/mail/src/engine/message-cache.ts#L498) · [作业合并](../../../../../plugins/mail/src/engine/message-cache.ts#L667) · [当前回归时序](../../../../../plugins/mail/test/oauth-engine.test.ts#L1664)

**P3 · 投递前切为只接收后，发件箱要等用户点击重试才解释当前账号不能发信。** 沿用已复现的 MIME 构建暂停场景，重授权提交只接收再放行。门禁抛出账号变动错误，记录 `not-delivered`，结果既无 Graph HTTP 状态也无可供 UI 展示的原因。发件箱仍给这些收件人呈现可操作的重试，点下后才由重新认领检查报「此 Microsoft Graph 账号未启用发送」。网络和认领均受现有检查保护。此项影响失败后的恢复体验，保留明确未投递的证据与恢复发送后重试的资格即可。 [门禁错误](../../../../../plugins/mail/src/engine/accounts.ts#L347) · [结果原因与重试列表](../../../../../plugins/mail/src/engine/outbox.ts#L262) · [重新认领检查](../../../../../plugins/mail/src/engine/outbox.ts#L291) · [落盘映射](../../../../../plugins/mail/src/engine/outbox.ts#L372) · [发件箱原因与操作](../../../../../plugins/mail/src/ui/MailOutbox.tsx#L93) · [S1b.3](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S1b.3-submit-draft.md)

### 产品待决

S5.2 仍等待用户决定是否接受 Graph「可证实的首次入箱」作为新信口径，包括其他目录首次移入和证据不足时静默的取舍。本轮没有据此新增缺陷或签收通知。原型确认记录中的 Outlook 演示走 IMAP，独立 Graph consent 仍在原确认范围之外。 [S5.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/tasks/S5.2-new-mail-notice.md) · 待决语义（历史位置 `t125-report01.md`，本次未取得原件） · [原型确认](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/prototype-review.md#L29)

## 规范轴

本次范围内未发现独立规范违规。Graph 快照沿用 Mail 缓存和 Vault 写入，发送沿用 Outbox 认领及工作台 EngineClient。R-87 的固定 one-mail 参考、模块来源记录、总台账和第三方声明相符。MIME 构建使用 Mail 已锁定的 Nodemailer 10.6.0 发布接口。前端改动沿用既有查询、反馈组件及宿主接口，无直接访问桌面能力的新入口。 [模块来源](../../../../../plugins/mail/UPSTREAM.md) · [总台账](../../../../../docs/upstream/ledger.md#L57) · [第三方声明](../../../../../THIRD_PARTY_NOTICES.md#L167) · [依赖声明](../../../../../plugins/mail/package.json#L25)

## 既有证据及未运行验证

- `mail-boundaries-red.log` 直接记录补位不足及核实重启重复。该日志的发送用例停在前置可选字段断言，实际越界 POST 用 `mail-send-boundary-red.log` 佐证，修正夹具后为一次 POST、已接受。t14n 的 `mail-boundaries-check.log` 记录 OAuth 单文件 7/7 通过。 初次红灯（历史位置 `mail-boundaries-red.log`，本次未取得原件） · 发送红灯（历史位置 `mail-send-boundary-red.log`，本次未取得原件） · 回环绿灯（历史位置 `mail-boundaries-check.log`，本次未取得原件）
- 绿灯后修正了核实检查点重建中的 `recovery` 可选属性生成。t14q 在修正后记录 Mail 包与差异 E2E 类型检查 exit 0。t14t 记录 23 个差异文件格式化和 oxlint 结果，以及 Mail spec 共 12 项的加载列表。 初次类型错误（历史位置 `mail-boundaries-types.log`，本次未取得原件） · 类型复查（历史位置 `mail-boundary-types-recheck.log`，本次未取得原件） · [批次记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L173) · E2E 列表（历史位置 `mail-diff-final-check.log`，本次未取得原件）
- **本轮未运行任何验证。** 三条新增工作台浏览器 E2E、真实 Microsoft 账号的 Graph/Exchange 与收件方实际 Bcc 投递、当前候选构建和安装包均无本次运行结果。两项新增问题为可由当前控制流直接推导的静态发现。 [工作台用例](../../../../../tests/e2e/workflows/mail.spec.ts#L212) · [回环 MIME 断言](../../../../../plugins/mail/test/oauth-engine.test.ts#L1422)
