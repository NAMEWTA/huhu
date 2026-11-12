# 成熟实现复用映射

本文件是参考仓库、固定提交、复制文件与适配边界的唯一权威清单。任务文件通过 `R-xx` 编号引用；不在其他文件重复路径。本地路径相对于项目根 `/home/wta/projects/huhu`。

## 1. 参考仓库

| 简称 | 本地目录 | 仓库 | 固定提交 | 声明许可（package.json / Cargo.toml） |
| --- | --- | --- | --- | --- |
| OK | `temp/sources/open-knowledge` | https://github.com/inkeep/open-knowledge | `44a2e0a6acce5952da0764746e3693fded5025b4` | GPL-3.0-or-later |
| ORCA | `temp/sources/orca` | https://github.com/stablyai/orca | `7041ea022826ec19d627cd3a129b665822e7bf0a` | package.json 未声明 |
| AA | `temp/sources/agent-autoloop` | https://github.com/KKKKhazix/agent-autoloop | `9a6826ab89e1cac1fa12020a9dea50336837f258` | MIT |
| DSH | `temp/sources/deepseek-harness` | https://github.com/deepseek-ai/deepseek-harness | `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` | Cordis/cosmokit：MIT |
| HC | `temp/sources/herdr-core` | https://github.com/herdrdev/herdr-core | `ce81486e3d4032405060bb823687376fadaa087b`（Cargo 0.1.19，协议 generation 1） | Apache-2.0 |
| HA | `temp/sources/herdr-app` | https://github.com/herdrdev/herdr-app | `0ac92e4e9d5dea2097375c26e6a0cb194a75c2f0` | Apache-2.0 |
| PROTO | `temp/huhu-workbench-v8` | HUHU v9 原型 | 工作副本 | 本项目 |

复制规则：

- 复制的文件保留原版权头，并在文件顶部加一行 `// Source: <简称> <提交> <原路径>`；每次复制在 `docs/upstream/ledger.md` 记一行（原路径、目标路径、改动摘要）。
- 项目采用 GPL-3.0-or-later（D-27），与复制的 OK 代码一致。`THIRD_PARTY_NOTICES.md` 由 W20 用 `license-checker` 从依赖树生成，并补入上述复制来源。
- 用户已确认项目为个人使用且完全开源，复制不设许可审批流程；按约束未查阅任何 LICENSE 文件，表中“声明许可”只摘自 package.json / Cargo.toml。复制时保留原版权头与来源记录即可。
- HC 以官方发布的二进制形式随应用分发（W12），不复制 Rust 源码。HA 是 Rust 终端应用，只作为交互参考（Space 先建后启动、新建菜单结构），不复制代码。

## 2. 映射

“方式”取值：**复制**（逐文件复制，只改导入路径与类型）、**改造**（复制后按 HUHU 端口改写依赖部分，保留算法与测试）、**模式**（参照结构重写，因技术栈或耦合无法直接复制）、**依赖**（npm 包直接使用）。

### 平台与工程

