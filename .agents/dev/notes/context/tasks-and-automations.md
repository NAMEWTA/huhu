# 任务（Issue 化）与自动化

> 来源 change：`2026-11-13-task-issue-automation`（已归档）。以下是代码里读不出来的约束与取舍；实现细节看代码。

## 任务（schema 2）
- 文件 `Tasks/<标题>--<id>.md`：frontmatter 里 `type: human|agent`、`status: not_started|in_progress|completed`、`inputRevision`、`reminders`、`origin`、`execution`；正文是 `<task>…</task>` 区段（输入）与 `<comments>` 区段（评论）。**区段以外的字节保持不变**；评论到达不改变任务输入。
- schema 1 的旧任务文件不迁移：报错且不出现在列表，文件字节不变（0→1 项目，没有兼容层）。
- 写入按区段做条件写：`<task>` 变化才递增 `inputRevision`；版本冲突时若任务输入没变（只是有评论到达），按当前文件重新应用补丁。
- Agent 任务由自动化派发，**完成状态永远由人关闭**；agent 完成后任务进入进行中，不会自动完成。`markDispatched` 按 runId 幂等。
- 系统评论（派发 / 等人工 / 结果）经 `tasks.comment.system` 写入，仅内置插件可用。

## 自动化
- 三种动作：`agent`（{tasks | prompt}）、`terminal`、`reminder`。引擎全局派发互斥；有 claim 与重启后的 reconcile（按 requestId `autorun-<runId>` 找回会话）。
- **所有 `api.call` 都要带幂等键**（评论 id / `autorun-…`）；漏了会让评论重试写多次或根本没写。
- 终端动作走 agent-cli 的 `agent.sessions.launch`（provider=shell，command / envRefs）。envRefs 由 agent-cli 解析（调用方身份是插件）。读完输出后 `agent.sessions.release`（`terminal.rm`）：Herdr 把启动环境存进状态文件 `restart_env`，不删就会把 Token 留在磁盘上。`hasEnv` 要持久化在 SessionRecord 里，不能从当前规则推断（规则会被改）。
- 内置专用权限组（仅内置插件）：`tasks.dispatch`、`tasks.comment.system`、`agent.run`、`automations.runs.internal`、`agent.terminal`。

## 等人工（agent 提问）
- Herdr 0.1.19 的 OSC 7501 状态：带 `msg=` 的记录**不更新状态**；`events.subscribe` 在普通模式也推通知；`terminal.send` 在 blocked 时要 `force:true`。
- `WaitingWatcher`（agent-cli）订阅事件，指数退避并用快照对账；会话的 `waiting` 字段驱动任务上的“等人工”徽标与自动评论；设置项 `waitingTasks` 控制。
- 终端动作的运行不显示“等人工”（已知偏差）。

## 未验证
- 真实 claude / codex 的 OSC 7501 上报与 codex `service_tier=priority`、真实 CLI 完整闭环；Windows / macOS 上的终端动作。只在 Linux + 假 CLI + 真实 Herdr 0.1.19 验证过。
