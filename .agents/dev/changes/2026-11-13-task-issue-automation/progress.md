# 进度：任务 Issue 化与自动化重构

> 工作区未提交（用户尚未授权提交）。状态以 2026-11-14 的工作区为准。

## 已完成并验证

| 切片 | 内容 | 证据 |
| --- | --- | --- |
| T01a 任务模型 | schema 2（type / status / tags / `<task>` + `<comments>` 区段、区域级条件写、B09、markDispatched、系统评论、`inputHash`） | `plugins/tasks/test/service.test.ts` 15 例、`packages/vault/test/markdown.test.ts` |
| T01b 任务界面 | 列表 / 看板 / 月历、状态下拉、标签筛选、详情、评论、编辑器（`@` 引用补全） | e2e：shell“任务界面”“任务：新建…”，acceptance ACC-TK-06 / ACC-TK-11 |
| T02 权限 | 内置插件按权限组授权；内置专用权限组；外部清单声明被拒；Dispatcher `pluginOrigin` | kernel 单元测试、`engine.test.ts` 安全回归 |
| T03 引用与改写 | `@` 补全、`[[路径]]` 解析；notes 改写范围含 `Tasks/`（只改正文）；文件夹前缀改写 | `plugins/notes/test/{links-rewrite,service}.test.ts` |
| T04 评论 | `tasks.comments.add`，事件派生 id 幂等，外部不能给 agent 任务写评论 | service 测试、engine 测试 |
| T05 自动化 | 三种动作（agent / terminal / reminder）、预览与扫描同一谓词、全局派发互斥、markDispatched 回滚、对账 queued | `plugins/automations/test/*`（30 例）、W-A 闭环 e2e |
| T06 运行中等人工 | herdr-client `subscribeEvents`；`WaitingWatcher`（指数退避重连、快照对账）；会话 `waiting`；独立会话自动建 human 任务 + 评论（可在智能体设置里关闭）；UI 徽标“需要你操作”；运行详情“退出后提问” | **真实 Herdr 0.1.19**：`apps/engine/test/engine.test.ts` B04a/B07；`plugins/agent-cli/test/waiting.test.ts` |

## 测试过程中发现并修复的真实缺陷

- 自动化写评论 / 建任务的 `api.call` 没带幂等键，被内核拒绝，Agent 评论从未写进任务（engine 测试发现）。
- `toJsonSchema` 遇到带 `transform` 的入参 schema 会抛错，`capabilities.list`、CLI、MCP 全部失败（audit 发现）。
- `@` 补全的数据源函数在目录树加载前被编辑器固定，补全永远为空（e2e 发现）。

## 与规格的偏差 / 未做

- **terminal 动作**（C07）已改为经 agent-cli 的 `agent.sessions.launch`（`provider: shell` + `command` / `shell` / `envRefs`）在可见的 Herdr 会话里运行：automation-run 记录 `sessionId`，运行详情有“查看 / 接管终端”，引擎重启后按会话真实状态对账，取消 / 超时会结束终端。环境变量在 agent-cli 侧按调用插件的身份从保险箱解析，automations 不接触秘密值。证据：真实 Herdr 的引擎测试（ACC-SF-04 / C07）、W-C e2e、automations 单元测试。
  - **实测发现**：Herdr 会把启动环境变量存进自己的状态文件（`restart_env`），位于 Vault 的 `.huhu/runtime/` 下。所以带保险箱环境变量的命令读完输出后会 `terminal.rm` 移除终端；命令运行期间（以及引擎在运行期间崩溃时）秘密值会短暂留在该文件里，直到对账时移除。
  - 顾问复核后修复：是否带过环境变量改为由 agent-cli 在会话记录里持久化 `hasEnv`（只存布尔），输出读取与终端清理都以它为准（不再由调用方声明或由当前规则推断）；`sessionId` 没来得及写回运行记录时，对账按 `requestId`（`autorun-<运行 id>`）找回会话。
  - 已知限制：`terminal.rm` 失败（例如当时 Core 不可用）只吞掉不重试，秘密值会留在 Herdr 状态文件里直到下次对账；规则作者如果把秘密直接写进命令文本，会随会话记录的 `command` 落盘（应使用 envRefs）。
  - “终端命令动作在运行记录里显示等人工”没有做（blocked 状态只对 agent-cli 的独立会话生效）。
- 发生标识是 `<会话 id>:<n>`（第 n 次进入 blocked，持久化在会话记录里），不是规格里的 `<turn>:<status_ms>`：同一次 blocked 的重连、重启不会重复，效果等价。
- Herdr 当前版本对带 `msg=` 的 7501 记录不更新状态（实测），所以“等人工”提示里不显示 msg；kind=permission/question/auth 正常。
- B04c（真实 claude / codex 是否上报 OSC 7501）**未实测**。
- “任务关联的会话”（非独立会话）没有入口创建，所以只实现了独立会话路径。
- 闭环（真实 CLI）未验证；只用假 CLI。
- 区域级改写 `Tasks/` 链接使用 OperationLog 一次性写入，没有再套条件写重试（读—写之间是同一次操作内的毫秒级窗口）。

## 残留检查（T07）

- `setCompleted`、`completedChanged`、`execution.kind`、`TaskResourceSchema`、`ResourcePicker`、`scan_agent_tasks`、`scriptId`、`automations.scripts`、`ensureBuiltin`：0 处。
- `taskQuery` 保留：它是 tasks 插件 `api.provide` 的服务名（不是旧概念）。`agent_prompt` / `agent_tasks` 只在 RuleEditor 里作为表单类型的内部取值，不落盘。
