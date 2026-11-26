# 派发回执

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory`
- terminal_address — `t1zn`，本机默认 Core
- task — `task03.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/task03.md`
- 回执文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1zn/report03.md`
- 工作目录 — `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{041-s3,042-s4,090-s5,099-s6,105-s7}.md`
- 执行结果 — **done**，待 Lead 验收

## 成果与运行指针

`inv/w2` 从主线 `37b0c0e04b5e8cee2e4f62a01f3decb6e432d695` 快进后提交五项，最终提交为 `f9fc24add64d7f404534689e81fe467459ac0b1e`。五个提交均含 `Refs: #7`，工作树干净，验证结果由本回执交回。

以 #7 快照 §6–11、§13.2、§15–16 和 H12.1 为准。本地 Motty 对照了 `internal/workbench/restore_connect.go`、`internal/sshconn/sudo.go`、`internal/sftpclient/sudo.go`、`internal/remotetools/remotetools.go`。继续复用 Huhu 的 SSH 路由、ssh2、Vault 偏好、请求校验、转发和文件传输执行器。

### 041-s3 与 099-s6 · A12 同主机连接共享

提交 `724a4cf4`。当前 Vault 的连接设置增加「同主机的新终端复用 SSH 连接」，旧记录和恢复默认均为开启。关闭后，新工作区分栏和主机详情的新终端各自拨号。待答项按实际尝试和分栏查找，信任、认证及取消不影响同主机的其他连接。文件源与监控按真实连接 ID 查找。已开启自动重连时，工作区隔离分栏仅沿原路由重连一次并取得新的 Shell，旧文件会话可观察到断开。由主机详情打开的隔离终端有显式取消与继续认证，断线后可手工新开。

- Engine — `plugins/ssh/src/engine/{file-sessions,index,manager,workspace-runs}.ts`
- 共享合同及界面 — `plugins/ssh/src/shared/{preferences,trust}.ts`、`plugins/ssh/src/ui/{SshModule,SshSettingsPage,SshVaultSettings}.tsx`
- 用例 — `plugins/ssh/test/{manager.test,preferences.engine.test}.ts`、`tests/e2e/workflows/ssh-workspaces.spec.ts`
- 回环验证覆盖两个等待项的交叉提交被拒、文件与监控绑定第二条连接、关闭第一条时第二条仍可用，以及隔离分栏掉线后更换 Shell 和连接、旧文件会话断开、第二次掉线不重拨。

### 042-s4 · A07 主机直开独立文件管理

提交 `df7e3a78`。主机详情及主机目录菜单可为未连接的主机启动文件管理。使用常规 SSH 指纹和交互认证对话框，取得由该文件会话持有的连接。桌面按已有窗口偏好打开；独立 Web 可从双栏的链接打开新的浏览器标签页。显式关闭独立文件视图释放其自有连接，普通分栏来源继续采用借用语义。

- Engine — `plugins/ssh/src/engine/{capabilities,file-sessions,index,manager}.ts`
- 界面 — `plugins/ssh/src/ui/{HostDirectory,SshModule}.tsx`
- 用例 — `plugins/ssh/test/manager.test.ts`、`tests/e2e/ssh/file-properties.spec.ts`
- 回环验证从零连接开始，完成首次信任、浏览测试文件，确认没有 Shell。随后开启一条普通主机连接，关闭独立文件视图仅令其自己的 SSH 连接关闭。

### 042-s4 · A09 sudo 文件动作和传输队列

提交 `8135e0cd`。复用原 SSH 连接的提权 SFTP 执行属性与属主修改、移动或重命名、文件和空目录删除、文本编辑，以及批量上传下载。属性、移动和删除携带已读版本，删除有确认。批量继续走原传输队列的目录扫描、冲突判断与暂存发布逻辑。

免口令探测失败时可输入一次远端 sudo 口令。SSH 通道等待独立的 stderr 提示，单次写入 stdin，等远端启动标记后再发送 SFTP 二进制握手。成功后文件视图保留一个已认证的 SFTP 通道，后续操作及批次绑定该会话标识。退出、原连接关闭或操作中断导致该通道结束时，旧标识失效。口令不拼进命令，Engine 调用使用 handler 幂等策略，SSH 审计只写操作元数据。Web、MCP、CLI 的普通文件会话仍按各自已有公开权限执行。

