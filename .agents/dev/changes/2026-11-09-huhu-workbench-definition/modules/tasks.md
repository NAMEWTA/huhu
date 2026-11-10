# 任务

插件：`tasks`。原型依据：`task-workbench.jsx`（`TaskWorkbenchView` 及子组件）、`task-workbench-model.js`、`vault-resource-picker.jsx`。复用：R-19、R-27、R-28。数据：[data-model](../data-model.md) §5 task。

## 1. 核心规则

1. Task 是一件待办，唯一完成事实是 `completed`。没有优先级、进度、派发状态。
2. 任何 Task（含 Agent 执行的）都可由用户直接勾选完成或取消勾选重新打开；不需要先看运行结果。
3. Agent 的运行结果不会自动勾选 Task；用户勾选也不会停止正在运行的 Agent 进程（停止只能在运行记录上明确操作）。
4. 执行方式只有 `manual`（我自己做）与 `agent`（由自动化插件的扫描规则交给 Agent 处理）。保存 Task 永远不会立即启动 Agent。
5. 提醒与执行方式无关；到点只产生软件内提醒，不改变完成状态。
6. 关联资料只能从 Vault 实际存在的文件、文件夹或根目录中选择；关联不授予任何权限，也不改变 Agent 的工作目录。

## 2. 用户故事

| ID | 故事 |
| --- | --- |
| US-TK-01 | 我记录一件待办：标题、Markdown 需求、截止日、项目标签、执行方式、关联资料、提醒。 |
| US-TK-02 | 我按“全部任务/今日/明日/未来7天/已结束”查看任务，前四类分“未完成”“已完成”两组。 |
| US-TK-03 | 我在列表中直接点圆框完成或重开任意任务。 |
| US-TK-04 | 我以列表、看板（未完成/已完成两列）或月历查看同一批任务。 |
| US-TK-05 | 我把一件任务交给 Agent：选择 Space 与 CLI（及可选模型），之后由自动化在下一次扫描时处理。 |
| US-TK-06 | 我从 Vault 中模糊搜索并多选关联的笔记、文件或文件夹。 |
| US-TK-07 | 我设置一个或多个提醒时间，到点在软件内收到提醒。 |
| US-TK-08 | 我在任务详情中查看 Agent 的运行记录、回答 Agent 提出的问题。 |
| US-TK-09 | 我用任何文本编辑器打开 `Tasks/` 下的文件也能读懂并修改任务，HUHU 会识别这些修改。 |

## 3. 界面

- **模块侧栏**：标题“任务”+“+”；副标题当前 Vault 名；五个分类（含计数，计数 = 该分类下未完成数，“已结束”为已完成总数）；底部链接“自动化 ↗”与一行提示“Agent 执行由自动化扫描；完成状态由本人勾选”。
- **页头**：分类名（未来7天显示具体日期范围，如“11月10日–11月16日”）+ “N 件任务” + 主按钮“新建任务”。
- **工具条**：搜索（标题、正文、项目）+ 视图分段控件（列表/看板/月历）。
- **列表**（DataTable）：列 = 完成圆框 · 任务名称 · 截止日期 · 执行方式（“手动执行”/“Agent 执行”带图标）· 项目/资料（项目标签与关联资料首项 + “+n”）· 详情按钮。分组行“未完成 n”“已完成 n”（已完成组可折叠，折叠状态记入界面状态）。逾期日期用 `--danger` 文字（不是第三种状态）。无截止日只出现在“全部任务”。窄屏（< 1024）隐藏“项目/资料”列。
- **看板**：两列卡片（未完成/已完成），卡片可拖到另一列以完成/重开（等价于勾选）。
- **月历**：按 `due` 投影到月网格，上/下月翻页，点日期格内任务打开详情；格内“+”以该日期为截止日新建。
- **详情面板**：标题 + 完成圆框 + 编辑/导出 Markdown/更多（复制、删除）；字段：截止日期、执行方式（agent 时显示 Space 名与路径、CLI、模型）、项目、关联资料（可点击打开）、提醒（时间、渠道、已提醒/等待提醒）、需求正文（Markdown 阅读渲染）；“运行记录”分区（只在存在 task-run 时显示）：每条显示状态徽标、开始时间、模型、结果摘要，展开看结果正文；`waiting_input` 的运行显示问题与选项/输入框和“回答并继续”。分区说明文字：“这些是运行记录，完成状态只由任务圆框决定。”
- **编辑对话框**：任务名称（必填）、任务内容（Markdown 文本域，可切到预览）、截止日期（DateTimePicker 日期模式，可清空）、项目（Combobox，可输入新标签）、执行方式（分段：手动/Agent；Agent 时展开 Space 下拉（列出 Space 名与路径；为空时提供“去 Agent CLI 创建 Space”）、CLI 下拉（当前机器检测到且支持无界面运行的 provider：Claude Code、Codex）、模型与推理强度（来自 provider 模型能力，可留空表示默认），帮助文本“由自动化规则扫描并调用，保存后不会立即启动 Agent”）、关联资料（ResourcePicker）、提醒（列表：时间 DateTimePicker + 渠道下拉（软件内弹窗可选；系统通知/IM/短信/邮件禁用并标注“暂不支持”）+ 删除；“添加提醒”）。

## 4. ResourcePicker

