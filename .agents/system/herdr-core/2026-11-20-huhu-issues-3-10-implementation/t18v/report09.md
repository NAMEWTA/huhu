# task09.md · #7 H8.1/H8.2 SSH 转发规则与运行

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task09.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task09.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report09.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — `impl/huhu-issues-3-10-ssh-forwarding`
- 基线 — `4f30195345d732ab0e51b974ac9915bcfbefce6e`

## 结论

Local、Remote、SOCKS5、HTTP CONNECT 四种规则可在桌面保存、按版本编辑及删除。保存不启动监听。规则绑定稳定主机 ID 与 SSH 路由指纹。启动经现有逐跳信任与模块凭据，端口仅绑定 `127.0.0.1`。监听就绪后显示实际地址、连接归属及真实 TCP 流量。

符合当前版本和路径的现有 SSH 连接可借用，否则共享该路径的专用连接。停止借用规则保留原 SSH 会话，停止最后一个专用连接持有者才关闭该连接。断线释放监听，启用恢复的规则可显式恢复。运行中编辑或删除先确认回收旧实例。远端拒绝释放时保留待确认状态和当前配置。

## 产物与改动

| 提交 | 交付 |
| --- | --- |
| `e69a8580c9ed7eba63965f6ecfea97ba45f0603c` | 四种配置、Vault 版本写入、编辑器、监听和目的地说明、被规则引用的主机删除检查。 |
| `f19a3a9e5fae264e916b71eacd5fec1d436be6b3` | 四种真实 TCP 运行、启动／停止／恢复、借用与共享专用连接、运行统计、失败回执、Workbench 与隔离 Engine 验证。 |

复用 `HostConfigurations.withAuthentication`、逐跳 SSH 指纹核对、`workspaceTarget` 和已安装 ssh2 的 `forwardOut`、`forwardIn`、`unforwardIn`。用本地 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c` 的 `internal/portforward/forward.go` 对照监听范围、所有权和流量统计。 [配置证据](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/verification/H8-config-windows.md>) · [运行证据](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/verification/H8-runtime-windows.md>)

公共装配沿用现有入口，无额外 Lead 补丁。Engine 的 `apps/engine/src/boot.ts` 已用 `declareDescriptors("ssh", Object.values(ssh.sshCapabilityDescriptors))` 与 `ssh.apply(ctx, api, credentialHost)` 自动装载。新增描述器和实现分别位于 SSH 插件的 `src/engine/capabilities.ts` 和 `src/engine/index.ts`，清单在 `huhu-plugin.json`。Renderer 的 `apps/desktop/src/renderer/main.tsx` 通过既有 `r.register(sshUi)` 装载 SSH 模块，模块内的 `SshModule.tsx` 增加「端口转发」入口。能力限制为桌面，CLI／MCP 不导出。 [Engine 装配](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/engine/src/boot.ts:128>) · [Renderer 注册](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/apps/desktop/src/renderer/main.tsx:119>)

## 验证

| 入口 | 实测结果与命令 |
| --- | --- |
| 规则配置与运行 | `vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test`。66 项通过，其中 4 项使用新转发用例。保存及重开均不监听。四种模式回显真实 TCP 字节，核对连接数及字节。Remote 在 SSH 回执前保持启动中。端口冲突、出口被拒、远端绑定和释放被拒分别核对。共享连接停止部分规则后仍可用，最后持有者释放后实际断开。跳板中断释放端口，显式恢复分配新连接。插件停用回收连接及监听，启用后只恢复规则。 [SSH 日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task09-0f6b0bc0/ssh-final.log>) |
| Windows Workbench | `playwright test -c plugins/ssh/e2e/playwright.config.ts`。1 项通过。实际界面创建并回读四种规则，在同一个 Local 规则核对显式启动、信任、字节、统计、停止、重复启动和再次停止。停止后客户端收到 `ECONNREFUSED`。 [Workbench 转发日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task09-0f6b0bc0/forward-workbench-final.log>) |
| 既有 SSH Workbench 回归 | `playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1`。9 项通过，覆盖工作区、终端、文件会话、批量传输、发布回读和 ZIP。 [工作区回归](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task09-0f6b0bc0/ssh-workspaces.log>) |
| 构建与静态检查 | `pnpm --filter @huhu/desktop run build`、`pnpm --filter @huhu/plugin-ssh run typecheck`、SSH 范围 Oxlint 和 `git diff --check 4f301953..HEAD` 均通过。 [桌面构建](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task09-0f6b0bc0/desktop-final.log>) · [类型检查](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task09-0f6b0bc0/typecheck.log>) |

Windows、隔离临时 Vault、合成本机回环 SSH 和服务。所有业务文件改动限于指定工作树的 SSH 插件和 #7 证据。临时依赖 junction 已清理，分支干净，未改根锁或写入其他工作树及远端。

## 阻碍与接续

本轮交付 SSH TCP 后端。ViaShell 在界面显示不可用，规则校验拒绝该配置。动态模式提供 TCP CONNECT，SOCKS5 采用回环无认证握手。每条规则最多 64 个同时进入的连接，最多运行 32 条规则。运行实例与计数保存在当前 Engine 生命周期，重开 Vault 只加载配置。

H9 完成只读复用考察。Motty `remotestats/worker.go` 分离 Linux、Windows、Darwin 采样器，`monitoring/history.go` 区分订阅和来源、按最快有效订阅采样并以代次拒绝过期结果。当前 `WorkspaceRunView.tsx` 已给出活动 Pane 和具体 shellId，`SshManager.fileOrigin(hostId, shellId)` 可复核来源。采样执行和界面留给 H9 独立切片。

## Lead 验收

由 Lead 追加。
