# Agent CLI

插件：`agent-cli`。原型依据：`agent-cli.jsx`（`AgentCLIView`、`LaunchPicker`）、`agent-cli-model.js`、`agent-cli-context.js`、`agent-cli-review.jsx`、`terminal-surface.jsx`、`docs/HUHU_V9_Agent_CLI.md`。复用：R-35–R-39、R-57。接口：[interfaces](../interfaces.md) §7、§8。

## 1. 概念

| 概念 | 含义 |
| --- | --- |
| Space | 一个明确选择的本机目录（可在 Vault 外）及其名称；Agent CLI 的会话与历史都属于某个 Space。保存在 `.huhu/agent-cli/spaces/`，绑定 `machineId` |
| Provider | 可启动的 AI CLI：Claude Code、Claude Agent Teams（Claude 的预设）、Codex、Pi（检测命令与显示名来自 R-36） |
| 会话 | 一个在 Herdr Core 中运行的终端（AI CLI 或普通 shell），标签带 `huhu.space` 等 |
| 视图 | 界面上显示某会话的标签页/分屏格；关闭视图只 detach，不结束进程 |
| 历史 | 当前机器上 provider 原生会话记录中 `cwd` 等于 Space 根（或其子目录）的条目，加上 HUHU 记录的会话 |

Space 只决定启动目录与历史范围；它不授予 Vault 资源权限，不把外部目录导入 Vault。Agent CLI 以当前用户的系统权限运行，HUHU 不提供文件沙箱（见 [security](../security.md) §5）。

## 2. 用户故事

| ID | 故事 |
| --- | --- |
| US-AG-01 | 我创建 Space：填写名称并选择一个本机目录；创建 Space 不会启动任何进程。 |
| US-AG-02 | 我点击标签栏右侧“+”，看到本机检测到的 AI CLI 与“新终端”；选择一个 CLI 后搜索选择模型、推理强度、Fast（若支持），可填附加提示词，点“启动终端”。 |
| US-AG-03 | 新会话总是在 Space 根目录启动，与我在其他终端里 `cd` 到哪里无关。 |
| US-AG-04 | 我同时打开多个会话标签，可以把 1–4 个会话分屏并排查看。 |
| US-AG-05 | 关闭标签只是不再显示；进程仍在运行，从右侧历史可以重新打开同一个终端。 |
| US-AG-06 | 右侧历史只显示当前 Space（本机、该目录）的会话：运行中的点开就是原终端，已结束的先查看记录，需要时明确“恢复会话”以原生 ID 继续。 |
| US-AG-07 | 我可以中断（Ctrl+C）或结束一个会话。 |
| US-AG-08 | 我在会话详情中查看 Space 工作树相对 Git HEAD 的改动，逐行写审查意见并发送给同一会话。 |
| US-AG-09 | 我在“智能体设置”中查看本机每个 CLI 的检测结果、版本、登录状态，重新检测，设置默认模型。 |
| US-AG-10 | 关闭 HUHU 后再打开，仍在运行的会话可以重新连接。 |

## 3. 界面

三栏：模块侧栏（Spaces）· 中央（会话）· 右侧历史（宽 278px，可折叠；< 1200px 为抽屉）。