- 触发器显示已选项 chips（图标、名称、×）。点击打开 Popover：搜索框 + 候选列表（Vault 根、文件夹、文件；每项显示类型图标、名称、完整相对路径）。
- 匹配：R-19 的 `scorePath`（文件名优先、路径分词、连续字符加权），最多显示 50 项；空输入时显示最近修改的 20 项与根目录。
- 键盘：上下移动，Enter 选中/取消，Backspace（输入为空时）移除最后一个已选项，Esc 关闭。
- 输入的文字只用于搜索，不能作为资源保存。
- 已选资源在 Vault 中不存在（被删或外部移动且无法配对）时 chip 显示 `--warning` 与“已失效”，可移除。

## 5. 行为

### 分类计算（`plugins/tasks/src/shared/categories.ts`）

以设置中的时区（`settings.dateTime.zone`，默认系统时区）计算今天 `T`：today = `due == T`；tomorrow = `due == T+1`；week = `T ≤ due ≤ T+6`；ended = `completed == true`（不看 due）；all = 全部。前四类在主区按 `completed` 分组。跨午夜时（应用一直打开）在下一次分钟刷新时重新计算。

### 勾选

`tasks.setCompleted({id, completed, expectedVersion})`：写 `completed` 与 `completedAt`；其他字段不变；`inputRevision` 不变。例外：Agent 任务从已完成改回未完成时 `inputRevision + 1`（重新打开表示需要再次处理，规则 4）。界面乐观更新，失败回滚。勾选不调用任何 automations 能力。

### 编辑与输入版本

`tasks.update` 比较新旧值：标题、正文、`resources`、`execution` 任一变化 → `inputRevision + 1` 并发布 `task.inputChanged`；只改 `due`、`project`、`reminders` 不变。标题变化同时重命名文件（data-model §2）。

### 外部编辑

文件监听收到 `Tasks/` 下文件变化：重新解析；`completed` 变化发布 `task.completedChanged`；输入字段变化由 automations 在扫描时通过 `inputHash` 识别（无需改写文件）。解析失败的任务在列表顶部 Banner 列出（“1 个任务文件无法解析”→ 打开文件）。

### 提醒

tasks 插件每 30 秒（及启动时）检查 `enabled && deliveredAt == null && at <= now` 的提醒：写 `deliveredAt`、创建站内通知、发布 `reminder.due`。应用关闭期间到点的提醒在下次启动时补发一次，通知标注“（应用关闭期间到点）”。

### 删除与复制

删除：AlertDialog → 文件移到回收站（同笔记回收站）；关联的 task-run 文件保留。复制：新 id、`completed: false`、`inputRevision: 1`、不复制提醒的 `deliveredAt`，不复制运行记录。

## 6. 依赖

- 读 `agent-cli` 的 Space 列表与 provider 检测结果（能力调用 `agent.spaces.list`、`agent.providers.detect`）；agent-cli 停用时执行方式“Agent”禁用并提示。
- 为 automations 提供进程内服务 `TaskQuery`（`listOpenAgentTasks()`、`snapshot(taskId)`：返回冻结的标题、正文、资源、执行目标、`inputRevision`、`inputHash`）。tasks 停用时该服务不可用。

## 7. 验收

| ID | Given | When | Then |
| --- | --- | --- | --- |
| ACC-TK-01 | 新建任务对话框 | 填标题、正文、截止日明天、执行方式 Agent（Space S、Codex），保存 | `Tasks/` 新增文件，frontmatter 与 data-model 一致，`completed: false`；任务出现在“明日”未完成组；没有任何 Agent 进程启动 |
| ACC-TK-02 | 一个 Agent 任务有运行中的 task-run | 在列表勾选该任务 | 任务移到已完成组；运行记录仍为 running，Agent 进程仍在 |
| ACC-TK-03 | 一个 task-run 状态 succeeded | 查看任务 | 任务仍未完成；详情显示结果 |
| ACC-TK-04 | 时区 America/Los_Angeles，当地 23:59，一个任务 due 为当地今天 | 时间到当地 00:00 后一分钟内 | 该任务不再出现在“今日”与“未来7天”，只在“全部任务”中，截止日以逾期样式显示 |
| ACC-TK-05 | 未来7天分类 | 打开 | 页头显示从今天起 7 个日历日的范围；due 为第 7 天的任务在内，第 8 天不在 |
| ACC-TK-06 | ResourcePicker | 输入“研究”，回车选中文件夹 `02 · 研究`，再输入任意不存在的文本回车 | 只有该文件夹被加入；不存在的文本不产生资源 |
| ACC-TK-07 | 一个提醒 1 分钟后到点 | 等待 | 出现持久提示与通知；`deliveredAt` 写入；任务仍未完成 |
| ACC-TK-08 | 用文本编辑器把任务文件中 `completed: false` 改为 `true` | 保存文件 | 界面中该任务移到已完成组 |
| ACC-TK-09 | 只修改某 Agent 任务的截止日 | 保存 | `inputRevision` 不变 |
| ACC-TK-10 | 已完成的 Agent 任务 | 取消勾选 | `inputRevision` +1；下一次扫描会再次处理它 |
| ACC-TK-11 | 看板视图 | 把卡片从“未完成”拖到“已完成” | 等同勾选；键盘可通过卡片菜单“标记完成”完成同样操作 |
