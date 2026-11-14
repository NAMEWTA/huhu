# 规格：任务 Issue 化、三类自动化与统一能力复用

> 本文件是本 change 的行为契约（唯一权威）。
>
> - 来源与当前事实：[brief.md](brief.md)
> - Issue 原文：[source-issue-1.md](source-issue-1.md)
> - 实施切片：[plan.md](plan.md)
> - 复用核对：[reuse.md](reuse.md)
>
> 字段名与能力名已在 S0（[s0-findings.md](s0-findings.md)）核实后定稿。实施时如需调整，**先改本文件**，同步引用处，再实施。标注 “TD-” 的条目是本 change 的决定，见 §12。用户在 2026-11-13 的两轮 dev-grill 中作出的决定优先于 Issue 原文。

## 1. 术语

| 术语 | 含义 |
| --- | --- |
| 任务（Task） | `Tasks/` 下的一份 Markdown 文件。任务内容和评论时间线都在这一份文件里，它是工作项的唯一事实来源 |
| 类型（type） | `human` 或 `agent`，表示由谁执行。它不是标签，也不是状态 |
| 状态（status） | 只有三种：`not_started`（未开始）、`in_progress`（进行中）、`completed`（已完成） |
| 执行配置（execution） | agent 任务的 Space（工作目录）、Provider（CLI）、模型、推理强度、fast |
| 运行（run） | 一次派发产生的执行记录，由 task-run 和 claim 组成。运行状态为 `queued/running/waiting_input/succeeded/failed/cancelled/unknown`，**不是**任务状态 |
| 请求（request） | 运行中需要人处理的问题、权限、登录或手动操作。请求的事实以运行或会话记录为准 |
| 注意提示（attention） | 任务上的“需要你操作 / 有新结果 / 上次失败”标记。它从运行和请求的事实派生，不是任务状态 |
| 引用（reference） | 任务内容或评论中的 `[[Vault 相对路径]]` 双链，可以指向笔记、档案、普通文件或文件夹，由 `@` 补全插入 |
| 派发（dispatch） | 依次执行：预检 → 取得唯一处理权（claim）→ 持久化运行 → 任务进入进行中 → 启动 |
| 网关（gateway） | 现有 Dispatcher 加能力 handler，是唯一的授权边界（§8.6） |

## 2. 任务模型（schema 2）

### 2.1 文件示例

```markdown
---
huhu: { kind: task, id: task-xxxx, schema: 2 }
title: 整理接口文档
type: agent
status: in_progress
completedAt: null
tags: [接口, 文档]
project: 平台
due: 2026-11-20
origin: { kind: desktop }
execution:
  spaceId: space-xxxx
  provider: codex
  model: gpt-5.5
  effort: high
  fast: false
reminders: []
inputRevision: 3
createdAt: 2026-11-13T09:50:00+08:00
updatedAt: 2026-11-13T10:20:00+08:00
---

<task>

整理新版接口说明，参考 [[设计/接口说明.md]]，联系人见 [[Archives/张三--archive-xxxx.md]]。

## 验收条件

- 列出与旧版的差异。

</task>

<comments>

<comment id="c-01" at="2026-11-13T10:00:00+08:00" source="human" author="wta">

旧版见 [[设计/旧接口/]]。

</comment>

<comment id="c-02" at="2026-11-13T10:20:00+08:00" source="agent" author="codex" run="taskrun-xxxx" ask="q1">

发现两套定义，以哪套为准？

</comment>

</comments>
```

### 2.2 frontmatter 字段

- `type`、`status`：**都没有默认值**，缺失即视为文件错误。`completedAt` 只是时间戳，“是否完成”只看 `status`（TD-02）。
- `tags`：多值标签，见 §2.4。`project`、`due`、`reminders` 保持现有含义。
- `origin`：创建来源，创建后不可修改。§8.3 的字段权限依赖这个字段。
  - **种类**由网关根据受信的 caller 推导。
  - **明细 ID** 取自内置插件调用时的 `onBehalfOf` 上下文（§8.2），不取自请求体。

  | caller | `origin` | 对应的“本插件来源”插件 |
  | --- | --- | --- |
  | `desktop` | `{kind:"desktop"}` | — |
  | `plugin:inbox` | `{kind:"inbox", captureId}` | inbox |
  | `plugin:automations` | `{kind:"automation", ruleId, activationId}` | automations |
  | `plugin:agent-cli` | `{kind:"session", sessionId}` | agent-cli |
  | 其他内置插件 | `{kind:"plugin", id}` | 该插件 |
  | CLI / MCP / HTTP / 第三方插件 | `{kind:"external", caller}` | — |
- `execution`：`type=agent` 时必填。`type=human` 时可以保留，方便切回 agent，但不会生效。字段里**没有** `kind`，类型只看 `type`（Issue §3.1）。
- `inputRevision`：现有字段，含义见 §4.4。
- **删除**以下字段：`completed` 布尔、`execution.kind`、frontmatter `resources`。不做兼容读取，也不双写（TD-01）。
- 未知的 frontmatter 键原样保留（沿用 `patchFrontmatter`）。

### 2.3 版本与旧文件

- `TASK_SCHEMA_VERSION = 2`。task 的 schema 必须严格要求 `huhu.schema === 2`。
- schema 1 的文件给出明确的文件级错误：“旧版任务文件（schema 1）不再支持”。它们不出现在列表中可派发的位置，也**不会被转换或改写**。
- 代码中不存在读取 schema 1 的分支（TD-01）。原因是：仓储只拒绝比当前版本新的 schema，又带着 zod 默认值，如果不加这条严格检查，旧文件会被静默解析成新任务，并在下次写入时被改写。

### 2.4 标签（TD-03）

- 规范化规则：去掉首尾空白和开头的 `#`，转为 Unicode NFC，去重并保持原顺序。每个标签 1–40 个字符，不含换行和逗号。每个任务最多 20 个标签。
- 匹配规则：规范化后逐字相等，区分大小写。
- 筛选语义是**全部匹配**；空筛选表示不限。
- 任务列表、看板和自动化“选择任务”共用同一个谓词，并通过同一个 `tasks.list` 执行（§9）。这样预览与实际执行的结果一致。
- 标签只用于分类和筛选，不代表派发身份，也不授予任何权限（§8.3）。

### 2.5 类型与执行配置

- 选择 human 时，只需填写任务内容和普通属性。
- 选择 agent 时，表单内依次配置：
  - **工作目录**：选择已有 Space，或选择一个本地目录。选本地目录时，复用路径相同的 Space，没有就通过 `agent.spaces.save` 新建，不另外保存目录数据。
  - **CLI**：只列出已检测到、支持 headless 的 Provider。
  - **模型**。
  - **推理强度 / fast**：仅在 Provider 支持时显示。
- 保存任务**不启动**进程。新任务的状态为 `not_started`。
- 可派发条件：
  - Space 存在，且 `validateForLaunch` 通过。
  - Provider 已检测到，且支持 headless。
  - 模型合法（如有设置）。
  - `<task>` 区段解析成功（§3）。