| ID | HUHU 功能 | 来源文件 / 符号 | 来源如何实现 | 方式 | HUHU 目标 | 适配与不迁移 |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Electron 构建与三平台打包配置 | OK `packages/desktop/electron.vite.config.ts`、`packages/desktop/electron-builder.yml`、`packages/desktop/electron-builder.linux.yml`、`packages/desktop/scripts/run-electron-builder.mjs` | electron-vite 构建 main/preload/renderer/utility 四入口；electron-builder 产出 NSIS/DMG/AppImage | 改造 | `apps/desktop/electron.vite.config.ts`、`apps/desktop/electron-builder.yml` | 删除签名、公证、自动更新、universal 构建；mac 仅 arm64，win 仅 x64，linux 仅 x64 |
| R-02 | Engine 作为 utilityProcess 启动与监管 | OK `packages/desktop/src/main/index.ts`（`utilityProcess.fork`、`buildUtilityForkEnv`）、`packages/desktop/src/utility/server-entry.ts` | Main fork 服务进程，传入环境与参数，监听退出 | 改造 | `apps/desktop/src/main/engine-supervisor.ts`、`apps/engine/src/main.ts` | 不迁移 OTEL、遥测、自动实例、单文件服务器模式 |
| R-03 | 单端口 HTTP + WS + MCP 挂载、来源策略 | OK `packages/server/src/mcp-mount.ts`、`packages/server/src/http/http-app.ts`、`packages/server/src/http/local-api-dispatch.ts`、`packages/server/src/ingress-policy.ts`、`packages/server/src/mcp-http.ts` | 一个 `http.Server` 上挂 Hono 应用、WS 升级与 MCP 处理；按 Host/Origin/转发头拒绝请求 | 改造 | `packages/kernel/src/server/` | 去掉 Hocuspocus、ACP、分享、预览；路由改为 interfaces §6 |
| R-04 | CLI 框架与 stdio MCP | OK `packages/cli/src/cli.ts`、`packages/cli/src/mcp/` | commander 命令树；MCP stdio 入口 | 模式 | `apps/cli/src/` | 命令集合按 interfaces §6 重写 |
| R-05 | 插件运行时 | DSH `vendor/cordis/src/{context,events,fiber,registry,service,reflect,logger,utils,index}.ts`、`vendor/cosmokit/src/*` | Context 依赖注入、Service、插件作用域与自动 dispose | 复制 | `vendor/cordis`、`vendor/cosmokit`、`vendor/timer`（DSH `vendor/timer/src/index.ts`，为 Context 提供 `setTimeout`/`setInterval`/`debounce` 并随作用域释放）；workspace 包 `@huhu/cordis`、`@huhu/cosmokit`、`@huhu/cordis-timer` | 不迁移 loader、include、hmr、logger-console |
| R-06 | 单写者锁 | 依赖 `proper-lockfile`（OK/ORCA 均用） | 文件锁 + stale 判定 | 依赖 | `packages/vault/src/lock.ts` | — |
| R-07 | 原子写与自写回执 | 依赖 `write-file-atomic`（PROTO `desktop/main/vault-files.ts` 已用）；OK `packages/server/src/disk-receipts.ts`（`DiskReceiptLog`） | 写临时文件后 rename；记录自身写入以过滤监听回声 | 依赖 + 改造 | `packages/vault/src/write.ts`、`receipts.ts` | 回执键从 docName 改为 Vault 相对路径 |
| R-08 | 文件监听 | OK `packages/server/src/file-watcher.ts`、`packages/server/src/watcher-clock.ts`、`packages/server/src/polled-path-watcher.ts` | @parcel/watcher 订阅，chokidar 回退，去抖与就绪检测 | 改造 | `packages/vault/src/watch/` | 去除 OK 专有 `.okignore` 与托管工件逻辑，忽略规则用 data-model §2 |
| R-09 | 文件身份 | OK `packages/core/src/filesystem-identity.ts`（`filesystemIdentity`） | `dev:ino` 作为身份 | 复制 | `packages/vault/src/identity.ts` | — |
| R-10 | YAML frontmatter 局部改写 | OK `packages/core/src/frontmatter/{yaml-codec,record,schema,errors}.ts` | 基于 yaml CST 修改单键，保留其余文本 | 改造 | `packages/vault/src/semantic/frontmatter.ts` | 去掉 OK 页面 schema，改为按 kind 的 zod 模式 |
| R-11 | 全文检索 | Node 内置 `node:sqlite` + FTS5（D-34 取代 `@orama/orama`） | 内存全文索引 | 运行时自带能力 | `packages/vault/src/index/search.ts` | — |
| R-12 | 原型语义 Markdown 编解码与文件布局 | PROTO `semantic-markdown.js`、`vault-format.js`、`examples/demo-vault/` | 各 kind 的 frontmatter 字段与文件命名 | 模式 | `packages/contracts/src/kinds/`、测试夹具 `packages/testkit/fixtures/demo-vault` | 字段以 data-model §5 为准；示例 Vault 复制为测试夹具后按新字段修正 |

### 工作台 UI 与设计系统

