# 插件中心、能力网关与 Agent 指南

所属：kernel 插件管理器与网关服务（界面在 `packages/workbench/src/pages/{plugins,gateway}`）、`mcp` 插件、`agent-guide` 插件。原型依据：`plugins-v3.jsx`、`system.jsx`（`Interfaces`、`Tester`）、`capability-contracts.js`、`cli-prototype.js`、`builtin-guide-model.js`、`builtin-guide-v5.jsx`。复用：R-03、R-04、R-05、R-52–R-54。架构：[architecture](../architecture.md) §5。

## 1. 用户故事

| ID | 故事 |
| --- | --- |
| US-PL-01 | 我在插件中心看到 12 个内置功能与已安装的外部扩展：状态、版本、描述、依赖、请求的权限、贡献（界面/命令/能力）、已注册能力。 |
| US-PL-02 | 我停用不需要的功能，对应界面立即消失，数据保留；重新启用后恢复。停用会影响其他插件时先告诉我。 |
| US-PL-03 | 我从本地文件夹或 zip 安装外部扩展，安装前看到它要求的权限并确认；可停用、卸载（默认保留数据），单独选择擦除数据。 |
| US-PL-04 | 我在运行时页看到每个插件的状态（运行中/已停用/启动中/故障）与故障原因，可重试启动。 |
| US-PL-05 | 我开启 MCP 服务，复制客户端配置给 Claude Code 等使用，并逐项决定开放哪些能力。 |
| US-PL-06 | 我查看 CLI 的安装方式与命令说明；开启 HTTP 服务并创建访问令牌。 |
| US-PL-07 | 我在测试台用 JSON 参数调用任意能力，看到结构化结果；查看所有外部调用记录。 |
| US-PL-08 | 在这个 Vault 里工作的外部 Agent 能读到 HUHU 使用指南（三份文件）；我手改过的指南不会被覆盖，我可以对比差异、备份后恢复内置版本。 |

## 2. 插件中心

- **模块侧栏**：已安装（内置 12 · 外部 n）、发现插件、运行时、权限与依赖。
- **已安装**：左列插件列表（分段 内置/外部，搜索，项：图标、名称、id、状态点）；右侧详情：名称、徽标（内置功能/外部扩展、运行中/已停用/故障）、描述、包名与版本、启用开关；按钮“插件设置”（有设置贡献时）、“打开 <模块>”；内置显示“内置功能不可卸载”，外部显示“卸载扩展”；分区：贡献到工作台（界面/命令/能力数量）、依赖与生命周期（依赖列表、激活方式 Vault 打开时/按需）、请求权限（chips + “管理授权”）、已注册能力（能力名、开放状态徽标）。
- **发现插件**：随应用提供的示例外部扩展卡片（每日回顾、快速剪藏、便携导出：名称、发布者、标签、描述、依赖、权限）+“安装”；另有“从文件夹安装…”“从 zip 安装…”。
- **运行时**：DataTable（插件、来源、状态、贡献数、最近错误、操作 重试/停用）。
- **权限与依赖**：每个插件请求与已授予的权限（外部插件可撤销单项授权）、依赖图（列表形式：插件 → 依赖）。

### 行为

- 启用/停用（`plugins.setEnabled`）：停用时若有已启用插件依赖它，确认对话框列出它们并一起停用；内置插件 `notes` 被 `tasks` 等依赖关系按 manifest `dependsOn` 声明（tasks → 无硬依赖；automations → 无硬依赖，scan 动作在运行时检查 tasks；agent-guide → 无；mcp → 无）。
- 外部安装（`plugins.install`）：读取 `huhu-plugin.json` 并校验（id 不得与内置冲突、`main` 文件存在、权限名合法）→ 权限确认对话框（列出每个权限对应的能力，提示“扩展以你的系统权限运行，只安装你信任的扩展”）→ 复制到 `.huhu/plugins/external/<id>/<version>/` → 登记 → 启用 → Main 启动插件宿主进程。
- 卸载：停用 → 删除包目录 → 从登记移除；“同时删除扩展数据”默认不勾选。

## 3. 能力网关

