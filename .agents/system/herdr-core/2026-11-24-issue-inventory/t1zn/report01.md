# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1zn
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 040-s2.md、041-s3.md、042-s4.md、090-s5.md、099-s6.md，由 Lead 验收更新
- 执行结果 — done。本批已实施的切片全部提交，各票剩余项见下文。

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，起点 `10b8c46c`，交回 `bcd65ea10f93a99d59cd3e198a3d2e6d8a22ab90`。工作树干净，16 个提交均带 `Refs: #7`。

定向验证命令均使用前缀 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1`，一次运行一个测试文件或一个包。检出首次的 `pnpm --filter "./vendor/*" run build:types` 通过。按改动逐包执行的 `pnpm --filter <包名> run typecheck` 覆盖 `@huhu/plugin-ssh`、`@huhu/desktop`、`@huhu/kernel`、`@huhu/ui`，均为 0 错误。提交范围的 `git diff --check 10b8c46c..HEAD` 通过。TypeScript 对 6 个改动的 Playwright spec 做了语法解析，0 诊断。桌面实际捆绑 Electron 44.9.1 和 Chromium 152.0.7977.167。

### 040-s2 主机、路由与连接

- 提交 `a366db04`、`719a828d`、`ac27be9f`、`bcf90b98`、`bcd65ea1`。
- 复用 `45b9fae3` 的受限执行器。本机 ProxyCommand 使用绝对程序路径与分开的 argv。设备批准绑定保存主机及整条路由修订，参数按实际第一跳展开。修改或撤销批准会关闭该批准启动的连接。导入配置仍不会启动本机程序，远程工具入口拒绝使用设备批准的程序。桌面首跳预览与实际跳点记录显示 ProxyCommand。
- 路由页可按直接跳板选择 ViaShell。中继通过独立的非 PTY POSIX Shell 运行 `nc`，处理启动标记、同包余字节、超时、取消、独立逐跳握手和通道回收。OpenSSH 同步明确标明该边无法表示为 ProxyJump。
- 桌面主机目录及主机页支持 `user@host[:port]` 和方括号 IPv6 的快速连接。沿用指纹确认、密码或本机 Agent、原有交互认证及终端桥接。目标与密码不进入主机目录或持久请求回执，关闭临时视图或 Shell 退出后回收。用户仍可在指纹对话框显式保存主机信任。
- `pnpm exec vitest run plugins/ssh/test/proxy-command.test.ts` 16/16 通过。最终候选 `pnpm exec vitest run plugins/ssh/test/manager.test.ts` 30/30 通过，覆盖真实首跳进程与两跳 SSH 握手、旧批准失效、撤销关闭、ViaShell 超时/取消及临时连接回收。
- 请 Lead 运行 `tests/e2e/ssh/trust.spec.ts` 中的 `A03 desktop approves the first-hop ProxyCommand and revokes its live connection`、`A03 route editor selects ViaShell and authenticates the target over the dedicated channel`、`A01 quick connection opens and reclaims a terminal without saving the target`。
- 剩余项包括原生 PTY 且需账号切换前置命令的 ViaShell 堡垒机、可配置中继命令、高级认证，以及 A21 的 Safe 三态整体验收。真实外部多跳主机未验证。

- 改动文件

  - `plugins/ssh/src/engine/auth-profile.ts`
  - `plugins/ssh/src/engine/authentication-capability.ts`
  - `plugins/ssh/src/engine/capabilities.ts`
  - `plugins/ssh/src/engine/config-sync.ts`
  - `plugins/ssh/src/engine/device-proxies.ts`
  - `plugins/ssh/src/engine/device-proxy-capabilities.ts`
  - `plugins/ssh/src/engine/draft-connection.ts`
  - `plugins/ssh/src/engine/host-configurations.ts`
  - `plugins/ssh/src/engine/hosts.ts`
  - `plugins/ssh/src/engine/index.ts`
  - `plugins/ssh/src/engine/manager.ts`
  - `plugins/ssh/src/engine/outbound-proxy-capabilities.ts`
  - `plugins/ssh/src/engine/proxy-command.ts`
  - `plugins/ssh/src/engine/quick-connection-capabilities.ts`
  - `plugins/ssh/src/engine/shell-relay.ts`
  - `plugins/ssh/src/engine/workspace-target.ts`
  - `plugins/ssh/src/shared/config-sync.ts`
  - `plugins/ssh/src/shared/outbound-proxy.ts`
  - `plugins/ssh/src/shared/quick-connection.ts`
  - `plugins/ssh/src/shared/trust.ts`
  - `plugins/ssh/src/ui/ConfigSyncPanel.tsx`
  - `plugins/ssh/src/ui/DeviceProxyCommand.tsx`
  - `plugins/ssh/src/ui/HostDirectory.tsx`
  - `plugins/ssh/src/ui/QuickConnectionDialog.tsx`
  - `plugins/ssh/src/ui/RoutePanel.tsx`
  - `plugins/ssh/src/ui/SshModule.tsx`
  - `plugins/ssh/test/fake-server.ts`
  - `plugins/ssh/test/manager.test.ts`
  - `plugins/ssh/test/proxy-command.test.ts`
  - `plugins/ssh/test/shell-relay-fixture.ts`
  - `tests/e2e/ssh/trust.spec.ts`

### 041-s3 工作区与终端

- 提交 `6998755f`、`e479377e`、`a8bb19c3`、`1edd3ca0`。
- 运行中的自定义分隔线可拖动，也可用方向键及 Home/End 调节。松手按开始时的布局版本持久化，Escape 或指针取消丢弃预览。分割树的比例调整保留现有 Pane 和 Shell ID。新增分栏选择尚未使用的 SSH 主机，先保存树和绑定，再启动新分栏。
- 标签菜单支持通过更多按钮、右键及 Shift+F10 打开，可重命名、锁定输入、交换标签、关闭当前、关闭其他与关闭右侧/下方标签。批量关闭在一个布局修订中提交，保留分栏沿用原会话。标签关闭的外部工作区回归走同一个编辑器。
- 终端使用 xterm 活动缓冲区查找前后匹配，支持回滚、宽字符和软折行。HTTP/HTTPS 文本链接和 OSC 8 由同一终端处理，桌面复用既有宿主外链确认。
- `pnpm exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` 8/8 通过。`pnpm exec vitest run plugins/ssh/test/workspace-pane-edits.test.ts` 1/1 通过。`pnpm exec vitest run packages/ui/test/terminal-content.test.ts` 2/2 通过。`pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'changes only the owned SSH workspace layout'` 2 个选定用例通过。
- 请 Lead 运行 `tests/e2e/workflows/ssh-workspaces.spec.ts` 中的 `A06 dragging and keyboard resizing a running workspace retain the original shells`、`A05 adding a split opens only the new host and keeps the original pane session`、`A06 live SSH scrollback search and terminal links use the same shell`、`A06 workspace tab actions rename and close neighboring tabs without replacing retained shells`。
- 标签复制、标签级重连/断开、移至新窗口和跨窗口交接仍需实施。真实全屏、中文 IME 及窗口切换后的焦点回归仍需 Lead 验证。

- 改动文件

  - `packages/ui/src/components/TerminalView.tsx`
  - `packages/ui/src/components/terminal-content.ts`
  - `packages/ui/src/styles/base.css`
  - `packages/ui/test/terminal-content.test.ts`
  - `plugins/ssh/src/engine/public-workspaces.ts`
  - `plugins/ssh/src/engine/workspace-pane-capability.ts`
  - `plugins/ssh/src/engine/workspace-runs.ts`
  - `plugins/ssh/src/shared/workspace.ts`
  - `plugins/ssh/src/ui/SshTerminal.tsx`
  - `plugins/ssh/src/ui/WorkspaceCanvas.tsx`
  - `plugins/ssh/src/ui/WorkspaceLibrary.tsx`
  - `plugins/ssh/src/ui/WorkspaceRunView.tsx`
  - `plugins/ssh/src/ui/ssh.css`
  - `plugins/ssh/test/workspace-device-layout.test.ts`
  - `plugins/ssh/test/workspace-pane-edits.test.ts`
  - `tests/e2e/workflows/ssh-workspaces.spec.ts`

### 042-s4 文件与传输

- 提交 `65da66e4`、`c3eaabc9`、`24c332c5`、`cd726452`。
- Linux 桌面探测 `/usr/bin/python3` 的 ZIP 组件，复用归档任务的暂存与发布流程。压缩、清单及解压使用真实 ZIP，覆盖 Unicode、哈希、秒级时间戳、路径与文件类型校验。SFTP 缺失时桌面从原已验证 SSH 连接探测 SCP，并开放显式单文件下载。校验协议文件名、长度、结束状态和原连接代，用独占暂存和无覆盖发布保护本机目标。
- 外部编辑器走桌面文件选择器和系统 .txt 关联程序。用户选中的本机副本在关闭编辑视图后仍可保留。读回副本后，现有远端编辑提交使用原文件会话、版本检查及权限/属主保留流程。该方式可处理外部编辑器无法重建的私有路由。
- `pnpm exec vitest run plugins/ssh/test/archives.test.ts` 1/1 通过，包含真实回环 SFTP 的 ZIP 往返、目标冲突和拒绝链接条目。`pnpm exec vitest run plugins/ssh/test/scp-download.test.ts` 1/1 通过，包含真实 OpenSSH SCP 二进制数据、重名、异常协议文件名与原会话关闭。`pnpm exec vitest run apps/desktop/test/ssh-external-editor.test.ts` 2/2 通过，包含窗口授权归属、原子保存后回读、超限、无效 UTF-8 和链接替换。
- 请 Lead 运行 `tests/e2e/ssh/file-properties.spec.ts` 中的 `A09 desktop offers verified SCP single-file download when SFTP is unavailable`、`A09 external editor copies text locally and writes back through the original SFTP revision`、`A08 Linux desktop creates, lists and extracts a ZIP over the bound SFTP connection`。另跑 `tests/e2e/workflows/ssh-workspaces.spec.ts` 中的 `H7.3 ZIP 探测报告本机支持状态，支持时验证原设备的归档内容和错误`。
- 剩余项包括 SCP 上传、独立文件 sudo 和原生 SFTP 窗口。系统关联编辑器的真实启动与回写尚未运行。执行 `command -v zsh` 未找到 Zsh，未增加或执行真实 Zsh 目录跟随用例。

- 改动文件

  - `apps/desktop/src/main/index.ts`
  - `apps/desktop/src/main/ssh-external-editor.ts`
  - `apps/desktop/src/preload/index.ts`
  - `apps/desktop/src/renderer/env.d.ts`
  - `apps/desktop/test/ssh-external-editor.test.ts`
  - `plugins/ssh/src/engine/archives.ts`
  - `plugins/ssh/src/engine/capabilities.ts`
  - `plugins/ssh/src/engine/index.ts`
  - `plugins/ssh/src/engine/linux-zip.ts`
  - `plugins/ssh/src/engine/manager.ts`
  - `plugins/ssh/src/engine/native-zip.ts`
  - `plugins/ssh/src/engine/proxy-share.ts`
  - `plugins/ssh/src/engine/public-archives.ts`
  - `plugins/ssh/src/engine/scp-capabilities.ts`
  - `plugins/ssh/src/engine/scp-download.ts`
  - `plugins/ssh/src/engine/sftp.ts`
  - `plugins/ssh/src/engine/windows-zip.ts`
  - `plugins/ssh/src/shared/external-editor.ts`
  - `plugins/ssh/src/shared/index.ts`
  - `plugins/ssh/src/ui/FilesPanel.tsx`
  - `plugins/ssh/src/ui/RemoteTextEditor.tsx`
  - `plugins/ssh/src/ui/ScpDownloadPanel.tsx`
  - `plugins/ssh/test/archives.test.ts`
  - `plugins/ssh/test/scp-download.test.ts`
  - `plugins/ssh/test/shell-relay-fixture.ts`
  - `tests/e2e/ssh/file-properties.spec.ts`
  - `tests/e2e/workflows/ssh-workspaces.spec.ts`

### 090-s5 转发与监控

- 提交 `3ec5d015`。
- Local、SOCKS5 和 HTTP CONNECT 可显式选择 ViaShell 出口，Remote 模式拒绝保存该组合。独立非 PTY 通道运行 SSH 主机上的 Python 3.8+ 中继。目的 TCP 建立后才确认就绪，取消或停止时回收该通道。
- 最终候选 `pnpm exec vitest run plugins/ssh/test/forwarding.engine.test.ts` 5/5 通过。新用例在真实 POSIX Shell 与 TCP echo 之间校验三个模式的二进制流、HTTP 目的端拒绝、未请求 direct-tcpip 与资源回收。
- 请 Lead 运行 `tests/e2e/ssh/forwarding.spec.ts` 中的 `P07 Workbench ViaShell confirms a TCP exit and cannot be selected for Remote` 和现有 `A10 Workbench forwards bytes in all four modes and releases each loopback listener`。
- A11 仍需独立监控/工具窗口、监控和工具 sudo、真实 Docker 与指标覆盖。本机有 Docker socket，本回合未启动真实 Docker 工具或验证远端设备。

- 改动文件

  - `plugins/ssh/src/engine/forward-listener.ts`
  - `plugins/ssh/src/engine/shell-relay.ts`
  - `plugins/ssh/src/shared/forwarding.ts`
  - `plugins/ssh/src/ui/ForwardingPanel.tsx`
  - `plugins/ssh/test/forwarding.engine.test.ts`
  - `plugins/ssh/test/shell-relay-fixture.ts`
  - `tests/e2e/ssh/forwarding.spec.ts`

### 099-s6 设置与公共能力

- 提交 `7cd14308`、`ddbadefa`。
- 增加设备本地的 xterm 选词分隔符与链接开关，支持搜索、取消修改、恢复默认及实时生效。路由编辑使用统一的公共描述符和 Dispatcher，默认关闭。CLI／HTTP MCP 要求目标、旧链和将启用的跳板链授权及绑定版本，提交边界复核当前授权，复用意图回执和已建立外部连接的路由失效处理。
- `pnpm exec vitest run plugins/ssh/test/route-edits.test.ts` 9/9 通过。`pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'edits SSH routes'` 4 个选定用例通过，覆盖 CLI 与 HTTP MCP 的关联、启停、拒绝未经授权跳板、重放、旧路由失效及发布前撤权。`pnpm exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` 8/8 通过。
- 请 Lead 运行 `tests/e2e/ssh/entry-parity.spec.ts` 中的 `CLI manages SSH authentication, transfers and versioned route edits` 与 `HTTP MCP manages SSH authentication, transfers and versioned route edits`，并运行 `tests/e2e/ssh/settings.spec.ts` 中的 `SSH preferences apply to workspace, terminal, file views and transfer queue`。
- 仍缺部分 A12 设置，包括自动重连、共享连接策略、录制和历史策略、导航显隐及独立文件窗口。新增分栏目前走工作台入口，外部工作区仍按原主体与代次提供布局、重命名及关闭。A14 全能力目录与 #12/#17 联动、提交回执结果未知故障注入待同候选验收。

- 改动文件

  - `packages/kernel/src/credentials/module-credentials.ts`
  - `plugins/ssh/src/engine/capabilities.ts`
  - `plugins/ssh/src/engine/host-configurations.ts`
  - `plugins/ssh/src/engine/index.ts`
  - `plugins/ssh/src/engine/public-resources.ts`
  - `plugins/ssh/src/engine/route-edits.ts`
  - `plugins/ssh/src/ui/SshSettingsPage.tsx`
  - `plugins/ssh/src/ui/SshTerminal.tsx`
  - `plugins/ssh/src/ui/device-preferences.ts`
  - `plugins/ssh/test/public-resources.engine.test.ts`
  - `plugins/ssh/test/route-edits.test.ts`
  - `plugins/ssh/test/workspace-device-layout.test.ts`
  - `tests/e2e/ssh/entry-parity.spec.ts`
  - `tests/e2e/ssh/settings.spec.ts`

## 阻碍与接续

- 按派发约定，worker 未运行 Playwright、视觉取证、全量单测、全仓检查、构建或打包。独立 Web、真实远端、系统编辑器、真实 Docker、原生窗口及组合验收未验证。
- 回环测试使用此机器的 POSIX Shell、OpenSSH `scp`、系统 Python 和 SSH 夹具。设备批准、认证或换 Vault 的跨进程场景仍需对应 Lead 用例。测试原件观察已从 Core 终端回读，派发无强制附件。
- 业务票据与验收文件均由 Lead 持有。worker 自建的临时验证终端已回收，工作检出由 Lead 在验收后据清单处理。

### Modern Web Guidance

- **`forms`** 我对含一次性密码、代理批准与文件变更的表单使用 POST 语义与显式提交按钮，按 “use method POST for sensitive data and mutations” 处理。
- **`dialog`** 我沿用带标题的原生对话框包装，应用 “name every dialog with aria-labelledby pointing at its heading”。
- **`drag`** 我把指针捕获与禁止选字限定在单独的分隔线。分隔线也接受键盘操作，按 “Start dragging from a dedicated handle” 实现。 [W3C Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)
- **`accessibility`** 我让快速连接输入以 `aria-describedby` 关联持久的目标格式提示，应用 “Link hints to inputs via aria-describedby”。
- **`tabs`** 我用可见标签为面板命名，并沿用当前标签的键盘焦点，依据 “use aria-labelledby or aria-label to give the panel an accessible name”。
- **`ime-safe-enter-submit`** 我在终端搜索的自定义 Shift+Enter 操作前检查合成状态，遵循 “check the native isComposing property” 和 Safari 的 `229` 回退建议。

## Lead 验收