| ID | HUHU 功能 | 来源文件 / 符号 | 来源如何实现 | 方式 | HUHU 目标 | 适配与不迁移 |
| --- | --- | --- | --- | --- | --- | --- |
| R-13 | shadcn 组件基线 | ORCA `components.json`（new-york-v4、neutral、cssVariables）；OK `packages/app/components.json` | shadcn CLI 生成到 `components/ui` | 依赖（shadcn CLI 生成） | `packages/ui/src/components/` | 颜色全部映射 HUHU token（design-system §2） |
| R-14 | 设计 token 数值 | PROTO `ui/refinement.css`（`:root` 与三主题×明暗块）、`ui/motion.css`、`style.css` | CSS 变量 + `data-theme`/`data-mode` | 改造 | `packages/ui/src/styles/tokens.css` | 只保留 design-system 中定义的 token |
| R-15 | 命令面板 | OK `packages/app/src/components/CommandPalette.tsx`、`packages/app/src/components/command-palette-search.ts`、`packages/app/src/components/command-palette-recents.ts` | cmdk + 最近项 + 分组搜索 | 改造 | `packages/workbench/src/command-palette/` | 命令来源换成插件贡献；不迁移 Skill/Chat 分组 |
| R-16 | 编辑器标签条 | OK `packages/app/src/components/EditorTabs.tsx`、`packages/app/src/components/tab-strip-wheel.ts`、`packages/app/src/components/tab-tooltip-state.ts` | 可拖拽排序标签、滚轮横移、提示 | 改造 | `packages/workbench/src/tabs/`（模块标签与文档标签共用） | — |
| R-17 | 文件树 | OK `packages/app/src/components/FileTree.tsx`、`packages/app/src/components/file-tree-operations.ts`、`packages/app/src/components/file-tree-rename-validation.ts`、`packages/app/src/components/file-tree-reveal.ts`、`packages/app/src/components/file-tree-selection.ts`、`packages/app/src/components/file-entry-icon.tsx` | `@pierre/trees` 虚拟化树 + 重命名/拖放/选择 | 改造 | `plugins/notes/src/ui/file-tree/` | 数据源改为 `vault.tree`；不迁移分享、技能分区 |
| R-18 | 日期选择 | OK `packages/app/src/components/ui/calendar.tsx`（react-day-picker） | shadcn Calendar | 复制 | `packages/ui/src/components/calendar.tsx` | 时间/时区部分沿用 PROTO `temporal.jsx` 的交互（今天/明天/一周后、直接输入、周一起始） |
| R-19 | 资源模糊选择 | OK `packages/app/src/editor/link-path-suggestions-core.ts`（`basename`、`scorePath`）；PROTO `vault-resource-picker.jsx` | 路径打分排序；Popover 多选 | 改造 | `packages/ui/src/components/resource-picker.tsx` | Popover 换成 shadcn Command + Popover |
| R-20 | 安全 Markdown 渲染 | ORCA `src/renderer/src/components/sidebar/{CommentMarkdown,comment-markdown-block-pipeline,comment-markdown-code-renderers,comment-mermaid-fence,comment-markdown-element-renderers}.tsx` | react-markdown + remark/rehype 插件 + 消毒 + Mermaid | 改造 | `packages/editor/src/preview/` | 增加 `[[双链]]` 与 frontmatter 隐藏；图片只走 Vault 资源路由 |

### 知识库与编辑器

