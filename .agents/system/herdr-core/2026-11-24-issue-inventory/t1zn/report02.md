# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1zn
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/task02.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/report02.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/ 下的 040-s2.md、041-s3.md、042-s4.md、090-s5.md、099-s6.md，Lead 负责回写
- 执行结果 — done，交回已验证切片及下列未覆盖项

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，开工按派发从 `bcd65ea1` 快进到 `8a836003`。交回 `592f7ed93da84b76dc867a9c1c39fa5424df08fd`，共 10 个提交，每个提交有 `Refs: #7`，工作树干净。运行结果通过终端交回，无强制附件。

### 渲染进程边界

- 提交 `9de3c1e7`。SSH UI 的认证用途及导入约束移入 `shared`，对 Engine 定义保留显式类型导入。盘点同时发现邮件 UI 的预设和转发上下文值依赖，移入邮件的 `shared` 后对全部插件启用同一 Oxlint 相对路径规则。规则拦截静态值导入和再导出，允许同插件的 `import type`。
- `node scripts/check-lint-rules.mjs` 通过，SSH 导入单文件 11/11，SSH 与邮件包 typecheck 通过。实际 Electron 启动由下列定向用例复验。

### 041-s3 · A05 新增分栏

- 提交 `7d445f7b`。原 E2E 已出现新增端点的首次信任按钮，排除夹具预置信任缺失。定向 Engine 回环证明新端点能接受其自己的确认，原分栏 Shell 和连接继续存活。渲染侧在布局保存和列表校对完成后允许确认，并将新增分栏设为活动分栏。原 trace 缺实际确认请求，点击时序为推断，需 Lead 复跑确认。
- 定向 Engine 用例 `workbench dynamic split gives the new SSH host its own trust prompt` 1/1。E2E 现直接断言 `ssh.hostKey.decide` 返回 `applied: true`。
- Lead 复跑 `tests/e2e/workflows/ssh-workspaces.spec.ts` 的「A05 adding a split opens only the new host and keeps the original pane session」。

### 042-s4 · H7.2/H7.3 回归与 A07/A09 文件

- H7.2 `f53f024f`。运行中取消先返回 `cancelling`，清理完成后才释放队列名额并返回 `cancelled`。E2E 按任务 ID 轮询终态与名额。定向夹具在 SFTP 暂存后取消，回读确认旧目标未变且临时文件已清除，单文件 8/8。
- H7.3 `4643fd98`。本机文件的 `mtimeMs` 带小数，Python 的浮点整除结果不能编码为 ZIP 扩展时间戳整数。增加带小数毫秒的本机目录压缩、清单和解压复现。修复前出现同一条「Linux ZIP 压缩失败」，修复后 1/1，并保留 SFTP 内容、时间戳与拒绝链接校验。
- A07 `385428bb`。桌面文件双栏可按设备偏好在主工作台或原生窗口打开，窗口 IPC 校验原 Vault，固定打开时的文件会话 ID。Web 提供同源新标签链接，独立导航绑定同一会话。关闭窗口保留原 SSH 和已建文件会话。沿用 HUHU 既有的主工作台默认值，设置可改为独立窗口。
- A09 `d22a9839`。SFTP 不可用时探测绑定端点的 SCP 双向能力，上传使用真实 `scp -t` 接收，先在远端私有目录暂存并核对字节数，再用无覆盖硬链接提交。回环单文件用例 1/1，检查引号文件名、字节回读、同名冲突保全、暂存清理与一条原 SSH 连接。文件 sudo 使用原会话的免交互 `sudo -n` 启动系统 OpenSSH sftp-server，按真实 SFTP 握手判定支持。在单独的桌面文件操作区提供浏览、读文本和按版本写回，退出取消该区查询，并保留原 Shell 权限。真实回环打开并写回了 root 所有、权限 0600 的文件，原 UID 和权限保留，用例 1/1。第二端点的 sudo 拒绝返回不可用。
- Lead 复跑 `tests/e2e/workflows/ssh-workspaces.spec.ts` 的「H7.2 两个回环端点按前缀续传、暂停和继续，前缀失配保留原目标」和「H7.3 ZIP 探测报告本机支持状态，支持时验证原设备的归档内容和错误」。
- Lead 复跑 `tests/e2e/ssh/file-properties.spec.ts` 的「A07 外置原生文件窗口保留打开时的分栏并在关闭后保留 SSH」「A07 独立 Web 文件会话按路径前进和返回，保留桌面来源与原连接」「A09 desktop transfers a single file in both directions when SFTP is unavailable」「A09 desktop sudo SFTP edits an actual root-owned file and leaves the shell connected」。

### 090-s5 · A11 监控与工具

