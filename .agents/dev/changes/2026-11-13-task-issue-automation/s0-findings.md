# S0 结论：事实核对与改动面

> 2026-11-13，基线 HEAD `8283c5c`。由只读子代理（grep / search）核对，主会话在本机运行了 `claude --help` 和 `codex exec --help` 补充确认。本文件记录**事实**；行为契约以 [spec.md](spec.md) 为准，复用结论汇总在 [reuse.md](reuse.md)。行号是观察时的位置，实施时以符号为准复核。

## 1. 已核实的外部事实

| 事项 | 结论 | 证据 |
| --- | --- | --- |
| Herdr Core 0.1.19 对应的 schema | `temp/sources/herdr-core/schema/released.openrpc.json`。`hc.openrpc.json` 比它多出未发布的 `server.restart.environment`（`--fresh`） | `schema/README.md:14-18`、`CHANGELOG.md` 中 `[0.1.19] - 2026-11-07`；随包二进制含版本字符串 0.1.19 |
| Terminal 的 status 结构 | `status` 是 Status 对象或 null，字段为 `state ∈ {idle, working, done, blocked, error}`、`kind ∈ {permission, question, auth}`（仅 blocked 有）、`progress`、`app`、`title`、`msg`；Terminal 上另有 `status_ms`（最近一次变化时间）和 `turn`（每离开一次 working 加 1）。Terminal 顶层的 `state` 取值为 `live`/`finished`，不要和 `status.state` 混淆 | `released.openrpc.json:1293-1344`、`herdr-core/src/status.rs:12-29` |
| 订阅状态变化 | `events.subscribe({terminal?, labels?, children_of?})` 返回 `{seq, terminals, channel}`，之后推送 `event` 通知（类型 `status`、`turn` 等），每 15 s 一次心跳。必须使用**专用连接** | `schema/README.md:125-140` |
| 等待终端 | `terminal.wait({terminal, children, output, timeout})` 是事件驱动的，带 `after_turn` 语义 | `herdr-core/src/wait.rs` |
| `terminal.run` | 接受 `argv`、`env`（叠加在 core 环境之上）、`cwd`、`labels`、`name`、`line` | `released.openrpc.json` |
| env 是否回显 | 不回显。Terminal 对象中只有 `argv` 和 `cwd` | 同上 |
| OSC 7501 的来源 | 只能由程序自己输出。herdr-app 里**没有** Claude 或 Codex 的集成层，只有示例脚本 | `herdr-app/scripts/notes-clips/peek.sh:8,10`；许可证 Apache-2.0（只在 Cargo.toml 中声明） |
| 另一种等待信号 | orca 通过 Claude/Codex hooks 回报 `working/waiting/done`，OSC 7501 只作补位 | `temp/sources/orca/src/main/agent-hooks/README.md` |
| claude 2.1.323 的最高权限参数 | `--dangerously-skip-permissions`，或 `--permission-mode bypassPermissions` | 本机运行 `claude --help`（2026-11-13） |
| codex 0.167.2 的最高权限参数 | `exec` 接受 `--dangerously-bypass-approvals-and-sandbox`；**没有** `--yolo`；顶层命令有 `--no-daemon` | 本机运行 `codex exec --help` / `codex --help`；herdr-core 的 SKILL.md:314 写明 “Codex must run with `--no-daemon`”（是否适用于 Herdr 交互会话，留到 T06 实测） |
| claude 的 worktree 风险 | agent-autoloop 禁用 `EnterWorktree,ExitWorktree`，因为 worktree 会移动 transcript，导致 `--resume` 找不到会话 | `agent-autoloop/plugins/claude/agent.ts` |

## 2. 仓库现状要点