- 条件不满足时，列表、详情和自动化预览都显示**不可派发原因**，不会静默回退到其他目录、Vault 根或其他 CLI。
- 派发时把 `effort` 和 `fast` 传给 worker（目前缺失）。
- **写入形状（`TaskWritable`）**：
  - 允许的字段为 `title`、`type`、`tags`、`project`、`due`、`execution`、`reminders`、`body`。
  - `body` 是 `<task>` 区段的**内容**，不含标签本身。沿用现有字段名，inbox 现在传的 `{title, body, due}` 不需要改动。
  - schema 使用 strict 模式，未知字段直接报 `INVALID_INPUT`，不静默丢弃。
  - `status` 只能通过 `setStatus` 或 `markDispatched` 修改。
  - `origin` 由网关写入。
- 切换类型或编辑执行配置，不会影响正在进行的运行。详情页显示本次运行所用配置的快照。

## 3. 任务文件正文：`<task>` 与 `<comments>`（TD-12）

### 3.1 结构

- 正文由两个顶层区段组成：
  - `<task> … </task>`：任务要求，**必须存在**。
  - `<comments> … </comments>`：评论时间线，可选，没有评论时可以省略。
- 每条评论是一个 `<comment …> … </comment>`，属性如下：

  | 属性 | 必需 | 说明 |
  | --- | --- | --- |
  | `id` | 是 | 线程内唯一，也是幂等去重键 |
  | `at` | 是 | 创建时间，ISO 8601，带时区 |
  | `source` | 是 | `human`、`agent`、`system` 或 `external` |
  | `author` | 否 | 显示名 |
  | `run` | 否 | 关联的运行 |
  | `ask` | 否 | 运行中的问题或请求 ID |
  | `session` | 否 | 关联的会话 |
  | `event` | 否 | 系统事件的种类 |

- 区段内部仍是 Markdown，可以使用任意级别的标题、列表、代码块和 `[[双链]]`。
- 开闭标签必须各占一行，前后留空行，这样在普通编辑器中可读，CommonMark 渲染也不会吞掉内部的 Markdown。
- 两个区段之外的文本原样保留，但不参与派发，并给出提示。
- 用户可以在外部编辑器里直接修改任何内容，包括评论。

### 3.2 解析与转义

- 只有满足以下全部条件的行才被识别为结构标签：
  - 位于行首（允许前导空格）。
  - 不在代码围栏或缩进代码块内。
  - 精确匹配 `<task>`、`</task>`、`<comments>`、`</comments>`、`<comment 属性…>` 或 `</comment>`。
- 属性值用双引号包裹，属性名限定在 §3.1 的集合内。
- **转义**：通过网关写入正文或评论时，内容中任何会被识别为结构标签的行都在行首加 `\`。渲染时去掉这个 `\`，交给 Agent 的快照保留转义原文。这样，评论内容无法伪造新评论、改写来源，也无法闭合区段（这一点是顾问审查中的阻塞项 1）。
- 以下情况都会给出文件级问题，任务**不可派发**：
  - `<task>` 缺失或重复。
  - 标签未闭合。
  - 评论缺少必需属性，或 `id` 重复。
- human 任务出现上述问题时仍然可以查看和关闭；结构损坏的评论区按原文显示。
- 代码围栏的判定（S0 已定）：
  - 把仓库里已有的两份同源正则——`vault/index/links.ts` 的 `stripCode` 与 `notes/shared/links-rewrite.ts` 的 `codeRanges`——收敛成一个共享函数 `codeRanges(text) → [start,end][]`，放在 `packages/vault/src/markdown/`，三处统一调用。
  - 写法参照 open-knowledge 的 `fence-regions.ts`，补齐波浪线围栏、围栏长度匹配、缩进代码块。
  - 引擎侧不引入新的 Markdown 解析依赖（reuse.md R-T03）。

### 3.3 写入规则

- 网关只按**区段**写入。编辑任务内容时只替换 `<task>` 区段，追加评论时只在 `</comments>` 前插入，其他字节保持不变。
- 写入使用条件写：读取最新版本 → 修改区段 → `repo.patch(expectedVersion)`。遇到版本冲突时重新读取、重新应用同一区段操作，最多重试 3 次，仍失败就报错。这样不会覆盖用户、Agent 或外部编辑器的新内容。
- 用户正在编辑 `<task>` 时如果有评论到达，保存只替换 `<task>` 区段，评论不会丢失（验收 B09）。
- 追加评论时按 `id` 去重：同一个 `id` 已经存在，就视为成功、不重复写入。
- 新建任务时，界面写入 `<task>` 骨架。

### 3.4 引用与 `@` 补全（TD-13）

- 关联的笔记、档案、普通文件、文件夹，**统一**用 `<task>` 或评论中的 `[[Vault 相对路径]]` 双链表达。frontmatter 中没有关联列表。API 返回的 `references` 是解析出来的只读派生值，并标注每条引用是否存在。
- 在任务内容编辑器和评论输入框中输入 `@`，会弹出 Vault 文件和文件夹的模糊匹配。选中后插入 `[[相对路径]]`：
  - 文件写完整相对路径，包括扩展名。
  - 文件夹以 `/` 结尾。
  - 数据源复用 `vault.tree`，打分复用命令面板的 `scoreText`。
  - 被过滤的内部目录（如 `.huhu/`）不出现。
- 任务内容编辑器从 `<textarea>` 改为现有的 CodeMirror `MarkdownEditor`。
- `@` 补全作为 `packages/editor` 的可选扩展实现：
  - 通过 `MarkdownEditor` 新增的 `extensions` 入参注入。
  - 引入 CM6 官方的 `@codemirror/autocomplete`（复用顺序 ③：已有生态内的成熟依赖；atomic 的 `suggest` 只有类型声明，没有实现）。
  - 本期只在任务内容和评论中启用；笔记编辑器是否启用另行决定。
- 渲染复用现有的双链渲染，并为任务视图提供 `resolveWikiLink`，根据 `vault.tree` 判定引用是否存在。点击文件会打开它；点击文件夹会在笔记模块的文件树中定位该文件夹（现有 `openWiki` 只能匹配文件，需要小改）。引用不存在时显示失效标记，不会静默换成其他目标。
- 文件移动或改名时，任务中的引用随之更新。需要两处小范围适配（reuse.md R-T04）：
  - `notes/engine/service.ts` 的改写范围加入 `Tasks/`（现在被 `isNoteFile` 排除）。
  - `links-rewrite` 支持文件夹前缀：文件夹改名或移动时，改写 `[[旧目录/]]` 和 `[[旧目录/…]]`。现在只改写指向文件的链接。
- 档案引用就是指向档案文件的路径引用。档案模块改为“文件夹笔记”形态的事项另开 change（[2026-11-13-archives-as-folder-notes](../../archive/changes/implemented/feature_2026-11-13-archives-as-folder-notes/spec.md)），本 change 不依赖它；它依赖本 change 的 T03（文件夹引用与前缀改写），并在其上加入“`[[目录/]]` 有 index.md 时打开该文件夹笔记”。

### 3.5 交给 Agent 的内容（TD-14）

- 派发时把**整份任务文件**（frontmatter + `<task>` + `<comments>`）原样复制到运行目录，作为本次输入快照（替代现有的 `context.md`），保证运行期间输入不变（验收 A08）。
- 提示词的第一条写明三件事：
  - Vault 绝对路径。
  - 快照文件的路径。
  - 格式约定：`<task>` 是本次要完成的要求；`<comments>` 是讨论历史，每条带 `source`；`[[路径]]` 相对于 Vault 根。
- 自动化规则的补充指令附在其后。
- Agent 通过 Vault 绝对路径**自行读取**被引用的文件，worker 不内联文件内容，也不做容量裁剪。
- **启动参数统一取自“智能体启动设置”**（用户 2026-11-13 第三轮决定：复刻 orca，交互会话与 headless 运行共用同一份设置，默认完全访问）。设置的定义与组装函数由 [2026-11-13-agent-launch-settings](../../archive/changes/implemented/feature_2026-11-13-agent-launch-settings/spec.md) 负责。本 change 只依赖它的组装契约：
  - `resolveAgentLaunch({agentId, mode: "interactive" | "headless", model?, effort?, fast?, prompt?, sessionId?, resume?})` 返回 `{command, argv, env, stdin?, warnings}`（另有仅供设置页预览的 `draft?`、`preview?`，worker 不用）。
  - 返回的参数已经合并了用户命令覆盖（或检测到的绝对路径）、默认参数（默认包含完全访问参数，例如 claude 的 `--dangerously-skip-permissions`、codex 的 `--dangerously-bypass-approvals-and-sandbox`）、新会话 id 与恢复会话参数。
  - headless 模式下，由组装函数加入无界面所需的参数：claude 是 `-p --output-format stream-json --verbose`，codex 是 `exec … --json -`（恢复会话为 `exec resume … --json <id> -`），提示词经 `stdin` 传入。
  - 返回的 `env` 只是覆盖层（目录条目 env + 用户 env）；worker 自行在继承环境上合并。
- 因此 Agent 可以读写 Vault。用户在设置里删掉完全访问参数后，就按 CLI 的默认权限运行。
- claude 的 headless 运行由组装函数在最后追加 `--disallowedTools EnterWorktree,ExitWorktree`，避免 worktree 移走 transcript 导致 `--resume` 失效（参照 agent-autoloop）。
- 智能体范围只有 Claude Code、Codex、Pi。Claude Agent Teams 被删除；Pi 没有 headless 模式，不能被选为 agent 任务的 CLI。
- 所有评论都进入输入，不另设“纳入”标记（用户决定）。外部来源不能给 agent 任务写评论（§8.3），所以通过网关不存在注入入口；通过文件系统的写入见 §8.6。
- 本次快照的 SHA-256 和 `<comments>` 末条 `id` 记入 task-run，方便事后复查本次运行看到了哪些内容。

## 4. 状态流转与派发

### 4.1 状态流转

| 事件 | 任务状态 | 用户可见的变化 |
| --- | --- | --- |
| 创建 human 或 agent 任务 | 未开始 | 不启动进程 |
| 用户开始处理 human 任务 | 进行中 | 追加系统评论“开始处理” |
| 自动化接受派发（§4.2） | 进行中 | 追加系统评论“已派发”，附运行入口 |
| Agent 请求回答、确认或手动操作 | 进行中 | 追加请求评论，显示“需要你操作” |
| 用户回复并继续 | 进行中 | 追加用户回复，标出送达或续跑结果 |
| Agent 返回结果 | 进行中 | 追加结果评论，提示“有新结果” |
| 运行失败或结果未知 | 进行中 | 追加失败评论，提示“上次失败”，**不自动重启** |
| 用户关闭完成 | 已完成 | 追加系统评论“关闭”。未开始的任务也可以直接关闭 |
| 用户重开 | 见 §4.4 | 追加系统评论“重开” |

- 只有用户（desktop，或按 §8.3 被授权的外部 human 任务写入）能把任务设为已完成。Agent 成功返回**不会**自动关闭任务。
- 系统评论的 `id` 由事件派生，例如 `sys-<runId>-dispatched`，保证重复处理时只写一次。

### 4.2 派发顺序与一致性

```text
派发互斥（引擎内全局，见 §6.2）
  → 预检：任务可派发；没有任务级活动运行；Space 当前无活动运行
  → claim 原子创建 + task-run 持久化（queued）
  → tasks.markDispatched（内部能力；条件：status == not_started，且当前完整 processingKey（inputRevision + inputHash）与 claim 一致）
       失败（任务已改变、tasks 停用、Vault 只读）→ 复用现有回滚：删除 claim 与 task-run，记录跳过原因
  → 释放互斥 → 启动 worker