| ID | HUHU 功能 | 来源文件 / 符号 | 来源如何实现 | 方式 | HUHU 目标 | 适配与不迁移 |
| --- | --- | --- | --- | --- | --- | --- |
| R-21 | 实时预览 | PROTO `vendor/atomic/{inline-preview,wiki-links,atomic-theme,read-only,tree-progress,huhu-composition,highlight}.ts`、`vendor/atomic/styles/`（上游 kenforthewin/atomic-editor `b6ed65f01bde4510031bc7a495520bc1a7688c66`，MIT） | CM6 装饰：非活动行隐藏标记、活动行显示源码；组合输入保护 | 复制 | `packages/editor/src/codemirror/live-preview/` | 适配 @codemirror/state 6.7 / view 6.43 后重跑编辑器测试 |
| R-22 | 编辑器装配 | PROTO `editor.jsx`（`MarkdownEditor`：模式、行号、留白、查找替换、工具栏命令） | 单 EditorView，模式切换只换扩展 | 模式 | `packages/editor/src/MarkdownEditor.tsx` | 用 TypeScript 重写；CodeMirror 包用 npm 版本，不再 vendor commands/search |
| R-23 | 外部修改三方合并 | OK `packages/core/src/bridge/{merge-three-way,diff-lines,line-endings}.ts` | 行级三方合并，标出冲突区 | 复制 | `packages/editor/src/merge/` | 只用于“磁盘已改且本地有未保存修改”的合并 |
| R-24 | 批注锚点 | OK `packages/server/src/comments/anchor.ts`（`createAnchor`、`refind`）、`packages/core/src/comments/passage-match.ts` | exact + 上下文打分重定位 | 复制 | `plugins/notes/src/engine/comments/anchor.ts` | — |
| R-25 | 批注界面 | OK `packages/app/src/comments/{CommentsPanel,CommentListPanel,CommentBubbleButton,CommentSelectionAffordance,anchor-decorations}.tsx`、`packages/app/src/comments/scroll-to-anchor.ts` | 侧栏线程、选区气泡、锚点装饰 | 改造 | `plugins/notes/src/ui/comments/` | 装饰改为 CodeMirror Decoration；不迁移发送到 Agent 的队列 |
| R-26 | 双链解析 | PROTO `vendor/atomic/wiki-links.ts`；OK `packages/core/src/markdown/wiki-link-micromark.ts` | `[[目标\|别名#标题]]` 语法 | 复制 | `packages/vault/src/index/links.ts` | — |

### 任务与自动化

