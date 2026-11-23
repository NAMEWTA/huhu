# 独立关闭条件审查

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead — `t3p`，本机默认 Core
- terminal_address — `t1d4`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d4/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1d4/report01.md`
- 执行结果 — `done`，独立审查已完成

## 关闭与归档建议

| Issue | 按本轮已确认范围 | 对应 change |
| --- | --- | --- |
| [#8 Mail](https://github.com/NAMEWTA/huhu/issues/8) | **暂缓关闭**。M-01 账号行与分栏还有确定的产品交互缺口。 | 保留活跃，补齐交互后复验。 |
| [#9 Safe](https://github.com/NAMEWTA/huhu/issues/9) | **可以关闭**。个人密码管理与现有消费者的认证去耦已接通。完整 SSH 产品验收按 #7 暂停处理。 | 可归档为 implemented，附各运行环境证据及 #7 边界。 |
| [#10 Dashboard](https://github.com/NAMEWTA/huhu/issues/10) | **暂缓关闭**。看板交互已有实际交付。强制的 W01-01 网格运行对照和生产选型决策仍缺。 | 保留活跃，补齐选型证据和结论。 |
| [#1 任务 Issue 化](https://github.com/NAMEWTA/huhu/issues/1) | **可以随 #5 关闭**。#1 原实现已归档，曾缺的任务绑定实时接管与原任务闭环已有 #4／#5 的实现和运行证据，工具权限由 #6 延续。 | #1 已归档。#5 可按现有签收范围归档，引用最终包和 #1 的历史归档。 |

## 规格轴

### #8 Mail

- **确定缺口 · M-01 账号行。** Issue §4 M-01 和 §13 要求账号行展示未读数、悬停刷新、同步与异常状态，并从账号行右键刷新、修复、编辑或删除。生产账号行只有选择入口、标题和一个凭据检查提示。刷新与修复、改名、删除在用户选中账号后的右侧工具栏。联系人未读数另有实现。两邮箱下，用户在左栏直接查看未读或刷新、修复另一账号的操作仍缺。M-05 正文右键操作已独立接通。 [Issue](https://github.com/NAMEWTA/huhu/issues/8) · [确认原型记录](../../../../../.agents/dev/changes/2026-11-19-issue-8-mail-module/prototype-review.md#L15) · [账号行](../../../../../plugins/mail/src/ui/MailModule.tsx#L393) · [账号按钮](../../../../../plugins/mail/src/ui/MailModule.tsx#L420) · [详情刷新](../../../../../plugins/mail/src/ui/MailModule.tsx#L823) · [详情操作](../../../../../plugins/mail/src/ui/MailModule.tsx#L846) · [正文右键](../../../../../plugins/mail/src/ui/MailReader.tsx#L325)
- **确定缺口 · 可调整分栏。** S1a.3 明确验收拖动账号、联系人和阅读分栏，早期报告曾把拖动栏宽和右键留待后续。宽屏生产界面靠 CSS 断点使用 220–260px 账号栏和 13rem 联系人栏。两个 grid 的生产 JSX 都没有拖动把手或宽度输入，用户无法按约定调整分栏。现有窄窗分层返回可用，属于同一工作区的另一项行为。 [S1a.3 验收](../../../../../.agents/dev/changes/2026-11-19-issue-8-mail-module/tasks/S1a.3-manage-accounts.md#L19) · [早期证据](../../../../../.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S1a.3-account-repair.md#L14) · [账号 grid](../../../../../plugins/mail/src/ui/MailModule.tsx#L393) · [联系人 grid](../../../../../plugins/mail/src/ui/MailModule.tsx#L864) · [网格尺寸](../../../../../plugins/mail/src/ui/mail.css#L323)
- **已接通与验证。** Engine 在同一插件里注册 18 家与自定义预设、账号和 OAuth、同步、正文与对话、草稿和发件箱、子集恢复、AI。外部 AI 需工作台确认。历史源码构建 Mail UI 13/13，含搜索、回复、草稿失败恢复、桌面与 Web 受管附件、远程图片。最终包 package 5/5 中有锁 Safe 后回环邮件认证及新格式恢复。此前的 Graph 回流缺口已由 `c5aa50fe` 关闭，已观察身份与延后通知随检查点写入。回环 Engine 16/16 与独立复核覆盖首扫、重放、恢复和较早接收的真新信。对本地从未观察过的首次移入，既有交付记录保留 Inbox delta 无法辨别其来源的边界。 [预设](../../../../../plugins/mail/src/engine/presets.ts#L34) · [统一注册](../../../../../plugins/mail/src/engine/registration.ts#L99) · [AI 确认](../../../../../plugins/mail/src/engine/ai-settings.ts#L496) · [Mail 13 项](../../../../../temp/issue-worktrees/integration/temp/final-audit/followup-mail-b8f6c427.log) · [Graph 通知判定](../../../../../plugins/mail/src/engine/message-cache.ts#L591) · [Graph 独审](../../../../../.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S5.2-graph-classification-review.md) · [Graph 16 项](../../../../../temp/issue-worktrees/integration/temp/final-audit/graph-classification-check.log)
- **外部验证边界。** 线上 Google/Microsoft、真实 IMAP/SMTP 与提供商矩阵、第二设备授权及 Windows/macOS 当前安装包待用户后测。新增 Graph 专属授权和旧 one-mail 格式迁入已出范围。当前缺口可以用本机合成邮箱验收。 [产品定案](../../../../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md#L14) · [新格式范围](../../../../../.agents/dev/changes/2026-11-19-issue-8-mail-module/spec.md#L40)

### #9 Safe

- **已接通与验证。** Safe 用稳定条目、账号、彩色标签及独立显式 reveal。个人类 handler 校验当前解锁会话，UI 收到锁定世代事件即收起明文界面。模块认证经独立的 keyring 保护层，Linux 显式用 Secret Service。Git 从当前绑定远端拿认证交给系统 Git，Safe 密文整代同步是独立的备份职责。Agent CLI、Automations、Mail、现有 SSH 代码各自持有模块认证。扫描生产路径未见 `secretUse`、`safe://` 或 `allowedModules`，`safe.accounts.reveal` 只在 Safe 自身出现。 [Safe 服务入口](../../../../../plugins/safe/src/engine/index.ts#L161) · [锁定界面](../../../../../plugins/safe/src/ui/SafeModule.tsx#L72) · [模块保护](../../../../../apps/engine/src/module-credential-host.ts#L12) · [Git 认证](../../../../../plugins/versioning/src/engine/sync.ts#L365) · [Agent 环境](../../../../../plugins/agent-cli/src/engine/index.ts#L79) · [规则环境](../../../../../plugins/automations/src/engine/index.ts#L282) · [SSH 主机认证](../../../../../plugins/ssh/src/engine/host-configurations.ts#L108)
- **运行证据与边界。** Linux 有真实 Secret Service 可用和 D-Bus 不可用证据。较早固定候选 f91 有实际 Git 锁定／停用 1/1、Agent 三态实际受保护终端 2/2、已批准规则 CLI/MCP 1/1。最终包验证 CLI/MCP 单项授权、锁 Safe 后使用 Mail、恢复个人数据并提示重配 Mail 凭据。已有 SSH 自有认证在 Safe 三态的 Engine 回环证据，最新 SSH 整包及完整外部 SSH 旅程留在暂停的 #7。旧 Safe 库已排除迁入，当前安装版 Windows Credential Manager 和 macOS Keychain 列用户后测。未发现非 SSH 范围的确定缺口。 [平台矩阵](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/evidence/P0.1-protection-platform-matrix.md) · [SSH 与模块回归](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/evidence/P3.4-P10-linux.md#L15) · [Git 包日志](../../../../../temp/issue-worktrees/integration/temp/final-audit/final-package-git-f91a5515.log) · [Agent 包日志](../../../../../temp/issue-worktrees/integration/temp/final-audit/final-package-native-f91a5515.log) · [规则包日志](../../../../../temp/issue-worktrees/integration/temp/final-audit/final-package-rule-f91a5515.log) · [最终包原始结果](../../../../../temp/issue-worktrees/integration/temp/candidate-acceptance/package.M3rcaN/result.json)