- 提交 `f21d277f`。原生服务器工具窗口绑定 Vault、主机和 Shell，重复开启聚焦同一窗口，切换活动标签仍查询原主机。监控 sudo 与工具 sudo 各自生效，采样源按原连接和权限分开，避免 sudo 样本进入未提权视图。使用固定 Linux 查询命令，免交互 sudo 不可用时显示失败原因。
- `monitor.engine.test.ts` 5/5，包含原端点作用域、普通与 sudo 采样隔离、Linux procfs、Windows 夹具及既有最快采样复用。未运行真实 Windows。Linux 主机的默认 Docker socket 可访问（`docker info` 返回 29.8.2），已写真实 Docker 查询的 Lead E2E。
- Lead 复跑 `tests/e2e/ssh/monitoring.spec.ts` 的「A11 native server tools keep the original shell and query the actual Docker socket」。该用例缺 Docker CLI 或默认 socket 不可用时会跳过，原 SSH 夹具仅放行受测固定只读命令。

### 099-s6 · A12 设置与目录回归

- 提交 `cd0d1f91`。设备导航显隐可搜索、保存和恢复默认。库内自动重连在非主动断开后，按同一主机、跳板、代理修订尝试一次，默认关闭。原 Shell 与文件会话保留已结束状态，避免把既有文件动作切向新传输。录制可阻止新录制并在下一次保存时执行保存条数限制，默认允许且 60 条。已开始录制仍可保存。独立窗口模式随设备设置在下一次打开时生效。
- `preferences.engine.test.ts` 2/2，实测关闭后自动新建传输、原 Shell 已结束、旧录制清理与停用后拒绝录制。设备偏好单文件 8/8。
- 提交 `592f7ed9`。设置验证触及 task01 遗留的精确目录断言遗漏 `ssh.routes.edit`。同步既有开放目录，并新增 SCP 上传和 sudo 文件调用拒绝外部开放的断言。CLI/MCP 单文件 2/2。
- Lead 复跑 `tests/e2e/ssh/settings.spec.ts` 的「A12 SSH navigation and recording settings apply to their own UI and can be restored」。

### 040-s2 · A01 认证