- **模块侧栏**：标题“Spaces”+“+”；列表项：文件夹图标、名称、路径（中间省略，悬停显示完整路径）、运行中会话数；选中项高亮；底部“新建 Space”按钮与 Herdr Core 状态行（“Herdr Core 0.1.19 · 已连接/未启动/连接失败”，点击打开智能体设置）。默认存在一个以 Vault 根为目录的 Space（首次进入时创建，可重命名、可删除）。
- **中央顶栏**：Space 名称 + 路径；右侧“智能体设置”。
- **标签栏**：当前 Space 的会话标签（provider 图标、名称，可双击重命名，× 关闭视图）；右端“+”（R-37 启动菜单）与“分屏”按钮（1/2/3/4 布局：单格、左右、左一右二、2×2）。
- **启动菜单**（Popover，宽 640px）：右列“新终端”、检测到的 CLI 列表（悬停/方向键即在左列展开设置）、底部“智能体设置…”；左列：模型搜索框 + 模型列表（R-37 搜索评分）、推理强度分段、Fast 开关（仅支持时显示）、附加提示词文本域、“启动终端”主按钮。无检测结果时显示“此主机未检测到支持的 CLI”+“重新检测”“智能体设置”。每个 provider 的上次选择记入 `providers.json`。
- **会话格**：头部（provider、模型、状态徽标 运行中/已结束/已断开，按钮：搜索、导出记录、详情、中断、结束）；TerminalView；断开时覆盖层“连接已断开 · 重新连接”。
- **右侧历史**：标题“会话历史 n”；Space 名与路径；搜索；分段（全部/运行中/已结束）；条目：provider 图标、标题（首条用户提示）、provider · 状态、时间、固定按钮；固定项置顶。底部提示“只显示当前 Space 的记录”。
- **会话详情**（右侧抽屉）：基本信息（provider、模型、cwd、原生会话 id、开始时间、退出码）；“变更审查”页签（D-30）：Space 根是 Git 仓库时显示 `git diff HEAD` 文件列表与 DiffView，可在行上添加审查意见；“发送审查意见”把未发送意见整理为一段文本写入该会话输入；非 Git 仓库时显示“此 Space 不是 Git 仓库，无法显示变更”。
- **新建 Space 对话框**：名称（必填）、工作目录（只读显示 + “选择目录…”调用 `pickDirectory`）；同一机器上同一 canonical 目录已有 Space 时字段错误“这个目录已有 Space，请从左侧打开”。
- **智能体设置对话框**：按 provider 列出：检测状态（已找到/未安装/未登录/版本不受支持/检测失败）、可执行路径、版本、默认模型与推理强度；“重新检测”；Herdr Core 状态与“重启 Core”（AlertDialog 说明运行中终端会保留）。

## 4. 行为

### 检测

`agent.providers.detect({refresh?})`：对每个 provider 运行检测命令（R-36，`findOnPath` + `--version` 探测，超时 5 秒），结果缓存于内存 10 分钟并带 `checkedAt`。安装与可用性问题沿用 R-36 中 Orca `agent-cli-installation-problem.ts` 的判定；HUHU 不读取 provider 的凭据文件，登录状态在首次运行失败时由 provider 输出判定（`PROVIDER_UNAUTHENTICATED`），检测阶段显示为“未知”，不阻止启动。

### 启动交互会话

1. 界面提交 `agent.sessions.launch({spaceId, spaceRevision, provider | 'shell', model?, effort?, fast?, prompt?, requestId})`。
2. Engine 校验：Space 存在、`revision` 一致、`machineId` 为本机、目录存在且可访问（realpath）；provider 检测结果有效。失败 → `SPACE_INVALID` / `PROVIDER_NOT_FOUND`，菜单保持打开并显示原因。
3. 写 `.huhu/agent-cli/sessions/<sessionId>.json`（`state: launching`、`requestId`）。
4. `terminal.run({argv: provider.interactiveArgv(...), cwd: Space.root, labels: {huhu.vault, huhu.space, huhu.session, huhu.launch}, name})`；shell 不传 argv。
5. 收到 `terminalId` → 会话 `running`；界面新增标签并 attach。响应丢失 → 按 `huhu.launch` 标签查询，找到唯一终端则绑定，找不到则 `failed`，找到多个则 `unknown`（显示列表让用户选择）；任何情况下都不重复 run。

### 视图与连接

- attach：Renderer 打开 `/ws/terminal/<sessionId>`，Engine 调 `terminal.attach({terminal, cols, rows, history: 2000})` 转接字节流；第二个视图打开同一会话时使用 `observe: true`（只读，不改尺寸），界面标注“观察中”并提供“接管输入”（关闭其他视图的输入权）。
- 关闭标签：关闭 WebSocket（Core 侧 detach），会话保持 `running`。
- 中断：`terminal.interrupt`。结束：AlertDialog“结束会话？进程将被终止，记录会保留。”→ `terminal.kill`。
- 进程退出：Core 事件 → 会话 `exited`（退出码）；标签保留并显示“已结束”，可关闭。
- 对账（打开模块 / 列表请求时，2 秒节流；Core 没在运行时不去启动它）：`terminal.list({all:true, labels:{huhu.vault}})` 对账：本地会话记录与 Core 终端一一对应；Core 中有而记录中无 → 补记录；记录中有而 Core 无 → `exited`（退出码未知）。

