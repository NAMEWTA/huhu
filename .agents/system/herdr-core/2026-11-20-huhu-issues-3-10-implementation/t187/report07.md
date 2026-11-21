# 工作区时序、原位恢复与联系人隐私独立复验

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task07.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task07.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report07.md`
- 执行结果 — `done`

## 结论

**签收 `c3d5b7ff` 的两项恢复修复和 `2a627f54` 的两项联系人隐私修复。#4 工作区 `ba894846` 暂缓签收。** 陈旧目标的启动前拦截、同一 Engine 的关闭串行化、Core 0.1.19 文档事件和原启动重交通过。独立复验确认工作区仍有三处 P2，分别发生在布局读取失败、用户重新聚焦同一活动叶，以及外部 Core 写入与终止交错时。

## 固定候选与验证方式

| 范围 | 固定提交 | 独立运行 |
| --- | --- | --- |
| #4 工作区 | `ba89484612584e4848d06de3ae554741d1ce9385` | Windows 固定 Core 的 Engine 2 项、树领域 5 项。追加真实 Core 关闭时序与实际组件焦点时序探针。 |
| E07 恢复 | `c3d5b7ffe298cf093f11b1551969c4694b71d560` | Windows Engine 的 HTTP 历史保护和本机批准 2 项。 |
| #8 联系人 | `2a627f54e8ed0d2aa5c9d1a124e3441829b3a38f` | 真实回环 IMAP 的 Engine 1 项，Edge 实际组件与 Engine 1 项。 |

以各提交的 `git archive` 固定源码，在本机个人证据目录复用已安装依赖。Windows x64、Node 24.21.0、Vitest 3.2.7，测试 Core 为安装包提取的 0.1.19，SHA-256 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。Core 控制面会话是本机 0.1.21。已有回归共 11 项通过，两个附加探针按断言记录了通过路径和缺陷现象。Lead 的 App E2E 另计。共享工作区的未提交跨标签移动文件未纳入，所有运行使用本机临时夹具或个人目录中的内存组件构建。未创建测试 pane。 [二进制与提交标识](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/versions.log) · [原工作区与 Mail 审查](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report05.md) · [原 E07 恢复审查](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report06.md)

## #4 Core 工作区

| report05 问题 | 复验结论 |
| --- | --- |
| 陈旧菜单可能先启动终端 | **签收。** Engine 在启动前检查目标 Space 修订、叶子存在、占用和布局限制。真实 Core 用例先收起原目标，同请求首次提交返回 `VERSION_CONFLICT`，会话数为零。已被 Core 受理的同一请求在收起后只找回原会话；相同请求号换 baseVersion 返回 `IDEMPOTENCY_MISMATCH`。 [提交前校验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/engine/workspace-layout.ts:129) · [真实 Core 回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws.log) |
| 定位任务原会话时使用旧布局或缺焦点 | **部分通过，仍有 P2。** 成功刷新时等会话列表和布局完成，并选中及聚焦最新叶。读取失败仍会用缓存布局结算，见下。 [定位条件与焦点](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/ui/AgentCliModule.tsx:106) · [Edge 定位探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws-focus-orders-r3.log:12) |
| 迟到启动覆盖用户后续焦点或 zoom | **部分通过，仍有 P2。** 新版在工作期间切换到其他叶或调整 zoom 后递增导航代次。实际组件探针确认延迟成功回执保留另一叶的 zoom。重新聚焦当前已选叶仍会被抢走焦点，见下。 [焦点及 zoom 回调](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/ui/AgentCliModule.tsx:490) · [Edge 启动探针](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws-focus-orders-r3.log:18) |
| 收起与终止争用 | **同一 Engine 通过，外部写入仍有 P2。** 同一工作区服务的保存、启动、关闭共用队列。真实 Core 夹具验证收起先完成时，陈旧终止被拒，原会话仍运行。附加探针验证反向时序，终止先进入时收起等待，随后因旧修订被拒；外部 Core 直接写入不经此队列。 [关闭校验](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/engine/workspace-layout.ts:157) · [两种写入时序](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws-close-orders.log:12) |

Core 0.1.19 的订阅参数为空对象，匹配工作区文档名后才转成工作台失效事件，终端状态仍按本 Vault 会话身份定位。真实测试通过独立 Core 客户端写文档，观察到 Engine 事件，并验证未知格式原样保留。首次写 A 后 B 的旧修订仍有效，写 B 与丢失写回执的核对保留 A；Engine/Core 重启后两 Space 仍有各自修订和布局。Lead 的 Engine 2 项与 App E2E 2 项通过，后者覆盖六叶、比例、收起后重开，以及丢 HTTP 回包后同请求号和同叶找回单一会话。固定布局字段随原请求重交，稳定目标和版本纳入会话启动意图摘要。 [0.1.19 订阅与本地过滤](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/engine/waiting.ts:78) · [真实外部 Core 事件](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/apps/engine/test/agent-workspace.test.ts:65) · [Lead Engine 日志](D:/Document/code/huhu/temp/issue-baseline/agent-guarded-workspace-tests-r2.log) · [Lead App E2E 日志](D:/Document/code/huhu/temp/issue-baseline/agent-guarded-workspace-e2e-r2.log)

### P2 · 任务定位在布局刷新失败后接受旧叶位置

Edge 的实际组件探针从旧布局开始，把目标移到新版中的另一叶。定位等待布局读取结束。以一次可重试读取失败结束时，组件仍按旧缓存选择旧叶、移交焦点并消费请求。下一次主动定位获得新布局才正确聚焦。应保留失败状态的重试入口，并在请求获得成功的同 Space 布局前避免完成定位。 [失败与成功的对照](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws-focus-orders-r3.log:12) · [使用缓存并清除请求](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/ui/AgentCliModule.tsx:119)

### P2 · 重新聚焦当前叶仍会被迟到启动回执覆盖

在新开 Tab 启动等待期间，用户主动聚焦原本已选中的叶。代码以叶 ID 是否变化判断要不要递增导航代次，这次聚焦没有变化。Edge 探针实测回执返回后，新 Tab 获得焦点。修改保护条件时应记录窗口在启动期间收到的主动聚焦意图，包含同一叶的重新聚焦。 [同叶焦点现象](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws-focus-orders-r3.log:21) · [启动回执](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/ui/AgentCliModule.tsx:162) · [叶焦点入口](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/ui/AgentCliModule.tsx:490)

### P2 · 外部 Core 写另一 Space，已终止的叶仍留下并返回版本冲突

在真实 Core 0.1.19 中，探针使 A 的终止请求通过绑定校验并等待发出 kill，另一 Core 客户端提交只改 B 且正确递增 B 修订的文档，然后让 A 继续。A 的会话确实退出，B 的写入保留。A 的移除仍用读取时的文档全局版本，返回 `VERSION_CONFLICT`，A 的原叶留在布局。这与同一 Engine 的窗口操作已被串行化的结果有明确边界。退出后可重读文档，校验 A 的修订和原绑定仍一致时仅补交布局清理。 [真实 Core 探针输出](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws-close-orders.log:12) · [文档 CAS 与丢回包核对](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/engine/workspace-layout.ts:96) · [终止到保存](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/ws/plugins/agent-cli/src/engine/workspace-layout.ts:157)

## E07 · 历史恢复与本机批准

- **运行历史保护签收。** `Automation Runs` 和 `Task Runs` 的历史可读，恢复到旧版本会在历史保存前拒绝。独立 HTTP 复跑同时验证普通笔记可恢复、两类运行的旧内容可读、当前退出输出和待释放标记逐字节保留。 [目录保护](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/guards/plugins/versioning/src/engine/index.ts:35) · [HTTP 测试](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/guards/apps/engine/test/engine.test.ts:611) · [独立回归日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/guards.log)
- **同一 Vault 原位回滚与失败保留批准签收。** 改名先在应用私有目录落盘挂起，便携定义恢复旧字节也不能消除挂起。独立复跑了真实定义发布失败，旧批准 ID、原修订和外部状态照常可读；成功改名后重启 Engine 并原位恢复定义，旧修订可读，原批准仍被拒。再把名称正常改回也需要新批准。代码在定义仍是原修订的可判定失败时用挂起版本条件写回原批准。进程在这两个文件操作之间中断时保守挂起，未做断电或磁盘故障实测。 [挂起及回滚](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/guards/plugins/automations/src/engine/terminal-environment.ts:276) · [原位恢复夹具](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/guards/apps/engine/test/module-credential-host.test.ts:183) · [Lead 恢复日志](D:/Document/code/huhu/temp/issue-baseline/e07-rollback-guards.log)

## #8 · 联系人隐私

- **公开 Sent 的 Bcc 路径签收。** 联系人只调用公开正文能力，正文投影无 RFC822 头，去掉原文控件和请求。固定候选的 Edge 实际组件实测了带 Bcc 的 Sent 副本仍可读正文，公开读区无私人地址、无原文按钮、未触发原文调用。单账号普通目录另有最新邮件入口，原文读取仍通过。 [公开正文能力](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/mail/plugins/mail/src/engine/message-cache.ts:285) · [公开和普通阅读分流](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/mail/plugins/mail/src/ui/MailReader.tsx:82) · [固定候选 Mail 证据](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/mail/.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.1-public-reader.md)
- **撤出已打开读区签收。** 公开读取解析前后校验账号、目录可见性和缓存来源。列表删除选中项时关闭旧读区，账号移除事件触发刷新。Windows Edge 复跑验证移除 Sent 目录后旧正文退出且同组另一账号可见，移除账号时同时关闭已打开读区及等待正文的另一窗口，延迟送回已取得的响应未重新打开正文。回环 IMAP 和 SMTP 无额外同步或投递。 [读区选中项匹配](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/mail/plugins/mail/src/ui/MailModule.tsx:786) · [Engine 聚合与公开读取](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/mail.log) · [实际组件复跑](C:/Users/cdewta/AppData/Local/Temp/huhu-t187-task07-942d090b/mail-renderer.log)

## 阻碍与接续

复验完成。工作区的三处 P2 仍需修复。跨标签移动、在线 Core 重连时的键盘输入恢复及组合安装包不在上述通过范围。Edge 焦点探针采用真实组件与合成 Engine 响应，验证的是分栏 DOM 焦点和选中状态。Core 终止探针运行了实际 Windows 终端，未验证强制停止时整棵子进程树。

## Lead 验收

Lead 核对了 E07 和 Mail 各两处复验通过。工作区三处剩余 P2 进入下一本地修复，2e0d4d36 先完成刚并入 SSH 与 Mail 的同候选门禁。