```

- `markDispatched` 是条件写，不依赖调用方传入的 `expectedVersion`。
- **幂等键是本次 claim 的 `runId`**，不是 processingKey。原因：Dispatcher 会缓存不可重试的失败（`dispatcher.ts:96-98`；`VERSION_CONFLICT`、`READ_ONLY_VAULT`、`INVALID_INPUT` 都不可重试）。如果用 processingKey，回滚后下一次触发拿到的还是缓存的失败。
- 条件比对完整的 processingKey，而不只比对 `inputRevision`。外部编辑器修改只会改变 inputHash，不会改变 revision。
- 条件不满足时直接失败并回滚，下一次触发会生成新 claim 和新 runId，自然重试。
- 启动时的对账（现有 reconcile）在 queued 分支里，先确认任务已经是进行中，再决定是否启动：
  - 任务还是未开始：补调一次 `markDispatched`，失败就回滚。
  - 任务已完成：取消这次运行，记录“任务已关闭，未启动”。
  - 只有确认任务是进行中，才进入现有的 `drive`。
- 不允许出现两个进程，也不允许出现“进行中但没有任何运行依据”的 agent 任务。human 任务的进行中状态不需要运行依据。
- 对有副作用的外部进程，只承诺“同一派发意图最多被接受一次”，不宣称 exactly-once。

### 4.3 任务级活动运行（TD-04）

- 一个任务的 claim 如果处于 `queued`、`running`、`waiting_input` 或 `unknown`，就算该任务有活动运行。
- 判定方式是 claim 列表按其中的 `taskId` 字段过滤。每次扫描只列一次 claim，按 taskId 分组，不靠文件名前缀判断。
- automations 提供内部能力 `automations.runs.activeFor({taskIds})`，供 tasks 的守卫使用（拖回未开始、重开、关闭提示）。automations 停用时，tasks 退回读取 task-run 的状态（现有 `tasks.runs` 就直接读 task-run）。
- 当前 processingKey 已有终态 claim 时，扫描跳过该任务并给出原因，不会造成重复派发，也不会被静默忽略：
  - `succeeded`：原因是“已有成功结果，需重开以再次派发”。重开时 `inputRevision + 1`，会生成新的 key。
  - `failed`、`cancelled`：原因是“上次运行未成功，可重试”。重试复用现有 `retryRun`，在同一个 processingKey 下 attempt + 1，沿用归档的重试语义。
- 用户在外部编辑器里把 status 改回未开始时，按上面两条处理。
- `unknown` 状态只有用户明确对账、取消或重试后才会解除。

### 4.4 关闭、重开、停止、拖动

- **关闭完成**：只改变 `status`，不批准请求，也不终止进程。有活动运行时，界面提示，并提供单独的“停止运行”操作（复用现有取消能力）。
- **关闭后到达的结果**：只追加评论，不会重开任务。
- **重开**：
  - 有活动运行时，回到进行中。
  - 没有活动运行时，回到未开始，并且 `inputRevision + 1`，表示一次新的派发意图。
- **看板拖动**：与列表、详情修改的是同一个 `status`。拖到“未开始”等同于重开。拖动和编辑都不会批准请求，也不会向终端发送输入。
- **agent 任务不能被手动改为进行中**：`setStatus` 拒绝把 agent 任务从未开始改为进行中，看板拖动时提示“Agent 任务由自动化派发后进入进行中”。这类变化只能走 `markDispatched`，保证 §4.2 的“进行中必有运行依据”。agent 任务仍然可以手动关闭和重开。
- **编辑进行中的任务或切换类型**：不会中止或替换原运行。
- **`inputHash`**：只覆盖 `<task>` 区段和 `execution`。评论、标签、frontmatter 的其他字段都不计入，所以追加评论或改标签不会让输入版本变化。

## 5. Issue 式评论时间线

### 5.1 详情布局

任务详情从上到下依次显示：

- 标题、类型、状态、标签。
- 不可派发原因。
- `<task>` 渲染结果。
- 引用列表，带失效标记。
- 时间线：评论、系统事件、请求卡片、结果卡片。
- 运行记录。
- 底部输入框，支持 `@` 补全。

列表、看板、详情读的是同一份数据。卡片显示需要操作的数量；点击后定位到对应评论或现场。

### 5.2 操作语义

| 操作 | 语义 |
| --- | --- |
| 发表评论 | 追加一条 `source=human` 的评论。不会启动 Agent，不会写终端，不会改变 `inputRevision`。它会进入**下一次**派发的快照 |
| 回复并继续 | 绑定一个当前有效的请求：先追加回复评论（`ask` 指向该请求），再调用 `automations.runs.answer` 续跑 |
| 前往处理 | 聚焦原会话或原终端，由用户自己处理 |
| 关闭完成 / 发表评论并关闭完成 | 见 §4.4。都不代表执行授权 |

- “回复并继续”的送达状态从运行记录派生：回复已经写入，但运行记录中该请求仍未回答，就显示“未送达，可重试”。重试使用同一个幂等键（`runId + requestId`），并且**必须带原回复文本**，不会重复续跑。
- 续跑时传给 Agent 的回答就是这条回复的正文。

### 5.3 来源、请求与去重

- 每条评论的 `source` 由网关根据受信调用者决定（§8.4），请求体里自报的作者或来源一律忽略。
- 请求卡片的状态（待处理 / 已回复未送达 / 已解决 / 已过期）从运行或会话记录实时派生，评论里不保存审批状态。已解决或已过期的卡片不再显示可操作的按钮。
- “已读”、“已回复”、“任务已关闭”都不等于请求已经解决。
- 运行事件的评论 `id` 由事件派生，保证幂等：

  | 事件 | 评论 id |
  | --- | --- |
  | 问题 | `run-<runId>-q-<questionId>` |
  | 结果 | `run-<runId>-r<round>-result` |
  | 失败 | `run-<runId>-r<round>-failed` |
  | 运行中请求（关联了运行的会话或终端命令） | `run-<runId>-w-<发生标识>`（§7.3） |
  | 运行中请求（独立交互会话，没有 runId） | `session-<sessionId>-w-<发生标识>` |
  | 人工状态流转的系统评论 | `sys-<事件>-<ISO 时间>`，例如 `sys-start-…`、`sys-close-…`、`sys-reopen-…`；派发事件用 `sys-<runId>-dispatched` |

- 防丢失：事实首先写入运行记录。评论写入失败（tasks 停用、Vault 只读）不影响运行本身。对账时根据运行记录幂等补写缺失的评论。
- Agent 输出写入评论前先经过现有的脱敏处理。

## 6. 自动化：只有三类动作

### 6.1 规则契约

```yaml
action:
  kind: agent
  input:
    from: tasks                       # 派发已有任务
    filter: { tags: [...], project: ..., due: ... }   # 与 tasks.list 同一筛选
    instructions: "..."               # 可选补充指令
    maxConcurrent: 1                  # 1–4，复用现有上限
  # 或
  input:
    from: prompt                      # 不关联任务
    prompt: "..."
    spaceId / provider / model / effort / fast
