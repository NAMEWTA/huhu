# #5 T7.1 生产切换独立审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t187`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report01.md`
- 审查候选 — `9bb7efaffe2a101ed1de755731dd176aa9883106`
- 执行结果 — `done`

## 结论

**T7.1 暂不通过，W8.3 的切换前置条件仍待修复。** 旧 Automations supervisor、PID/heartbeat、claim 写入和旧问答接口已退出生产。规则、人工及授权 MCP/CLI 的任务派遣已汇入 Tasks，Agent 的原始回执、两个 ACK 和任务结果投递已在 Windows 合成夹具中取证。候选仍允许终端规则经旧 Safe 引用启动，直接缺少 #5 E07 和 #4 W8.3 要求的切换。另有两处源码可证的恢复或路由遗漏。

### 规格发现

1. **P1 · 终端规则仍能写入并执行旧 Safe 环境引用，阻塞 E07 和 W8.3。** 规则 schema 接受 `envRefs`，编辑器仍显示该输入并把原引用合并回保存结果。终端规则把引用传给统一启动入口，规则无自有环境时，Agent CLI 仍通过 `secretUse` 解析，Safe 停用或锁定会使这类规则失败。独立通过的 Automations 测试还把这条转发和锁定失败列为预期。Windows 的受保护规则环境回归通过，说明新入口可用。当前环境配置描述符只允许 Desktop，若继续沿用 E07 原文，授权 MCP/CLI 对应操作仍缺候选入口和证据。修复入口为规则 schema、RuleEditor、Automations 启动装配和 Agent CLI handler。停止接收、保存及解析旧引用，对已存在的规则只读出补配状态并保护原文件，随后以受保护配置验证 Safe 未初始化、锁定和停用的场景。 [E07](/D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/source.md:598) · [W8.3](/D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-4-agent-cli/tasks/W8.3-acceptance-package.md:10) · [规则 schema](/D:/Document/code/huhu/temp/issue-worktrees/integration/packages/contracts/src/kinds/automation.ts:41) · [RuleEditor](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/ui/RuleEditor.tsx:119) · [装配](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/index.ts:81) · [启动 handler](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts:306) · [工具描述符](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/terminal-environment.ts:34) · [旧行为回归](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/test/service.test.ts:299)
2. **P2 · 定时终端规则在启动前中断后可吞掉同一计划点。** `activateRule` 先追加 activation，再创建关联 `automation-run`。两次写入之间中断时，定时重交按 ruleId 和计划点命中仅有的 activation，直接返回。启动对账只枚举当前 owner 的 run，无法补齐这个发生。计划点可能既无终端也长期无终态。修复入口为 `activateRule`、`lastActivatedFor` 和 `reconcileTerminalRecords`，让发生在第一次持久化时即可识别启动阶段并关联稳定 run/request。补足 activation 已落盘、run 尚未落盘的中断用例。已有用例覆盖终端已经创建后丢失 ACK 的窗口。此遗漏为源码判断。 [发生去重与写入](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:316) · [创建运行](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:352) · [启动对账](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/service.ts:467) · [已有回归](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/test/service.test.ts:373)
3. **P2 · 已绑任务的会话发出纯 blocked 信号时仍能走独立 Human 等待任务。** `WaitingWatcher` 接受生产会话的 blocked 信号，`applyStatus` 只沿用旧 `waiting.taskId`，`onBlocked` 再据此创建或重用 Human 任务并直接写 waiting 评论。该入口没有查当前会话的 Tasks 执行绑定。同一会话用于任务时，用户可能在另一个 Human 任务收到等待评论，原任务缺少本次等待的现场定位。结构化 question/result 走原回执，偏差限于纯状态信号。修复入口为 `onBlocked`，按已确认的会话执行绑定，为原任务投影只提供现场定位的等待状态，独立会话保留 Human 兜底。此遗漏为源码判断。 [行为规格](/D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/spec.md:14) · [Watcher](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/waiting.ts:106) · [会话状态](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/sessions.ts:943) · [Human 等待任务](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/index.ts:123)

### 规范与调用方

