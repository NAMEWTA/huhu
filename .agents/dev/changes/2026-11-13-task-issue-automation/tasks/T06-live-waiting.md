# T06 运行中等待人工（Herdr 状态订阅）

**规格**：[spec.md](../spec.md) §7（全部）；TD-07。

**交付**：
- Herdr 会话里的程序上报 blocked 状态时，不用等进程退出，HUHU 在 3 s 内显示“需要你操作”。
- 显示位置：
  - 会话关联了任务：显示在原任务。
  - 用户自己启动的独立会话：显示在为该会话自动建立的 human 任务上。
  - 终端命令动作：显示在运行记录，并发一条通知。
- 用户可以一键聚焦原终端。程序离开 blocked 状态后，提示自动解除。

**依赖**：
- T04：评论能力。
- T05：终端命令的运行记录，`agent.sessions.launch` 的扩展。

**边界**：
- 负责：
  - `packages/herdr-client` 的 subscribe 辅助方法。
  - agent-cli 的后台 watcher。
  - 会话状态 `waiting`。
  - 发生标识的持久化。
  - 独立会话建任务（含设置项）。
  - 能力矩阵在 UI 上的呈现。
- **不做**：
  - 为 claude、codex 托管 hooks（orca 方案）。
  - 应用内批准按钮。

## 当前代码指针

- `packages/herdr-client/src/client.ts`：`onEvent` 在 `:32`，通知分发在 `:128`。
- `packages/herdr-client/src/frames.ts:2`。
- `plugins/agent-cli/src/engine/sessions.ts`：`reconcile` 在 `:229-251`，2 s 节流在 `:231`；会话状态在 `:14`。
- `plugins/agent-cli/src/ui/AgentCliModule.tsx:103`：UI 每 5 s 刷新一次。
- 协议（0.1.19）：
  - `temp/sources/herdr-core/schema/released.openrpc.json`：Terminal 定义在 `:1293-1344`。
  - `schema/README.md:125-140`：`events.subscribe` 事件。
  - `:216-219`：OSC 7501 说明。
- OSC 7501 输出示例：`temp/sources/herdr-app/scripts/notes-clips/peek.sh:8,10`。可用作测试程序的参考，许可 Apache-2.0；如果复制代码，需要登记 ledger。

## 实施要点

- **watcher 的启动与释放**：用 `ctx.effect` 启动，建立专用连接并调用 `events.subscribe({labels:{"huhu.vault": vaultId}})`。断线后按指数退避重连，重连成功后先用 `terminal.list` 全量对账一次。插件停用时由 `ctx.effect` 释放连接。
- **事件处理**：收到 `status` 事件时，若 `status.state==="blocked"`：
  1. 计算发生标识 `<sessionId>:<turn>:<status_ms>`。
  2. 持久化到会话记录或 automation-run 记录。
  3. 按以下方式分派：
     - 会话关联了任务：调用 `tasks.comments.add`，评论 id 为 `run-<runId>-w-<发生标识>`。
     - 终端命令动作：更新运行记录，按发生标识幂等地发通知。
     - 独立会话：受“独立会话自动建任务”设置控制（默认开）。以 `sessionId` 为幂等键调用 `tasks.create`（human 任务，`origin=session`），再追加评论。评论 id 为 `session-<sessionId>-w-<发生标识>`，因为独立会话没有 runId。
- **解除提示**：状态离开 blocked 时解除。进程结束（Terminal 的 `state=finished`）时，把未解决的请求标为已过期。
- **UI 能力矩阵**：
  - headless 运行显示“退出后提问”。
  - Herdr 会话显示“前往处理”。
  - 没有上报状态的程序只显示“查看终端”。

## 验收

| 编号 | 条件 / 动作 → 可观察结果 | 验证入口 |
| --- | --- | --- |
| B04a | 测试程序在 Herdr 会话中输出 OSC 7501 blocked（kind=permission）后保持运行；用户停留在任务页（不打开 Agent 模块）→ ≤ 3 s 内出现“需要你操作”。点击后聚焦原终端；程序输出 working 后，提示解除 | 拟新增 e2e，配合测试程序（真实 Herdr） |
| B04b | headless 运行的详情显示“退出后提问”，没有批准按钮；不上报 OSC 7501 的程序只显示“查看终端” | e2e |
| B05 | “前往处理”聚焦的是原终端，`terminal.list` 中不会多出新的终端 | e2e |
| B07（会话） | 同一次 blocked 状态下重连或重启 Engine → 只有 1 条评论。独立会话第一次 blocked 时建 1 条 human 任务，第二次 blocked 时只追加评论。终端命令动作不建任务 | 服务测试 + e2e |
| B04c（待验证） | 在本机真实的 claude 和 codex 交互会话中触发权限或提问，记录是否会上报 OSC 7501；顺带验证 codex 是否需要 `--no-daemon` | 手工实测，记入 evidence，不阻塞交付 |
| 生命周期 | 停用 agent-cli 插件后，订阅连接关闭；重新启用后自动恢复，并补齐期间发生的 blocked 状态 | 服务测试 |

## 完成证据

- `audit` 跑 herdr-client、agent-cli 的测试和 e2e。
- 使用真实 Herdr Core 0.1.19 二进制，不使用假 Herdr。
- B04c 的实测结论如实记录，无论结果是“会上报”还是“不会上报”。
