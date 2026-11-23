# 任务（Issue 化）与自动化

2026-11-23 核对 `fc43ceef` 的任务与自动化实现。任务 Markdown 继续使用 schema 2。2026-11-13 归档中的 `markDispatched`、`tasks.comment.system` 和 Safe 环境引用属于历史实现，以下是现役路径。

## 任务文件与派遣

- `Tasks/<标题>--<id>.md` 的 frontmatter 保存 `type`、`status`、`availableAt`、`inputRevision`、`reminders`、`origin` 与 `execution`。正文用 `<task>` 和 `<comments>` 区分输入和评论，区段替换保留区段外的正文。仓储将 schema 1 记为文件问题并跳过，原文件保留。`execution.target` 缺省为新会话，派遣时重新核验显式选择的现有会话。原生历史目标保存确切来源及修订，2026-11-23 收尾补齐了下述受控 Codex 路径；其他无原生受理证据的 provider 仍返回 `unsupported`。 [任务 schema](../../../../packages/contracts/src/kinds/task.ts) · [任务写入](../../../../plugins/tasks/src/engine/service.ts) · [目标核验](../../../../plugins/agent-cli/src/engine/dispatch.ts)
- 派遣输入由 `taskId + inputRevision + inputHash` 识别。编辑时正文或执行配置变化才递增 `inputRevision`，评论到达可在编辑快照仍相符时重放条件补丁。重开已关闭且无活动运行的任务会生成新的派遣意图。人显式关闭任务；关闭只改任务状态并记评论，回答问题和停止进程各有入口。 [输入身份](../../../../plugins/tasks/src/shared/input.ts) · [状态操作](../../../../plugins/tasks/src/engine/service.ts)
- 工作台、自动化及获得授权的 CLI/MCP 走同一 Tasks 派遣与追问路径。持久化派遣记录把任务版本、执行和会话身份绑在一起；对账要区分确知未送达和状态未知，离线或空列表仍属未知。问答和补充在已绑定的原会话中处理，回执允许重交并按身份去重，结果更新运行记录，已接收派遣将任务置为进行中。 [派遣](../../../../plugins/tasks/src/engine/dispatch.ts) · [派遣存储](../../../../plugins/tasks/src/engine/dispatch-store.ts) · [回执](../../../../plugins/tasks/src/engine/receipt-inbox.ts)

## 受控原生历史派遣

直接任务恢复当前只开放固定 Linux x64 Codex 0.170.0 与独立受控 private home。任务冻结 machine、Space 修订、原生 UUID、historyId 和来源修订，恢复同一 thread 和物理 rollout；原请求重交沿原派遣身份对账，不重发正文。恢复进程自己更新 rollout 后，使用已绑定凭据对账，不能把这次更新误判成用户换了来源。默认全局 profile、Claude/Pi 和其他平台没有这条受理证据，不能用「终端能启动」代替原生派遣资格。[受控配置](../../../../plugins/agent-cli/src/engine/codex-dispatch.ts) · [原生桥](../../../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs)

取消前须区分确知未发送与已经发送／结果未知。只有原 Tasks 终态与 Agent 未写入凭据一致时才释放准备好的 helper；首轮输入前同步复核配置、Space 与输入所有权。自动化预览和发生冻结共用 Tasks 的目标资格检查，保留失效或忙的原因。真实 writer 拒绝由原恢复进程返回并绑定签名，不以相同目录代替相同线程来源。[首轮输入](../../../../plugins/agent-cli/src/engine/dispatch.ts) · [扫描资格](../../../../plugins/automations/src/engine/service.ts)

源码桌面 C01 已用真实 Codex App Server 生成的 A/B 持久历史验证选择 B、原生问答和一次结果，A 不改、B 保持原 thread、rollout 和 cwd。模型响应为本地夹具，未验证线上模型或交互 TUI 创建来源的步骤。[本轮原始证据](../../archive/changes/implemented/feature_2026-11-23-closeout-preview-release/evidence/history-rgl-reviewed.json)

## 自动化与等待人工

- 动作仍为 `agent`（任务扫描或独立提示词）、`terminal` 和 `reminder`。内置任务扫描按规则时区和触发实例处理可执行任务，通过 Tasks 受理派遣。删除默认扫描规则会留下标记，显式恢复才重建。 [规则 schema](../../../../packages/contracts/src/kinds/automation.ts) · [默认扫描规则](../../../../plugins/automations/src/engine/default-task-scan.ts)
- 终端规则按 `autorun-<runId>` 对账。现役受保护值由自动化模块按审批和本轮运行解析，再交本机受保护终端；旧 `envRefs` 只作为旧规则识别信息，规则需重新配置。会话的 `hasEnv` 用于输出脱敏及退出后的清理与重试，不能从可编辑的当前规则反推历史。 [终端环境](../../../../plugins/automations/src/engine/terminal-environment.ts) · [运行与释放](../../../../plugins/automations/src/engine/service.ts)
- `WaitingWatcher` 继续用 Core 事件与快照同步会话等待状态，`waitingTasks` 控制相应提示。原生任务问题的等待和回答以已绑定执行回执为准，状态提示与实际送达各有证据。 [等待监视](../../../../plugins/agent-cli/src/engine/waiting.ts) · [任务问答](../../../../plugins/tasks/src/engine/native-replies.ts)

Linux 固定包已有任务跨日触发、原生问答、回执重交及 CLI/MCP 会话验收。Windows/macOS 安装与系统后端、其他设备及真实 OS 输入法仍在交付验证范围之外。凭据所有权见 [工作台总体](workbench.md#模块凭据与邮件通知)。

2026-11-23 外部工具评论边界补齐：授权后的 CLI/MCP 可给 Agent 任务添加普通讨论，服务端确定评论身份和来源；普通评论不变成执行输入，也不能伪造运行或问题回执。显式派遣、问答与补充仍使用各自能力和原 execution 身份。[评论入口](../../../../plugins/tasks/src/engine/index.ts) · [回归](../../../../plugins/tasks/test/persistence-http.test.ts)