- 提交 `7d756ddf`。保留 ssh2 原生 PuTTY v2 RSA/DSA 分支，补充 v2 的现代密钥类型和 v3 解析。用 Node 的 Argon2/AES 与 HMAC 验证 PPK，经既有 ssh2 密钥签名器拨号，原件与口令留在 SSH 的 ModuleCredentials 流程。主机粘贴／身份文件和密钥库入口共用适配。测试涵盖 PPK v2/v3 回环拨号、错误口令、篡改 MAC、v3 RSA 公钥、加密 OpenSSH 私钥、真实隔离 ssh-agent，以及同一轮多问题和后续一轮的过期回答隔离。认证单文件 8/8。
- Lead 复跑 `tests/e2e/ssh/trust.spec.ts` 的「A01 PuTTY v2, encrypted PuTTY v3 and OpenSSH keys connect after desktop trust」「A01 desktop SSH agent authenticates with its isolated system socket」「A01 desktop answers a multi-question challenge and a second SSH authentication round」。Agent 用例需 Linux 的 ssh-agent、ssh-add 和 ssh-keygen。
- PPK 格式依据 [PuTTY Appendix C](https://www.puttyssh.org/0.83/htmldoc/AppendixC.html)，同时参照本机 `temp/sources/motty/internal/ppk`、`internal/scpclient`、`internal/sftpclient` 及实际锁定的 ssh2 1.17.0。

### 验证命令

下列均在本检出串行执行，持 Lead 指定的 `verify.lock`，一次一个测试文件。

- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/host-import.test.ts` — 11/11。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/archives.test.ts` — 修复前 0/1，修复后 1/1。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/transfer-publication.test.ts` — 8/8。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'workbench dynamic split'` — 1/1。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/scp-download.test.ts` — 1/1，实际 OpenSSH SCP。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'privileged SFTP'` — 1/1，实际 sudo sftp-server。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/monitor.engine.test.ts` — 5/5。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/preferences.engine.test.ts` — 2/2。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` — 8/8。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/host-auth.engine.test.ts` — 8/8，真实 ssh-agent 通过。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/domain-exposure.engine.test.ts` — 修补目录断言后 2/2。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-ssh run typecheck` — 0 错误。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/desktop run typecheck` — 0 错误。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --filter @huhu/plugin-mail run typecheck` — 0 错误。
- `node scripts/check-lint-rules.mjs` 通过。最终 `git diff --check 8a836003 HEAD` 通过。6 个改动的 E2E spec 使用 TypeScript 语法解析检查，0 个语法诊断。

### 逐提交改动路径

#### `9de3c1e7` fix(plugins): keep renderer value imports out of engines

- `oxlint.json`
- `plugins/mail/src/engine/account-definition.ts`
- `plugins/mail/src/engine/accounts.ts`
- `plugins/mail/src/engine/ai-settings.ts`
- `plugins/mail/src/engine/discovery.ts`
- `plugins/mail/src/engine/draft-content.ts`
- `plugins/mail/src/engine/drafts.ts`
- `plugins/mail/src/engine/index.ts`
- `plugins/mail/src/engine/message-cache.ts`
- `plugins/mail/src/engine/oauth-provider.ts`
- `plugins/mail/src/engine/prepare-forward.ts`
- `plugins/mail/src/engine/prepare-reply.ts`
- `plugins/mail/src/engine/public-mail.ts`
- `plugins/mail/src/engine/read-overrides.ts`
- `plugins/mail/src/engine/smtp.ts`
- `plugins/mail/src/engine/forward-context.ts` → `plugins/mail/src/shared/forward-context.ts`（移动）
- `plugins/mail/src/engine/presets.ts` → `plugins/mail/src/shared/presets.ts`（移动）
- `plugins/mail/src/engine/reply-context.ts` → `plugins/mail/src/shared/reply-context.ts`（移动）
- `plugins/mail/src/ui/MailAccountDialog.tsx`
- `plugins/mail/src/ui/MailComposer.tsx`
- `plugins/mail/src/ui/MailModule.tsx`
- `plugins/ssh/src/engine/auth-profile.ts`
- `plugins/ssh/src/engine/host-configurations.ts`
- `plugins/ssh/src/engine/import/capability.ts`
- `plugins/ssh/src/engine/import/input.ts`
- `plugins/ssh/src/engine/import/preview.ts`
- `plugins/ssh/src/engine/public-resources.ts`
- `plugins/ssh/src/shared/host-auth.ts`
- `plugins/ssh/src/shared/host-import.ts`
- `plugins/ssh/src/ui/HostEditorDialog.tsx`
- `plugins/ssh/src/ui/HostImportDialog.tsx`
- `plugins/ssh/src/ui/host-record.ts`
- `plugins/ssh/test/host-import.test.ts`
- `scripts/check-lint-rules.mjs`

#### `4643fd98` fix(ssh): encode native Linux ZIP timestamps as integers (H7.3)

- `plugins/ssh/src/engine/linux-zip.ts`
- `plugins/ssh/test/archives.test.ts`

#### `f53f024f` test(ssh): verify cancelling transfers reach a clean terminal state (H7.2)

- `plugins/ssh/src/engine/capabilities.ts`
- `plugins/ssh/test/transfer-publication.test.ts`
- `tests/e2e/workflows/ssh-workspaces.spec.ts`

#### `7d445f7b` fix(ssh): settle an added pane before its trust action (A05)

- `plugins/ssh/src/ui/WorkspaceRunView.tsx`
- `plugins/ssh/test/public-resources.engine.test.ts`
- `tests/e2e/workflows/ssh-workspaces.spec.ts`

#### `385428bb` feat(ssh): open file sessions in a bound native window or browser tab (A07)

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/workbench.tsx`
- `plugins/ssh/src/shared/file-window.ts`
- `plugins/ssh/src/shared/index.ts`
- `plugins/ssh/src/ui/FileWorkspace.tsx`
- `plugins/ssh/src/ui/SshModule.tsx`
- `plugins/ssh/src/ui/SshSettingsPage.tsx`
- `plugins/ssh/src/ui/WorkspaceLibrary.tsx`
- `plugins/ssh/src/ui/WorkspaceRunView.tsx`
- `plugins/ssh/src/ui/device-preferences.ts`
- `plugins/ssh/src/ui/files.css`
- `plugins/ssh/src/ui/index.tsx`
- `tests/e2e/ssh/file-properties.spec.ts`

#### `d22a9839` feat(ssh): add SCP upload fallback and scoped sudo SFTP (A09)

- `plugins/ssh/src/engine/capabilities.ts`
- `plugins/ssh/src/engine/file-sessions.ts`
- `plugins/ssh/src/engine/index.ts`
- `plugins/ssh/src/engine/manager.ts`
- `plugins/ssh/src/engine/privileged-file-capabilities.ts`
- `plugins/ssh/src/engine/privileged-sftp.ts`
- `plugins/ssh/src/engine/scp-capabilities.ts`
- `plugins/ssh/src/engine/scp-download.ts`
- `plugins/ssh/src/ui/FilesPanel.tsx`
- `plugins/ssh/src/ui/RemoteTextEditor.tsx`
- `plugins/ssh/src/ui/ScpDownloadPanel.tsx`
- `plugins/ssh/src/ui/SudoFiles.tsx`
- `plugins/ssh/test/public-resources.engine.test.ts`
- `plugins/ssh/test/scp-download.test.ts`
- `tests/e2e/ssh/file-properties.spec.ts`

#### `f21d277f` feat(ssh): scope monitor sudo and pin native server tools (A11)

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/env.d.ts`
- `apps/desktop/src/renderer/workbench.tsx`
- `plugins/ssh/src/engine/monitor-sample.ts`
- `plugins/ssh/src/engine/monitor-tools.ts`
- `plugins/ssh/src/engine/monitors.ts`
- `plugins/ssh/src/shared/index.ts`
- `plugins/ssh/src/shared/monitoring.ts`
- `plugins/ssh/src/shared/tool-window.ts`
- `plugins/ssh/src/ui/MonitorSidebar.tsx`
- `plugins/ssh/src/ui/MonitorTools.tsx`
- `plugins/ssh/src/ui/index.tsx`
- `plugins/ssh/test/monitor.engine.test.ts`
- `tests/e2e/ssh/monitoring.spec.ts`

#### `cd0d1f91` feat(ssh): apply reconnect, recording, and navigation preferences (A12)

- `plugins/ssh/src/engine/index.ts`
- `plugins/ssh/src/engine/manager.ts`
- `plugins/ssh/src/engine/terminal-recordings.ts`
- `plugins/ssh/src/shared/preferences.ts`
- `plugins/ssh/src/ui/SshModule.tsx`
- `plugins/ssh/src/ui/SshSettingsPage.tsx`
- `plugins/ssh/src/ui/SshVaultSettings.tsx`
- `plugins/ssh/src/ui/TerminalRecordings.tsx`
- `plugins/ssh/src/ui/device-preferences.ts`
- `plugins/ssh/test/preferences.engine.test.ts`
- `tests/e2e/ssh/file-properties.spec.ts`
- `tests/e2e/ssh/settings.spec.ts`

#### `7d756ddf` feat(ssh): authenticate PuTTY keys and verify agent and multi-round login (A01)

- `plugins/ssh/src/engine/host-configurations.ts`
- `plugins/ssh/src/engine/key-library.ts`
- `plugins/ssh/src/engine/putty-key.ts`
- `plugins/ssh/test/fake-server.ts`
- `plugins/ssh/test/host-auth.engine.test.ts`
- `plugins/ssh/test/key-auth-fixture.ts`
- `tests/e2e/ssh/host-records.spec.ts`
- `tests/e2e/ssh/trust.spec.ts`

#### `592f7ed9` test(ssh): keep gateway coverage aligned with routes and file tools (S6)

- `plugins/ssh/test/domain-exposure.engine.test.ts`

## 阻碍与接续

- A12 的同主机新终端共享策略仍缺关闭复用选项。当前工作台连接按主机索引，而文件、监控、自动重连和鉴权依赖原连接 ID。关闭复用需要按分栏维护独立传输与待答信任记录，并迁移这些调用路径。
- A07 Web 新标签可操作已绑定的远端文件会话，本机目录选择保留桌面专用方式。桌面从终端附属面板打开独立双栏；从断开主机直接取得独立连接仍待实现。
- A09 sudo 切片覆盖免交互系统 sftp-server 的目录浏览和 UTF-8 文本读写。提权的完整文件动作、批量队列和口令交互未覆盖。SCP 回退支持桌面单文件，无覆盖提交依赖兼容 `ln -T` 的远端文件系统。
- A11 的 sudo 开关覆盖分栏采样和工具查询，仪表盘逐主机 sudo 与进程终止、Docker 日志/容器终端仍待实现。
- A01 未实测 PuTTYgen 导出的真实外部样本和各种硬件或系统 Agent。Ed448 未接入，OpenSSH 真实 Agent 验证为本机独立回环。
- worker 未运行任何 Playwright、打包、构建、全仓验证或截图。真实 Docker 工具界面、Electron 原生窗口和独立 Web 待 Lead 验收。真实 Zsh（本机未安装）、真实外部 SSH、Windows 与 macOS 未验。其他原票中超出 task02 派发切片的验收条件仍由 Lead 查阅既有证据。
- 本机检查时约 26 GiB 可用内存，仓库、临时目录、缓存和回执同盘约 140 GiB 可用，磁盘 51%，inode 15%。本任务的验证与独立 ssh-agent 已退出。本次复用 `inv-w2` 与 worker `t1zn`，保留供 Lead 验收和回收。

### Modern Web Guidance

- `forms` 用显式 `htmlFor` 和控件 ID 关联 sudo 路径、上传目标和设置值，遵循 “always associate `<label>` with its input using `for` and `id`”。
- `accessibility` 用 `aria-pressed` 反映监控和工具各自的 sudo 开关，遵循 “Utilize aria-expanded and aria-pressed to communicate toggle states”。

## Lead 验收