---
action:
  kind: terminal
  spaceId: space-xxxx
  shell: <现有终端能力支持的取值>
  command: "pnpm test | tee out.txt"
  envRefs: [...]                      # 保险箱引用
  timeoutSec: 600
---
action:
  kind: reminder
  text: "..."
  deliver: notification | task | both
  taskId: task-xxxx                   # 可选：针对已有任务时追加评论，不新建
```

- 删除 `scan_agent_tasks`、`agent_prompt`、`script`、`notify` 四个旧枚举，以及对应的编辑器分支、默认文案和旧行为测试。run 的 `actionKind` 同步改为新的三类。
- 删除内置扫描规则和启动时的自动补建（`ensureBuiltin`）。新建规则对话框提供“定时派发 Agent 任务”模板。
- 暂停规则只停止以后的触发，不终止已经开始的执行。

### 6.2 执行已有任务

每次触发都重新查询 `tasks.list`，选出同时满足以下条件的任务：

```text
type = agent 且 status = not_started
且 满足规则 filter
且 可派发（§2.5）
且 当前 processingKey 没有 claim（§4.3）
且 所用 Space 没有活动运行
```

- **派发互斥**：引擎内所有规则共用一把互斥，串行进入“预检 → claim → markDispatched”。持锁后再检查一次 Space 是否有活动运行。这样两条规则同时激活时，也不能在同一个 Space 并发派发（TD-06）。
- **Space 活动的范围**：同一 Space 内处于活动状态的 task-run，加上同一 Space 内处于活动状态的 automation-run（不关联任务的 Agent 运行、终端命令）。用户手动开的交互会话不计入，只在预览里作为提示显示。
- **预览**复用现有的 `automations.preview`。它和扫描共用 `classify`，同一次计算给出“将派发 / 将跳过”及原因，不产生任何副作用。
- 没有候选任务时只记录“跳过：无候选”，不启动空 Agent。
- 匹配到多条任务时，**每条用自己的配置分别派发**，不会合并成一个会话。同一次激活中，多条任务指向同一 Space 时只派发一条，其余跳过，原因记为“同一工作目录已有运行”。
- 进行中、等待用户、已返回但未关闭的任务都不在“未开始”状态，因此不会被重新派发。评论、标签、提醒都不会改变状态或 `inputRevision`。
- 重复激活、多条规则竞争、重启恢复：由互斥、claim 和对账保证同一派发意图只被接受一次。
- 失败或未知的运行不会自动重放，只能由用户明确重试（复用 `retryRun`）或对账。

### 6.3 不关联任务的 Agent 执行

保留“定时执行一段提示”。只有这种情况下，目录、CLI、模型才写在规则里。

### 6.4 终端命令

- 扩展 `agent.sessions.launch`，增加 `shell`、`command`、`envRefs` 三个字段（目前 `provider:"shell"` 既不接受命令，也不接受 env）。执行方式是 `argv = [shell, -c | -Command, command]`，所以能拿到退出码。`envRefs` 在引擎侧解析后，作为 `terminal.run` 的 `env` 传入。S0 已核实：`terminal.list/get` 只回显 `argv` 和 `cwd`，不回显 env。
- 终端在规则配置的 Space 中，以可见的 Herdr 会话运行。Shell 语义只来自用户写下的命令；任务正文、标签、文件名等外部数据**不会**被拼进命令；环境变量只通过保险箱引用注入。
- automation-run 关联 `sessionId`，界面提供“查看 / 接管终端”。输出摘要和退出码沿用现有的截断与脱敏规则；超时和取消沿用现有的监督语义。
- 补上对账缺口：引擎重启后，根据 Herdr 会话的真实状态更新处于 running 的运行，不会永远停在 running。
- 运行中需要交互时，保留原现场，既不自动确认，也不静默输入。
- 删除旧的脚本管理，S0 已确认没有其他使用方：
  - 能力：`automations.scripts.list/save/delete`。
  - 存储：`ScriptStore`。
  - UI：scripts 标签页，以及 RuleEditor 里的脚本下拉框。
  - 动作：`script` 动作及 `runScript`。
- Vault 中已有的 `.huhu/automations/scripts.json` 不再读取，也不删除。
- `runScript` 里的脱敏闭包提取成共享函数 `redactSecrets(text, secrets)`，供终端命令和 Agent 结果评论共同使用。

### 6.5 提醒

- `notification`：调用 `notifications.create`。
- `task`：通过内部能力创建 human 任务，状态为未开始。`origin` 为 `{kind: automation, ruleId, activationId}`，幂等键为 `<ruleId>:<scheduledFor>`，同一次提醒重试不会重复建任务。
- `both`：两者都做。
- 设置了 `taskId` 时，改为向该任务追加系统评论并加注意提示，不新建副本。
- 提醒不会启动 Agent。

## 7. 运行中等待人工的适配（TD-07）

### 7.1 能力矩阵

| 执行方式 | 等待上报 | 请求 ID | 应用内回答 | 观察解决 | 原现场 | 本期行为 |
| --- | --- | --- | --- | --- | --- | --- |
| 任务的 headless 运行（claude / codex） | 只在退出后，通过回执 | 回执中的 question id | 是（`runs.answer` + `--resume`） | 是 | 无终端 | 复用现有的“退出后提问”。最高权限模式下不会出现中途等待权限确认 |
| Herdr 会话（交互式 `agent.sessions`、终端命令） | `status.state === "blocked"`，`status.kind` 为 `permission/question/auth`，前提是程序会上报 OSC 7501 | 无原生 ID，使用发生标识 | 否 | 是（状态离开 blocked） | 是，聚焦原终端 | 显示“需要你操作”和“前往处理”，不提供应用内的批准按钮 |
| 不上报 OSC 7501 的程序 | 否 | — | 否 | 否 | 是 | 不推断等待（例如不把长时间无输出当成等待），只提供“查看终端” |

### 7.2 状态读取

- 现有会话的 `reconcile()` 只在有能力调用时才触发，没有后台轮询可用。因此要在 agent-cli 引擎中新增一个后台 watcher（S0 已定）：
  - 用 `ctx.effect` 建立一条**专用**的 Herdr 连接，调用 `events.subscribe({labels: {"huhu.vault": <当前 Vault>}})` 接收 `status` 和 `turn` 事件推送。复用 `herdr-client` 现有的 `onEvent`，只需补一个 subscribe 辅助方法。
  - 连接断开后重连。重连成功时，先用一次 `terminal.list` 全量对账，再继续接收推送。
  - 插件停用时，由 `ctx.effect` 负责释放这条连接。
  - 不引入消息中间件。
  - 延迟目标是 ≤ 3 s。
- 字段以 Herdr Core 0.1.19 对应的 `schema/released.openrpc.json` 为准（S0 已核实），按以下方式读取：
  - 等待判定：`terminal.status.state === "blocked"`。
  - 等待类别：`terminal.status.kind`，取值为 `permission`、`question` 或 `auth`。
  - 回合与时间：`terminal.turn`、`terminal.status_ms`。
  - Terminal 顶层的 `state`（`live`/`finished`）只用于判断进程是否结束。
- OSC 7501 只能由程序自己输出，herdr-app 没有为 claude 或 codex 提供集成。orca 用 Claude/Codex hooks 回报等待状态，可作为后续增强（例如由 HUHU 托管 hooks 并转成 OSC 7501），**本期不做**。真实 CLI 是否会上报，仍按 B04c 记为待验证。
- 会话状态新增 `waiting`（附带 kind）。它是会话或运行的状态，不是任务状态。状态离开 blocked 时解除提示；进程失联时把请求标为已过期。用户查看过、或任务已关闭，都不算请求已解决。

### 7.3 发生标识

一次等待的发生标识为 `<sessionId>:<turn>:<status 进入 blocked 的时间>`，在进入 blocked 时持久化到会话或运行记录中。重连、重启、重复轮询都不会产生新的标识。

### 7.4 请求回到哪里

```text
请求出现 → 写入会话或运行记录
→ 关联了任务：在原任务追加请求评论，并加注意提示
→ 终端命令动作：只更新 automation-run，并发一条通知（按发生标识幂等），不建任务
→ 用户手动启动的独立交互会话：为该会话创建一条 human 任务
   （origin = session，幂等键 = sessionId），之后的请求都追加到这条任务
