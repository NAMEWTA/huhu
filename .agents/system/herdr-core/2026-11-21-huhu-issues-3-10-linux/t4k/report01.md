# #7 H5.4 本地 Shell 的 Herdr Core 装配分析

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4k`，本机 `wta-ubuntu`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4k/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4k/report01.md`
- 执行结果 — `done`（只读装配分析）。H5.4 的产品验收待实机验证。

## 结论

建议复用随包 Herdr Core **0.1.19**、现有 Core 启动器和 `@huhu/herdr-client`，给每个可写 Vault 的 SSH 插件一个按需启动、独立停止的 Core 实例。Agent CLI 关闭时，桌面仍可经 `ssh.local.open → SshLocalShells → createHerdrLocalPty → terminal.run/attach` 启动所选环境。SSH 持有 Shell、来源映射和视图，Engine 提供可执行文件与 Vault 范围，Agent Space、Agent 会话表和 Agent 历史均不在这条调用链上。两侧都启动过终端时可能有两份 Core；SSH 卸载负责结束自己的实例。此结论只涉及本地 PTY；远端 SSH 连接沿用 SSH 自身的管理器。

**同一配置目录可以复用，同一实例不能由两个插件分别停止。** 上游将配置解析为 `$XDG_CONFIG_HOME/herdr-core/config.toml`，状态解析为 `$XDG_STATE_HOME/herdr-core/$HC_SESSION`，显式 `HC_SOCKET` 优先并决定 holder socket。SSH 和 Agent 可以只读共享一份静态配置；建议给 SSH 使用自己的 runtime 子目录，沿用同一套缺省配置，无需复制配置文件。只换配置或状态目录、保留当前显式 socket 仍会命中同一 Core。Huhu 的启动器目前硬编码 `HC_SESSION=huhu`，endpoint 也没有模块维度。证据见 `plugins/agent-cli/src/engine/herdr-core.ts:28–44`，上游 `crates/herdr-core/src/paths.rs:17–48`。

## 核对依据与现有行为

