# task10.md · #7 SSH 凭据切换与 H9 监控

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task10.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task10.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report10.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — `impl/huhu-issues-3-10-ssh-monitoring`
- 基线 — `4563a422ed8bb11f4160485271a82082b6a0161c`

## 结论

SSH 直连、工作区、跳板、转发和监控拨号使用 SSH 模块认证。删除 `secretUse` 消费、Safe 依赖及旧的 `ssh.hosts.save`、`ssh.hosts.delete` 入口。兼容目录仅以脱敏摘要显示「需要修复」。任一跳为旧主机时，在建立网络连接前返回错误。原始主机文件和个人 Safe 条目保留。

活动分栏的监控绑定原 SSH 连接和具体 Shell。按连接共享最快采样周期，暂停和断线写入空隙。关闭监控释放采样，保留用户终端。多个命名仪表盘可保存主机顺序、周期和保留期，显式启动后各主机独立显示采样及失败。隐藏仪表盘停止界面轮询，已开始的仪表盘继续在 Engine 采样。

H9.3 增加当前分栏的普通权限只读进程与容器摘要。只接受类型枚举并执行固定查询，区分缺 Docker、权限不足及分栏断开。

## 提交与证据

| 提交 | 交付与证据 |
| --- | --- |
| `006d42a9548698bbeeaa54ea7e6e5986f0d165b5` | 所有者凭据切换、兼容只读修复标记、回环验证无旧拨号及旧文件与条目逐项保留。 [凭据切换](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/P10-ssh-owner-cutover.md>) |
| `c2e3605dc56c7c41beabc59823b8f1e803432314` | 活动分栏监控、按连接复用采样、命名仪表盘、前后台与终态证据。 [监控取证](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H9-monitoring-windows.md>) |
| `9c55c07e0533c284724932118d16a10faf6455ec` | 分栏绑定的进程与容器只读摘要、拒绝任意查询、原连接生命周期。 [服务器工具](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H9-tools-windows.md>) |

对照本机 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c` 的 `internal/monitoring/history.go`、`internal/remotestats` 和 `internal/remotetools`。复用既有的 SSH 路由信任、所有者凭据、专用连接共享机制、活动 Shell 与 Vault 文件版本。监控和转发的专用连接池按用途隔离，避免跨功能改变持有者计数。对已存在的普通连接，监控可直接固定连接 ID 并只关闭自己的采样通道。

## 验证

| 范围 | 实测 |
| --- | --- |
| SSH 实际 Engine 和回环 | `vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test`，70 项通过。含旧主机、旧跳板及旧转发零拨号，Safe 锁定或停用时新凭据真实认证，两个系统合成计数，最短周期复用、快面板暂停后降到慢周期、断线与重接历史隔离、失败重试与停止回收，以及两条分栏只读状态。 [最终日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task10-dfe5033f/ssh-9c55c07e.log>) |
| Windows Workbench | `playwright test -c plugins/ssh/e2e/playwright.config.ts`，2 项通过。监控用例覆盖命名面板、历史配置、真实 SSH 回读合成样本、导航离开后继续采样、分栏停靠及暂停空隙、进程与 Docker 缺失反馈、关闭后终端就绪。 [Workbench 日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task10-dfe5033f/plugin-workbench-9c55c07e.log>) |
| 使用模块主机配置的既有场景 | `playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1 -g 'H4.2 临时运行\|H6\|H7'`，7 项通过。覆盖工作区、终端、SFTP、目录批量、发布回读和 ZIP。 [既有工作区回归](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task10-dfe5033f/workspaces-managed.log>) |
| 构建及静态检查 | 桌面生产构建、SSH TypeScript、SSH 范围 Oxlint、Stylelint、仓库 CSS 检查和 `git diff --check 4563a422..HEAD` 通过。 [最终构建](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task10-dfe5033f/desktop-9c55c07e.log>) |

验证在当前 Windows、隔离 Vault 和本机回环 SSH 上完成。Linux／Windows 指标由合成 SSH 响应验证。采样器显示 Linux procfs／Windows CIM 的可用项，其他系统、GPU 等未接入项显示原因。历史存在当前 Engine 的有界内存，每订阅每主机最多 1800 个时间点。H9.3 本次交付分栏内只读摘要，完整独立窗口、日志、镜像和特权操作另行实施。工作树干净，临时依赖 junction 已清理。

## Lead 公共装配与测试接续

现有 Engine 自动注册 `Object.values(ssh.sshCapabilityDescriptors)` 和 `ssh.apply`。桌面现有 SSH Renderer 注册即包含新增入口。插件自己的 `huhu-plugin.json` 已同步，公共装配入口无需修改。 [描述器注册](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/src/boot.ts:128>) · [Engine 入口](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/src/boot.ts:383>) · [Renderer 入口](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/desktop/src/renderer/main.tsx:132>)

任务写入范围外仍有公共测试夹具绑定旧契约，整批验收需同步以下位置。

- 将两处公用 SSH 密码夹具切到 `ssh.hosts.configure` 和隔离 `desktopUserData`（与 Vault 并列），使用返回的 `hostId`。旧 Safe 集成用例改验 Safe 锁定不影响已配置 SSH。 [密码与 Safe](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/engine.test.ts:634>) · [PTY 夹具](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/engine.test.ts:912>)
- 能力目录断言改为 `ssh.hosts.remove`，核对桌面管理权限及 `hostId + expectedRevision`。 [公共目录断言](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/test/capability-catalog.test.ts:65>)
- H4.1 的主机夹具和按版本删除分别改用 `ssh.hosts.configure` 与 `ssh.hosts.remove`。H4.2 缺失主机用例可写一个隔离兼容记录、保存模板后移除 fixture 文件，以保留「缺失」验收语义。 [H4.1 创建](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/tests/e2e/workflows/ssh-workspaces.spec.ts:56>) · [H4.1 删除](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/tests/e2e/workflows/ssh-workspaces.spec.ts:97>) · [H4.2 缺失夹具](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/tests/e2e/workflows/ssh-workspaces.spec.ts:258>)
- 验收和导入 E2E 的三处旧创建改为 `ssh.hosts.configure`，使用 `authKind: "agent"` 与 `expectedRevision: null`，通过 `ssh.hosts.list` 取得主机详情用于存储比较。 [公共验收](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/tests/e2e/workflows/acceptance.spec.ts:400>) · [导入夹具](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/tests/e2e/ssh/import.spec.ts:110>) · [并发导入夹具](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/tests/e2e/ssh/import.spec.ts:147>)

## Lead 验收

由 Lead 追加。
