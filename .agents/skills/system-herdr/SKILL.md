---
name: system-herdr
description: "控制 Herdr 的窗格、标签页、工作区、命令及 agent，并支持按 pane 使用 task/report 文件派发任务与收取结果。仅当用户明确提到 Herdr 或要求使用 Herdr 时启用，不因任务可并行而自动触发。执行控制命令要求 HERDR_ENV=1。"
---

# Herdr

Herdr 将终端组织为工作区、标签页和窗格，识别窗格中运行的编程 agent，并通过 `herdr` CLI 提供当前会话的访问入口。

执行任何控制命令前，先确认当前 agent 正在 Herdr 管理的窗格内运行：

```bash
test "${HERDR_ENV:-}" = 1
```

如果检查失败，说明当前不在 Herdr 内运行，然后停止。不要从 Herdr 外部查看或控制当前聚焦的 Herdr 会话。

检查通过后，`PATH` 中的 `herdr` 程序会与当前会话通信。使用它查看相邻工作、创建终端布局、启动 agent 和命令、读取输出，以及等待状态变化。

## 了解当前 CLI

命令语法以已安装的程序为准。先运行：

```bash
herdr --help
```

然后运行不带子命令的相关命令组，查看其说明：

```bash
herdr agent
herdr pane
herdr workspace
herdr tab
herdr worktree
herdr terminal
herdr notification
herdr integration
herdr session
herdr machine
```

不要用不带参数的 `herdr` 探索命令，它会启动或连接 TUI。不要通过省略参数来试探会修改状态的嵌套命令。`herdr workspace create` 等命令使用默认值也有效，会实际执行。

大多数控制命令返回 JSON。从响应中读取标识符和状态，不要猜测。

## 理解布局、窗格和 agent

选择与任务匹配的操作对象：

- 工作区、标签页和窗格的拓扑关系用于组织终端位置。
- 窗格命令控制原始终端、shell、测试、服务、输入和输出。
- agent 命令控制当前占用窗格、且已被识别的编程 agent。

无论是否包含 agent，窗格都独立存在。`agent start` 要求已有可用的 shell 窗格，绝不会创建、拆分或移动布局。普通进程使用窗格命令。需要 Herdr 验证 agent 身份或解释 `idle`、`working`、`blocked`、`done` 和 `unknown` 生命周期状态时，使用 agent 命令。

agent 命令接受唯一的在线 agent 名称，或当前承载该 agent 的窗格 ID。不接受终端 ID 或单独的 agent 类型标签。名称必须匹配 `[a-z][a-z0-9_-]{0,31}`，并且在在线 agent 中唯一。名称跟随当前窗格中的 agent，在该 agent 退出、被释放或被替换时清除。用 Ctrl+Z 挂起 agent 后运行非 agent 命令，只要原进程仍存活，其身份就会保留。如果另一个被识别的 agent 接管窗格，原身份不会继续保留。身份保留不代表 agent 位于前台，发送输入前先检查窗格。

`idle` 和 `done` 通常表示 agent 可以接收输入，但都不保证 Herdr 识别出了陌生的审批对话框，也不保证身份被保留的 agent 位于前台。CLI/API 根据服务端记录的已查看状态区分二者。显式聚焦命令会将目标标为已查看，读取操作不会。每个 TUI 客户端独立记录已查看的完成结果，因此其 Done 标记可能与 CLI 或其他客户端不同。Antigravity 和 Grok 可能在后台任务或子 agent 仍运行时处于 idle，因此等待状态稳定不能证明这些任务已结束。`blocked` 表示 Herdr 识别到了审批或提问界面。`unknown` 表示 agent 存在，但 Herdr 无法可靠分类，不能据此判定已完成。

## 使用 ID 和调用方上下文

公开 ID 是不应解析其内部含义的稳定标识：

- 工作区：`w1`
- 标签页：`w1:t1`
- 窗格：`w1:p1`

已关闭的标签页和窗格 ID 不会复用。窗格移动到其他工作区后，会获得带有新工作区限定的新窗格 ID。执行 `pane move` 后，继续使用 `.result.move_result.pane.pane_id` 或在线 agent 名称。旧值通过 `.result.move_result.previous_pane_id` 返回。只有被移动进程继承的调用方上下文仍能解析该旧 ID，不要将它用作通用 agent 目标。

Herdr 会向每个受管理的窗格注入调用方上下文：