### 历史与恢复

- `agent.history.list({spaceId, query?, filter?})`：用 R-38 扫描器扫描当前机器各 provider 会话目录，保留 `realpath(cwd)` 等于 Space 根或在其之下的条目；合并 HUHU 会话记录（运行中的条目优先，可直接 attach）；按时间倒序；固定项置顶。扫描在 Engine 内增量缓存（按会话文件 mtime），切换 Space 时取消上一次未完成的扫描。
- 点击运行中条目 → 打开或聚焦其标签。点击已结束条目 → 只读打开记录（`agent.history.read` 返回消息列表，以 MarkdownPreview 显示）。记录视图中“恢复会话”→ `agent.history.resume({spaceId, provider, nativeSessionId})`：以 provider 的 resume 参数（例：`claude --resume <id>`、`codex resume <id>`）在 Space 根启动新的交互会话。不提供“恢复最近一次”。
- 自动化的无界面运行（[automations](automations.md) §5）cwd 同为 Space 根，因此自然出现在该 Space 的历史中，可用同一方式恢复。

### Herdr Core 管理

- 随应用打包对应平台的 `hc` 二进制（W12、[release](../release.md)）。Engine 首次需要时以 interfaces §7 的环境变量启动 `hc server`（若同一会话名的 Core 已在运行则直接连接）。
- Core 连接失败 → 中央显示 Banner“终端引擎不可用”+“重试”“查看日志”；Space 与历史仍可浏览（历史只读）。

## 5. 验收

| ID | Given | When | Then |
| --- | --- | --- | --- |
| ACC-AG-01 | 本机安装了 Codex | 新建 Space 指向 Vault 外目录 D | `.huhu/agent-cli/spaces/` 新增文件；没有任何进程启动 |
| ACC-AG-02 | Space D，另开一个“新终端”并 `cd /tmp` | 从“+”启动 Codex | Codex 进程 cwd 为 D（`terminal.get` 返回的 cwd 与进程实际 cwd 均为 D） |
| ACC-AG-03 | 打开启动菜单后，在另一窗口修改了该 Space 的目录 | 点“启动终端” | 返回 `SPACE_INVALID`，菜单显示“Space 已变化，请重新选择”，没有启动进程 |
| ACC-AG-04 | 运行中的会话 | 关闭其标签，再从历史点击该会话 | 重新 attach 到同一终端（终端内容延续），Core 中终端数不变 |
| ACC-AG-05 | 两个 Space 指向不同目录，各有会话 | 切换 Space | 右侧历史只显示当前 Space 目录的会话；搜索框被清空 |
| ACC-AG-06 | Claude 原生会话目录中有一条 cwd 为 D 的会话（非 HUHU 启动） | 打开 Space D 的历史 | 该会话出现；点“恢复会话”以 `--resume <该 id>` 启动 |
| ACC-AG-07 | 启动请求发出后 Engine 未收到响应（测试注入丢弃响应） | Engine 对账 | 通过 `huhu.launch` 标签找到终端并绑定；Core 中只有一个对应终端 |
| ACC-AG-08 | 有运行中的会话 | 退出 HUHU 再打开同一 Vault | 会话仍在运行并可重新连接 |
| ACC-AG-09 | 一个视图正在输入 | 另一个视图打开同一会话 | 第二个视图为观察模式，不能输入、不改变终端尺寸 |
| ACC-AG-10 | Space 根是 Git 仓库且 Agent 修改了文件 | 打开会话详情“变更审查”，添加一条意见并发送 | 会话终端收到包含文件路径、行号与意见的文本；意见标记为已发送 |
| ACC-AG-11 | 本机未安装任何 provider | 点“+” | 只显示“新终端”与“此主机未检测到支持的 CLI” |