- Engine — `plugins/ssh/src/engine/{file-sessions,manager,privileged-file-capabilities,privileged-sftp,transfers}.ts`
- 共享合同及界面 — `plugins/ssh/src/shared/transfers.ts`、`plugins/ssh/src/ui/{FilePropertiesDialog,RemoteTextEditor,SudoFiles}.tsx`
- 用例 — `plugins/ssh/test/public-resources.engine.test.ts`、`tests/e2e/ssh/file-properties.spec.ts`
- Linux 回环使用实际 OpenSSH `sftp-server`，核对 root 所有的文件权限、移动、删除、批次双向内容及根属主；一次性口令提示由 SSH 测试端生成。验证错误口令被拒、正确口令仅发一次、退出后拒绝旧会话、普通 SSH 继续在线，SSH 审计未含测试口令。

### 090-s5 · A11 仪表盘与服务器工具

提交 `a90a6863`。逐主机 sudo 仅影响本次仪表盘的该主机，并沿用原连接切换采样源。进程终止先确认，再在原 Linux SSH 分栏上核对 PID 和命令名，发送 SIGTERM。容器日志按所选 ID 读取最近 100 行，输出受 32 KiB 查询上限约束。容器终端验证容器中的 `sh` 后在同一个 SSH 连接开 PTY 执行 `docker exec -it`，关闭来源 Shell 时释放子终端。

- Engine — `plugins/ssh/src/engine/{capabilities,index,manager,monitor-tools,monitors}.ts`
- 共享合同及界面 — `plugins/ssh/src/shared/monitoring.ts`、`plugins/ssh/src/ui/{MonitorDashboard,MonitorTools}.tsx`
- 用例 — `plugins/ssh/test/monitor.engine.test.ts`、`tests/e2e/ssh/monitoring.spec.ts`
- 两台回环服务器验证危险动作和 Docker 查询只走来源连接，输错进程名遭版本冲突，子终端随来源关闭且另一 Shell 继续运行。仪表盘仅勾选的主机收到提权采样。进程发送信号与 Docker 执行路径用可观察的测试端响应验证。

### 105-s7 · H12.1 切库与停用

提交 `f9fc24ad`。SSH 执行管理器进入销毁状态后，取消待拨号、探测和传输，清理旧代 Shell、连接快照及待答项，阻止旧代完成回调发布连接事件。回环单测在等待 keyboard-interactive 时销毁，确认 TCP 关闭、旧答复为 `false`、无迟到连接事件。

- Engine 与单测 — `plugins/ssh/src/engine/manager.ts`、`plugins/ssh/test/manager.test.ts`
- Playwright — `tests/e2e/ssh/lifecycle.spec.ts` 两个场景。两者均准备活动终端、文件会话、受控写入中的传输、真实本机 SOCKS5 监听、监控及另一连接的认证待答。在切换后检查 TCP 回收、端口可重新绑定、旧认证与迟到写入失效、SSH 快照无旧对象、笔记模块仍可查询。

## 定向验证