代码行号以集成提交 `ade79b58f3bd386207edeb36599b1efc12753591` 为准，SSH 候选 `53e516ca` 已合入。Issue 来源为项目保存的 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/source.md:3,126,285–289,368`。其中要求插件卸载及 Vault 切换时释放 SSH 原生资源，临时关闭视图只释放视图。切片 `tasks/H5.4-local-shell.md:11–16` 还要求更换默认后按旧环境重连、环境丢失时给出原因并检查进程。[原 Issue #7](https://github.com/NAMEWTA/huhu/issues/7)

| 已核对的问题 | 当前实现与证据 |
| --- | --- |
| 实际发行物 | `scripts/herdr.lock.json:2–10` 及 Linux x64 的 `.herdr-lock:1` 锁定 0.1.19。只运行随包程序的 `--version`，得到 `hc 0.1.19`；本机编排工具 `hc --version` 是 0.1.21。Main 从平台资源目录解析程序并通过 `HUHU_HERDR_BIN` 传给 Engine，见 `apps/desktop/src/main/engine-supervisor.ts:9–13,147–152`。 |
| 谁启动与持有 | `apps/engine/src/boot.ts:154–169,278–294,471–480` 打开 Vault，分别注册 Agent CLI 和 SSH，目前只给 Agent 传二进制。Agent 在 `plugins/agent-cli/src/engine/index.ts:100–130,732–741` 构造 HerdrCore，并把它作为插件服务提供；`herdr-core.ts:47–99` 在同一个对象内合并并发 ensure，启动后缓存 plain RPC 连接。停用时插件 abort 并 dispose 客户端，保留 Core 和已有 Agent 终端。服务随作用域注销，见 `packages/kernel/src/context.ts:88–97`。 |
| 重启影响 | `plugins/agent-cli/src/engine/index.ts:466–492` 的 `agent.core.restart` 先 stop 后启动，外部调用还校验 core ID 和 PID。它会影响该 Core 上所有终端。上游另有保留程序的计划重启 `server.restart`，两者语义不同。健康检查走 `probe`，当前仅在 Agent 启用时显示，见 `apps/engine/src/boot.ts:395–406` 和 `herdr-core.ts:141–158,181–195`。 |
| SSH 尚缺的装配 | `plugins/ssh/src/engine/index.ts:47,978–1023` 的 apply 没有接收启动器，现有 bridge 仅调用 manager.attachShell。候选已经提供 `registerSshLocalShells(api, launch)` 与 `registerSshTerminalBridge(api, manager, local?)`，注册点分别在 `local-shell.ts:227`、`terminal-bridge.ts:73`。Engine 已按 `ssh-` 前缀路由，可复用同一条桌面 WebSocket。 |
| 谁负责卸载 | `packages/kernel/src/plugin-manager.ts:140–146,194–196` 先禁用新调用，再 await 作用域释放。桌面切 Vault 串行等待旧 supervisor 停止，Engine 在释放 Vault 前 await plugins.disposeAll，见 `apps/desktop/src/main/index.ts:307–323`、`apps/engine/src/boot.ts:619–638`。SSH 候选 `local-shell.ts:172–190` 的 dispose 逐项发起 close 后立即返回，不能作为释放完成的证据。 |

## 建议接线与生命周期

1. 将现有 `HerdrCore` 启动与连接逻辑提取到 `packages/herdr-client/src/herdr-core.ts`，由 `src/index.ts` 导出。保留 Agent 原导出、构造默认值和旧地址，兼容已有调用者、布局及会话。将 `runnable` 的小型文件检查放在无插件依赖的位置（当前在 `plugins/agent-cli/src/engine/detect.ts:26`）。为新调用者允许显式指定 `session` 与 `endpoint`，各实例独立缓存 client 和 starting。若从 Engine 导入该包，在 `apps/engine/package.json` 声明直接依赖。
2. 在 `boot.ts` 的 **SSH apply 回调内**为本次启用构造 SSH 私有宿主。例如取 `runtimeDir = path.join(vault.runtimeDir, "ssh-local-herdr")`、`session = "huhu-ssh-local"`、短 socket/命名管道 `huhu-ssh-<根目录绑定与机器标识的摘要>`。复用 `packages/vault/src/identity.ts:25` 的 endpointRootBinding 和 `packages/vault/src/vault.ts:64,120` 的 machineId/runtimeDir。仅拼 Vault ID 短前缀不能区分复制的 Vault。创建对象或列环境时均不启动进程。只读 Engine 不持写者锁（`vault.ts:196`），不得取得写者 SSH Core 的停止权；若支持只读窗口启动本地终端，应给它独立的临时状态和端点。
3. SSH 包从现有 `./engine` 出口导出 `createHerdrLocalPty` 和 `LaunchLocalPty`。生产接线为 `launch = ssh.createHerdrLocalPty(sshCore, attachTerminal)`，在 `ssh.apply` 增加尾部宿主参数，例如 `{ launch: LaunchLocalPty, shutdown(): Promise<void> }`。保留现有第三、四参数的凭据与作业语义。apply 内以 `const shells = registerSshLocalShells(api, host.launch)` 建立会话，再以 `registerSshTerminalBridge(api, manager, shells.attach)` 取代原内联 bridge 的唯一注册点。`boot.ts:146` 的静态目录和 `plugins/ssh/huhu-plugin.json` 同步四项描述符 `ssh.local.environments/list/open/close`。本地能力执行时继续检查 desktop caller，环境 ID 在 Engine 解析为 argv。
4. SSH 卸载先禁止新开，取消在途发现、run 和 attach，**等待在途 open 的补偿及已建 PTY 的 close，再 await 私有 Core 停止**。将 `SshLocalShells.dispose()` 改为可等待、可重复调用；仅遍历 session 并等待 `close` 还不足以覆盖尚未赋值的 `session.pty`。可复用 Mail 插件 `ctx.effect(() => async () => …)` 的做法（`plugins/mail/src/engine/registration.ts:105–108`）。宿主 shutdown 要等待已发起的 ensure 收敛，停止时使用仍有效的宿主生命周期；现有 `HerdrCore.stop()` 在 signal 已 abort 时会抛错，且忽略子进程错误和退出码。用隔离端点确认停止或缺席，无法确认则显式记录失败。未启动且没有旧实例时直接结束。切 Vault、关闭 Engine 复用同一释放路径，重新启用时建立新的插件作用域。若允许崩溃后接手同一 SSH 私有端点，应在写者持锁后核对旧实例与所属终端、清理遗留，再接受新 launch。
5. Agent 按自己既有的停止与重启规则工作。SSH 的“重连”对 ended Shell 重新运行原环境；只在需要新建时 ensure 自己的 Core。若确需在两个模块中共用**一个进程**，可改由每个 Vault 的 Engine 独占一个 HerdrCore，分别借给插件，Agent 停用只注销其借用，SSH 卸载仍只收自己的 PTY。此选项另需 Engine 串行协调新建与 Core 级重启，避免 Agent 的 stop 结束正在启动或工作的 SSH Shell，并区分需跨 Engine 保留的 Agent 与最后一个 SSH 持用者。直接调用 `api.service("agentCli")`、或让两个 wrapper 同时管理同一 socket，均无法兑现这些行为。H5.4 优先采用独立实例，使现有 Agent 重启语义可完整保留。
6. 桌面与 Web 分享目前共用 boot 的 terminal 回调（`boot.ts:545–550`），Web 分享在验证邀请后向 bridge 转交终端请求，bridge 参数中没有 caller（`packages/kernel/src/server/web-share.ts:63–73`、`ws-workbench.ts:58–67`）。接入本地 attacher 时，在 Web 专用终端回调先拒绝 `ssh-local-`，再委托其余原有路由；只在能力函数检查 desktop 不足以覆盖终端流。现有桌面控制监听器另有 desktop 校验（`http-app.ts:147`）。

## attach、重挂、关闭

- 实际协议为 Unix socket 或 Windows 命名管道。plain RPC 的 `terminal.run({argv,cwd,labels,name,no_parent:true,keep:false})` 返回 address。独立连接发送 `hello({framed:true})`，再调用 `terminal.attach({terminal:address,cols,rows})` 获得 channel。控制 RPC 在通道 0，PTY 在返回的通道上收发 DATA，按已消费字节回 CREDIT，RESIZE 传列、行。查看者的 CLOSE 是 detach；程序退出由 Core 发 CLOSE，可附 reason/exit_code/signal。上游本地参考副本 `/home/wta/projects/huhu/temp/sources/herdr-core` 为 `ce81486`，其中 `schema/released.openrpc.json:1436,1625,1878,1980,2037,2272` 标示发行协议 0.1.19，`schema/README.md:41–72,103–111` 说明帧语义。Huhu 对应实现见 `packages/herdr-client/src/client.ts:181–252`、`frames.ts:1–32`。
- **关视图后重挂**可直接匹配候选。SSH 每个本地会话仅持一个 Herdr stream。视图 close 只 detach 本地 view；新视图由 `shells.attach` 回放最近至多 64 KiB，再订阅同一个 PTY。SSH bridge 在 WebSocket 层挑选唯一控制者与观察者，重挂不再次 run，不应 kill。此回放为有限字节尾部，全屏恢复是否完整需要实测。见 `local-shell.ts:20–21,119–133,153–169`、`terminal-bridge.ts:15–37,42–68`。
- **结束 Shell 与同源重开**是两个操作。stop 对该 address 执行 kill、rm，之后关闭 stream；run 回复丢失时按本次唯一 `huhu.ssh-local` 标签查找。再次 open 用旧 session 的环境 ID 重新发现，ID 来自 kind 与确切 argv 的摘要，成功后返回新 SSH session ID。WSL 使用 `wsl.exe --distribution <选定名>`。见 `local-pty-herdr.ts:16–81`、`local-shell.ts:34–38,55–74,100–149`。
- **传输断线不等同于程序退出。** Huhu 客户端在 socket 断开时传 `null`，自然退出可传退出原因。候选忽略 reason，任何非主动 CLOSE 都异步 kill，错误被吞，然后将 UI 标为 ended。plain 连接失效时其原有 client 也无法完成清理；运行结果未知时的 list/rm 失败同样可能被吞。建议保留结束原因，用仅连接现存 Core 的 `peek()` 重新核对本次标签和 address；确认仍活且是同一 PTY 时可重挂，确认结束后再清理。如决定断线即收回，仍须验证进程已结束再报告成功。Engine 内存 Map 支持同一作用域内重挂，跨 Engine 恢复原会话目前没有持久绑定。0.1.19 的明确边界是 Unix 上用户主动脱离终端的后台服务可存活，检查 Shell 及其前台 PTY 作业的结果应分别记录。见 `client.ts:192,202–208,219–227`、`local-pty-herdr.ts:22–43,62–80`、上游 `CHANGELOG.md:11–16`。

## 未运行的验证与剩余未知

本次只读核对了源代码、发行 schema、锁记录与二进制版本。以下是建议 Lead 在隔离夹具中执行的最小验收，无运行结果。现有 `plugins/ssh/test/terminal-runtime.test.ts:68,91` 用替身；`packages/herdr-client/test/attach.live.test.ts:23–49` 包含真实 Unix 回显、尺寸、exit 7，跳过 Windows，也没有经过 SSH 装配。

| 场景 | 能区分正确与错误接线的观察 |
| --- | --- |
| 冷启动，Agent CLI 已停用 | 桌面打开测试 Vault，列环境与健康检查时无 SSH Core；开选定的 Shell 后有真实 PTY，记录 PID、TTY 和尺寸。关闭再打开视图，PID 相同，输入与 resize 生效。显式结束后核对 Core 终端记录与 Shell PID，不能仅看 Tab 状态。Web 分享对本地终端流应拒绝。 |
| 两插件同时运行 | 两侧各留一个有可观察 PID 的夹具。停用、重启 Agent（启用时调用其 restart），SSH 原 PID 继续响应；停用 SSH 后其 Shell 与私有 Core 结束，Agent 的 PID 和输入正常。 |
| 启动过程中停用 SSH 或切换 Vault | 在 run 返回前、attach 返回前分别触发取消。卸载返回时没有旧 PTY、在途启动或残留 Core；新 Vault 与旧 Vault 即使复制了相同 manifest ID 也不会误停。对失去 attach/控制连接分别核对真实进程，确认没有把通信失败报成正常退出。 |
| 原环境消失及 Windows WSL | 存在两个可区分的 Shell／测试发行版。改变默认并重开 ended 会话，观察实际执行环境；移除选中夹具后，旧会话明确显示原来源不可用，没有替代进程。Windows 实机核对发行版名、ConPTY 输入、resize 和退出。只有 Linux 版本读数，Windows、macOS 运行结果均待补。 |

未运行 Node 应用、任何测试、构建、打包或全仓门禁，未访问真实 Vault、凭据、Agent 历史或业务服务。业务代码、分支、索引和远端均由原负责人管理。本报告完成分析交付。

## Lead 验收

由 Lead 复核后填写。

已验收装配分析。采用同一随包 Herdr Core 启动器，分别管理 Agent 与 SSH 本地终端实例。现有 Agent 重启会停止其 Core 上的终端，SSH 私有端点可保留隔离。具体接线、资源释放与真 PTY 行为仍按新候选验证。