| ID | HUHU 功能 | 来源文件 / 符号 | 来源如何实现 | 方式 | HUHU 目标 | 适配与不迁移 |
| --- | --- | --- | --- | --- | --- | --- |
| R-27 | 任务分类、日期与提醒规则 | PROTO `task-workbench-model.js`（`createTask`、`humanComplete`、分类查询、`collectDueReminders`、`markReminderDelivered`） | 纯函数 | 改造（转 TS） | `plugins/tasks/src/shared/` | 字段改为 data-model §5 |
| R-28 | 任务界面 | PROTO `task-workbench.jsx`（`TaskTable`、`TaskRow`、`TaskEditor`、`TaskDetail`、`TaskCalendar`、`RemindersEditor`、`ExecutionFields`） | 表格分组、详情、编辑表单 | 模式 | `plugins/tasks/src/ui/` | 用 shadcn + TanStack Table 重写，交互保持原型 |
| R-29 | 排期配置 UI | ORCA `src/renderer/src/components/automations/authoring/{AutomationSchedulePicker,AutomationCustomCronPanel,AutomationTimeField,AutomationMissedRunGraceField,AutomationEditorSettingsSidebar}.tsx` | 预设 + 自定义 cron + 时区 + 宽限 | 改造 | `plugins/automations/src/ui/schedule/` | 去掉工作区/项目/会话复用字段 |
| R-30 | cron 计算 | 依赖 `croner`；PROTO `task-workbench-model.js` 中的下次激活计算 | Cron + IANA zone | 依赖 | `plugins/automations/src/engine/scheduler.ts` | — |
| R-31 | 无界面 Agent worker | AA `worker/run.ts`（监督进程、Windows job）、`worker/agents.ts`（`findProgram`、`Turn`、`Reading`）、`host/command.ts`（`findOnPath`、`commandLine`） | 监督进程保存输出与退出码；按 provider 构造 argv | 改造 | `plugins/automations/src/engine/worker/` | 去掉 AA hub/卡片/渠道；输出写 `.huhu/runtime/<machineId>/runs/<runId>/` |
| R-32 | provider 无界面适配 | AA `plugins/claude/agent.ts`、`plugins/codex/agent.ts` | `-p`/`exec` 打印模式、`--session-id`/`--resume`、stream-json 解析结果与会话 id | 复制 | `plugins/agent-cli/src/engine/providers/{claude,codex}.ts` 的 `headless` 字段 | 权限映射默认 `edit`（Claude `acceptEdits`） |
| R-33 | 提示与回执协议 | AA `worker/contract.ts`（`promptFor`、`receiptBlock`、`readMessage`）、`protocol/validate.ts`（`parseResult`） | 资料写入 context 文件并标为数据；最后消息中的 ` ```agent-autoloop ` 块含 ask/notice/resolve/later | 改造 | `plugins/automations/src/engine/contract.ts` | 提示词改为 HUHU 任务语境；只使用 ask/notice/resolve |
| R-34 | 重试与上限常量 | AA `kernel/decide.ts`（`MAX_ATTEMPTS = 10`、`MAX_HOPS`）、`kernel/due.ts`（`RUN_LEASE`、`OFFLINE_AFTER`） | 确定性决策 | 模式 | `plugins/automations/src/engine/policy.ts` | HUHU 无自动重试：失败需用户点“重试”；保留 lease 与离线判定 |

### Agent CLI、终端与 SSH

| ID | HUHU 功能 | 来源文件 / 符号 | 来源如何实现 | 方式 | HUHU 目标 | 适配与不迁移 |
| --- | --- | --- | --- | --- | --- | --- |
| R-35 | Herdr 协议 | HC `schema/hc.openrpc.json`、`schema/README.md`、`docs/security.md` | JSON-RPC + framed 流；命名管道/Unix socket；HC_SESSION 隔离 | 依赖（官方二进制）+ 生成类型 | `packages/herdr-client` | — |
| R-36 | CLI 检测与模型目录 | ORCA `src/shared/agent-launch/catalog/{tui-agent-config,tui-agent-detection-commands,tui-agent-display-names,agent-cli-installation-problem}.ts`、`src/main/agent-launch/preflight/agent-cli-version-probe.ts` | 每个 agent 的检测命令、显示名、版本探测 | 改造 | `plugins/agent-cli/src/engine/providers/catalog.ts` | 只启用 claude、claude-agent-teams、codex、pi |
| R-37 | 启动菜单与设置面板 | ORCA `src/renderer/src/components/tab-bar/{TabBarAgentPickerEntry.tsx,use-new-tab-agent-menu-rows.ts}`、`src/renderer/src/components/agent/{AgentLaunchSetupPanel,AgentLaunchSetupFooter}.tsx`、`src/shared/agent-launch/picker/agent-launch-picker-{rows,search,speed,effective-choices}.ts`；PROTO `ui/agent-launch-helpers.ts` | 模型搜索与评分、effort/Fast 行、启动按钮 | 改造 | `plugins/agent-cli/src/ui/launch/` | 去掉账户切换、worktree 创建 |
| R-38 | 原生会话历史扫描 | ORCA `src/main/ai-vault/{session-scanner,session-scope-cwd,session-scope-real-paths,session-scanner-roots,session-scanner-jsonl-reader,session-scanner-agent-parser,session-first-user-prompt-read}.ts`；界面 `src/renderer/src/components/right-sidebar/ai-vault/panel/AiVaultPanel.tsx` | 扫描 provider 会话目录，按 cwd 真实路径归属，取首条提示作为标题 | 改造 | `plugins/agent-cli/src/engine/history/`、`src/ui/history/` | 去掉 WSL、远端主机、删除会话 |
| R-39 | 终端视图 | PROTO `terminal-surface.jsx`；ORCA `src/renderer/src/components/plain-ssh-terminal/PlainSshTerminalView.tsx` | xterm + fit + search，输入输出与尺寸 | 模式 | `packages/ui/src/components/terminal-view.tsx` | 字节流来自 `/ws/terminal/:id` |
| R-40 | SSH 主机密钥 | ORCA `src/main/ssh/host-keys/{ssh-host-key-verifier,ssh-host-key-decision,ssh-known-hosts,ssh-host-key-store,ssh2-host-key-verification}.ts` | known_hosts 匹配、首次/变化决策、指纹格式 | 改造 | `plugins/ssh/src/engine/host-keys/` | 信任库改为 `.huhu/ssh/known_hosts`；首次连接决策走 `ssh.hostKeyPrompt` 事件 |
| R-41 | SSH 连接与认证 | ORCA `src/main/ssh/connection/ssh-connection.ts`、`src/main/ssh/authentication/{ssh2-handshake,ssh-private-key-authentication,ssh-keyboard-interactive,ssh-auth-resolution}.ts` | ssh2 Client 握手、私钥/agent/键盘交互认证、超时 | 改造 | `plugins/ssh/src/engine/connection.ts` | 凭据从保险箱 `safe://` 取；跳板用 `forwardOut` 链（D-13） |
| R-42 | SFTP 与远程 Exec | ORCA `src/main/ssh/file-transfer/sftp/`、`src/main/ssh/file-transfer/ssh-file-transfer-abort.ts`、`src/main/ssh/remote-exec/{remote-host-exec,remote-exec-command}.ts` | SFTP 列表/读写/中止；exec 退出码 | 改造 | `plugins/ssh/src/engine/{sftp,exec}.ts` | — |
| R-43 | SSH 界面 | PROTO `execution.jsx`（`SSHView`）、`ssh-console.jsx`（`SSHConsole`）、`ssh-session-state.js` | 主机列表、概览/终端/Exec/文件/审计 | 模式 | `plugins/ssh/src/ui/` | 删除故障演练选择器 |