- **Provider 偏好**：`plugins/agent-cli/src/engine/prefs.ts:4-8` 的 `ProviderPref` 只有 `model`、`effort`、`fast`，**没有权限偏好**。交互式 argv（`providers/index.ts:34-67`）和 headless argv（`automations/engine/worker.ts:54-66`）都没有权限选项，headless 的 claude 写死了 `acceptEdits`。
- **会话轮询**：`sessions.ts:229-251` 的 `reconcile()` 只在能力调用时触发，2 s 内去重；唯一的周期驱动是 UI 每 5 s 刷新一次（`AgentCliModule.tsx:103`）。仓库里没有任何地方调用 `events.subscribe` 或 `terminal.wait`，`herdr-client` 的 `onEvent` 也没有生产环境的使用方。
- **shell 会话**：`agent.sessions.launch` 的入参（`index.ts:126-141`）不包含 argv、env、cwd；`provider:"shell"` 时，Herdr 运行该机器的默认 shell。
- **脚本管理**：
  - 能力：`automations.scripts.list/save/delete`，全部 `exposable:false`。
  - 存储：`.huhu/automations/scripts.json`。
  - ScriptDef：绝对程序路径、args、cwd、envRefs、timeoutSec。
  - UI：AutomationsModule 的 scripts 标签页，以及 RuleEditor 的下拉框。
- **输出脱敏**：没有独立函数，是 `scripts.ts:98` `runScript` 里的闭包 `redact`，只对 envRefs 解析出的值做字面替换。复用时需要提取出来。
- **Markdown 解析**：
  - 引擎侧（vault、tasks、notes engine、apps/engine）**没有** Markdown 解析器依赖。
  - 现有两处用同一套正则处理代码块：`vault/index/links.ts:8-10` 的 `stripCode()`，以及 `notes/shared/links-rewrite.ts:24-32` 的 `codeRanges()`。
  - open-knowledge 有 `packages/core/src/markdown/fence-regions.ts` 可以参考。
- **编辑器**：
  - `MarkdownEditor` 的 `extensions` 数组和 Compartment 可以扩展。
  - **没有** `@codemirror/autocomplete` 依赖；atomic 的 `WikiLinksConfig.suggest` 只声明了类型，没有实现。
  - `wikiLinks.resolve` 是桩函数，固定返回 unresolved。
- **文件夹双链**：`[[a/b/]]` 能被解析（target 保留末尾的 `/`），但在 notes 的 `openWiki` 中打不开，`links-rewrite` 在文件夹改名时也不改写它。`moveEntry` 不发出事件。
- **打分与树**：`scoreText` 已经从 `@huhu/workbench` 导出，插件可以直接使用。`vault.tree({prefix})` 返回 `file`/`dir` 两类条目。
- **主题**：`packages/ui/src/theme.ts:31` 的 `applyAppearance` 设置 `data-theme`、`data-mode` 属性。
- **任务 UI**：
  - `TaskEditor` 的正文目前是 textarea。
  - 看板用原生 HTML5 拖放。
  - 列表过滤在 `TasksModule.tsx:45`。
- **自动化 UI**：`RuleEditor.tsx` 按 kind 分支渲染；`AutomationsModule.tsx:123-126` 的下拉框只对内置规则显示 scan；预览在 `:239-259`。
- **inbox 转任务**：`inbox.convert` → `api.call("tasks.create", {title, body, due?})`，调用者为 `plugin:inbox`（`inbox/engine/index.ts:36-41`），依赖 `tasks.write` 权限。
- **写入并发**：`vault/write.ts:53-61` 在校验 expectedVersion 和真正写入之间没有锁，只有进程级的 `writer.lock`。open-knowledge 的 `withFileLock` 可以参考。本 change 的条件写都在单个 Engine 进程内完成，这一缺口记为风险，不在本期解决（见 spec §3.3）。

## 3. 改动面（全部使用方）

只统计 git 已跟踪的文件（排除 node_modules、dist、out、release、temp、.claude/worktrees、.agents）。

