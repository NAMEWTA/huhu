# 复制来源台账

| 编号 | 来源 | 提交 | 目标路径 | 说明 |
| --- | --- | --- | --- | --- |
| R-05 | DSH fcc0ad4 | vendor/{cordis,cosmokit,timer}/src/* | vendor/{cordis,cosmokit,timer}/src/* | 包名改为 @huhu/*，保留 MIT 许可文件与来源行 |
| R-08 | OK 44a2e0a | packages/server/src/file-watcher.ts | packages/vault/src/watch/ | 仅参照批处理/回退/重命名配对思路，按 HUHU 需求精简重写（模式，未复制代码） |
| R-09 | atomic-editor b6ed65f (kenforthewin, 0.6.2) | src/* | ~~packages/editor/src/vendor/atomic/~~（已删除） | **已退役**（知识库编辑器重构，R-46）：被 OK 编辑器取代，目录、样式 `editor-cm.css`、`atomic-initial-reveal-fade` 动画与“关于”页致谢一并删除；历史记录保留于此 |
| R-24 | open-knowledge 批注锚点 | packages/server/src/comments/anchor.ts、packages/core/src/comments/{passage-match}.ts、markdown/whitespace-char-ref.ts | plugins/notes/src/engine/comments/ | 复制（GPL-3.0-or-later，与本项目许可一致）；类型改为本地 Anchor，删除未使用导出，补 noUncheckedIndexedAccess 守卫 |
| R-40 | orca 7041ea0（Lovecast Inc.，MIT） | src/shared/agent-launch/catalog/tui-agent-config.ts、permissions/tui-agent-permissions.ts、agent-session/options/agent-session-option-catalog-claude-codex.ts、node-cli-command-resolution.ts、agent-launch/choices/agent-choice-cli-apply.ts | plugins/agent-cli/src/shared/catalog.ts、plugins/agent-cli/src/engine/{detect,launch}.ts | 智能体目录的检测命令、完全访问参数、模型 / effort / fast 的 CLI 映射、冲突标志表、安装目录表、启动参数合成顺序；按 HUHU 的三个智能体与数据驱动目录改写，并与本机 claude 2.1.323、codex 0.167.2 的 `--help` 核对 |
| R-41 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/status-bar/icons.tsx（ClaudeIcon、OpenAIIcon）、components/agent/icons/agent-icon-glyphs.tsx（PiIcon） | plugins/agent-cli/src/ui/AgentIcon.tsx | 三个智能体的标识图形（仅用于标识对应工具）；改为数据表加首字母兜底 |
| R-42 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/settings/agents/launch/{AgentDetectionCatalog,AgentCatalogRow,AgentLaunchDefaultsEditor}.tsx、tab-bar/{TabBarCreateEntry,QuickLaunchButton}.tsx、agent/AgentLaunchSetupPanel.tsx | plugins/agent-cli/src/ui/{AgentSettingsPage,LaunchMenu}.tsx | 仅复刻交互与结构（“已安装 N 个已检测”、逐条展开编辑、命令行预览；新建菜单的搜索、新终端、智能体行与子菜单、设置入口），按 HUHU 的组件与中文文案重写，未复制源码 |
| R-43 | orca 7041ea0（Lovecast Inc.，MIT） | src/renderer/src/components/editor/{pdf-viewer-session,pdf-document-loader,pdf-view-position,pdf-scale-preference,pdf-scale-preference-storage,pdf-js-document-options,pdf-orca-media-range-transport,image-viewer-zoom,use-pdf-viewer-find-shortcut}.ts、lib/scroll-cache.ts（部分） | plugins/notes/src/vendor/orca/pdf/ | 复制并改造（范围传输改为注入的读取器 → `vault.readRange`；i18n、存储键及当前分栏 Find 命令适配）；保留 MIT 许可文件与 `UPSTREAM.md` / `PATCHES.md`；PdfViewer / PdfFind 外壳按 Huhu 组件重写（未复制） |
| R-44 | orca 7041ea0（Lovecast Inc.，MIT） | config/patches/pdfjs-dist@6.3.289.patch、config/build-plugins/pdfjs-viewer-assets.ts | patches/pdfjs-dist@6.3.289.patch、apps/desktop/scripts/pdfjs-viewer-assets.ts | 复制：PDF.js 局部渲染补丁；cmaps / standard_fonts / wasm 的构建期本地打包与开发服务器中间件（pdfjs-dist 根改为从 plugins/notes 解析） |
| R-45 | orca 7041ea0（Lovecast Inc.，MIT） | src/main/browser/document-preview/doc-preview-protocol.ts（CSP 与协议处理思路） | apps/desktop/src/main/preview-{protocol,session}.ts | 仅借鉴“独立协议 + 严格 CSP + 路径守卫”的思路，按 Vault 路径模型与 sandbox iframe 方案自行实现（模式，未复制代码） |
| R-46 | open-knowledge 44a2e0a（Inkeep，GPL-3.0-or-later） | packages/core/src/{extensions,markdown,bridge,registry,frontmatter,comments,schemas,…}、packages/app/src/{editor,lib,components(ui、属性面板),hooks,locales,globals.css,…}（历史闭包及当前逐文件来源见本文末尾） | packages/editor/src/vendor/open-knowledge/{core,app}/ | 复制（与本项目同为 GPL-3.0-or-later）：Tiptap / Yjs 编辑器内核、Markdown 管线、属性面板、编辑器渲染优化（editor-cache、display-lock、块级 content-visibility 等）。**补丁逐文件登记**在 `packages/editor/src/vendor/open-knowledge/PATCHES.md`，`scripts/ok-patches.mjs --check` 校验；来源与冻结说明 `UPSTREAM.md`；许可证 `LICENSE`（取自上游 `HEAD:LICENSE`） |
| R-47 | open-knowledge 44a2e0a | packages/app/src/comments/*（评论面板、线程卡、边距轨、选区入口、锚点装饰与分层、store） | packages/editor/src/vendor/open-knowledge/app/src/comments/；适配层 plugins/notes/src/ui/comments/ | 复制 + 适配：`comments-client` 换成适配 Huhu `comments.*`；AI 派发 / 队列 / 发送栏不接（decisions OP-D19 / Q2）；补丁 P-S4-xx |
| R-48 | open-knowledge 44a2e0a | packages/app/src/components/{FileTree,file-tree-*,use-file-tree-listing,OkFileTree,FileTargetMenuItems,…}.tsx，依赖 `@pierre/trees@1.0.0-beta.4`（精确锁定） | packages/editor/src/vendor/open-knowledge/app/src/components/；适配层 packages/editor/src/host/{explorer.tsx,routes/files.ts} | 复制 + 适配：数据源 `vault.list`，隐藏改写 `hiddenPaths`（不写 `.okignore`），去掉 Open with AI / 模板导入；补丁 P-S5-01～05 |
| R-49 | open-knowledge 44a2e0a | packages/server/src/{server-observers,map-driven-splice,bridge-watchdog,bridge-quiescence,pre-drain-discriminator,bridge-intake,bridge-loss-detector,cc1-broadcast,doc-extensions,agent-activity,md-manager}.ts | packages/editor/src/vendor/open-knowledge/server-bridge/ | 复制：OK 把“编辑树 ↔ 源文本”的跨 CRDT 桥放在服务端；本地宿主把它搬到渲染进程原样运行（`LocalDocProvider`，无 Hocuspocus） |
| R-50 | open-knowledge 44a2e0a | packages/{core,app}/src 中与闭包同目录的 `*.test.*`、助手与 fixtures（167 原样 + 1 适配，另 70 个因被测模块不在闭包而不迁入） | packages/editor/src/vendor/open-knowledge/ 同路径；`pnpm test:vendor` | 复制：结果与三分类见 [历史验证结果](../../.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/vendor-test-results.md)，原样基线 [tests-manifest.json](ok-parity/tests-manifest.json) |
| R-51 | open-knowledge 44a2e0a | patches/*.patch（9 条：@handlewithcare/remark-prosemirror、@lingui/core、@pierre/trees、@radix-ui/react-tooltip、@tiptap/extension-drag-handle、@tiptap/y-tiptap、cmdk、react-medium-image-zoom、y-indexeddb） | patches/ 与 pnpm-workspace.yaml 的 patchedDependencies | 原样复制；另 `pdfjs-dist@6.3.289` 补丁见 R-44 |
| R-52 | open-knowledge 44a2e0a | pnpm-lock.yaml 的解析版本 | pnpm-workspace.yaml 的 overrides（tiptap / ProseMirror / mdast / hast 等） | 版本对齐（行为基线）：浮动到更新的传递依赖会改变编辑器行为（例：mdast-util-gfm-task-list-item 2.0.1 把任务项序列化成 `- [ ] [ ] x`）；登记见 PATCHES.md P-D-01 |
| R-53 | prosemirror-view 1.41.8（MIT），参照 [1.42.9 聚焦修复](https://code.haverbeke.berlin/prosemirror/prosemirror-view/commit/2978d100a6c6f94bf59a97cbe88f53d3bcaf6f9d) 与 [1.43.0](https://www.npmjs.com/package/prosemirror-view/v/1.43.0) | `src/input.ts`、`dist/index.js`、`dist/index.cjs` | `patches/prosemirror-view@1.41.8.patch`，由 `pnpm-workspace.yaml` 登记 | B06 聚焦竞态。保留聚焦后形成的扩选。可编辑视图中，本次聚焦后的原生导航使折叠光标移动时，先让 DOM 观察器读取光标。无该导航时沿用原有恢复，组合输入期间不提前读取。升级依赖时复跑 `editor-selection-focus.spec.ts` 核对补丁能否移除。 |
| R-54 | Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0） | `internal/sessionimport/sessionimport.go`、`internal/sessionimport/sessionimport_test.go`、`internal/sshconfig/{syntax,sshconfig}.go`、`LICENSE` | `plugins/ssh/src/engine/import/` | 参照格式、字段和分组映射，用 Huhu 主机模型与只读预览重新实现。导入诊断报告凭据、命令及未解跳板，数据不执行也不连接。未复制 Go 源码。 |
| R-55 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（AGPL-3.0-only） | `src/components/conversations/conversation-message-content.tsx`、`src/components/mail/mail-html.ts`、`src-tauri/src/mail/body/format.rs`、`src-tauri/src/mail/sync/imap.rs` | `plugins/mail/src/{ui/MailReader.tsx,ui/mail-html.tsx,engine/message-cache.ts}` | 参考正文进视口才标已读、外部资源默认屏蔽和复查 FLAGS 的交互与行为。用 Huhu 的缓存、ImapFlow 和工作台组件重新实现。 |
| R-56 | Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0） | `internal/workbench/host_edit_save_failure_test.go`、`internal/workbench/host_auth.go` | `plugins/ssh/src/ui/{HostEditorDialog,HostRecordActionDialog}.tsx` | 参考认证草稿在保存失败时的保留与现有认证状态的显示。以 Huhu 的版本化主机能力和模块凭据重新实现。 |
| R-57 | Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0） | `internal/workbench/known_hosts.go`、`internal/workbench/known_hosts_test.go` | SSH 工作台的首次信任、指纹变化和已知主机界面 | 参考独立核对、移除和重新询问的流程，用现有 SSH 信任事务、版本校验及工作台对话框实现。 |
| R-58 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（AGPL-3.0-only） | `src/components/account/account-list.tsx`、`src/components/account/account-form-types.ts` | `plugins/mail/src/ui/{MailModule,MailAccountDialog,MailAccountNameDialog}.tsx` | 参考提供商分组、折叠、选择和认证类型，用 Huhu 现有工作台组件、版本化账号能力及模块凭据实现。 |
| R-59 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（AGPL-3.0-only） | `src/components/conversations/conversation-workspace/conversation-pane.tsx`、`src-tauri/src/commands/data/conversations.rs`、`src-tauri/src/mail/smtp.rs` | `plugins/mail/src/{ui/MailReader.tsx,ui/MailComposer.tsx,engine/prepare-reply.ts,engine/outbox.ts,engine/smtp.ts}` | 参考回复入口、参与者和线程头，用 Huhu 的原信身份、草稿及 outbox 实现。地址解析调用已锁定的 `nodemailer/lib/addressparser`（10.6.0，MIT-0）。 |
| R-60 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（AGPL-3.0-only） | `src/components/account/remove-account-dialog.tsx` | `plugins/mail/src/ui/MailAccountRemovalDialog.tsx`、`plugins/mail/src/engine/account-removals.ts` | 参考账号删除入口和确认操作。用 Huhu 的版本化影响预览、账号清理记录、模块凭据及可核对投递结果实现。 |
| R-61 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（AGPL-3.0-only） | `src/components/conversations/conversation-workspace/conversation-pane.tsx`、`src/components/mail/mail-composer/index.tsx`、`src-tauri/src/commands/data/compose.rs` | `plugins/mail/src/{engine/prepare-reply.ts,ui/MailReader.tsx,ui/MailComposer.tsx}` | 参考原邮件的转发与新话题入口。复用 Huhu 草稿、原信身份、附件引用及投递状态。 |
| R-62 | herdr-app `317e673f1f1568b876cbaa0b41dabeb9153ecbea`、herdr-core v0.1.19 `06793ede1bedb1fed8d22d3cae476d3eb239edf0`（Apache-2.0） | `src/mirror_sync.rs`、Core `crates/herdr-core/src/api/doc.rs` 与 `crates/herdr-core/src/events.rs` | `plugins/agent-cli/src/engine/{workspace-layout,waiting}.ts` | 调用固定 Core 的 `doc.get`、`doc.set` 与无标签事件订阅。Huhu 筛选自己的文档、校验同 Space 会话及丢回包后的原版本。 |
| R-63 | orca `8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3`（MIT） | `src/shared/workspace-layout/terminal-topology/terminal-pane-tree.ts` | `plugins/agent-cli/src/shared/workspace-layout.ts`、`plugins/agent-cli/src/ui/WorkspaceCanvas.tsx` | 参考递归插入与兄弟节点折叠。Huhu 自行管理稳定叶 ID、最小分栏尺寸和 TerminalView 的连接。 |
| R-64 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（AGPL-3.0-only） | `src-tauri/src/commands/data/conversations.rs` | `plugins/mail/src/engine/{conversations,message-cache,public-mail}.ts` | 参考按公开参与者过滤、归组和分页的流程。由 Huhu 校验原目录与账号身份，使用现有缓存及发件结果。 |
| R-65 | motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0） | `internal/workspace/spec.go`、`internal/workbench/workspace_launch.go` | `plugins/ssh/src/{shared/workspace.ts,engine/workspace-templates.ts,engine/workspace-runs.ts}` | 参考模板预设、阅读顺序和分栏启动流程。用 Huhu 主机目录、私有运行绑定和既有连接及信任状态机实现。 |
| R-66 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（AGPL-3.0-only） | `src-tauri/src/commands/data/conversations.rs`、`src/components/conversations/use-conversations.ts`、`src/components/conversations/conversation-workspace/global-search-dialog.tsx` | `plugins/mail/src/{engine/search-text.ts,engine/conversations.ts,ui/MailSearch.tsx}` | 参考自然日过滤、跨账号搜索和定位原件。由 Huhu 的缓存、公开正文投影和 Workbench 命令负责读取和交互。 |
| R-67 | Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0） | `internal/sftpclient/{walk,text,worker}.go`、`write_protocol_test.go` | `plugins/ssh/src/engine/{file-sessions,sftp,transfers,transfer-io}.ts` | 参考绑定文件会话、文本保存、传输队列、续传及提交恢复。以 Huhu 的 SSH 连接身份、ssh2 流与 Workbench 界面实现。 |
| R-68 | Pi CLI 1.5.2，`b4afdddf44e059c67ccf5097e5317d913521b470`（MIT，Mario Zechner） | [会话格式](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md)、[加载和分支](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/main.ts)、[许可证](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/LICENSE) | `plugins/agent-cli/src/engine/{history,launch.ts,sessions.ts}` | Huhu 读取原生 JSONL 的会话头和父子关系，调用本机 Pi 的 `--session` 和 `--fork`，根据实际扫描范围解析文件，经现有 Core 布局与启动对账执行。未复制或分发 Pi 源码。 |
| R-69 | Open Knowledge `b2af296a73049ddd47f6d679b36774ecbdd3d19b`（GPL-3.0-or-later） | `packages/desktop/src/main/window-chrome.ts` | `apps/desktop/src/main/window-chrome.ts` | 沿用按平台启用原生标题控件、更新 overlay 和检查存活窗口的结构。Huhu 使用自己的标题尺寸、根主题颜色、IPC 主框架检查和退出事务。 |
| R-70 | Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`（Apache-2.0） | `internal/sshconn/integration.go`、`internal/sshconn/integration_unix_test.go`、`internal/term/cwd.go`、`LICENSE` | `plugins/ssh/src/engine/{shell-directory,manager,file-sessions}.ts` | 参考私有 Shell 启动脚本和提示符上报。Huhu 绑定现有 Shell 与 SFTP 会话，以一次性目录选择、工作区分栏和空闲状态约束反向切换。 |
| R-71 | open-knowledge 44a2e0a | `packages/server/src/link-preview/{guarded-fetch,html-metadata}.ts`、`packages/core/src/util/ip-classifier.ts` | `packages/editor/src/vendor/open-knowledge/server-bridge/link-preview/` | 复用网络地址验证、限量读取及标题和描述提取。桌面主进程在用户启用 Q3 后调用。补丁与来源见 [逐文件清单](../../.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/source-file-catalog.md)。 |
| R-72 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/keyidentity/generate.go`、`internal/workbench/stored_keys.go` | `plugins/ssh/src/engine/key-library.ts` | 移植粘贴规范化规则，使用 ssh2 生成和解析 Ed25519 密钥，由 ModuleCredentials 保护私钥。 |
| R-73 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/workbench/host_test_connection.go` | `plugins/ssh/src/{engine/draft-connection.ts,engine/manager.ts,ui/HostEditorDialog.tsx}` | 参照测试结果、30 秒窗口及草稿所有权，接入 Huhu 的 ssh2 跳板和主机信任。 |
| R-74 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/sshconn/{auth,conn}.go`、`internal/workbench/host_jump_row.go`、`internal/sshconfig/edit.go` | `plugins/ssh/src/{engine/manager.ts,engine/config-sync.ts,ui/RoutePanel.tsx}` | 参考逐轮认证、跳点轨迹和配置保留，沿用 Huhu 的主机版本、Vault 与 OpenSSH 解析器。 |
| R-75 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/workbench/{local_proxy_tunnel,local_proxy_ui}.go` | `plugins/ssh/src/engine/proxy-share.ts` | 参考远端回环检查和固定端口，复用 Huhu 的转发监听器、现有连接和 HTTP CONNECT 测试。 |
| R-76 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/workspace/spec.go`、`internal/workbench/{terminal_input_guard,terminal_recording}.go`、`internal/sessionlog/store.go` | `plugins/ssh/src/{ui/WorkspaceCanvas.tsx,engine/terminal-bridge.ts,engine/terminal-recordings.ts}` | 参考分栏阅读顺序和输入、录制生命周期，复用 Huhu 的终端视图、SSH Shell 和本机运行目录。 |
| R-77 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/localshell/{discovery_other,discovery_windows,wsl_windows}.go` | `plugins/ssh/src/engine/{local-shell,local-pty-herdr}.ts` | 参考设备和 WSL 探测，PTY 复用 Huhu 随包的 Herdr Core。 |
| R-78 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/workbench/terminal_recording.go`、`internal/sessionlog/{model,store}.go` | `plugins/ssh/src/{engine/terminal-recordings.ts,shared/recordings.ts,ui/TerminalRecordings.tsx}` | 参考相对时间、事件排序与索引上限。Huhu 使用现有录制文件的可选文本偏移和工作台纯文本播放器。 |
| R-79 | [ssh2 #1495 `d268d9b8de7783a4e8b4357a8cf2bf659cfe2dff`](https://github.com/mscdex/ssh2/commit/d268d9b8de7783a4e8b4357a8cf2bf659cfe2dff)（MIT，Copyright Brian White） | `lib/client.js`、`lib/protocol/{Protocol,keyParser}.js` | `patches/ssh2@1.17.0.patch` | 在锁定的 ssh2 v1.17.0 `844f1edfc41589737671f96a4f4e76afdf46abd4` 上适配 Ed25519 用户证书认证。单独保留证书 blob 与主体签名私钥，限定请求和内层签名的算法，沿用普通公钥解析、hostbased 与 KEX。许可证随 ssh2 分发。 |
| R-80 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/workbench/{proxy_batch,proxy}.go` | `plugins/ssh/src/{engine/route-edits.ts,ui/RoutePanel.tsx}` | 参考显式选择、跳过或覆盖现有跳板与行级结果。Huhu 以原子批次提交、版本核对和现有 SSH 连接实现。 |
| R-81 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/sshconn/certificate.go` | `plugins/ssh/src/engine/{host-configurations,identity-certificate}.ts` | 参考伴随文件命名和签名器配对。Huhu 在本机凭据租约操作内限量读取证书，核对 Ed25519 主体公钥，使用 R-79 的 ssh2 公钥认证。 |
| R-82 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/workbench/{toolbar_dock_ui,toolbar_dock,terminal_toolbar_settings,vertical_tab_groups}.go` | `plugins/ssh/src/ui/{WorkspaceRunView,WorkspacePaneTools}.tsx`、`{device-preferences,workspace-tab-groups}.ts` | 参考工具栏位置、快捷键替代、动作可见性和纵向标签分组。Huhu 复用工作台终端节点，以设备偏好控制展示。 |
| R-83 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0）；`socks@2.8.10`（MIT） | `internal/sshconn/{proxy,proxy_test}.go`、`internal/workbench/outbound_proxy.go`；`SocksClient` 发布接口 | `plugins/ssh/src/engine/{outbound-proxy-dial,outbound-proxies,manager}.ts` | 参考首段代理、握手余字节、超时和取消，Huhu 使用已锁定的 SocksClient 与 Node HTTP CONNECT。代理凭据留在模块私有存储，实际 SSH 验证沿每一跳进行。 |
| R-84 | Motty v0.4.12 `102228261703d8f22c5eb98b1c500e2a24889dee`（Apache-2.0） | `internal/workbench/{snippets,snippet_groups,snippet_picker,snippet_send}.go` | `plugins/ssh/src/{engine/shortcuts.ts,ui/ShortcutPanel.tsx,ui/TerminalActions.tsx}` | 参考可搜索的分组与排序、预览及明确的目标和回车选择。Huhu 用 Vault 版本写入、同一 SSH 输入控制和安全粘贴。 |
| R-85 | ssh2 v1.17.0 `844f1edfc41589737671f96a4f4e76afdf46abd4`；Go x/crypto `729f1e841bcca28c2cd9f4034d6f7672604dbeda`（BSD-3-Clause）；OpenSSH 10.0p1 协议参考 | ssh2 `lib/protocol/{constants,kex}.js`、Go `ssh/certs.go`、OpenSSH `PROTOCOL.certkeys` | `patches/ssh2@1.17.0.patch` 与 `plugins/ssh/src/engine/{host-certificate,known-hosts,known-host-rules,ssh-wire}.ts` | 固定 ssh2 在显式证书策略下协商 Ed25519 主机证书，完整 K_S 进入交换哈希，由叶钥验签。Huhu 独立核对批准 CA、principal、时间、撤销及旧指纹。Go 与 OpenSSH 用于格式和行为核对。 |

| R-86 | Herdr App `0ac92e4e9d5dea2097375c26e6a0cb194a75c2f0`（Cargo 工作区声明 Apache-2.0） | `src/window.rs` 的 `shell`、`unix_agent_argv` | `plugins/agent-cli/src/engine/linux-interactive-program.ts`、`native/agent-pty/console_linux.go` | 参考 Agent 退出后返回同一终端交互 shell 的行为和参数边界；Huhu 用既有私有启动协议、Go 进程监督和 PTY 实现，未复制 Rust 源码。Linux 安装适配核对本机 Volta 记录、Codex 0.171.0（Apache-2.0）和 Pi 1.5.2（MIT）的发布包布局及 Claude 原生版本路径，不随补丁分发 provider。候选 `6874c619` 与探针 `6a510e6f` 的四种真实安装离线交互及返回 shell 已通过，f91a5515 同包 Linux 原生终端与批准规则已验；四种安装入口仍按 W7.3 的独立离线证据范围记录，不将同包结果扩大为所有线上 provider。 |
| R-87 | one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`（README 声明 AGPL-3.0-only，固定根树无独立 LICENSE）；Nodemailer 10.6.0（MIT-0） | `src-tauri/src/mail/sync/graph_api.rs`；Nodemailer `lib/mail-composer` 发布接口 | `plugins/mail/src/engine/{graph-mail,graph-send,message-cache}.ts` | 只参考 Graph 分页、原生 ID 与最终 delta 游标提交的行为，没有复制或翻译 one-mail 源码。同步与缓存复用 Huhu Gmail/IMAP 设施；MIME 发信复用已锁定 MailComposer，Outbox 保留原认领和未知结果。实现已落地；Graph 分页、降权、恢复与发信边界有隔离发行方及回环 Engine 证据，真实线上账号仍待验，见 Linux 最终验收记录。 |
| R-88 | Herdr Core `ce81486e3d4032405060bb823687376fadaa087b`（Apache-2.0） | `crates/herdr-core/src/platform/windows.rs` 的 `batch_line` | `plugins/agent-cli/src/engine/codex-dispatch-helper.cjs` 的 `historyInvocation` | 将既有批处理参数编码小范围适配为 JavaScript：保留 TOML 引号、隔离百分号展开、处理反斜杠；两段原生历史启动共用构造，CR/LF/NUL 在列表和首次提交前拒绝。可移植参数和公开 Engine 回归已通过，Windows 实机回显未运行。 |

Motty v0.4.12 源码适配的条目沿用 Copyright 2026 Motty contributors。 [固定提交](https://github.com/t8y2/motty/commit/102228261703d8f22c5eb98b1c500e2a24889dee) · [LICENSE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE) · [NOTICE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/NOTICE)

## 账本来源与领域合同（#11 L0a）

HomiBook 固定为 v1.2.4 `5d3d71713de805c95245378408b73f101f69659a`，完整提交已获取到 `temp/sources/homibook`。根 LICENSE 为 MIT，版权为 saaangxy（2026）。本阶段复用行为与边界样例，Huhu 合同独立实现。基线为 Huhu `825b0c0327954680c1133a4307730db5e94b33ca`。 [固定提交](https://github.com/saaangxy/HomiBook/commit/5d3d71713de805c95245378408b73f101f69659a) · [LICENSE](https://github.com/saaangxy/HomiBook/blob/5d3d71713de805c95245378408b73f101f69659a/LICENSE)

| 固定源文件 | Huhu 适配与责任 |
| --- | --- |
| `backend/prisma/schema.prisma` 的 `AccountBook`、`Account`、`BalanceAdjustment`、`Record` 与 `RecordAttachment` | `packages/contracts/src/ledger.ts` 冻结账本、账户、余额基准、流水、转账、平账组及两条提交输入样例。JSON 金额使用最小单位整数字符串，加减用 BigInt。不同币种分别出账，两个转账端点独立保存。以首批合同中固定的币种精度表校验，未知币种进入待决。 |
| `backend/src/services/balance.ts`、`backend/src/lib/date-time.ts` | 保留期初/校准与真实资金变动关系。将上游浮点舍入替换成精确整数，账本自带 IANA 时区。以半开业务日区间归集，明确处理重复或不存在的来源壁钟时刻。 |
| `backend/src/services/offset-match.ts`、`backend/src/services/backup/{export,import}.ts` | 平账/恢复交互参照上游。后续 `plugins/ledger/src/domain/offset.ts` 复用候选排序的行为，Engine 复核组成员和版本。归档或缺失的凭证/知识资源保留可辨认状态，历史流水保持可读。迁入旧 `offsetAt` 时复核缺失关系，不捏造组身份。 |
| `backend/src/services/scheduler.ts`、`backend/src/routes/recurring.ts`、`frontend/src/pages/BooksPage.tsx` | UI 模块承接建账、流水、导入和报表。固定收支接 Automations 唯一 planId/revision，贷款历史显式确认。账本 owner 保存期次和入账关系，经现有 VaultFiles/OperationLog 做一致提交与恢复。 |

合同放在已装配且可单独验证的 `@huhu/contracts`，沿用 `CapabilityIntentKeySchema`。L1 建立插件时由账本 owner 消费此共享输入及本地提交约定。`packages/contracts/test/ledger.test.ts` 的固定样例验证宽金额、校准、时区、异常引用和受控导入确认输入。样例不代表 SQLite、Vault 写入或业务能力已经注册。

## MCP 聚合来源与合同（#12 P0）

首选 Huhu 现有 Dispatcher、MCP 会话、工作台接入中心、VaultFiles 及模块凭据宿主。实施机的 `temp/sources` 未预置 Magpie，本次取回 v0.1.4676 固定提交 `700f4127e8044ac6dfbb0e0cc937e91c59a601ac`，保存在 `temp/sources/magpie` 下的 `refs/huhu-research/issue12`。根 LICENSE 为 MIT，版权 yetone（2026）。P0 适配连接和工具路由行为，未复制 Go 源码。 [固定提交][mcp-magpie] · [LICENSE][mcp-magpie-license]

| 路径 | 实际交付与迁移目标 | 测试来源与边界 |
| --- | --- | --- |
| Magpie `docs/subsystems/mcp-router.md`、`docs/subsystems/library.md`、`internal/library/mcp_check.go`、`internal/library/mcp_accounts.go` | 服务列表、共享入口、显式检查、身份绑定迁移到 `prototype/mcp/prototype.js`，真实连接管理拟落在 `plugins/mcp/src/engine/{sources,credentials}.ts`。 [Router][mcp-magpie-router] · [Library][mcp-magpie-library] · [检查][mcp-magpie-check] · [账户][mcp-magpie-accounts] | P0 原型走查添加、检查、OAuth 过期和状态分离。P1/P4 连接夹具和认证状态核对真实效果。 |
| Magpie `internal/gateway/hub_mcp.go` 与 `hub_mcp_test.go` | `packages/kernel/src/mcp-routing.ts` 确认来源权限后按稳定公开键命中。延续有来源前缀的工具名与原生 MCP 结果。 [实现][mcp-magpie-hub] · [测试][mcp-magpie-hub-test] | `TestHubMCPListsAndRoutes`、`TestHubMCPGuarded`、`TestHubMCPNamesItsServers` 对应本票目录、缓存名和多来源样例。Magpie 仅聚合 Tools，其 `hubNamed` 的顺序后缀及 `TestHubMCPCallsAToolNoLongerListed` 的前缀回退均未移植。 |
| Magpie `internal/library/mcp_hub.go` 与 `mcp_hub_test.go` | P1/P2/P5 拟迁移并发连接合并、分页、来源故障隔离及回收至 `plugins/mcp/src/engine/{runtime,catalog}.ts`。 [实现][mcp-magpie-pool] · [测试][mcp-magpie-pool-test] | `TestHubToolsAndCalls`、`TestHubServerDiesAndIdles`、`TestHubEntrySwap` 对应后续真实连接验收。 |
| TypeScript SDK 1.32.2（已锁定，提交 `3b73021a0a2272c0c04c3917bcdb03398b3ec63f`） | P0 引用 SDK 原生结果 schema 和类型。P1–P4 直接使用 stdio、Streamable HTTP、旧版 SSE、OAuth 与 URI 模板原语。 [协议版本][mcp-sdk] · [stdio][mcp-sdk-stdio] · [Streamable HTTP][mcp-sdk-http] · [SSE][mcp-sdk-sse] · [OAuth][mcp-sdk-auth] | 库声明兼容的握手和 Huhu 验收矩阵分别记录。P0 不声明真实传输兼容。 |
| #12 的 1MCP、MCPHub、MetaMCP 固定参考 | 1MCP 的快照/代次、模板与 supervisor 对应 P2、P3、P5；MCPHub 的服务/导入和资源/提示对应 P2、P3；MetaMCP 仅参照发现/调用双检。MCPHub 与 1MCP 的 SDK 2.x 包入口需转为现有 SDK。 [1MCP 快照][mcp-1mcp-cap] · [1MCP 模板][mcp-1mcp-template] · [1MCP 进程恢复][mcp-1mcp-stdio] · [MCPHub 导入][mcp-mcphub-import] · [MCPHub 资源][mcp-mcphub-resources] · [MCPHub 提示][mcp-mcphub-prompts] · [MetaMCP 过滤][mcp-metamcp-filter] | 1MCP 的同仓快照、模板和 supervisor 单测是后续迁移的用例来源。此行用 #12 固定路径标出后续来源，无直接复制。MetaMCP 查询异常时放行的分支不适用。 |

[mcp-magpie]: https://github.com/yetone/magpie/commit/700f4127e8044ac6dfbb0e0cc937e91c59a601ac
[mcp-magpie-license]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/LICENSE
[mcp-magpie-router]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/docs/subsystems/mcp-router.md
[mcp-magpie-library]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/docs/subsystems/library.md
[mcp-magpie-check]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/internal/library/mcp_check.go
[mcp-magpie-accounts]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/internal/library/mcp_accounts.go
[mcp-magpie-hub]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/internal/gateway/hub_mcp.go
[mcp-magpie-hub-test]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/internal/gateway/hub_mcp_test.go
[mcp-magpie-pool]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/internal/library/mcp_hub.go
[mcp-magpie-pool-test]: https://github.com/yetone/magpie/blob/700f4127e8044ac6dfbb0e0cc937e91c59a601ac/internal/library/mcp_hub_test.go
[mcp-sdk]: https://github.com/modelcontextprotocol/typescript-sdk/blob/3b73021a0a2272c0c04c3917bcdb03398b3ec63f/src/types.ts
[mcp-sdk-stdio]: https://github.com/modelcontextprotocol/typescript-sdk/blob/3b73021a0a2272c0c04c3917bcdb03398b3ec63f/src/client/stdio.ts
[mcp-sdk-http]: https://github.com/modelcontextprotocol/typescript-sdk/blob/3b73021a0a2272c0c04c3917bcdb03398b3ec63f/src/client/streamableHttp.ts
[mcp-sdk-sse]: https://github.com/modelcontextprotocol/typescript-sdk/blob/3b73021a0a2272c0c04c3917bcdb03398b3ec63f/src/client/sse.ts
[mcp-sdk-auth]: https://github.com/modelcontextprotocol/typescript-sdk/blob/3b73021a0a2272c0c04c3917bcdb03398b3ec63f/src/client/auth.ts
[mcp-1mcp-cap]: https://github.com/1mcp-app/agent/blob/6e25f4a5b8b2728e74af06cd61981f5cd94c125c/src/core/capabilities/capabilityAggregator.ts
[mcp-1mcp-template]: https://github.com/1mcp-app/agent/blob/6e25f4a5b8b2728e74af06cd61981f5cd94c125c/src/sdk/legacy/shared/resourceTemplateRouting.ts
[mcp-1mcp-stdio]: https://github.com/1mcp-app/agent/blob/6e25f4a5b8b2728e74af06cd61981f5cd94c125c/src/core/server/backendStdioSupervisor.ts
[mcp-mcphub-import]: https://github.com/samanhappy/mcphub/blob/f4aad3de1857385b234887bb46f81fbc2fbf8816/frontend/src/components/JSONImportForm.tsx
[mcp-mcphub-resources]: https://github.com/samanhappy/mcphub/blob/f4aad3de1857385b234887bb46f81fbc2fbf8816/src/services/mcpResources.ts
[mcp-mcphub-prompts]: https://github.com/samanhappy/mcphub/blob/f4aad3de1857385b234887bb46f81fbc2fbf8816/src/services/mcpPrompts.ts
[mcp-metamcp-filter]: https://github.com/metatool-ai/metamcp/blob/05818ec2767b946f98d280ae9cefa401f0362d62/apps/backend/src/lib/metamcp/metamcp-middleware/filter-tools.functional.ts

## 安装包依赖

| 依赖 | 来源与许可 | 用途 |
| --- | --- | --- |
| `d3-dsv@3.0.2` | Mike Bostock，ISC。锁文件保留发布包完整性摘要。 [发布包](https://registry.npmjs.org/d3-dsv/-/d3-dsv-3.0.2.tgz) | SSH 导入使用 `csvParseRows` 读取 Netcatty CSV。账本使用 `csvParseRows` 和 `csvFormatRows` 解析、导出 CSV。 |
| SheetJS CE `xlsx@0.20.3` | Apache-2.0，发布包含 `LICENSE`。`pnpm-lock.yaml` 的完整性摘要为 `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`。 [官方发布包](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz) · [安装说明](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) | 账本 Engine 在本机读取微信 XLSX。 |
| `@napi-rs/keyring@2.1.2`、`@napi-rs/keyring-win32-x64-msvc@2.1.2`、`@napi-rs/keyring-linux-x64-gnu@2.1.2`、`@napi-rs/keyring-darwin-arm64@2.1.2` | 上游 `52184fbebffeef8a061234f60f313c479b954f9f`，MIT，原生包附 `LICENSE.third-party.md`。 [发布元数据](https://registry.npmjs.org/@napi-rs%2Fkeyring/2.1.2) · [Entry 接口](https://github.com/Brooooooklyn/keyring-node/blob/52184fbebffeef8a061234f60f313c479b954f9f/src/entry.rs) | Engine 按可信 Vault 实例读取、创建与清理系统钥匙串中的精确数据键：Windows Credential Manager、macOS Keychain、Linux Secret Service（固定 `secret-service` 存储，不用内存 keyutils）。`apps/engine/src/module-credential-host.ts` 包装发布 API，桌面通过锁文件纳入对应平台的原生包，`electron-builder.yml` 按 `**/keyring.*.node` 解包。Linux x64 已实测；macOS、Windows 本轮未在当前候选实测。 |
| `imapflow@2.12.1` | Postal Systems OÜ，MIT。 [发布包](https://registry.npmjs.org/imapflow/-/imapflow-2.12.1.tgz) · [许可证](https://github.com/postalsys/imapflow/blob/master/LICENSE.txt) | Mail 的 IMAP 登录和文件夹发现复用发布接口。桌面将此依赖作为 Node 模块随包分发，传递依赖由工作区锁文件固定。 |
| `nodemailer@10.6.0` | Andris Reinman，MIT-0，按发布包固定版本与完整性摘要。 [发布包](https://registry.npmjs.org/nodemailer/-/nodemailer-10.6.0.tgz) | Engine 装配 Mail SMTP 传输，调用发布的 `nodemailer/lib/smtp-connection` 与 `nodemailer/lib/mail-composer` 构造器。Mail 自行管理草稿认领、收件人投递证据和故障恢复。该版本没有运行时传递依赖。 |
| `@zone-eu/mailsplit@5.4.31`、`parse5@8.1.1` | 本仓库已锁定的发布包。mailsplit 为 MIT OR EUPL-1.1+，parse5 为 MIT。 | Mail Engine 用 Splitter 解析 MIME 边界和传输编码。阅读器用 parse5 生成无网络副作用的数据树，按自身允许清单构造 React 节点。 |
| Go `1.26.7`、`golang.org/x/sys v0.50.0` | BSD-3-Clause。Go 提交 `e3336a22ad3f0a90bd252c95d8b5544e02674205`，x/sys 提交 `00227f1d192842e243cba7763c1f9a1fcb1c4344`。 [Go 标签](https://go.googlesource.com/go/+/refs/tags/go1.26.7) · [x/sys 标签](https://go.googlesource.com/sys/+/refs/tags/v0.50.0) | 使用 `windows/{syscall_windows,zsyscall_windows,types_windows}.go` 的 Win32 调用构建 Windows 受保护 PTY。Huhu 实现身份核验和授权协议，`native/agent-pty/go.sum` 固定依赖摘要，应用随 Windows 安装资源交付两份许可和专利文件。 |
| `github.com/creack/pty v1.1.24` | MIT，提交 `edfbf75025b0ba4ee17c19f52d9b600fad80a787`，Go 模块缓存发布元数据与 `go.sum` 固定。 [固定来源](https://github.com/creack/pty/tree/edfbf75025b0ba4ee17c19f52d9b600fad80a787) | Linux Agent helper 调用 `pty.Open` 建立真实 PTY。未改上游模块，Huhu 的 `console_linux.go` 负责进程监督、输入转发、尺寸与生命周期。许可 `native/agent-pty/LICENSE-creack-pty.txt` 随包交付。 |
| `golang.org/x/term v0.46.0` | BSD-3-Clause，提交 `6226200ed12cba417a9d9e799c2a7179d3fc0e27`。 [固定来源](https://go.googlesource.com/term/+/6226200ed12cba417a9d9e799c2a7179d3fc0e27) | Linux Agent helper 复用 `IsTerminal`、`MakeRaw`、`Restore`，未改上游模块；`LICENSE-x-term.txt` 与 `PATENTS-x-term.txt` 随包交付。Linux 构建另复用已锁定的 x/sys Unix 接口，实际 Go 工具链由构建日志及 `go version -m` 记录，本轮为 Go 1.27.1，许可和专利文件已与本机工具链逐字节比对一致。 |
| `react-grid-layout@2.3.0` | Samuel Reed，MIT。npm gitHead `9b01a614bcdd13e7e921cf3f4b1c7e77942421c1`，本地审查 pin `ec4ab79c97448947b04601c2237b2861d94a0fcb`，实际安装摘要由根锁文件固定。 [发布包](https://registry.npmjs.org/react-grid-layout/-/react-grid-layout-2.3.0.tgz) | Desktop 与独立 Web 的看板直接使用原包装配 `GridLayout`、容器测量、格点约束及样式。Huhu 负责草稿、空位和碰撞策略，不复制 RGL 源码。 |

### react-grid-layout 2.3.0 许可证

```text
The MIT License (MIT)