### 保险箱、版本、插件、指南

| ID | HUHU 功能 | 来源文件 / 符号 | 来源如何实现 | 方式 | HUHU 目标 | 适配与不迁移 |
| --- | --- | --- | --- | --- | --- | --- |
| R-44 | 秘密封装 | ORCA `src/main/orcad/orcad-secret-sealing.ts`（`sealOrcadSecret`、`openOrcadSecret`、`orcadSealingKeyCheck`） | AES-256-GCM，magic + IV + tag + 密文，AAD | 模式（按 Node crypto 重写同一格式） | `plugins/safe/src/engine/crypto.ts` | magic 改为 `HUHU\x01`；密钥由 scrypt(主密码) 解封的数据密钥提供；不做 host binding |
| R-45 | 保险箱界面 | PROTO `system.jsx`（`Safe`）、`credential-refs.js` | 锁定页、列表、详情、审计、锁定设置；`safe://` 引用解析 | 模式 | `plugins/safe/src/ui/` | 演示口令换成真实主密码设置流程 |
| R-46 | 文件历史 | OK `packages/server/src/shadow-repo.ts`（`initShadowRepo`、`commitWip`、`safetyCheckpoint`）、`timeline-query.ts`、`packages/core/src/shadow-repo-layout.ts` | 独立 Git 仓库记录每个 writer 的 WIP 链与检查点，查询带重命名谱系的时间线 | 改造 | `plugins/versioning/src/engine/history/` | 仓库路径固定 `.huhu/history/git`；writer 身份为 `huhu-<machineId>` |
| R-47 | 历史界面与差异 | OK `packages/app/src/components/{TimelinePanel,TimelineDiffPane,ActivityPanelDiffView}.tsx`、`packages/app/src/lib/use-timeline-entry-diff.ts`、`packages/core/src/frontmatter-diff.ts` | 时间线、vs-parent/vs-current 差异、属性差异、恢复确认 | 改造 | `plugins/versioning/src/ui/history/`、`packages/ui/src/components/diff-view.tsx` | 不迁移 `RenderedDiffView`（依赖 ProseMirror） |
| R-48 | 恢复顺序 | OK `packages/server/src/http/history-routes.ts`、`packages/server/src/http/agent-write-routes.ts`（`handleRollback`） | 先拒绝已知冲突、解析重命名路径、建安全检查点、再写入 | 模式 | `plugins/versioning/src/engine/restore.ts` | 写入走 data-model §7 操作日志 |
| R-49 | Git 状态与同步 | OK `packages/server/src/sync-engine.ts`、`packages/server/src/git-worktree-status.ts`、`packages/core/src/config/auto-sync-mode.ts`、`packages/core/src/git-repository.ts`、`packages/core/src/git-pathspec.ts` | simple-git；off/follow/full；拉/推独立定时与退避；临时 index 收集推送范围 | 改造 | `plugins/versioning/src/engine/sync/` | 范围过滤换为 HUHU 规则（排除 `.huhu/runtime`、`cache`、`ui`、`history`、`safe` 以外不含秘密） |
| R-50 | 冲突处理 | OK `packages/server/src/conflict-authority.ts`、`packages/server/src/conflict-kinds.ts`、`packages/app/src/components/{ConflictView,DiffViewBoundary,ConflictFilePreview}.tsx` | 冲突生命周期唯一 owner；逐块选择、未解决计数 | 改造 | `plugins/versioning/src/engine/conflicts/`、`src/ui/conflicts/` | — |
| R-51 | 同步界面 | OK `packages/app/src/components/SyncStatusBadge.tsx`、`packages/app/src/components/settings/SyncSection.tsx` | 将拉入/将推送/跳过分组；模式与间隔设置 | 改造 | `plugins/versioning/src/ui/sync/` | — |
| R-52 | 插件中心界面 | PROTO `plugins-v3.jsx`（`PluginCenterV3`、`EXTERNAL_DEMOS`） | 已安装/发现/运行时/权限四页 | 模式 | `packages/workbench/src/pages/plugins/` | 删除“模拟故障” |
| R-53 | 指南维护 | PROTO `builtin-guide-model.js`、`builtin-guide-v5.jsx`、`assets/agent-guide/` | 三文件状态判定（current/missing/outdated/conflict/preserved/needs-check/disabled/error）、备份替换 | 改造（转 TS） | `plugins/agent-guide/src/` | 删除“演练安装异常” |
| R-54 | 网关界面 | PROTO `system.jsx`（`Interfaces`、`Tester`）、`capability-contracts.js`、`cli-prototype.js` | 四页签、能力表、测试台、调用记录 | 模式 | `packages/workbench/src/pages/gateway/` | 能力表来自 `capabilities.list` |
| R-55 | 首页、健康、设置、数据页 | PROTO `app.jsx`（`Home`、`ActivityFeed`）、`system.jsx`（`Health`、`Preferences`）、`vault-storage-v6.jsx`、`backup-dialog-v6.jsx` | 卡片、专注、习惯；诊断；设置分组；数据与存储四页签 | 模式 | `packages/workbench/src/pages/`、`plugins/health/src/ui/` | 删除“宿主演示”状态 |
| R-56 | 知识库界面 | PROTO `knowledge.jsx`（`NotesView`、`ArchivesView`、`ArchiveDetail`、`ArchiveTypes`、`ArchiveRelations`、`InboxView`） | 文件操作对话框、档案表格/卡片、收件箱转换 | 模式 | 对应插件 `src/ui/` | 交互与文案保持原型 |
| R-57 | Agent CLI 界面 | PROTO `agent-cli.jsx`（`AgentCLIView`、`LaunchPicker`）、`agent-cli-model.js`、`agent-cli-context.js`、`agent-cli-review.jsx` | Space 列表、顶部 +、标签与分屏、右侧历史、审查 | 模式 | `plugins/agent-cli/src/ui/` | 删除样例检测开关 |