| 符号 | 数量 | 主要分布 |
| --- | --- | --- |
| 任务 `completed` / `completedAt` | 约 105 | contracts（dto/kinds/events）、vault 测试、tasks（service/index/categories/UI/测试）、automations（scan/service/测试）、**versioning**（`engine/index.ts:29,37` 恢复旧版本时保留完成状态，并有 ACC-VS-03 测试）、workbench 首页（`HomeModule.tsx:60,108,118`）与 query 失效、archives（`ArchivesModule.tsx:89,357-359`）、notes（`NoteInspector.tsx:128,140`）、**agent-guide**（`guide-files.ts:69` 中给 Agent 的 CLI 示例）、CLI（`main.ts:101-114`）、engine boot 与测试、examples/daily-review、e2e（shell、acceptance、packaged） |
| `setCompleted` / `task.completedChanged` | 约 28 | 定义、`permissions.ts:11`（`tasks.write`）、event-log、query 失效、4 个调用方（首页、任务页、档案页、CLI），以及测试 |
| `execution.kind` / `"manual"` / `resources` | 约 75 | contracts、tasks（service、input hash、draft、resources.ts、ResourcePicker、Editor、Detail、Views、i18n）、automations（scan/service/worker）、首页徽标、archives 和 notes 的返回类型、engine 测试、e2e、perf |
| 四个旧动作与脚本 | 约 75 | contracts、automations（engine、builtin、UI、i18n、测试）、engine 测试（外部入口不能创建 scan/agent_prompt/notify 规则）、e2e |
| `api.service` / `provide` | provide 8 处、consume 约 22 处 | `taskQuery` 被 automations 和 **versioning**（`engine/index.ts:114`）使用；`agentCli` 被 engine boot 使用；`automations` 服务（holdRestoredInput）被 versioning 使用 |
| 只看 caller 的判定 | 4 组 | 详见 brief；另有 `notes/engine/index.ts:69,320,324` 的 `author(caller)` |
| `isNoteFile` / `SEMANTIC_DIRS` / `rewriteLinks` | 约 29 | `notes/engine/service.ts:26-28,108,223-224,267-270,377`，以及 links-rewrite 测试 |
| 权限相关 | kernel 约 25 处，测试约 20 处 | `permissions.ts`、`dispatcher.ts:115-124`、`plugins/external.ts:156,194`、`exposure.ts`、`capabilities/system.ts:161-233`、`boot.ts:374,388`、GatewayModule、agent-guide |

完整逐行清单可以随时用 `git grep -n` 重新生成，这里不再复制。实施 T01 和 T05 时，以 grep 为零残留作为完成判据（见 tasks/）。

**这次新发现的使用方**（之前的计划里没有）：
- versioning 恢复旧版本时保留 `completed`。
- versioning 读取 `taskQuery` 和 `automations` 服务。
- agent-guide 给 Agent 的 CLI 示例里用到 `--completed`。
- e2e 的 `perf.spec.ts`。
- `tests/perf/scale-vault.ts`。

## 4. 与归档规格的关系

- 归档 `decisions.md` 的 D-01…D-43 中**没有**被整体取代的决定。新规格只扩展了 D-04（Dispatcher 增加委托链与内置权限组）和 D-06（内置插件标记 origin=builtin）。被取代的是归档里的行为定义，逐条列在 spec §10。
- 归档 `interfaces.md:50` 写的是“plugin 调用只需权限”，但代码 `dispatcher.ts:119` 实际还要求 `exposable`。也就是说，归档文字与代码本来就不一致，本 change 让代码回到归档文字所描述的意图。
- 新规格没有提及、但**继续有效**的归档行为（spec §10 写明保留）：
  - 恢复后暂停（holds）与 ACC-AU-12。
  - 宽限补激活 ACC-AU-09。
  - “立即运行” US-AU-05。
  - 逾期与“未来 7 天”分类 ACC-TK-04/05。
  - 月历视图。
  - 提醒 US-TK-07。
- 失败重试的语义：归档规定同一 processingKey 下 attempt+1 重试。新规格保留这一点：失败或取消的运行显式重试时，沿用原 processingKey。只有已成功、需要重做的任务才要求“重开”（spec §4.3 已据此修正）。
