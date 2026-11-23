# 原生历史任务派遣独立收尾审查

- 任务身份为 `t1fg/task01.md`，Lead 为 `t3p`，本机 Herdr Core 0.1.21。工作目录为 `/home/wta/projects/huhu`。
- 审查对象为 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2` 上的原生历史派遣工作树增量，包含未跟踪的 E2E helper（Git blob `2758a1fe1e95931e05a3ee553d78993c15fc7eb5`）。范围是 #4 W6.1 与 #5 C01 的 Agent CLI、Tasks、Automations、合同及相关测试。业务源码只读。
- 审查完成。固定 Linux Codex 的桌面成功路径有实测证据。建议先修复以下两项 P1，再签收收尾。

## 规格问题

### P1 取消未发送的任务后，工作台无法结束已恢复的会话

Tasks 在恢复期间允许将 `claimed` 落为 `cancelled`。此时正文未发，Agent 的派遣记录仍为 `not_sent`。输入仲裁仍从会话记录取回原 dispatchId 并持续持有输入权。工作台的结束会话和「停止并关闭」都经过同一个 `hasTask` 拒绝分支。Tasks 已没有接受的原生轮次可停止，原线程 writer 仍留在运行中的 helper，新任务继续等待。实施报告所述「关闭后重新选择」无法通过工作台完成。定向探针执行真实取消、仲裁和 kill 方法，得到 `cancelled`、`not_sent`、`INVALID_INPUT`、Core kill 0 次。 [取消落盘](../../plugins/tasks/src/engine/dispatch.ts#L735) · [持续占用](../../plugins/agent-cli/src/engine/index.ts#L115) · [结束拒绝](../../plugins/agent-cli/src/engine/sessions.ts#L1452) · [分栏结束入口](../../plugins/agent-cli/src/engine/workspace-layout.ts#L174)

### P1 准备恢复后停用 Codex，原任务仍会提交首轮正文

受控启动预检会拒绝停用的 Codex。已有恢复凭据时，`launchDispatchResume` 和 `SessionsService.launch` 直接找回原进程，绕过该配置门槛。最终 socket 写入前的同步校验确认 Space 与输入占用，未确认 Codex 仍启用。恢复等待期间在 Agent 设置停用 Codex，原回执就绪后仍会提交尚未送出的正文。探针对同一已准备会话先取得 `resume_ready`，随后设为停用。直接配置检查返回 `AGENT_DISABLED`，原派遣路径的配置检查为 0 次、socket 提交为 1 次。已发请求的只读对账可继续沿用原凭据。 [配置门槛](../../plugins/agent-cli/src/engine/codex-dispatch.ts#L141) · [恢复凭据重放](../../plugins/agent-cli/src/engine/index.ts#L636) · [启动回查](../../plugins/agent-cli/src/engine/sessions.ts#L408) · [提交前校验](../../plugins/agent-cli/src/engine/dispatch.ts#L289)

### P2 目录占用判断会阻塞无关会话，且会丢失真实 writer 冲突原因

独立的普通 Codex 交互新建没有原生 ID 或 historyLaunch。只要它与历史 B 同 cwd，目录及启动认领就把 B 判定为 `input_owned`，即使前者使用默认 Codex profile、B 位于受控私有 profile。探针对同一普通会话只更改 cwd，得到同目录忙、异目录不忙。反过来，Vault 之外的 App Server writer 不在 `sessions.list()` 中，目录可将其历史列为可用。Lead 已用固定 Codex 实测该 writer 冲突返回 `already has an active writer`。当前 helper 将 RPC 错误折叠为无结果并退出，Agent 对确定已退出的原准备实例返回 `history_selection_changed`，Tasks 将它标成目标不可用，丢失这一可等待资源的原因。C03 要求无资源冲突的会话能并行，T2.1 要求保留原忙目标。 [目录与认领](../../plugins/agent-cli/src/engine/index.ts#L609) · [同目录判断](../../plugins/agent-cli/src/engine/index.ts#L662) · [RPC 错误处理](../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs#L441) · [退出映射](../../plugins/agent-cli/src/engine/dispatch.ts#L260) · [真实 writer 证据](codex-resume-protocol.log)

### P2 自动化预览仍把已失效的历史列为候选

保存的完整原生选择在 rollout 更新、删除或受控配置撤下后，Tasks 的静态 blocker 仍可为空。扫描对 resume 跳过 CLI 探测，预览和发生记录的候选冻结均只使用静态分类。发生记录因此接受这条任务，随后同一次派遣才在 Tasks 的真实目标预检中因无匹配而阻塞。探针重放实际分类和执行器 readiness，在目录无原记录时得到预览候选 1、跳过 0、就绪结果 `unavailable`。B04 要求预览提供配置失效及资源忙的原因。普通 PATH 探测无需恢复为硬条件，需让预览与发生冻结使用相同的受控目标资格信息。 [静态 blocker](../../plugins/tasks/src/engine/service.ts#L77) · [预览分类](../../plugins/automations/src/engine/service.ts#L293) · [发生冻结](../../plugins/automations/src/engine/task-scan-occurrences.ts#L324) · [任务实际校验](../../plugins/tasks/src/engine/agent-dispatch-executor.ts#L76)

## 规范及证据

- 选择器按 Vault 和 Space 隔离查询，保存原生 UUID、来源修订及机器和 Space 绑定。切换 Space 清掉来源凭据，不能把旧历史隐式改成新会话。任务服务端复核新选择，旧裸 UUID 可读并要求重选。已准备进程从原请求和签名来源凭据对账，避免把 provider 恢复时自己的文件更新当成换源。迟到输入凭据沿原 dispatch 与 native turn 对账。审查范围内未另发现确定的项目规范违规。 [选择器](../../plugins/tasks/src/ui/TaskEditor.tsx#L31) · [Space 切换](../../plugins/tasks/src/ui/TaskEditor.tsx#L167) · [查询键](../../packages/workbench/src/engine-client/react.tsx#L97) · [签名来源](../../plugins/agent-cli/src/engine/codex-dispatch.ts#L234)
- Lead 固定 Linux x64 Codex 0.170.0 协议实测覆盖原 thread、rollout、cwd 和 writer 拒绝。Engine live 1/1 使用模拟 App Server，覆盖原键重交、迟到接受、取消期间零首轮、同会话输入占用和旧修订。桌面 Electron 用例 1/1、0 跳过，A/B 由真实 Codex App Server 和本地模型响应夹具生成，桌面选择 B 后完成任务派遣、原生提问、回答及结果。用例核对 A 字节不变、B 同一物理 rollout、原 cwd、原 thread 以及恰好一个新的完成 turn。桌面类型和构建沿用 Lead 记录。 [协议日志](codex-resume-protocol.log) · [Engine 日志](resume-engine-live.log) · [桌面结果](native-history-ui/result.json) · [测试断言](../../tests/e2e/workflows/task-journey.spec.ts#L151) · [Lead 类型与构建记录](../../.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1dd/report02.md)
- 实际可用范围为固定 Linux x64 Codex 0.170.0 和独立受控私有 home 中具备资格的持久历史。默认安装需要先配置该受控 runtime。普通 profile、Claude、Pi 及其他平台的直接历史派遣仍不可用。交互 TUI 生成持久来源未实跑，成功的桌面用例从真实 App Server 生成的来源开始。发布口径应明确这两条证据边界。 [生产配置](../../apps/engine/src/boot.ts#L307) · [固定版本与 profile 检查](../../plugins/agent-cli/src/engine/codex-dispatch.ts#L117) · [E2E 来源 helper](../../tests/e2e/helpers/codex-persistent-source.ts#L105)
- 本轮运行定向 `git diff --check`、两个 Agent/测试 helper 的 `node --check`，以及从当前源码提取方法的四项 Node 探针。探针以替身承接受控 socket、Core 和持久写入，覆盖上述分支判定。worker 未重跑 Engine live、真实 Codex、Electron、E2E、整仓类型检查、构建或全量测试。 [探针](t1fg-review-probe.cjs) · [探针日志](t1fg-review-probe.log)

### Modern Web Guidance

我检索了 `select form options` 并读取 `forms` 和 `select-menu-interaction`，核对可见标签、错误关联和选择状态。本轮只读审查。

## Lead 收件
原报告及相对附件保留于 temp/closeout-release/t1fg-report01.md。四项发现已收取，安排定向修复，未签收产品完成。