Copyright (c) 2016 Samuel Reed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 黄金往返测试夹具

- Open Knowledge 固定在 `44a2e0a`（Inkeep，GPL-3.0-or-later）。`packages/editor/test/golden-roundtrip.test.ts` 直接从对应的 vendor 目录 `packages/editor/src/vendor/open-knowledge/core/src/markdown/fixtures/` 读取，目录映射到上游 `packages/core/src/markdown/fixtures/`。该目录有 10 个 Markdown 数据文件、6 个 JSON 数据文件、4 个 `.gitkeep` 和 2 个 TypeScript 管理文件。6 个 JSON 文件按 `markdown`、`input`、`source`、`blockForm`、`inlineForm` 展开共 109 个 Markdown 样本。数据文件与原测试副本逐字节一致。原项目许可证保留在 vendor 的 `LICENSE`。
- Huhu 的三份文本样本位于 `packages/editor/test/fixtures/golden/huhu/`。加密 PDF 是 Huhu 本地合成的测试夹具，位于 `tests/fixtures/password-protected.pdf`。使用本地单页 PDF 作输入，执行 `gs -q -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dEncryptionR=3 -dKeyLength=128 -sOwnerPassword=owner-fixture -sUserPassword=reader-fixture -sOutputFile=tests/fixtures/password-protected.pdf input.pdf`。

## 知识库移植的文件级来源

- R-43 至 R-45 的 ORCA 文件和 R-46 至 R-51 与 R-71 的 OK vendor 文件按固定上游路径查询[逐文件清单与重放命令](../../.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/source-file-catalog.md)。
- 初始依赖闭包保留在[归档 closure-manifest.json](ok-parity/closure-manifest.json)。R-50 另见归档的 [vendor 测试结果](../../.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/verification/vendor-test-results.md)。