- **模块侧栏**：MCP、CLI、服务端、桌面宿主、调用记录。
- **MCP**：服务卡片（MCP Server、当前 Vault、传输 stdio/HTTP、“已开启 · 开放 n / 共 m”、开关）；操作：配置传输（stdio 或 HTTP 端口 1024–65535）、复制客户端配置（stdio：`{"command": "<huhu 可执行路径>", "args": ["mcp", "--vault", "<Vault 路径>"]}`；HTTP：URL 与 `Authorization` 头占位）、管理所属插件；分段 Tools/Resources/Templates/Prompts；能力表（能力/描述、所属模块、访问范围 只读/写入/执行、有效状态 可调用/未开放/模块已停用、开放开关、“测试”）。开放写入或执行类能力时确认对话框写明能力名与影响。`exposable: false` 的能力不显示开关。
- **CLI**：安装状态与方式（macOS/Linux：创建 `~/.local/bin/huhu` 符号链接到应用内 CLI 启动脚本；Windows：把应用 `bin` 目录加入用户 PATH；均需用户点击并确认）；命令速查表（interfaces §6）；交互测试台（输入完整 `huhu …` 命令，Engine 内执行同一命令解析器，显示输出与退出码）。
- **服务端**：HTTP 服务开关、端口、状态（已停止/启动中/运行中/端口冲突）、“创建访问令牌”（只显示一次原文，保存哈希）、“撤销令牌”；只监听 127.0.0.1。
- **桌面宿主**：只读说明当前进程结构与 Engine 状态（Engine PID、端口、启动时间、内存）。
- **调用记录**：时间、入口、能力、结果、耗时；“清空调用记录”（只清记录，不影响业务数据）。
- **测试台**（能力表“测试”或侧栏入口）：能力选择、参数 JSON 编辑器（CodeMirror JSON）、“调用”；参数不是合法 JSON → 字段错误；结果以 JSON 显示并标注成功/失败码。测试台以桌面身份调用（与外部开放状态无关），界面注明。

### 行为

- MCP stdio：客户端启动 `huhu mcp --vault <path>`；CLI 连接（或启动）Engine，以 `mcp` 身份调用；能力列表实时反映开放状态与插件启停（插件停用 → 发送 `notifications/tools/list_changed`）。客户端缓存的旧工具被调用时返回错误结果而非执行。
- MCP HTTP：Engine 在 `/mcp` 挂载 Streamable HTTP（R-03），需要 HTTP 服务令牌。
- 关闭 MCP 只影响 MCP 入口；CLI 与 HTTP 各自开关。

## 4. Agent 指南（agent-guide 插件）

- 管理三份文件：`.agents/skills/huhu/SKILL.md`、`references/cli.md`、`references/mcp.md`。内容由构建脚本 `scripts/gen-guide.mjs` 从能力注册表与 CLI 命令表生成，作为应用资源打包（同一来源，不手写两份）。
- 状态判定（R-53）：current（与内置一致）、missing（缺失）、outdated（等于上一个内置版本的基线 → 可自动升级）、conflict（与内置及基线都不同，或存在非 HUHU 写入的同名文件）、preserved（用户选择保留）、needs-check（由版本历史恢复）、disabled（插件停用）、error（读写失败）。基线记录在 `.huhu/guide/state.json`。
- 自动维护：Vault 打开时 missing 补写、outdated 升级（先备份）；conflict/preserved/needs-check 不写。
- 界面（设置 → Agent 接入）：当前 Vault、内置版本、状态徽标；三个文件的 当前/内置/差异 视图；操作：检查、“保留当前文件”（设为 preserved）、“备份并恢复内置版本”（写 `.huhu/guide/backups/<ts>/` 后替换，重新校验哈希）、备份列表与“恢复这份备份”；快捷入口：复制指南路径、打开 CLI 测试台、配置 MCP。
- 只操作这三份文件，不删除 `.agents/skills/` 下其他内容；只读 Vault 中不写入。停用 agent-guide 不影响 CLI 与 MCP。

## 5. 验收

| ID | Given | When | Then |
| --- | --- | --- | --- |
| ACC-PL-01 | 已安装界面 | 停用“任务” | rail 任务项、首页任务卡片、命令面板任务命令消失；`Tasks/` 文件不变；MCP 工具列表不再含 tasks.*；已缓存的 MCP 客户端调用 `tasks.list` 得到 `PLUGIN_DISABLED` |
| ACC-PL-02 | 内置插件 | 尝试卸载 | 没有卸载入口；直接调用 `plugins.uninstall` 返回错误且无副作用 |
| ACC-PL-03 | 示例扩展“快速剪藏”（权限 inbox.write） | 安装并运行其命令 | 收件箱新增捕获，`source: plugin:quick-clip`；该扩展调用 `notes.save` 返回 `PERMISSION_DENIED` |
| ACC-PL-04 | 外部扩展已安装且有数据 | 卸载（不勾选擦除） | 包目录被删除，`.huhu/plugins/data/<id>/` 保留 |
| ACC-PL-05 | MCP 开启，`notes.create` 未开放 | MCP 客户端调用 `notes.create` | 返回 `CAPABILITY_NOT_EXPOSED`；开放后再调用成功创建笔记 |
| ACC-PL-06 | 通过 Claude Code 配置 stdio MCP | 列出工具 | 只包含已开放能力；stdout 中无日志文本 |
| ACC-PL-07 | 用户手改了 `SKILL.md` | 重新打开 Vault | 文件不变，状态 conflict；“备份并恢复内置版本”后文件为内置内容，备份目录中有手改版本 |
| ACC-PL-08 | HTTP 服务开启并创建令牌 | 不带令牌请求 `/api/v1/call`；带 `Origin: https://evil.example` 请求 | 分别 401 与 403 |