- 以 Git 对象检查 `4c8fe523`、`35dc2bf8` 和 `f207e8e1` 的切换及其在固定候选的实际调用方。旧 worker、supervisor、claim 源码和对应 manifest 能力已经删除。旧 `task-run` 文件类型仍可识别，启动、列表和新派遣过程中，旧 claim 和运行文件字节保持原样。真实 Engine HTTP 对原 answer、retry、activeFor 和 markDispatched 均返回 `CAPABILITY_NOT_FOUND`。 [旧文件回归](/D:/Document/code/huhu/temp/issue-worktrees/integration/apps/engine/test/engine.test.ts:539)
- 桌面和受权外部 `tasks.dispatch` 调用同一个 `TaskDispatch.accept`。规则的手动立即运行和定时触发经 `TaskScanOccurrences`、`taskDispatch.acceptRule` 进入该协调器，模板先创建真实任务。已核对首页走 `tasks.list`，任务详情及自动化抽屉分别查 `tasks.dispatch.list/recent` 并复用详情组件，终端规则明细单独走 `automations.runs`。现行示例 daily-review 继续调用 Tasks 列表，旧能力留在历史资料和回归断言。当前知识记录仍把 `markDispatched` 与 Automations claim 写成现行机制，归档时应校正其状态所有权和来源。 [Tasks 入口](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/index.ts:211) · [规则入口](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/engine/index.ts:151) · [抽屉](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/automations/src/ui/RunsPanel.tsx:31) · [现行知识记录](/D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/notes/context/tasks-and-automations.md)
- Agent CLI 先持久化原始回执，再向 helper 回 `agent_received`。Tasks 消费 handler 仅接受 `plugin:agent-cli`，按已落盘的 dispatch 与 execution binding 核对，回 `tasks_consumed` 前已保存原 payload 和可重建的 delivery/message ID。Agent 按原身份校验 ACK 才停止重交，Tasks 独占 result/failed 评论投影。终端对账通过当前 Vault/设备的 owner 与原 requestId 核对已知 sessionId，旧 launch ACK 丢失场景未观察到替代启动。 [Agent 回执](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/agent-cli/src/engine/execution-receipts.ts:110) · [Tasks 绑定](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/dispatch.ts:195) · [消费与投递](/D:/Document/code/huhu/temp/issue-worktrees/integration/plugins/tasks/src/engine/receipt-inbox.ts:61)
- 实际网关按显式选择开放工具，内部插件经 manifest 权限，两个入口各有校验。`defaultExposed: true` 的查询声明不替代显式开放。已核对第三方声明中的 Herdr Core 与 Croner，以及批次设计中 agent-autoloop 固定参考；本轮未再次逐函数对照第三方 checkout。 [Dispatcher](/D:/Document/code/huhu/temp/issue-worktrees/integration/packages/kernel/src/dispatcher.ts:128) · [采用来源](/D:/Document/code/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-5-task-automation/design.md:64) · [许可声明](/D:/Document/code/huhu/temp/issue-worktrees/integration/THIRD_PARTY_NOTICES.md)

## 验证

独立复跑在 Windows 用固定 pnpm 12.10.1、Vitest 3.2.7，采用 `--config.offline=true --config.verify-deps-before-run=false exec vitest run --no-cache --pool forks --maxWorkers 1`，每组独立系统临时目录和合成数据，运行前后检查同一完整提交和干净工作区。合计 **86 项通过**。Core 是候选桌面资源中的 0.1.19，二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。Core 协作连接 `wta` 是 0.1.21。