### #10 首页看板

- **已接通与验证。** Widget 来自受控注册表，插件停用和缺定义有独立显示边界。Workbench 保存可取消草稿和单独的实例配置。Engine 串行写入、校验 revision、实现新格式备份恢复。保存回执已控制旧查询反写，窄屏顺序与尺寸使用同一布局，关闭时有保存、放弃与继续编辑。最终包 dashboard 1/1 覆盖四主题明暗、减少动效、放大与键盘保存，close 2/2 覆盖保存失败保留窗口及放弃，web 1/1 覆盖同机浏览器编辑与重开。旧 widgets.json 迁移已取消。不同宿主、触摸与实际读屏矩阵缺证。现有指针测试定义和源代码可核对，最终包这四项的结果只写各自实际场景。 [注册表](../../../../../packages/workbench/src/contributions.ts#L110) · [保存与冲突](../../../../../packages/workbench/src/home/useDashboard.ts#L131) · [关窗结算](../../../../../packages/workbench/src/home/useDashboard.ts#L307) · [Engine 写入](../../../../../packages/kernel/src/capabilities/home-dashboard.ts#L95) · [新格式恢复](../../../../../packages/kernel/src/capabilities/home-dashboard.ts#L207) · [最终 dashboard](../../../../../temp/issue-worktrees/integration/temp/candidate-acceptance/dashboard.UAsPrC/result.json) · [最终 close](../../../../../temp/issue-worktrees/integration/temp/candidate-acceptance/close.KcyzcP/result.json) · [最终 Web](../../../../../temp/issue-worktrees/integration/temp/candidate-acceptance/web.AJ5lzp/result.json)
- **工程缺口见下方规范轴。** 现有指针与键盘操作为实际入口。W01-01 缺失的是 Issue 明列的选型证据与生产实现采用该结论的依据。

### #1 是否已由 #5 覆盖

- **已覆盖。** `e1837b72` 已将原 #1 change 归档为 implemented，并记录当时缺任务绑定会话入口和真实 CLI 上报边界。当前 contracts 保留两个类型、三个状态和三类自动化。Markdown 区段与引用沿用 #5 确认的 `<task>`、`<comments>`、`[[路径]]`。GitHub #5 §1 明确保留现行约定。Tasks 的派遣、回执、补充和回答进入同一生产路径。Agent 等待监听核对会话、任务和运行后显示原任务等待状态，没有任务绑定才走独立 Human 任务路径。Dispatcher 将内置插件许可与外部工具开放分别判定。 [#1 归档](../../../../../.agents/dev/archive/changes/implemented/feature_2026-11-13-task-issue-automation/README.md) · [#5 现行契约](../../../../../.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md#L9) · [任务模型](../../../../../packages/contracts/src/kinds/task.ts#L8) · [任务文件解析](../../../../../packages/vault/src/markdown/regions.ts#L63) · [自动化动作](../../../../../packages/contracts/src/kinds/automation.ts#L32) · [派遣与接收](../../../../../plugins/tasks/src/engine/index.ts#L458) · [等待接线](../../../../../plugins/agent-cli/src/engine/index.ts#L164) · [Dispatcher](../../../../../packages/kernel/src/dispatcher.ts#L352)
- **运行证据与边界。** #5 T7.1 在真实 Core 上用合成 provider 验证绑定终端的等待及重试，独立等待任务已有 Engine 回归。最终包 T7.2 走原生 Codex 原会话、提问回复、唯一结果和人工关闭，模型响应来自回环夹具。另有 CLI-only 和 HTTP MCP-only 同包原会话 2/2。真实线上模型以及所有版本的 Claude/Codex 在真实登录、权限等待中是否发出 OSC 7501，仍按具体 Provider 能力和现场处理边界列未测。 [绑定等待回归](../../../../../.agents/dev/changes/2026-11-19-issue-5-task-automation/evidence/T7.1-bound-terminal-wait.md) · [独立等待用例](../../../../../apps/engine/test/engine.test.ts#L834) · [T7.2 原始结果](../../../../../temp/issue-worktrees/integration/temp/candidate-acceptance/tasks.jqhB5t/result.json) · [外部原会话原始结果](../../../../../temp/issue-worktrees/integration/temp/candidate-acceptance/external-agent.R301gP/result.json)

## 规范轴

- **#10 W01-01 关闭条件尚未满足。** GitHub §6.3、W01/W04 和本地任务要求先比较实际 RGL、GridStack 与 Homarr 同样本并保存选型记录，成熟网格满足时直接复用。现有设计 §34–44 是静态预选，明确当时没有运行结果。早期独审已指出此项未开始，本轮在最新交付记录、change 和既有 Core 审查中也未找到其后运行结论或用户改动该要求的记录。当前生产实现自己处理指针坐标、尺寸约束、碰撞让位及窄屏重排。补同样本运行对照并按证据归档选型，若成熟实现达标则按契约接入。现有包通过证明了部分交互与持久化，仍需补工程选型依据。Lead 补充授权以 main 交付及逐项证据承接历史 PR 条件。 [Issue](https://github.com/NAMEWTA/huhu/issues/10) · [静态选型](../../../../../.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/design.md#L34) · [W01-01 执行判据](../../../../../.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/tasks/W01-01-grid-comparison.md#L13) · [此前审查](../../../2026-11-21-huhu-issues-3-10-linux/t9/report01.md#L243) · [指针实现](../../../../../packages/workbench/src/home/Dashboard.tsx#L145) · [几何算法](../../../../../packages/workbench/src/home/dashboard-layout.ts#L13)
- **#8、#9、#1 对照范围。** Mail 使用独立插件注册与 Huhu Dispatcher，来源记录锁定 one-mail 参考版本并注明具体行为及适配。Safe 保持个人账户与服务认证所有权分离。Tasks/Automations 沿用 Vault 文件、受控 Dispatcher 和同一 Agent CLI 运行入口。此次定向检查未发现这些边界的新增规则违反。 [Mail 来源](../../../../../docs/upstream/ledger.md#L24) · [Mail NOTICE](../../../../../THIRD_PARTY_NOTICES.md#L135) · [Safe 归属契约](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/spec.md#L26) · [Task 执行契约](../../../../../.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md#L34)

## 审查基线与采证

- 工作目录 `/home/wta/projects/huhu`。开始时 `HEAD` 与本地 `origin/main` 均为 `fc43ceef5b64ca1c9a68404c9110a6ca46883034`。固定 AppImage 的应用／驱动为 `f6c4e0d5684afa6e832340c4fbb4fd5445cf71b5`。用 `git diff --name-only f6c4e0d5 fc43ceef -- apps packages plugins native scripts tests package.json pnpm-lock.yaml` 核对，输出为空。收尾期间出现 Lead 的版本与文档工作树改动，审查结论固定到已提交基线。
- 按项目配置用 `gh issue view NUMBER --repo NAMEWTA/huhu --json number,id,title,state,labels,url,author,body,comments` 读取 #1、#5、#8、#9、#10。均为 OPEN，评论各 0 条，URL 与配置一致。对照最新范围决定、最终交付记录、原型确认记录、生产源码和历史审查。 [Huhu Issue 来源](https://github.com/NAMEWTA/huhu/issues) · [最终范围与交付证据](../../../../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/evidence/non-ssh-final-delivery.md)
- 以固定包索引的散列为输入，通过 `sha256sum -c` 核对 integration 下 8 份原始 JSON，全部一致。用 `jq -s` 汇总原件为 15 通过、0 失败、0 跳过、0 flaky、0 测试外错误。较早包、回环 Engine 和源码 UI 按各自记录列明。历史失败仍保留原结论。 [最终包索引](../../../../../.agents/dev/changes/2026-11-19-huhu-issues-3-10/evidence/linux-package-f6c4e0d5.json)

## 未运行的验证

本轮仅独立读取与核对。未运行 Vitest、E2E、Electron、构建、打包、全仓检查、视觉采证或外部环境验证。未改代码、Git、Issue 或清单。

## 阻碍与接续

审查任务已完成。#8 的 M-01 产品缺口及 #10 的 W01-01 工程证据缺口交 Lead 决定收尾安排。#9 与 #1 可按上表收口。汇总 change 若保留整批完整交付的含义，待 #8、#10 收尾后归档。#7 保持独立暂停记录。

## Lead 验收


Lead 2026-11-23：已读报告并核对关键代码定位；接受确定缺口，暂缓相应 Issue 关闭。文档结果与后续补齐同步，不把原总结视作无缺口证明。
