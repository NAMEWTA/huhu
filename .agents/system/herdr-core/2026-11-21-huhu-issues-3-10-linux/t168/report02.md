# t168/task02 Agent 审查发送与候选夹具独立复核

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t168`，Lead `t3p`
- task — `task02.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t168/task02.md`
- 报告文件 — `/home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t168-report02.md`
- 执行结果 — `done`

## 规格审查

**[P2] 恢复视图删除最后一条状态未知的意见后，终端仍是只读，新的评审也发不出去。** 发送超时后重新打开会话，桥接器会建立带恢复证明的只读连接。Workbench 的评审列表允许删除状态未知的意见。删除会把 `reviewInputPending` 变为 false，桥接器却只在一次评审发送结束时检查是否应通知重连。此时恢复视图仍持有恢复资格，普通发送被 `take` 拒绝，终端也继续丢弃键盘输入。未知意见已经消失，界面没有可执行的重交操作。用户必须手动关闭并重开终端视图。建议在最后一条未知意见从持久记录移除后，同样通知当前恢复视图重新接管，复用已有的接管握手。 [W7.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W7.2-review-send.md) · [ReviewPanel.tsx:266](../../../../../plugins/agent-cli/src/ui/ReviewPanel.tsx#L266) · [index.ts:715](../../../../../plugins/agent-cli/src/engine/index.ts#L715) · [sessions.ts:1607](../../../../../plugins/agent-cli/src/engine/sessions.ts#L1607) · [input-ownership.ts:16](../../../../../plugins/agent-cli/src/engine/input-ownership.ts#L16) · [terminal-bridge.ts:27](../../../../../plugins/agent-cli/src/engine/terminal-bridge.ts#L27)

定向探针用真实的 `SessionsService`、临时会话记录、`InputOwnership` 和终端桥，Core 收据和 WebSocket 以测试替身控制。首次发送模拟传输超时，持久记录保留 `sending`。关闭观察者和控制视图后重开，桥发送带证明的 `observe` 帧。删除唯一未知意见后，`reviewInputPending=false`，该连接收到的模式仍只有 `observe`，键盘写入 0 次，新意见发送返回 `INVALID_INPUT`。再手动关闭并重开即收到 `control`。同一探针也观察到，如果原控制连接在回执丢失后一直开着，它仍可写键盘及发送新的待发意见，未知的旧意见继续保存。两种状态的差异取决于连接何时建立。探针未观察到旧意见被自动重发。 [sessions.ts:1646](../../../../../plugins/agent-cli/src/engine/sessions.ts#L1646) · [terminal-bridge.ts:57](../../../../../plugins/agent-cli/src/engine/terminal-bridge.ts#L57)

### 其他已核对的行为

- **控制证明和会话。** UUID 随获权连接签发，Engine 在请求的 session 中同步比对当前 claim，发送前核对 Core 进程身份。跨会话或脱离后的证明无法取得该 claim。普通观察者收不到证明，桥也忽略其键盘和尺寸帧，UI 禁用提交。恢复连接的证明只允许显式选择状态未知的意见。旧的无视图能力调用仍可在没有本地 claim 或 Tasks owner 时取得审查权限。外部调用携带的证明不会参与仲裁，沿用会话版本、代次及所选意见校验。 [terminal-bridge.ts:20](../../../../../plugins/agent-cli/src/engine/terminal-bridge.ts#L20) · [input-ownership.ts:13](../../../../../plugins/agent-cli/src/engine/input-ownership.ts#L13) · [sessions.ts:1128](../../../../../plugins/agent-cli/src/engine/sessions.ts#L1128) · [index.ts:724](../../../../../plugins/agent-cli/src/engine/index.ts#L724)
- **切换视图和 Tasks 排他。** UI 以当前分栏或预览会话选控制证明，并在连接停止、被降级或视图清理时撤回。释放函数检查 claim 对象身份，原控制者在发送中断开会保留当轮 claim，完成后才通知下一视图。Tasks 从持久 owner 读取占用，派遣写入前再次检查本地 claim 与回执状态。三个新增单测覆盖正确和错误证明、Tasks 排他、断开时的延迟接管，以及显式重交成功后的恢复，未覆盖上面的删除流程。 [AgentCliModule.tsx:346](../../../../../plugins/agent-cli/src/ui/AgentCliModule.tsx#L346) · [TerminalView.tsx:100](../../../../../packages/ui/src/components/TerminalView.tsx#L100) · [input-ownership.ts:22](../../../../../plugins/agent-cli/src/engine/input-ownership.ts#L22) · [dispatch.ts:249](../../../../../plugins/agent-cli/src/engine/dispatch.ts#L249) · [sessions.test.ts:699](../../../../../plugins/agent-cli/test/sessions.test.ts#L699)
- **共享 TerminalView。** SSH 的 `mode: control` 沿用无证明的消息，控制后仍通过原 `onTerminalInput` 回调发布输入函数。新增字段是可选的，`observe` 仍撤回输入。共享调用者的交互检查停在代码路径。 [TerminalView.tsx:104](../../../../../packages/ui/src/components/TerminalView.tsx#L104) · [SSH terminal-bridge.ts:45](../../../../../plugins/ssh/src/engine/terminal-bridge.ts#L45)
- **网关与工作台用例。** 批量字段组和逐项开关跟随 `busy` 禁用，避免策略刷新时出现可点击却不响应的窗口。W05–W06 冲突夹具在首次冲突后撤掉，后续真实请求直通。撤权用例从认证成功的发现 GET 仅去除目标能力，仍断言可读与不可写。Agent 设置使用该版本实际的三个 provider，固定 Claude 并用新版本值验证二次探测。ACC-AG-10 增加当前视图可发送的断言，保留终端收文和已发送断言。自动化单例只增加失败诊断，结果正文和唯一投递断言保留。 [ToolPolicyCatalog.tsx:111](../../../../../packages/workbench/src/gateway/ToolPolicyCatalog.tsx#L111) · [acceptance.spec.ts:28](../../../../../tests/e2e/workflows/acceptance.spec.ts#L28) · [acceptance.spec.ts:113](../../../../../tests/e2e/workflows/acceptance.spec.ts#L113) · [acceptance.spec.ts:1514](../../../../../tests/e2e/workflows/acceptance.spec.ts#L1514) · [shell.spec.ts:2475](../../../../../tests/e2e/shell.spec.ts#L2475) · [shell.spec.ts:2775](../../../../../tests/e2e/shell.spec.ts#L2775)

### Lead 夹具更正

| 项目 | 复核结果 |
| --- | --- |
| 候选桌面关闭 | 启动后一次保存 `desktopPid`。关闭后用保存的 PID 与已核对的 Engine PID 检查退出，清理附件也复用该值。关闭后仍核对 Engine 描述、Core/holder 和 socket 清理。身份预检沿用 t15w 的上一轮审查。 [candidate-desktop.ts:214](../../../../../tests/e2e/helpers/candidate-desktop.ts#L214) · [candidate-desktop.ts:254](../../../../../tests/e2e/helpers/candidate-desktop.ts#L254) · [candidate-desktop.ts:294](../../../../../tests/e2e/helpers/candidate-desktop.ts#L294) · t15w-review02.md（历史位置 `t15w-review02.md`，本次未取得原件） |
| D09 tools-web | CLI 与 MCP 夹具只为 `tasks.create` 提交通用持久意图。读调用无该字段，`tasks.update` 使用对应任务的 `expectedVersion`。保留同一任务的双端刷新、重新打开、撤权和撤权后版本不变断言。t16h 在 05a 包配合修订测试上 1 通过，含退出清理。 [external-task-web.spec.ts:32](../../../../../tests/e2e/workflows/external-task-web.spec.ts#L32) · [external-task-web.spec.ts:91](../../../../../tests/e2e/workflows/external-task-web.spec.ts#L91) · tools-web-cleanup-check-05a.log（历史位置 `tools-web-cleanup-check-05a.log`，本次未取得原件） |
| T7.2 任务旅程 | 新模板前通过正常设置写入固定 Codex 路径，刷新普通目录并核对路径、已安装及 headless。包包装器仍检查相同受控 Codex ELF 的 SHA-256。保留同一意图重交、唯一派遣、唯一评论及一次 provider 请求断言。t166 在 05a 包配合修订测试上 1 通过。 [task-journey.spec.ts:411](../../../../../tests/e2e/workflows/task-journey.spec.ts#L411) · [task-journey.spec.ts:451](../../../../../tests/e2e/workflows/task-journey.spec.ts#L451) · [accept-linux-candidate.sh:14](../../../../../scripts/accept-linux-candidate.sh#L14) · template-pinned-check-05a.log（历史位置 `template-pinned-check-05a.log`，本次未取得原件） |

## 项目规范审查

两类业务路径沿用现有终端桥、输入仲裁和网关状态，无另外确认的项目规则违规。前端对照实现轮的现代 Web 指南。缓存检索和 `js` 指南复核未发现适用于此恢复状态的 WebSocket 生命周期专项条目。此次为独立审查。 t15t-report01.md（历史位置 `t15t-report01.md`，本次未取得原件）

## 范围和验证

已核对 topic、manifest 的 `t168/task02.md active` 与当前终端。审查 `impl/huhu-acceptance-followup` 上基线 `05a748b61eaa6dddaaa86aa648a2e68dd385d085` 的指定 17 份源码和测试差异，定向 Git diff 的 SHA-256 为 `31b963bd714fac4422e6a91185afcb039c2cdafe40a74d87e09493d540468a47`。范围内 `git diff --check` 通过。Linux Node 24.21.0 独立复跑单文件 `plugins/agent-cli/test/sessions.test.ts -t '变更审查意见'`，11 通过、46 过滤。t16f 定向类型通过引用 Lead 记录。 [Linux 最终验收记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/linux-final-acceptance.md#L248)

## 未运行的验证

- 真实 Electron/Web 多视图、Core 联调、ACC-AG-10、网关批量预览、W05–W06 撤权、Agent 二次检测及自动化结果 E2E。自动化结果用例仍待真实采样定位。
- 最终组合的 D09/T7.2 包验收、构建、打包和全仓门禁。两条旧包诊断仍按旧候选计。