| 证据 | 实际结果 | 复查入口 |
| --- | --- | --- |
| 领域与 ZIP 回归 | 76 通过。规则和人工争用、Task 结果持久化与一次增量投递、规则发生中断恢复、ZIP 损坏、还原历史、原 Vault 重开才继续旧派遣。 | `hc read t189`。选择 `plugins/automations/test/{service,task-scan-occurrences}.test.ts`、`plugins/tasks/test/persistence-http.test.ts`、`packages/vault/test/package.test.ts`。 |
| Engine 生产入口回归 | 5 通过，44 项被过滤。Agent 规则预览/手动发生与候选派遣、旧记录与旧能力、Tasks 停用后的 MCP、MCP 默认关闭及明确开放、真实 Engine 导入导出与 SHA。 | `hc read t189`。选择 `apps/engine/test/engine.test.ts`，测试名匹配 `Agent 任务自动化的预览\|恢复 Engine 时只查询\|ACC-PL-01 停用 tasks\|MCP over HTTP\|ACC-SY-08`。 |
| 真实 Core、合成 provider、真实 MCP/CLI | 2 通过。两个首个 ACK 被丢弃后复用同 receiptId，重新核对到 `agent_received` 和 `tasks_consumed`，原生输入一次。另一用例在同 session 做三轮输入、原生与普通回复各一次、两条首轮时间线消息和四个持久 ACK，停用 Automations 仍可人工推进。旧 Safe 引用的真实 Herdr 用例在源码中明确跳过 Windows。 | `hc read t18b`。选择 `plugins/agent-cli/test/native-receipts.live.test.ts` 的 `Windows Engine recovers both lost ACKs`、`Windows MCP and CLI dispatch`，以及 `apps/engine/test/engine.test.ts` 的 `ACC-SF-04 / C07`。 |
| Windows 模块凭据 | 3 通过。新规则配置在 Safe 锁定时可用，同一请求只启动一次，Core 运行参数、查询与 ZIP 未含合成值，导入后需要本机补配。 | `hc read t18d`。选择 `apps/engine/test/module-credential-host.test.ts`，使用候选 Herdr 二进制。 |
| Lead 的候选门禁 | 同 SHA 日志已有 lint、TypeScript、format、knip、build 和 Windows x64 NSIS package 通过。独立复算 `HUHU-0.0.1-rc.4-win32-x64.exe` SHA-256 为 `18d62216ebd3c0fa0c4a4857922cebae8aec60de2f79f2f6712f3e91593de088`。读取时全量回归日志仍无结束摘要。 | [门禁日志](/D:/Document/code/huhu/temp/issue-baseline/9bb7efaf-windows-gates.log) · [回归日志](/D:/Document/code/huhu/temp/issue-baseline/9bb7efaf-windows-regressions.log) · [安装包](/C:/Users/cdewta/AppData/Local/Temp/huhu-w83-9bb7efaf/HUHU-0.0.1-rc.4-win32-x64.exe) |
| 较早的投影记录 | `sameSession=true`、三轮输入、四个持久 ACK。该日志脚本没有检查完整提交，固定候选以本次独立复跑为准。 | [task-run-projection-core.log](/D:/Document/code/huhu/temp/issue-baseline/task-run-projection-core.log) |

## 待证据与接续

- **T7.1** 仍需在修复候选的干净安装入口验证 CLI/MCP 默认全关、授权和撤权，及撤销某份局域网邀请后其会话失去操作权限、其他独立会话与内部回执继续。本轮实际取证到 Engine HTTP、CLI/MCP 和合成 Vault，UI 邀请撤销依赖包内场景。A04 的完整 UI 表现也待该层取证。
- **W8.3** 已有安装包文件与 SHA。仍需在该版本或修复后的新 SHA 安装到临时 Vault，记录 OS、Core、实际 provider 和复现输入，经任务页人工派遣并在工作区定位同一 session，补测停用 Agent CLI 或目标不可用时保持原凭据。切换修复若改变 SHA，安装冒烟及后续验收需记录新 SHA。
- **W8.2 / T7.2** 分别以同一修复包独立签收。W8.2 覆盖多 Space、四向分栏、重连、恢复、关闭与实机显示及性能。T7.2 使用支持完整问答的真实 provider，走明日到期、后台原会话、失 ACK 重交、任务时间线和人工关闭。合成 App Server 同会话与双 ACK 回归只支持本报告所列候选行为。
- 业务工作区为集成 worktree。审查使用固定提交与隔离运行证据，唯一交付写入为本报告。

## Lead 验收

## T7.1 补充取证 · Windows 打包冒烟