下列验证串行使用 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm --config.verify-deps-before-run=false`。工作树快进时主线已新增并锁定 `@noble/hashes@2.4.0`，本检出的已有 pnpm 存储有同版本文件但缺包目录链接。补齐忽略目录中的符号链接，显式跳过 pnpm 自动安装检查。仓库依赖声明与锁文件无改动。实际验证开始时可用内存约 26 GiB，所属 cgroup 链无有限内存门槛，相关卷约余 140 GiB。

- `--filter @huhu/plugin-ssh run typecheck` — 每项实施阶段及最终候选均检查，最终 0 错误。
- `exec vitest run plugins/ssh/test/manager.test.ts` — 33/33，覆盖独立文件、隔离分栏、主机指纹、多轮认证和销毁行为。
- `exec vitest run plugins/ssh/test/preferences.engine.test.ts` — 2/2，含现有 Vault 版本和保活、共享与隔离重连。
- `exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'privileged SFTP'` — 2/2，含真实 sftp-server 双向批次与单次口令对话。
- `exec vitest run plugins/ssh/test/monitor.engine.test.ts` — 6/6。
- `exec vitest run plugins/ssh/test/domain-exposure.engine.test.ts` — 2/2，确认 CLI 与 MCP 保持各自授权和撤权行为。
- `exec vitest run plugins/ssh/test/transfer-publication.test.ts` — 8/8，覆盖在准备与提交阶段的暂停、取消、竞争和目标保护。
- `git diff --check 37b0c0e0 HEAD` — 通过。四个改动的 Playwright spec 经 TypeScript 语法解析均为 0 诊断。
- `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron -e '…'` — Electron 44.9.1、Chromium 152.0.7977.167，实际调用 `node:crypto.randomUUID()` 成功。

## Lead 待运行的 E2E

| 工作项 | Spec | 用例名 |
| --- | --- | --- |
| A12 | `tests/e2e/workflows/ssh-workspaces.spec.ts` | `A12 disabling connection sharing isolates same-host workspace shells` |
| A07 | `tests/e2e/ssh/file-properties.spec.ts` | `A07 从未连接主机打开独立文件管理并单独释放原连接` |
| A07 窗口回归 | `tests/e2e/ssh/file-properties.spec.ts` | `A07 外置原生文件窗口保留打开时的分栏并在关闭后保留 SSH`、`A07 独立 Web 文件会话按路径前进和返回，保留桌面来源与原连接` |
| A09 | `tests/e2e/ssh/file-properties.spec.ts` | `A09 desktop sudo SFTP edits an actual root-owned file and leaves the shell connected` |
| A11 | `tests/e2e/ssh/monitoring.spec.ts` | `Workbench monitors a saved panel in the background and controls the active Pane separately`、`A11 native server tools keep the original shell and query the actual Docker socket` |
| H12.1 | `tests/e2e/ssh/lifecycle.spec.ts` | `H12.1 停用插件回收活跃 SSH 对象并拒绝旧代答复`、`H12.1 切换 Vault回收活跃 SSH 对象并拒绝旧代答复` |

## 未运行的验证

- Playwright、桌面和独立 Web UI、截图、构建、打包、全仓类型检查、全仓 lint、knip 按派发留给 Lead。
- 真实 sudo 口令由远端测试夹具模拟。待以要求口令的独立 Linux 主机验证 PAM、sudoers 细粒度命令授权、requiretty 提示及不同 OpenSSH 安装路径。
- Docker 容器工具和进程终止的新增动作使用回环测试端验证命令、退出码、PTY 和连接归属。尚无真实容器日志、交互 Shell 或进程终止的本轮验收。
- 真实外部主机、真实 Zsh、Windows、macOS 按派发排除。Ed448 受 ssh2 支持范围限制。

## 阻碍与接续

主机详情直接打开的隔离终端掉线后由用户新开，自动重连的隔离恢复范围为工作区分栏。Linux 进程终止以 PID 和命令名核对，在 PID 被同名进程重用时仍缺启动时间证据。仪表盘 sudo 作用域随本次运行，重新开始面板后需重新开启。使用一次性口令的传输遇通道中断时需要重新认证并发起；已有暂存发布与结果核查逻辑继续提供状态。

版本待 Lead 合入与验收。复核 `hc ls --all` 仅有 Lead 与当前 worker，`git worktree list --porcelain` 仍为原三检出。验证锁已释放，未启动附加 worker 或应用验证进程。实施检出保留给 Lead 完成整合与回收。

### Modern Web Guidance

- `forms` 与 `checkbox` — 我用明确的 label 关联共享连接开关和一次性口令字段，批量选择使用包裹输入的 label。依据 “each checkbox associated with its label”。
- `dialog` — 我复用现有原生 Dialog，使删除和进程终止默认聚焦取消。依据 “put `autofocus` on the safe action”。
- `accessibility` — 我在重复的监控和服务器工具操作中包含主机、进程或容器名。依据 “Disambiguate controls that look visually identical”。

## Lead 验收