## 3. 必须自行开发的部分（无成熟实现可复制）

| 部分 | 原因 | 最小边界 |
| --- | --- | --- |
| Capability Dispatcher 与权限表 | 业务能力目录是 HUHU 特有 | `packages/kernel/src/dispatcher.ts`、`permissions.ts`，管线固定为 interfaces §1 |
| 语义 Markdown 仓储（kind 注册、查询投影） | HUHU 文件布局特有 | `packages/vault/src/semantic/`，frontmatter 改写复用 R-10 |
| 操作日志与恢复 | 多文件一致性规则特有 | `packages/vault/src/operations.ts`，规则见 data-model §7 |
| Task 两态、分类与处理去重 | HUHU 业务规则 | `plugins/tasks/src/shared/`、`plugins/automations/src/engine/scan.ts` |
| Space 与 cwd 历史归属 | Herdr Core 无 Space 概念 | `plugins/agent-cli/src/engine/spaces.ts` |
| 保险箱密钥层级 | 用户要求 Vault 内主密码方案 | `plugins/safe/src/engine/keyring.ts`，只用 `node:crypto` 的 scrypt 与 AES-GCM |
| ssh2 跳板链 | ORCA 用系统 ssh 做 ProxyJump | `plugins/ssh/src/engine/route.ts`，用 ssh2 `forwardOut` |
| 外部插件宿主 | 隔离进程 + 权限令牌为 HUHU 设计 | `apps/desktop/src/plugin-host/` |