Lead 提供了同一固定候选 `9bb7efaffe2a101ed1de755731dd176aa9883106` 的后续冒烟记录。本次复核日志、执行脚本和清单，并逐项复算六个打包文件的大小及 SHA-256，均与清单一致。NSIS 安装包 SHA-256 为 `18d62216ebd3c0fa0c4a4857922cebae8aec60de2f79f2f6712f3e91593de088`，实跑的 `win-unpacked/resources/app.asar` 为 `958e8c8ffa631549690a3cb5c524c2630abb40b8a3bd6c4cbed915791d243121`。脚本从 `win-unpacked/HUHU.exe` 启动，并核对应用报告的提交号。已取得同包解包直跑证据，NSIS 安装流程与安装后路径仍待取证。 [冒烟日志](D:/Document/code/huhu/temp/issue-baseline/9bb7efaf-packaged-smoke.log) · [哈希清单](D:/Document/code/huhu/temp/issue-baseline/package-9bb7efaf-hashes.json) · [执行脚本](D:/Document/code/huhu/temp/issue-baseline/9bb7efaf-packaged-smoke-inner.ps1)

| 验收范围 | 本次覆盖 |
| --- | --- |
| T7.1 生产工作台派遣与原结果 | 临时 Vault，停用 Automations 后从真实任务详情点「立即派遣」。随包 Core 0.1.19 与真实 Codex CLI 0.171.0 使用本地合成 Responses 服务。恰好处理一次模型请求、写入一条绑定原 run 的结果，工作台展开同一结果并定位原 session。补足 W8.3 的派遣、结果和定位冒烟。 |
| T7.1 工具默认及授权回收 | 临时 Vault 开启 MCP HTTP 传输后，CLI 令牌能力列表和 MCP 工具列表起始为空。显式开放 `notes.read` 后分别查询成功，撤权后列表为空，后续调用被拒绝。随包 CLI 另通过版本一致和 `huhu call vault.info` 冒烟。Tasks 派遣、回复及回执与撤权同一场景仍由此前源码回归或待补包内联验覆盖。 |
| T7.1 局域网邀请撤销 | Edge 三个浏览器会话验证撤销一份邀请后，该邀请下两个页面及事件连接失效，旧链接重开失效。另一邀请的任务详情和事件连接仍可用，停止分享后桌面仍运行。该探针与 Agent 结果探针各自使用临时 Vault。 |
| T7.1 基础业务与数据包 | Playwright 打包子集 3 通过、1 跳过。已覆盖笔记保存、Human 任务完成、ZIP 导出、随包 Core 启动 shell 和 CLI 查询。新格式 ZIP 还原、损坏包和禁止跨 Vault 重发仍引用此前隔离回归。 |

**T7.1 暂不通过，W8.3 的切换前置仍待修复。** 新证据补足真实工作台手工派遣、原结果、原会话定位、工具授权与邀请撤权。旧 Safe `envRefs` 的 P1 和此前两项 P2 维持。另确认打包测试仍保留按 Windows 条件跳过的旧 supervisor/`agent_prompt` 用例，属于 E04 的打包测试更新遗漏。生产源码退役证据仍成立。将该用例改为现有新规则入口的包内回归，验证同一规则发生与同一 Tasks 派遣及结果。 [旧打包用例](D:/Document/code/huhu/temp/issue-worktrees/integration/tests/e2e/packaged/packaged.spec.ts:163) · [工作台探针](D:/Document/code/huhu/temp/issue-baseline/packaged-codex-native-workbench.cjs:115) · [工具授权探针](D:/Document/code/huhu/temp/issue-baseline/packaged-web-tool-edge.cjs:79) · [邀请撤销探针](D:/Document/code/huhu/temp/issue-baseline/packaged-web-tool-edge.cjs:222)

W8.3 尚需补包内目标不可用或停用 Agent CLI 并保持原凭据的验证。W8.2 的完整工作区旅程与 T7.2 的真实服务问答、明日到期、失 ACK 后重交及人工完结仍待各自验收。本补充沿用 T7.1 的报告身份和候选，不改写原执行记录。