```bash
printf '%s\n' "$HERDR_WORKSPACE_ID" "$HERDR_TAB_ID" "$HERDR_PANE_ID"
```

窗格命令应作用于调用方窗格时，优先使用 `--current`。`pane split` 省略目标时，如果存在 `HERDR_PANE_ID`，则使用调用方窗格，否则使用当前聚焦的窗格。其他命令可能使用 UI 中聚焦的窗格，而该窗格可能属于用户或其他客户端。

使用以下命令查看实时状态：

```bash
herdr workspace list
herdr tab list --workspace "$HERDR_WORKSPACE_ID"
herdr pane current --current
herdr pane list --workspace "$HERDR_WORKSPACE_ID"
herdr agent list
```

创建操作的响应会提供后续应使用的 ID。`workspace create` 返回 `.result.workspace`、`.result.tab` 和 `.result.root_pane`。`tab create` 返回 `.result.tab` 和 `.result.root_pane`。`pane split` 通过 `.result.pane` 返回新窗格。

ID 和在线 agent 名称的作用域限于单个服务端。两个已保存的 SSH 机器都可能有 `w1:p1` 或名为 `reviewer` 的 agent。在 TUI 中选择机器不会改变窗格内命令的目标。不带 `--machine` 时，命令仍使用继承的会话和套接字上下文。

要控制已保存的 SSH 机器，在查看状态和后续每条命令中都使用相同的全局前缀：

```bash
herdr --machine <label-or-id> agent list
herdr --machine <label-or-id> pane list
herdr --machine <label-or-id> agent prompt <remote-agent-name> "Reply with your current status." --wait --timeout 120000
```

选择器必须是已启用的已保存配置 ID，或区分大小写的唯一标签，不能是任意 SSH 主机名。命令使用该配置的远程会话，无需打开 TUI。不要将 `--machine` 与 `--session` 或 `--remote` 混用。先在目标机器上查询 ID，继承的本地 ID 和 `--current` 不能用于标识远程窗格。

两端安装都必须支持机器 API 转发，且远程服务端必须已运行并与 API 兼容。转发绝不会安装、启动或重启服务端，也绝不会回退到本地。不会转发本地配置、会话管理、安装命令和交互式连接。远程 worktree 路径必须是绝对路径、`~` 或以 `~/` 开头，插件链接路径必须是绝对路径。连接失败不能证明修改操作未生效，重试前先检查远程状态。

`herdr machine list` 列出已保存的连接配置，而不是跨机器的窗格清单。脚本中加上 `--json`。仅在用户要求时添加、删除、启用或禁用配置。删除配置会断开客户端连接，但不会停止远程会话。交互式 `machine add` 会发现正在运行的远程会话，并可能让用户选择。非交互式配置使用远程默认会话，除非显式提供 `--remote-session`。使用 `herdr machine status [<label-or-id>] --json` 诊断连接失败的机器。`herdr machine reconnect` 需要用户在自己的终端中完成 SSH 认证，不要代为运行。配置流程在停止不兼容的服务端前会询问，默认选择 No。未经用户同意，不要批准替换。实验性交接功能不属于 `machine add`。

## 启动和协调 agent

默认使用当前标签页中的相邻窗格和当前工作目录。除非用户明确要求相应拓扑或位置，否则不要创建工作区、标签页、worktree，也不要换用其他工作目录。