→ 用户在原现场处理 → 观察到请求真正解决 → 更新卡片和提示
```

- 独立会话自动建任务由设置项控制，默认开启。
- 已经结束的会话只能通过明确的原生恢复动作继续，不会自动恢复其他会话。

## 8. 能力复用与授权

### 8.1 统一入口

界面、内置插件（`api.call`）、自动化、外部 CLI、MCP、HTTP 都经过现有的 Dispatcher，调用同一份业务实现。

- 插件之间不通过 CLI、localhost HTTP 或 MCP 绕路互调。
- 外部入口不另做一套校验或存储。
- 插件之间不直接 import 对方的 Service，也不写对方的私有文件。
- `api.service()` 只用于基础服务（文件、终端流、密钥引用）。automations 当前对 `taskQuery` 和 `agentCli` 的业务调用，改为走能力调用（TD-08）。确实必须保留的进程内服务，在 reuse.md 中登记理由。
- **登记的例外**：
  - **notes 改写 `Tasks/` 中的双链**（§3.4）：
    - 只改 `<task>` 和 `<comments>` 区段内的 `[[…]]`。
    - 使用条件写，冲突时重试。
    - 不增加 `inputRevision`，但 inputHash 会随 `<task>` 变化。对已派发的任务没有影响；未开始的任务会得到新的 processingKey，这是预期行为。
    - 这条例外不受 §8.3“内置插件不能改 agent 任务正文”的限制，因为它只是机械地同步路径，不改变语义。
  - **versioning 恢复任务文件**（见 §10）。
  - **versioning 使用 `automations` 服务的 `holdRestoredInput`**：保持同步的进程内调用，避免改成异步后与扫描之间出现竞态。

### 8.2 内部许可与外部暴露分离（TD-09，按顾问意见修订）

- 不新增清单键，直接扩展现有的 `permissions` 机制：
  - Dispatcher 对 `plugin:*` 调用者**按插件来源分流**：
    - 内置插件：只看 `permissionsAllow(granted, cap, scope, origin)`，不要求 `exposable`。
    - 第三方插件：保持现状，仍要求 `exposable && permissionsAllow`。
  - `permissionsAllow` 和 `isGrantable` 增加 `origin` 参数：内置插件可以使用 `execute` 范围以及内置专用权限组；第三方插件仍只能用 read/write。现状下 `isGrantable` 对 `execute` 一律返回 false，所以即使给了 `agent.run`，调用也会被拒绝。
  - 在 `PERMISSION_TABLE` 中新增**仅限内置插件**的权限组：`agent.run`、`tasks.dispatch`、`tasks.comment.system`、`automations.runs.internal`（不叫 `automations.runs.read`，那是现有能力名）。外部插件安装时如果声明了这些组，安装失败。
  - 内置插件的权限随清单获得批准，不存在第二份清单。
- 外部调用者（CLI/MCP/HTTP）的判定不变：能力必须 `exposable`，并且暴露开关打开。
- 委托链：扩展 `api.call` 与 handler 上下文，增加 `onBehalfOf`（例如 `plugin:automations ← activation:<id>`，或 `plugin:inbox ← external:mcp`）。审计会记录内置插件发起的 write 和 execute 调用，以及委托链；read 调用不记录，避免轮询刷满审计。
- 同步统一现有 4 处只看 caller 的判定（`assertNoAgentAction`、`assertAgentAllowed`、`assertNotAutomationsDir`、inbox 的 source 推断），改为“调用者类别 + 权限组”，避免一处放行、另一处拒绝。

### 8.3 字段与操作权限

“内置插件”指 `origin=builtin` 的插件，第三方插件**一律按外部处理**。

| 操作 | desktop | 内置插件 | 外部（CLI/MCP/HTTP/第三方插件） |
| --- | --- | --- | --- |
| 创建任务 | 任意类型 | 只能 human；`origin` 由网关按调用方写入（inbox/automation/session） | 只能 human，`origin=external` |
| 设置或修改 `type=agent`、`execution` | 允许 | 不允许 | 不允许 |
| 修改 agent 任务的 `<task>`、标签、project、due | 允许 | 不允许 | 不允许 |
| 修改 human 任务的字段与 `<task>` | 允许 | 只能修改本插件来源（`origin`）的任务 | 允许 |
| `tasks.setStatus` | 允许 | 不允许（派发改用 `markDispatched`） | 只能用于 human 任务 |
| `tasks.markDispatched` | — | 只给 automations（`tasks.dispatch` 权限组） | 不允许，`exposable:false` |
| `tasks.duplicate` | 允许 | 不允许 | 只能复制 human 任务；复制结果的 `origin=external` |
| `tasks.delete` | 允许 | 只能删除本插件来源的任务 | 只能删除 human 任务 |
| 追加评论 | `source=human` | `source=agent/system`，需要 `tasks.comment.system` 权限组 | `source=external`，**只能在 human 任务上** |
| 回答请求或续跑 | 允许 | 不允许 | 不允许（本期） |

inbox 转换为任务时，调用者是 `plugin:inbox`：只能建 human 任务，`fields` 中的 `type`、`execution`、`origin` 被忽略。

### 8.4 来源与身份

- 评论 `source`、任务 `origin`、审计委托链都由 Dispatcher 传入的受信调用者推导，请求体中的同名字段一律忽略。
- 经过内置插件转发的外部请求保留原始的外部来源，不能借转发提升权限。

### 8.5 调用、事件、服务

- 需要结果的就调用能力；事件只在操作成功之后发布；基础资源走受控服务。
- 执行类能力快速返回运行标识，长期状态从运行记录读取。
- 插件停用或重启时，按现有作用域机制释放和恢复。automations 停用时，任务的基本操作照常可用。

### 8.6 威胁模型

- **网关是授权边界，文件系统不是**。以下写入都绕过 §8.3：
  - 用户的外部编辑器。
  - 被派发的 Agent：最高权限运行并且知道 Vault 路径，可以直接改写 `Tasks/*.md`，包括其他任务的内容、状态，甚至伪造评论。
- 这是用户选择 yolo 并开放 Vault 写入（TD-14）后接受的风险。本期的缓解措施有三条：
  - 派发以“状态 = 未开始，且当前 processingKey 没有 claim”作为闸门。Agent 改写评论或内容不会自动触发派发（§4.3）。
  - 网关写入的评论有转义保护（§3.2）。直接改文件写入的评论，`source` 属性只是文件里的文本。本期**不做**“文件写入”识别，界面照文件内容显示，并在 §8.6 里写明这一点。
  - 预检发现 Space 根目录就是 Vault，或是 Vault 的祖先目录时，在预览和详情中提示：“Agent 将在 Vault 内运行”。

## 9. 能力契约变化

| 能力 | 变化 |
| --- | --- |
| `tasks.list` | 新增筛选：`type`、`status[]`、`tags`（全部匹配）、`project`。自动化的预览和扫描都使用它。“是否可派发”中涉及环境的部分（Space、CLI）由 automations 的 `classify` 判定，不放进 tasks 的筛选 |
| `tasks.read` | 返回 `type`、`status`、`tags`、`origin`、`body`（`<task>` 区段内容）、`comments[]`（解析后）、`references[]`（派生，只读）、`problems[]`（文件结构问题）、`dispatchBlockers[]`（只含任务自身原因：结构损坏、`execution` 缺失、引用越界或有歧义；环境原因由 `automations.preview` 给出，任务详情另行调用）、`attention`（由 tasks.runs 派生，T04 实现） |
| `tasks.create`、`tasks.update` | 写入 schema 2，按区段写；遵守 §8.3；需要 `expectedVersion` |
| `tasks.setCompleted` | **删除**，同时删除 `task.completedChanged` 事件，改为 `task.statusChanged` |
| `tasks.setStatus` | 新增。执行 §4.4 的流转和守卫 |
| `tasks.markDispatched` | 新增，内部专用（§4.2） |
| `tasks.comments.add` | 新增。按区段追加，按 `id` 幂等，`source` 由网关推导 |
| `tasks.duplicate`、`tasks.delete` | 增加 §8.3 的守卫 |
| `tasks.runs` | 保留，补充 `attention` 所需的字段 |
| `automations.rules.*` | 适配三类动作 |
| `automations.preview` | **复用**，与扫描共用 `classify` |
| `automations.runs.activeFor` | 新增，内部使用（§4.3） |
| `automations.runs.answer`、`cancel`、`retry` | 复用。`answer` 的幂等键为 `runId + requestId` |
| `agent.sessions.launch` | 新增 `shell`、`command`、`envRefs`；会话状态新增 `waiting` |
| `agent.spaces.*` | 复用 |
| `agent.catalog.detect`（取代 `agent.providers.detect`） | 由 agent-launch-settings 的 AL-S1 改名并提供 |
| 权限表 | 新增内置专用权限组；`isGrantable` 按插件来源判定 |
| 智能体启动设置 | 由 [agent-launch-settings](../../archive/changes/implemented/feature_2026-11-13-agent-launch-settings/spec.md) 定义并提供 `resolveAgentLaunch`；本 change 的 worker 改用它 |
| `automations.scripts.list/save/delete` | **删除**，同时删除 `ScriptStore` 和 scripts 标签页 |
| `tasks` 进程内服务 `taskQuery` | 删除。原使用方 automations 和 versioning 改为调用 `tasks.list`/`tasks.read` |
| `packages/editor` | `MarkdownEditor` 新增 `extensions` 入参；新增依赖 `@codemirror/autocomplete` |
| `packages/vault` | 新增共享的 `codeRanges()`；`stripCode` 和 `links-rewrite` 改为调用它 |
| `packages/herdr-client` | 新增 `subscribe` 辅助方法（专用连接，复用 `onEvent`） |

本表即 S0 定稿的方法名。实施时如需改名或新增，要先在本节说明理由：为什么现有契约不够用。

## 10. 对归档规格的取代

本规格取代 `archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/` 中的以下定义：

- `brief.md`、`data-model.md`：任务只有 `completed`、执行类型叫 `manual`、关联资料放在 frontmatter `resources`。
- `modules/tasks.md`：两列看板、勾选完成、正文用 textarea。
- `modules/automations.md`：四类动作，内置扫描规则不可删除。
- `interfaces.md`：`tasks.setCompleted`；`task.completedChanged` 事件。
- `modules/agent-cli.md`：会话没有 waiting 状态；shell 会话不接受命令。
- `modules/plugins.md`、`security.md`：`plugin:*` 调用需要 `exposable`。
- `reuse.md`：本 change 的复用记录由 [reuse.md](reuse.md) 承担。

逐条对照见 [s0-findings.md §4](s0-findings.md#4-与归档规格的关系)。

- **D- 决定**：D-01 至 D-43 中没有被整体取代的项，只扩展了两项：
  - D-04：Dispatcher 增加委托链和内置专用权限组。
  - D-06：内置插件标记 `origin=builtin`。
- **归档文字与代码不一致的一处**：归档 `interfaces.md:50` 写的是“plugin 调用只需权限”，但代码 `dispatcher.ts:119` 额外要求 `exposable`。本 change 让代码回到归档文字的意图。
- **未被取代、继续有效的归档行为**（实施时不得删除）：
  - 恢复后暂停（holds，ACC-AU-12）。
  - 宽限补激活（ACC-AU-09）。
  - 立即运行（US-AU-05）。
  - 逾期与“未来 7 天”分类（ACC-TK-04/05）。
  - 月历视图。
  - 任务提醒（US-TK-07）。
  - 失败后同一 key 重试（attempt + 1）。
  - versioning 恢复任务旧版本时保留当前完成状态（ACC-VS-03）。这一条改为恢复时保留当前的 `status`、`completedAt`、`origin`，以及**整个 `<comments>` 区段**，只回退 `<task>` 区段和其余字段，避免恢复操作丢失评论（对应 B09）。
  - versioning 不允许把 schema 1 的历史版本恢复到 `Tasks/`：拒绝恢复，并说明原因（对应 A09）。

收尾时由 `dev-archive` 把以上内容写入 `notes/context/workbench.md`，归档文件本身不修改。

## 11. 验收清单

> 交付报告对每一条标注三种结果之一：“已验证（命令或截图）”“仅静态检查”“未验证”。“假 CLI”指测试替身。

### A. 任务与文件

- [ ] A01 类型只有 Human / Agent，状态只有未开始 / 进行中 / 已完成。列表、详情、三列看板显示同一份事实。
- [ ] A02 在任务表单内可以选择已有 Space，也可以选本地目录（必要时自动建立 Space），并选择 CLI，不产生第二份目录或 CLI 数据。effort / fast 按 Provider 能力显示，并且确实传给 worker。
- [ ] A03 保存 agent 任务不会启动进程。配置无效时显示具体原因，不会静默替换。
- [ ] A04 预检失败的任务保持未开始；被派发的任务进入进行中，并且有运行记录。人为让 `markDispatched` 失败（包括 Vault 只读，恢复可写后再试）后，claim 与 task-run 被回滚，下一次触发能正常派发，不会被幂等缓存卡住；启动对账不会在任务未进入进行中时就启动进程；desktop 不能手动把 agent 任务改为进行中。
- [ ] A05 Agent 提问、失败或成功，都不会改变任务状态，只有用户关闭才会完成。human 任务可以正常开始和关闭。
- [ ] A06 在外部编辑器中修改 `<task>` 或评论后，界面正确刷新。界面保存只替换对应区段，区段外的文本和 frontmatter 的未知键逐字节保留。
- [ ] A07 代码围栏中的 `<task>`、`<comment>` 不会被当作结构标签。区段缺失、重复或未闭合，以及评论属性缺失，都会阻止派发，并给出文件级原因。
- [ ] A08 运行期间修改任务内容、执行配置或追加评论，都不会改变本次运行的快照（task-run 记录的 SHA-256 与运行目录中的文件一致），也不会触发并行的第二次派发。
- [ ] A09 schema 1 文件显示“旧版任务文件不再支持”，不会被改写。代码中没有 schema 1 的读取或转换分支；`type` 和 `status` 没有默认值。
- [ ] A10 在任务内容和评论中输入 `@`，能模糊匹配 Vault 中的文件和文件夹，并插入 `[[相对路径]]`。引用会被渲染并可以点击；失效的引用有标记。笔记改名或移动后，任务中的引用随之更新。

### B. 评论与人工响应

- [ ] B01 派发前后都可以发表评论。普通评论不会启动 Agent，不会写入终端，也不会改变 `inputRevision`。下一次派发的快照包含此前的全部评论。
- [ ] B02 已关联任务的 Agent 问题、请求和结果，都追加到原任务的 `<comments>`，不会新建任务。卡片显示需要操作的数量，点击能定位到对应评论。
- [ ] B03 “回复并继续”复用 `runs.answer`。重复点击或网络重试不会重复续跑；未送达的状态可见，并且可以重试。
- [ ] B04 运行中请求，分级验收：
  - B04a（必须）：测试程序在 Herdr 会话中输出 OSC 7501 blocked，进程不退出。用户停留在任务页、没有打开 Agent 模块时，≤ 3 s 内显示“需要你操作”，并且能定位原终端；状态离开 blocked 后提示解除。
  - B04b（必须）：headless 运行显示“退出后提问”的能力说明，没有伪造的批准按钮；不上报 OSC 7501 的程序只提供“查看终端”。
  - B04c（待验证，不阻塞交付）：记录本机真实的 claude、codex 交互会话是否会上报 OSC 7501，以及 herdr-app 的集成能否复用。
- [ ] B05 “前往处理”打开原会话或原终端，不会另起一个无关的 Agent。
- [ ] B06 请求解决或过期后卡片更新。已读、关闭任务、普通评论都不会被当作批准。评论中不出现令牌或密钥（经过脱敏）。
- [ ] B07 同一请求在重发、重连、重启后，不会产生重复的评论或任务。独立交互会话在第一次请求时建一条 human 任务，之后的请求都追加到这条任务；终端命令动作不会建任务。
- [ ] B08 关闭任务时如果仍有运行，界面会明确显示。晚到的结果不会重开任务；重开时不会重复启动仍在活动的原运行。
- [ ] B09 用户编辑 `<task>` 时并发追加评论、多方并发追加评论、外部编辑文件，这些情况下都不丢消息。notes 插件停用时任务评论仍可用。
- [ ] B10 通过网关写入的评论正文中，如果有一行 `</comment>` 或 `<comment source="human">`，它会被转义，不会生成新评论，也不会改变来源。

### C. 自动化

- [ ] C01 规则只有 Agent、终端命令、提醒三类。旧枚举、编辑器分支、内置规则及其自动补建都已删除。
- [ ] C02 执行已有任务时，目录、CLI、模型、effort、fast 都来自任务本身。只有直接提示的规则才在规则中配置这些目标。提示词第一条包含 Vault 绝对路径和快照路径。
- [ ] C03 规则创建之后新建的、或修改后匹配筛选的任务，会在后续触发中被选中。预览与实际派发的集合一致，预览不产生任何副作用。
- [ ] C04 没有候选时不会启动 Agent。进行中、等待用户、已完成的任务，以及有未知运行的任务，都不会被重复派发。同一 Space 的第二条任务被跳过，并注明原因。两条规则同时激活时，同一个 Space 内也不会出现并发运行。
- [ ] C05 目录或 CLI 不同的两条任务，各自使用自己的配置运行。规则的补充指令出现在各自的提示词中。
- [ ] C06 重复激活、规则之间竞争、重启恢复，最终都只产生一次有效派发。失败或未知的运行不会自动无限重试，但可以由用户明确重试或对账。
- [ ] C07 终端命令有可查看、可接管的真实终端。外部数据不会成为 Shell 代码，`terminal.list/get` 不回显 env。引擎重启后可以对账。
- [ ] C08 提醒可以发通知、建 human 任务，或两者都做。同一次提醒重试不会重复建任务；设置了 `taskId` 时只追加评论。
- [ ] C09 暂停规则不会终止正在进行的执行。automations 停用时，任务的基本操作照常可用；恢复后能幂等补齐缺失的内容。

### D. 授权、复用与交付

- [ ] D01 内置插件和外部 CLI/MCP 执行同类操作时，走同一份业务实现。automations 不再通过 `api.service` 做跨插件的业务调用（登记过的例外除外）。
- [ ] D02 被授予内置专用权限组的内置插件，可以调用 `exposable:false` 的能力，但同一能力对外部仍不可用。没有被授予权限的插件调用会被拒绝。外部插件声明内置专用权限组时，安装失败。
- [ ] D03 外部调用者和第三方插件都不能：创建 agent 任务；修改 agent 任务的内容、标签或执行配置；复制 agent 任务；在 agent 任务上发表评论；伪造 agent/system 来源。inbox 转换产生的只会是 human 任务。
- [ ] D04 依赖的模块缺失或停用时，返回明确的错误和恢复提示；恢复后能幂等补齐，不依赖一次性的内存广播。
- [ ] D05 每个新增实现在 reuse.md 中都有核对记录。没有读过的来源不能记为“无可复用”。没有新增重复的基础设施。
- [ ] D06 代码、契约、示例、测试和本规格同步更新。没有双写，没有兼容层，没有已被否决的旧设计残留。CLI 的 `--completed` 参数、`tasks.setCompleted`、`task.completedChanged` 已全部移除或替换。

### E. 标签

- [ ] E01 可以添加和删除多个标签，规范化规则符合 §2.4。在外部编辑 `tags` 后，界面能正确显示。
- [ ] E02 列表和看板支持多选标签筛选，语义为全部匹配。
- [ ] E03 自动化 filter 使用相同的语义。用同一套夹具对比预览结果和实际派发集合，两者一致。

## 12. 决策记录

| 编号 | 决定 | 依据 / 备选 |
| --- | --- | --- |
| TD-01 | 旧任务文件不做任何兼容；schema 严格要求等于 2；`type` 和 `status` 没有默认值 | 用户决定；顾问指出：不设严格 schema 时，旧文件会被静默接受并改写 |
| TD-02 | `status` 是唯一的完成事实，`completedAt` 只是时间戳 | Issue §3.1 |
| TD-03 | 本期加入多值 `tags`，筛选为全部匹配，列表与自动化共用同一谓词 | 用户决定 |
| TD-04 | 任务级活动运行：按 claim 的 `taskId` 字段判定，由 automations 提供 `runs.activeFor`；当前 processingKey 已有终态 claim 时要求先重开 | 顾问指出：文件名中的 `:` 已被替换，靠前缀判定不可行；claim 是 automations 的私有文件 |
| TD-05 | ~~评论放在独立线程文件~~ → 评论写进任务 md 本身，不新增 kind，也不依赖 notes | 用户在 2026-11-13 第二轮的决定。代价是评论会改变任务文件版本，由区段写入加冲突重试来消化（§3.3） |
| TD-06 | 同一 Space 内同时只有一个由自动化派发的活动运行，靠引擎内的全局派发互斥保证 | Issue §6.1；顾问指出：单靠规则级互斥，两条规则仍可能在同一 Space 并发 |
| TD-07 | 运行中等待人工纳入本期，验收分级；需要新增引擎侧 watcher | 用户决定；顾问指出：目前没有后台轮询 |
| TD-08 | 跨插件的业务调用都走能力调用 | Issue §8.1 |
| TD-09 | 内部许可扩展现有的 `permissions` 和权限表（内置专用权限组 + 按插件来源判定），不新增 `calls` 键；增加委托链 | 顾问建议，复用现有机制 |
| TD-10 | 外部调用者和第三方插件只能写 human 任务和 external 评论；agent 任务的配置与内容只能由 desktop 修改；派发通过专用的 `markDispatched` | Issue §8.3；顾问补充了 duplicate/delete/inbox 的漏洞和 origin 字段 |
| TD-11 | 本规格取代归档规格中的对应部分，不修改归档文件 | dev-workflow 约定 |
| TD-12 | 正文用 `<task>`、`<comments>`、`<comment 属性>` 固定标签分区，标签内部仍是 Markdown；网关写入时转义结构行 | 用户选择“固定标签 + 属性”。时间不适合当标签名，因为标签名不能以数字开头，而且要承载来源和 id |
| TD-13 | 关联统一用 `[[Vault 相对路径]]`，通过 `@` 补全插入；删除 frontmatter `resources`，不加档案 id 字段 | 用户决定：档案、笔记、文件都用地址引用；复用现有的双链渲染与改名改写 |
| TD-14 | 派发时把整份任务 md 复制为快照；提示词第一条写明 Vault 绝对路径；启动参数取自智能体启动设置（默认完全访问，交互会话与 headless 共用）；Agent 自行读写 Vault；全部评论都进入输入 | 用户决定（第二、三轮）。风险见 §8.6 |
