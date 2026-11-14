# 需求简报：任务 Issue 化、三类自动化与统一能力复用

## 用户目标

在 HUHU 工作台里，用户写一条 Markdown 任务，把它交给自己（Human）或交给 Agent（配置好目录和 CLI）。自动化按时派发后，任务进入“进行中”。Agent 运行中的提问、操作请求和结果都追加到这条任务的评论时间线；用户在原任务或原终端里处理，最后自己关闭完成。

自动化只保留三类：Agent 执行、终端命令、提醒。任务、评论和派发能力对内（其他插件）和对外（CLI / MCP）共用同一套业务实现，权限分别控制。

完成的定义（来自 Issue §14）是用户能实际走通以下闭环：

> 写一条 Markdown 任务 → 选择 Human，或为 Agent 配置目录与 CLI → 自动化按时派发 → 任务进入进行中 → Agent 的提问和结果持续追加到原任务 → 用户在原任务或原现场处理 → 用户关闭完成。

交付到 `main`，由下一个 rc 发布。本轮只输出文档，不写代码。

## 来源与已有决定

| 来源 | 版本 / 时间 | 相关事实或用户决定 |
| --- | --- | --- |
| [GitHub Issue #1](https://github.com/NAMEWTA/huhu/issues/1) | 2026-11-12 创建，代码基线 `38ab1c4`；正文快照见 [source-issue-1.md](source-issue-1.md) | 完整需求：两类型、三状态、任务内执行配置、两个 Markdown 章节、Issue 式评论、三类自动化、运行中人工接管、内外能力统一、复用优先 |
| Issue §0 | 同上 | 后续修正优先于早期方案；被纠正的多状态、多任务类型、自动化覆盖执行目标、默认合并会话等设计一律不采用 |
| 用户决定（dev-grill） | 2026-11-13 本会话 | **旧任务文件无需任何兼容，直接改动**：不写转换命令、不做读时改写，也不保留 schema 1 的运行分支 |
| 用户决定（dev-grill） | 2026-11-13 | **运行中等待人工（Issue S4）纳入本 change，验收分级**：能上报的显示“需要你操作”并能定位原现场；不能上报的明确降级；真实 CLI 是否上报单独列为待验证项 |
| 用户决定（dev-grill） | 2026-11-13 | **本期加入 tags**：多值标签字段，加“全部匹配”筛选；列表与自动化选择共用同一谓词，预览与实际执行一致 |
| 用户决定（第二轮） | 2026-11-13 | **评论写进任务 md 本身**：一个任务就是一份完整的 Markdown 文件，不另建线程文件 |
| 用户决定（第二轮） | 2026-11-13 | **正文用固定 XML 标签分区**：`<task>` 存任务内容，`<comments>` 下每条 `<comment id at source …>`；标签内部仍是 Markdown |
| 用户决定（第二轮） | 2026-11-13 | **关联统一用地址引用**：笔记、档案、文件都通过正文或评论中的 `@` 模糊补全插入 `[[Vault 相对路径]]`；frontmatter 不再保存关联列表，也不加档案 id 字段 |
| 用户决定（第二轮） | 2026-11-13 | **Agent 看到完整任务**：快照里包含全部评论；提示词第一条写明 Vault 绝对路径；Agent 自行读写 Vault；headless 运行权限跟随 Provider 偏好，**默认最高权限（yolo）** |
| 用户决定（第三轮） | 2026-11-13 | **智能体启动设置复刻 orca**：交互会话与 headless 运行共用同一份设置，默认完全访问；只保留 Claude Code、Codex、Pi，删除 Claude Agent Teams。另开 change [2026-11-13-agent-launch-settings](../feature_2026-11-13-agent-launch-settings/brief.md) |
| 用户决定（第二轮） | 2026-11-13 | **档案改为文件夹笔记形态**（`Archives/<类型>/<名称>/index.md` 加附件，重名时才追加 4 位随机码）**另开 change**，见 [2026-11-13-archives-as-folder-notes](../feature_2026-11-13-archives-as-folder-notes/brief.md) |
| 顾问审查 | 2026-11-13（Opus，只读） | 指出 9 个阻塞项与若干建议，已全部并入 spec。主要涉及：消息头伪造、第三方插件的权限、矩阵漏洞、schema 1 被静默接受、缺少 Herdr 后台轮询、对账顺序、Space 并发、权限机制复用、遗漏的消费者 |
| 项目约束 | `CLAUDE.md` | 复用优先顺序 ①→⑥（同 Issue §10）；本仓库为 0→1 项目：不写兼容层、迁移层或双写 |

### 与 Issue 文本不一致之处（以本 change 为准）

- Issue §11.3 要求修改 `.agents/dev/changes/2026-11-09-huhu-workbench-definition/` 下的权威规格。该目录已经由 `dev-archive` 归档到 `archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/`，归档目录表示历史，不再代表当前实现。
- 因此本 change 的 [spec.md](spec.md) 是任务、评论、自动化、能力授权四个领域的**新权威规格**，在对应部分取代归档规格。
- 收尾时由 `dev-archive` 把结论写入 `.agents/dev/notes/`（如 `context/workbench.md` 的“被取代的决定”），不回头改写归档文件，也不维护两套并行规格。取代关系见 [spec.md §10](spec.md#10-对归档规格的取代)。
- Issue 写于 `38ab1c4`，当前 HEAD 为 `8283c5c`（领先 33 个提交）。下节事实已按 HEAD 重新核对。
- 以下 Issue 条文已被用户决定替代：
  - §4.1 的 `# 任务内容`、`# 关联文档文件` 两个章节，改为 `<task>` 区段加 `[[双链]]` 引用。
  - §4.3 和 §5.4 的“评论优先复用 `Comments/` 存储”，改为评论写进任务文件本身。
  - §5.2 和 §6.1 的“只有本次明确纳入的讨论进入输入”，改为全部评论进入快照，同时外部来源不能评论 agent 任务。
  - §4.2 的“关联文件夹不无上限读取，由系统做容量控制”，改为由 Agent 通过 Vault 路径自行读取。

## 当前事实（HEAD `8283c5c`，2026-11-13 由只读子代理核对）

### 任务

- `packages/contracts/src/kinds/task.ts`：
  - `TASK_SCHEMA_VERSION = 1`。
  - frontmatter 字段：`title`、`completed`（布尔）、`completedAt`、`due`、`project`（单值）、`execution`、`resources`、`reminders`、`inputRevision`、`createdAt`、`updatedAt`。
  - `execution` 是判别联合：`{kind:"manual"}`，或 `{kind:"agent", spaceId, provider, model?, effort?, fast}`。
  - **没有** `status`、`tags`；没有 `human` 这个类型名。
- `resources` 是 frontmatter 数组（`{kind: file|folder|root, path, id}`），这就是现在的“关联资料”。正文作为整段 Markdown 原样存取（`replaceBody`），**没有按 `#` 章节解析或写回的代码**；`任务内容`、`关联文档` 只出现在 UI 文案中。
- 能力（`plugins/tasks/huhu-plugin.json`）：`tasks.list/read/create/update/duplicate/delete/setCompleted/runs`。插件还提供进程内服务 `taskQuery`（`listOpenAgentTasks` 等），被 automations 直接取用。
- `assertAgentAllowed`（`plugins/tasks/src/engine/index.ts:19-22`）：只有 `desktop` 调用者能把任务设成 agent 类型。
- `setCompleted` 重新打开 agent 任务时会把 `inputRevision` 加 1，并发出 `task.inputChanged`。
- 看板只有“未完成 / 已完成”两列（`ui/TaskViews.tsx:84-86`）。
- `TaskEditor` 已能为 agent 任务选择 Space（`agent.spaces.list`）、CLI（`agent.providers.detect`，只列出支持 headless 且已检测到的）、模型、推理强度，但不能在表单内新建 Space 或选本地目录。`fast` 没有 UI，固定为 false。
- `TaskDetail` 读取 `tasks.runs`，并通过 `automations.runs.answer` 回答运行中的问题。任务本身没有任何评论代码。
- 仓库跟踪的 demo vault（`apps/desktop/resources/demo-vault/`）**没有任务文件**。

### 评论

- `plugins/notes/src/engine/comments/service.ts`（CommentsService）：
  - `Comments/` 目录下每个线程一个文件，kind `comment`，归 notes 插件所有。消息头格式为 `### <ISO> · <作者>`，有导出的 `parseMessages`。
  - 目标身份与笔记耦合：`documentId`、正文锚点、`refind`。没有 source 字段。
  - `reply`、`resolve`、`reopen` 是“读到最新版本再 patch”，没有让调用方传入 `expectedVersion`。
- 能力：`comments.list/create/reply/resolve/reopen/relocate/delete`。
- tasks 与 notes 之间**没有依赖声明**（`dependsOn: []`；tasks 的 `optionalDeps` 只有 `agent-cli`、`automations`）。

### 自动化

- `packages/contracts/src/kinds/automation.ts`：动作仍为 4 种，`scan_agent_tasks`（maxConcurrent 1–4）、`agent_prompt`、`script`（`scriptId`、`args`）、`notify`（仅 `in_app`）。
- 内置的“每 5 分钟扫描”规则会在启动时自动补建（`shared/builtin.ts`、`service.ts:179-182`），不能删除，也不能改动作类型。
- 调度器（scheduler）：每条规则一个 Croner 实例，按时区触发，`protect:true` 防止同一规则重叠执行；补跑只补宽限期内最近一次。
- claim：`.huhu/automations/claims/<taskId>:<inputRevision>:<inputHash>.json`，用硬链接保证原子创建。claim 状态有 `queued/running/waiting_input/succeeded/failed/cancelled/unknown`。**claim 只按“输入版本”去重，不是任务级占用**：扫描时任何带 claim 的任务都会被跳过。
- worker：只支持 claude（`-p --output-format stream-json --permission-mode acceptEdits`）和 codex（`exec --json`）的无界面执行。由监督进程托管；进程**退出后**解析 `agent-autoloop` 围栏回执，得到 `waiting_input`。`runs.answer` 回答后用 `--resume` 续跑。
- 任务的 `effort`、`fast` **没有传给 worker**。
- **扫描不写任务本身**：结果只写在 task-run、claim 和 task-run 正文中。
- `script` 动作：用绝对路径加 argv 执行（`spawn(..., {shell:false})`），环境变量取自保险箱引用。它**不参与 reconcile**：引擎崩溃后，script 类运行可能永久停在 running。这一点仅来自代码阅读。
- `notify` 动作：只写 `.huhu/notifications.ndjson` 站内通知，不创建任务。

### 能力授权与外部入口

- `packages/kernel/src/dispatcher.ts:115-123`：
  - `desktop` 直接放行。
  - `plugin:*` 调用者需要 `def.exposable && permissionsAllow(...)`，因此**内部插件无法调用不可外露的能力**。
  - 外部调用者需要 `exposable && exposure`。
  - 可授予的权限只有 read / write。write 和 execute 类调用必须带 `idempotencyKey`。
- `api.service()` 在进程内直接取服务，不经授权。automations 正是通过 `service("taskQuery")`、`service("agentCli")` 绕开授权的。
- 只看 caller 的检查共 4 处：
  - automations：`assertNoAgentAction`。
  - tasks：`assertAgentAllowed`。
  - notes：`assertNotAutomationsDir`。
  - inbox：按 caller 决定 source。
- `agent.*` 能力全部为 `exposable:false`。
- MCP 和 CLI 每次调用都生成新的随机 `idempotencyKey`，所以客户端重试不具备幂等性。

### Agent CLI 与 Herdr

- 交互会话：`agent.sessions.launch` 经 Herdr `terminal.run` 启动，会话状态只有 `launching/running/exited/failed/unknown`，**没有 waiting**。
- Herdr Core 已锁定为 0.1.19，与 `temp/sources/herdr-core` 一致。
  - 上游支持 OSC 7501 状态上报：`idle/working/done/blocked/error`；`blocked` 的 kind 为 `permission/question/auth`。终端记录中带有 `status`、`status_ms`、`turn`，并提供 `terminal.wait`。
  - **HUHU 没有读取这些字段**。`herdr-client` 有 `onEvent` 钩子和 FACTS 帧定义，但没有生产调用方。
- 尚未确认 claude 和 codex 实际是否会输出 OSC 7501。

### 复用来源

- `temp/sources/` 在本地存在：agent-autoloop、deepseek-harness、herdr-app、herdr-core、open-knowledge、orca。Issue 撰写时未取得这些源码，本 change 必须逐项补齐检查（见 [reuse.md](reuse.md)）。
- 复制台账 `docs/upstream/ledger.md` 只有 R-05、R-08、R-09、R-24 四条。`reuse.md` 已随归档迁走。

## 范围与非目标

范围以 Issue §1–§13 为准，并按上面的用户决定调整。完整行为契约见 [spec.md](spec.md)，切片见 [plan.md](plan.md)。

非目标：

- 跨 Vault 的云任务平台、GitHub 同步、多人组织权限、任意工作流编排、新的 Agent 框架。
- 并行事件总线、分布式队列、第二套调度器 / 终端运行时 / 审批后端 / 泛化评论平台。
- 旧格式兼容：不做 schema 1 转换、读时改写或双写（用户决定）。
- 为接入所有 Provider 的结构化审批协议而做的适配。本期只消费 Herdr 已有的状态上报，以及现有“退出后提问”路径。
- 把任务的 headless 运行改成可见终端运行。运行方式不变，见 [spec.md §7](spec.md#7-运行中等待人工的适配)。

## 成功条件

以 [spec.md §11 验收清单](spec.md#11-验收清单) 为准（在 Issue A01–D06 基础上增加 E 组 tags 验收，B04 按用户决定分级）。交付报告需区分已验证、仅静态检查和未验证的部分；不能拿假 CLI 的通过结果冒充真实 Provider 已经支持。

## 待决问题

用户层面的问题已经在两轮 dev-grill 中答完，顾问的审查意见也已并入 spec。下列事实核对已在 2026-11-13 的 S0 中完成，结论见 [s0-findings.md](s0-findings.md)，并已写回 spec：

- Herdr 0.1.19 实际对应的 schema 文件和 `status` 字段结构。
- Provider 权限偏好的现有位置，以及 claude、codex 对应 yolo 的 headless 参数。
- Markdown 解析器能否给出代码围栏的位置。
- `[[文件夹/]]` 的渲染和改名改写。
- `terminal.list/get` 是否回显 env。
- 被取代的 D- 编号。

被派发的 Agent 能直接改写 Vault 里的任务文件（§8.6），这是用户选择 yolo 时接受的风险。spec 写明了现有的缓解措施，本期不再引入文件级沙箱。
