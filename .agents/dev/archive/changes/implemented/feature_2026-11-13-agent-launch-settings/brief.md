# 需求简报：插件设置页规范化与智能体启动设置（复刻 orca）

## 用户目标

1. **每个插件都有自己的设置页**：
   - 插件启用后，工作台“设置”中自动出现以该插件图标标识的独立设置页；插件停用后，页面随之消失。
   - 系统自带的设置页与插件设置页分开显示。
   - 设置按 Vault 保存。
   - 现有设置页同时规范化。
2. **智能体启动设置复刻 orca**：
   - 在 Agent CLI 插件的设置页中，逐个智能体配置启用状态、是否默认、命令、模型、Effort、参数、环境，并显示检测结果和有效命令行预览。
   - 默认参数为完全访问。
   - 交互会话与自动化的 headless 运行使用同一份设置。
3. **“新建”菜单复刻 orca**：
   - 菜单项依次为：搜索框、新终端（Ctrl+T）、已启用的智能体（每项带子菜单，可选模型、effort、速度）、底部的“智能体设置…”。

本轮只输出文档，不写代码。

## 来源与已有决定

| 来源 | 时间 | 内容 |
| --- | --- | --- |
| 用户（dev-grill，附 orca 截图两张） | 2026-11-13 | 复刻 `temp/sources/orca` 中新建终端、选择 Agent CLI 的逻辑；参照设置页“已安装”区和新建菜单的截图 |
| 用户决定 | 2026-11-13 | 智能体只保留 **Claude Code、Codex、Pi**，其他以后再加，加一个只需加一行。但这三个的检测命令、权限参数、显示名、目录信息等要补齐完整。**Claude Agent Teams 彻底删除** |
| 用户决定 | 2026-11-13 | 权限**只需要默认完全访问**，不做 orca 的五档权限菜单 |
| 用户决定 | 2026-11-13 | 新建菜单只放：终端、智能体、设置 |
| 用户决定 | 2026-11-13 | 每个插件模块启用后，设置页自动多出一个对应的图标，点击进入该模块的设置页；按 Vault 保存；系统设置与插件设置用图标分开；插件关闭时，功能和设置页一起关闭；**现有设置页一并规范化** |
| 关联 change | — | [任务 Issue 化](../../../../changes/2026-11-13-task-issue-automation/spec.md) 的 §3.5 / T05 依赖本 change 的 `resolveAgentLaunch` |
| 长期决定 | notes `context/workbench.md` | D-26：不做应用级数据库（因此设置按 Vault 存）；D-28：只有简体中文 |

## 当前事实（HEAD `8283c5c`，2026-11-13 由只读子代理核对）

### orca（MIT 许可，Copyright 2026 Lovecast Inc.；HUHU 为 GPL-3.0-or-later，复制时需保留版权与许可声明）

- **智能体目录**：
  - `src/shared/agent-launch/catalog/tui-agent-config.ts`：检测命令、启动命令。claude 在 `:17-29`，codex 在 `:62-70`，pi 在 `:124-131`。
  - `tui-agent-display-names.ts`：显示名。
  - `renderer/src/lib/agent-catalog/agent-catalog-entries-primary.ts:14,34,115`：label、cmd、主页链接。
- **完全访问参数**：`src/shared/agent-launch/permissions/tui-agent-permissions.ts:12-45`。claude 为 `--dangerously-skip-permissions`，codex 为 `--dangerously-bypass-approvals-and-sandbox`，pi 没有对应参数。
- **默认参数**：`tui-agent-launch-defaults.ts:62-63`，`DEFAULT_TUI_AGENT_ARGS = YOLO_TUI_AGENT_ARGS`。
- **模型、effort、fast 的 CLI 映射**：`src/shared/agent-session/options/agent-session-option-catalog-claude-codex.ts`。
  - claude：`--model`；`--effort`，可选 low/medium/high/xhigh/max；fast 通过 `--settings` 传入 `fastMode`。
  - codex：`-m`；`-c model_reasoning_effort=…`；`-c service_tier`。
- **启动参数合成**：
  - `startup/tui-agent-launch-command.ts:93-206`：命令覆盖 → 会话选项 → 用户参数，并检测冲突。
  - `choices/agent-launch-profile.ts:36-80`。
  - `tui-agent-launch-defaults.ts:235-260`：合并环境变量。
- **检测**：
  - `main/preflight/installed-agent-detection.ts:29-130`：跳过已禁用的智能体；设置了命令覆盖的视为已安装；探测前补全 shell PATH。
  - `agent-command-detection.ts:13-47`：先查 PATH，再查安装目录。
- **设置字段**：`global-settings-types.ts:334-393`，包括 `defaultTuiAgent`、`disabledTuiAgents`、`agentCmdOverrides`、`agentDefaultArgs`、`agentDefaultEnv`。
- **设置 UI**：
  - `settings/agents/launch/AgentDetectionCatalog.tsx:61-119`：“已安装 · N 已检测 · on …” 与刷新按钮。
  - `AgentCatalogRow.tsx:161-377`：一行一个智能体，可展开。
  - `AgentLaunchDefaultsEditor.tsx`：命令、参数、环境三个编辑区。