遵循用户指定的拆分方向。如果未指定，先检查调用方窗格：

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
```

宽窗格向右拆分，窄窗格或高窗格向下拆分。避免连续同方向拆分，造成过窄的列或过矮的行。将用户焦点保留在调用方窗格，并显式保留调用方工作目录：

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

适当时将 `right` 替换为 `down`。从 `.result.pane.pane_id` 读取新窗格 ID。

可用的 shell 窗格必须停在交互式提示符，shell 自身位于前台，且没有前台命令、编辑器或 agent 正在运行。在该窗格中启动受支持的 agent，并使用有意义的唯一名称：

```bash
herdr agent start reviewer --kind codex --pane <returned-pane-id>
```

使用用户要求的类型。运行 `herdr agent` 查看当前安装支持的类型和选项。agent 原生参数只能放在 `--` 之后：

```bash
herdr agent start reviewer --kind codex --pane <returned-pane-id> -- <agent-args...>
```

只有 Herdr 在同一窗格内检测到预期 agent，且认定其已准备好接收交互式输入后，`agent start` 才会成功返回。如果 agent 在启动期间受阻，命令立即返回 `agent_not_ready`，但保留名称，供 `agent read` 和 `agent send-keys` 使用。等待 agent 进入 idle 后再发送提示。启动超时默认为 30 秒。

通过 agent 命令提交工作：

```bash
herdr agent prompt reviewer "Review the current diff and report only actionable findings." --wait --timeout 120000
```

`agent prompt` 遵循窗格当前的括号粘贴模式，将文本和编码后的 Enter 作为一次有序提交发送。只有两者都写入后才报告提交成功，但这本身不能证明 agent 开始了新一轮工作。对于 Windows 上的 Codex，Herdr 会在 Enter 前发送粘贴边界，使提交不依赖提示长度。如果 agent 已停在审批或提问对话框，命令会在发送任何输入前返回 `agent_blocked`。先检查受阻界面；已有授权和上下文足以回答时继续，仅缺少必要决定、权限或只能由用户完成的认证时询问用户。需要在提交后等待单个 agent 时，使用 `--wait` 即可，它会等待首次稳定的 `idle`、`done` 或 `blocked` 状态。不要用 `--until` 重复这些默认值。

使用 `--wait` 时，从非 working 状态发送的提示必须产生可观察的 `working` 或 `blocked` 活动。提交后，Herdr 最多等待五秒来观察此类活动，无关的 `idle`、`done` 或会话变化不能满足此条件。未观察到活动时返回 `agent_prompt_stalled`，如果调用方超时先到则返回 `timeout`。调用方超时包含提交耗时。未设置超时时，在观察到活动后会无限等待状态稳定。此等待跟踪的是生命周期状态，而不是某一轮工作。如果 agent 已在工作，当前轮完成就可能满足等待条件。

仅在针对特定状态的流程中使用 `--until`，例如等待已运行的 agent 请求输入：

```bash
herdr agent wait reviewer --until blocked --timeout 120000
```

不带 `--until` 时，独立的 `agent wait` 与 `agent prompt --wait` 使用相同的默认稳定状态。

使用逻辑按键控制 agent 的交互界面：

```bash
herdr agent send-keys reviewer esc
herdr agent send-keys reviewer ctrl+c
```

Herdr 在写入任何字节前会验证全部按键。通过已解析到的 agent 读取结果：

```bash
herdr agent get reviewer
herdr agent read reviewer --source recent-unwrapped --lines 120
```

如果等待失败或返回 `blocked`，先检查 `agent get` 和 `agent read`，再决定发送什么输入。超时或停滞响应不能证明提示未送达，不要盲目重复提交。只有确实需要原始终端控制时，才使用窗格命令。

## 在其他窗格运行普通命令

按相同的几何规则创建相邻窗格，保留调用方工作目录，且不改变用户焦点：

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

从 `.result.pane.pane_id` 读取新窗格 ID，然后运行并检查命令：

```bash
herdr pane run <returned-pane-id> "just test"
herdr pane wait-output <returned-pane-id> --match "test result" --timeout 120000
herdr pane read <returned-pane-id> --source recent-unwrapped --lines 120
```

`pane run` 将命令文本和 Enter 一起排入队列。成功仅表示提交已被接纳，不代表命令已经执行。在 macOS 上，如果命令超过终端当前的规范模式行输入上限，`pane run` 和 `agent start` 会在排队前拒绝该命令。等待交互式 shell 提示符后再重试。此检查仅覆盖本次提交，不涵盖先前未完成的输入行或之后的终端模式变化。`pane wait-output` 会立即搜索所选快照，因此已存在的输出也可能匹配。`--match <text>` 用于匹配字面子串，`--regex <pattern>` 用于 Rust 正则表达式。省略 `--timeout` 时可以无限等待。

根据任务选择读取来源：

- `visible`：当前渲染的可视区域。
- `recent`：最近渲染的输出，包含软换行。
- `recent-unwrapped`：合并软换行后的最近输出，日志和对话记录优先使用它。
- `detection`：用于 agent 检测的底部缓冲区纯文本快照。

颜色和终端样式属于证据时使用 `--format ansi`，否则使用文本。

`--lines` 请求 Herdr 从窗格可用屏幕和宿主回滚缓冲区中读取更多行。备用屏幕的行不会进入普通宿主回滚缓冲区。对于受支持且处于 idle 的 agent，Herdr 可以收集应用自身的历史记录，并在之后恢复可视区域，但并非每个应用或响应都能以此方式恢复。

未使用下述文件通信协议的普通终端交互中，如果扩大最近输出的读取范围后仍看不到已完成的响应，让 agent 将响应写为临时目录中的 Markdown 文件，并只回复文件路径，然后在同一机器上读取该文件。仅将此方式作为后备方案，不要在初始提示中要求文件输出。

## 安全与协调规则

- 后台工作使用 `--no-focus`，除非用户要求切换上下文。
- 使用 `--current`、显式窗格 ID 或唯一 agent 名称。不要依赖其他客户端聚焦的窗格。
- 从 JSON 响应中解析 ID。不要从侧栏顺序或示例推导 ID。
- 未经用户明确要求，不要关闭并非由你创建的工作区、标签页、窗格或会话。普通 CLI/API 关闭操作不会继承 TUI 的最后一个窗格确认机制。`workspace close --group` 会关闭主工作区及其关联的 worktree 工作区，绝不能仅为绕过 `workspace_group_close_required` 而添加它。
- 仅在用户已验证仓库后使用 `--trust-repository`。它授予单次请求的 Git 信任，不是 worktree 命令失败后的常规重试手段。
- 更新后客户端与服务端版本可能不同。依赖新服务端功能前先检查 `herdr status`。方法缺失不代表可以停止或升级服务端。
- 除非用户明确打算停止服务端及其窗格进程，否则绝不要从活动会话中运行 `herdr server stop`。
- 绝不要杀死 Herdr 主进程。需要隔离服务端的实验应使用具名测试会话。
- CLI 服务端错误以 JSON 输出到 stderr，退出状态为 1。CLI 语法错误退出状态为 2。

## Claude Code & Codex & Pi 的默认启动方式命令

在已有可用 shell 窗格中启动；`<name>` 为唯一名称，`<returned-pane-id>` 为实际返回的窗格 ID，`<models_name>`/`<effort>` 为模型/推理强度，未指定则删除对应参数：

```
herdr agent start <name> --kind claude --pane <returned-pane-id> -- --dangerously-skip-permissions --model <models_name> --effort <effort>
herdr agent start <name> --kind codex --pane <returned-pane-id> -- --no-daemon --dangerously-bypass-approvals-and-sandbox -m <models_name> --config model_reasoning_effort="<effort>"
herdr agent start <name> --kind pi --pane <returned-pane-id> -- --model <models_name> --thinking <effort>
```

## 文件通信协议

需要持久化派发与回复时，首次投递就使用以下约定。任务派发方称为 Lead，目标 pane 的执行者称为 worker；Herdr 发送文件位置，文件保存任务、结果和恢复依据。通用格式见 [topic](assets/topic.md)、[manifest](assets/manifest.tsv)、[task](assets/task.md) 和 [report](assets/report.md)。

### 目录与身份

在项目的 `.agents/system/herdr/YYYY-MM-DD-topic_name/` 建立主题目录，包含 `topic.md`、`manifest.tsv`，以及每个已派发 pane 的目录。Lead 从当前任务标题生成 `topic_name`，创建后输出主题和共享根绝对路径。pane 目录内按数字递增保存 `task01.md/report01.md`、`task02.md/report02.md`。编号至少两位，不复用；同名主题先判断恢复还是新工作，不覆盖既有文件。

- 一个 topic 只对应一个 Herdr 服务端和一个共享根。Lead 在 `topic.md` 记录实际连接上下文、Lead pane、共享根绝对路径、目标、验收、约束与必要结论；不要另造会话 ID。
- 完整任务身份是“共享根 + 真实 pane ID + task 文件名”。编号或 pane ID 单独都不够；报告必须写全这三个值。
- 目录默认使用真实 pane ID，冒号不作分隔符解析。宿主无法原样表示时，在创建任务前为整个 topic 统一采用 `encodeURIComponent(pane_id)`，并写入 topic；manifest 始终保留真实 ID。不要用替换冒号、斜杠等方式生成可能碰撞的名称。
- 校验最终目录名是合法的单个路径组件，拒绝 `.`、`..`、路径分隔符和宿主禁用名称；编码后仍不合法就停止。TSV 字段不得含 Tab 或换行。路径作为独立参数正确引用，不拼成 `路径:行号`。
- 不同 worktree 的 worker 始终使用同一个绝对共享根；代码工作目录另写在 task 中。远程派发前，验证参与者能读同一份 task、能把报告写到 Lead 可读的位置。同名路径不等于共享文件；无法验证时先处理可达性，不派发不可读取的路径。

### 三列清单

`manifest.tsv` 使用真实制表符，表头固定为 `pane_id`、`task`、`status`。`task` 只填写当前任务文件名，例如 `task01.md`。每个已派发 pane 一行，以 `pane_id` 为唯一键；不添加空闲 pane 或 Lead 占位行。

| status | 含义 |
| --- | --- |
| `active` | 已分派、尚未由 Lead 验收；包括待启动、执行中和待审。 |
| `done` | Lead 已按该任务的验收要求确认通过。 |
| `blocked` | 当前任务因明确阻碍停止推进，原因与下一步见报告或 topic。 |

只有 Lead 写 manifest；worker 不改清单。报告中的 `done` 只表示 worker 认为任务完成，不能直接变成清单的 `done`。清单保存当前指针，旧任务的结果和验收决定留在对应报告。

### 发布与执行

1. Lead 填好 task 的全部路径、目标、输入、读写边界、工作目录、产物和验证要求。任务必须自包含；没有安装本技能的 worker 也能按它完成。先写完整文件再发布，发布后 task 不变。
2. 确认该 pane 没有尚在执行的任务；把 manifest 指向新 task，状态设为 `active`，再通过 Herdr 提示读取准确的绝对 task 路径，并给出绝对 report 路径。控制消息只传这两个文件指针，不另放一份任务正文。
3. 有多个已确定需要并行投递的任务时，先全部 `prompt`，再观察和 `wait`，避免逐个 `prompt --wait` 使投递串行。
4. worker 先读 task、topic 和 manifest，核对服务端、实际 pane、当前 task 与完整任务身份。若已有身份匹配的终稿 report，只回告其绝对路径，不重跑。指针过期、pane 不符或清单不是 `active` 时停止，并在终端说明；不擅自修正清单或转到下一任务。
5. worker 只执行当前 task。业务产物仅在任务允许的范围写入；协作记录只写自己的报告执行部分，不改 topic、manifest、task、他人报告或自己的 Lead 验收部分。无法继续时报告具体阻碍。
6. worker 按完整格式把报告写到同目录临时文件，检查身份与内容后重命名为同号终稿 report；不覆盖已有终稿。提交后停止写报告，只回告绝对报告路径，不自动领取下一任务。无法写报告时在终端明确说明任务身份、失败原因和已有产物，不能声称报告已提交。

### 验收与下一任务

Lead 读取同号报告与实际产物，核对任务的验收要求和验证证据，必要时独立检查。只有验收通过才把 manifest 标为 `done`；阻塞时标为 `blocked`，说明缺什么条件。

worker 交回终稿后不再写报告。Lead 可在末尾追加验收决定、依据和后续安排，不改执行部分。需要补充、返工、解除阻塞或换任务时，建立下一编号 task，引用原任务和报告；确认原执行者已停止后才更新清单并派发。可以提前准备后续 task，但 worker 不能自行扫描领取。

### 观察、恢复与交接

- `prompt` 成功只证明投递；Herdr 的 `idle`、`done`、`blocked` 是终端生命周期观察，不能代替任务报告。`timeout` 或停滞也不能证明未送达。先 `agent get`、`agent read` 并检查准确的 task/report 与产物，再决定处理方式，不盲目重发。
- 重复提示不产生新执行：已在做同一任务就继续原执行；已有匹配终稿就只回告路径；旧指针就停止。无法判断是否仍在执行时先观察，不启动第二份。
- 接手时读取 topic、manifest、当前 task、已有报告和实际工作区，确认同一服务端、共享根及当前执行者。只有确认旧执行者停止后才恢复或移交；没有报告不表示动作未发生，先核对真实产物与外部动作结果。
- 中断发生在终稿发布前时，可检查已有临时报告作为线索，但不能把它当作终稿或覆盖真实产物。若需要改变任务内容或换执行者，交回 Lead 新建任务。
- pane 移动会改变 ID 时，不重命名在途目录和文件。先停止或交回旧任务，保留旧身份与报告，再按新 ID 新建目录和任务，并在 topic 与新 task 中写清接续关系；不让两个身份同时执行旧任务。
- Lead 交接时在 topic 更新实际 Lead pane 和必要结论，保留原验收证据。恢复依靠已有文件与实际状态，不新增永久队列、轮询领单文件或其他状态。