- **新建菜单**：
  - `tab-bar/TabBarCreateEntry.tsx`：搜索框与键盘导航。
  - `QuickLaunchButton.tsx:185-335`：智能体行，默认智能体排第一。
  - `TabBarCreateEntryRow.tsx:51-75`：悬停或方向键打开子菜单。
  - `agent/AgentLaunchSetupPanel.tsx:55-165`：子菜单里的模型、effort、速度（`:162` 注明权限与参数在设置里改）。
  - `agent-launch-picker-search.ts:26-60`：搜索。
  - `definitions-core-2.ts:68-98`：快捷键 `tab.newTerminal` = Mod+T。
- **中文文案**：`renderer/src/i18n/locales/zh.json`。

### HUHU

- **agent-cli 引擎**：
  - `providers/index.ts:5-143`：只有 4 个 Provider（含 claude-agent-teams）。claude 的模型写死为 3 个，没有 effort；`claudeArgv` 和 `codexArgv` 都**不使用 fast**，所以 Fast 开关现在不起作用（缺陷）。
  - 检测方式是 `findOnPath` 加 `--version`，结果缓存 10 分钟；没有命令覆盖。
  - `prefs.ts:4-39`：只有 `{model, effort, fast}`，存放在 `.huhu/agent-cli/providers.json`。
  - `sessions.ts:133-197`：启动时只用 Provider 自带的 env；全仓库没有任何权限相关参数。
  - headless 运行的 argv 写死在 automations 的 `worker.ts:54-66`。
- **agent-cli UI**：
  - `AgentSettings.tsx:21-141`：设置对话框。
  - `AgentCliModule.tsx:162-164,197-199,235-266`：设置按钮、“+ 新终端”按钮与菜单。
  - `LaunchPanel.tsx:34-99`。
- **设置框架**：
  - 设置模块是 kernel 固定模块，8 个分区写死在 `apps/desktop/src/renderer/main.tsx:159-183`，由 `SettingsModule.tsx:52-68` 用 `switch` 分派。
  - 插件清单中的 `contributes.settingsPages` 只是字符串数组（`packages/contracts/src/plugin-manifest.ts:15-24`），**没有任何注册或渲染代码**。目前只有 agent-guide 声明了 `agent-access`，但这个页面实际由 workbench 写死，不随插件启停。
  - 启停过滤已经存在：`ContributionRegistry.visible()` 按 `plugin` 过滤（`contributions.ts:90-92`），由 `PluginFilter` 根据 `plugins.list` 驱动（`main.tsx:46-52`）。
  - 插件图标通过 `ModuleIconsContext` 取“插件的第一个模块的图标”（`AppShell.tsx:63-67`）。没有模块的插件（如 agent-guide）没有图标。
  - 跳转没有 `openSettings` API，只能 `setSection` 加 `openModule`；插件中心的“插件设置”按钮只能跳到设置首页（`PluginCenterModule.tsx:279-281`）。
  - 设置文件为 `<vault>/.huhu/settings.json`（`boot.ts:154`），天然按 Vault 存储。各插件自建 JSON store，没有公共 helper。
- **散落在模块里的插件配置**：
  - safe 的“锁定设置”（`SafeModule.tsx:454-474`）。
  - versioning 的“同步设置”（`SyncPage.tsx:55-82`）。
  - agent-cli 的设置对话框。
- **已知不一致**：
  - `SettingsModule.tsx:14` 的 TITLE 与 `main.tsx:178` 的标签不同。
  - tasks、ssh、versioning 的清单 `homeWidgets` 与 UI 实际贡献不一致。
  - 清单中声明的 `commands` 在 UI 侧都没有注册。
  - 快捷键按钮放在外观页（`ShellBars.tsx:65`）。

## 范围与非目标

**范围**

- 插件设置页的贡献机制与导航规范化。
- agent-guide、agent-cli、safe、versioning 四个插件的配置迁入各自的设置页。
- 三个智能体的目录与启动参数合成，删除 Claude Agent Teams。
- Agent CLI 设置页（复刻 orca 的“已安装”区）。
- 新建菜单。
- 修复 Fast 不生效的问题。

**非目标**

- orca 的五档权限菜单、聊天（chat / SDK）通道、WSL 和 SSH 远程检测、浏览器标签页、新 Markdown。
- 外部插件的 JSON schema 设置表单：归档规格中有这一项，但一直没有实现，本期也不做。外部插件只显示通用页面。
- 全局（跨 Vault）设置：D-26 保持不变。
- 快捷键自定义：`shortcuts` 字段目前没有 UI，本期不做。
- 新增 OpenCode 等其他智能体。

## 待决问题

无需用户决定的事项，交给实施时核实：

- orca 的 Claude、Codex、Pi 图标能否直接复制。它们是第三方商标图形，用于“标识该工具”属于常见用法；需保留 MIT 声明，并在 ledger 登记。
- orca 的 shell PATH 补全是否适用于 HUHU 的 Engine 进程环境。
