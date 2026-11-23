# #7 SSH 合并与接线审查

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4t`，本机 `wta-ubuntu` 默认 Core，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4t/report01.md`
- 执行结果 — done，独立审查已完成，#7 尚有验收缺口
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/integration`
- 提交范围 — `cc671b5f5afe63c61827e8fe3fb7cc4b8d4a8a8a` → `690e90978b6a012cead9f6bdd47ed93f13b65550`，63 个文件。合并提交 `ade79b58` 的两个父提交为 `cc671b5f`、`53e516ca`。

## 规格轴 · 已证实缺陷

1. **P1 · 停用 SSH 或切 Vault 无法清理已脱离 PTY 的 Unix 子进程。** #7 A17 要求回收旧运行对象，覆盖孤儿进程和端口。SSH 本地 PTY 依靠 `terminal.kill` 和 `server stop`。随包 Herdr 0.1.19 的发行说明明确允许 Linux/macOS 的主动脱离任务在终端关闭后继续运行。相邻上游源码的 holder 正常 Shutdown 分支只结束程序和前台作业组。SSH 接线没有额外的进程树回收，因此本地 Shell 中主动脱离的开发服务可在停用或换 Vault 后继续占用端口。已有真 PTY 测试只核对普通 Shell PID 和 socket。依据 `plugins/ssh/src/engine/local-pty-herdr.ts:26–38`、`plugins/ssh/src/engine/index.ts:172–176`、`packages/herdr-client/src/herdr-core.ts:198–216`，以及 `temp/sources/herdr-core/CHANGELOG.md:11–21`、`crates/herdr-core/src/holder.rs:281–305`。判定来自版本说明与代码，未启动进程复核。

2. **P1 · 21 个新增动作可在设置中开放，现有 handler 会拒绝 CLI/MCP。** 这 21 个描述符均允许开放、默认关闭。密钥、草稿、配置同步、代理分享、录制和本机终端的 19 个 handler 只接受 desktop。交互答复及布局的两个 handler 只接受桌面或 Web 工作台。设备专属动作与外部受权动作的限制需在目录中可见。远端布局和草稿测试还需对应外部对象与业务处理。当前目录选择与实际调用冲突，影响 A14/A15/A20，草稿测试也影响 A21。原有外部键盘交互 handler 继续处理外部尝试。依据 `plugins/ssh/huhu-plugin.json:117–137`、`packages/kernel/src/dispatcher.ts:352–363` 及 `plugins/ssh/src/engine/{key-library-capabilities,draft-connection,config-sync,proxy-share,terminal-recordings,local-shell,authentication-capability,workspace-pane-capability}.ts`。目录用例只对原有 settings get/update 验证开放后可调用（`plugins/ssh/test/domain-exposure.engine.test.ts:228–271`）。CLI/MCP 串联用例也选用既有能力（`tests/e2e/ssh/entry-parity.spec.ts:15–29`）。

3. **P2 · 「插入」仍允许会直接触发终端动作的控制字符。** 快捷文本的写入门槛只在未启用 bracketed paste 时拦截 CR/LF。xterm 6.0.0 的 `paste` 规范化换行、按当前模式包裹，然后发送其余字节。对从外部粘贴到预览的快捷文本，其余控制字符仍能触发终端动作，或改变 bracketed paste 的协议边界。#7 来源 §6.2 区分插入与执行。依据 `packages/ui/src/components/TerminalView.tsx:67–78`、`plugins/ssh/src/ui/TerminalActions.tsx:20–27,75–86` 与锁定的 xterm 源码 `src/browser/Clipboard.ts:13–25,51–55`。待跑 E2E 只覆盖单行可打印文本。

4. **P2 · 关闭自定义布局的一栏会重置其余分栏的几何。** `changeLayout(close)` 保留其他 Shell ID 和 Pane ID，却用 `splitTree(panes.length)` 重建整树，覆盖剩余分栏的方向、比例和嵌套关系。测试关闭的是 `tabs` 布局。依据 `plugins/ssh/src/engine/workspace-runs.ts:108–138`、`plugins/ssh/src/shared/workspace.ts` 的 `splitTree`、`plugins/ssh/test/draft-and-keys.test.ts` 的布局用例，以及 #7 W01–W06 的布局与单栏生命周期。

## 规范轴 · 可核对风险

1. **P1 · 私有端点的 OS 用户隔离取决于运行时目录权限。** SSH 的目录实例哈希、session 和状态目录独立于 Agent。Vault 写锁拦住同一目录的第二个可写 Engine，只读 Vault 不注入 PTY。Unix 在 `XDG_RUNTIME_DIR` 缺失时却直接把 socket 放入 `os.tmpdir()`，Huhu 无专属访问受限子目录。本机默认 Core socket 位于 0700 的 `/run/user/1000` 下，真 PTY 也使用专用临时目录。若宿主回退到共享目录且 socket 权限允许其他用户连接，上游本地 RPC 缺少应用级认证，端点名称不能约束调用方。依据 `apps/engine/src/boot.ts:476–491`、`packages/herdr-client/src/herdr-core.ts:39–55,70–100,198–216`、`packages/vault/src/vault.ts:195–225`，及上游参考 `paths.rs:51–55`、`platform/unix.rs:91–106,139–143`、`server.rs:85–92`。未在随包 0.1.19 上用第二个 OS 用户复核，Windows 命名管道访问边界也待验。

2. **P1 · 启动取消和异常停止缺少贯穿全程的时限与回收核对。** `ensure`、`terminal.run` 和 framed attach 没有接收请求 AbortSignal，取消在阶段间检查。丢失 run 回复会按标签对账，但沿用可能已断开的原客户端，查询失败退回空列表。卸载先等全部打开和关闭 Promise，再停止 Core，Shell 回收失败在 `allSettled` 中被丢弃。停止子进程没有自身时限。严格停止只看 CLI exit code，或在 socket 暂不可达时提前返回。相邻上游 CLI 的 `server stop` 对无法连接返回正常退出，holder 可等待接续 Core。Electron Engine supervisor 只有 15 秒退出窗口，启动等待或连续的 RPC 超时可耗尽此窗口。代码确认了等待关系和成功判据，实际故障下的存活时间待测。依据 `plugins/ssh/src/engine/local-shell.ts:102–107,124–159,182–204`、`plugins/ssh/src/engine/local-pty-herdr.ts:16–65`、`packages/herdr-client/src/{herdr-core,client}.ts`、`apps/desktop/src/main/engine-supervisor.ts:260–278`，以及上游参考 `cli.rs:805–813`、`holder.rs:157–168`。

3. **P2 · 本地终端历史及慢连接积压缺少总量边界。** 16 个上限只统计运行态。普通结束保留每个会话最多 64 KiB 的回放、PTY 引用和快照，`restart` 只删除被重启的原记录。重复新开时列表和内存持续增长。SSH WS 对每个观察者直接发送，framed 本机 attach 也未沿用 Agent 分支已有的 `canSend` 背压判定，64 KiB 回放限制约束不了 WS 发送队列。慢消费者需要运行验证，远端 SSH 发送积压在基准已存在。依据 `plugins/ssh/src/engine/local-shell.ts:21,98–99,119–152,200–204`、`plugins/ssh/src/engine/terminal-bridge.ts:15–42`、`plugins/ssh/src/engine/local-pty-herdr.ts:46–53`、`plugins/agent-cli/src/engine/terminal-bridge.ts:76–94`。

4. **P2 · TerminalView 回调身份改变会触发重挂，现有调用方已稳定化。** `onTerminalInput` 在 WS/xterm effect 依赖内，身份改变会销毁 xterm、丢弃回滚并重新竞争控制权。当前 WorkspaceRunView 按 sessionId 缓存 callback，Agent 不传此属性，一般重渲染不会命中该情况。重挂也没有将界面状态重置为 connecting，新 WS 确认前可能呈现旧的 open、ended 或 lost。依据 `packages/ui/src/components/TerminalView.tsx:34–44,80–108,136–146` 与 `plugins/ssh/src/ui/WorkspaceRunView.tsx:49–50,83–98,229–239`。

## 核对通过的边界

- **既有 Agent 行为。** SSH 和 Agent 无插件依赖，session、runtime、socketName 分属各自实例。Agent 停用仍只 dispose Core 连接，既有 `stop()` 默认行为保留。Agent 键盘输入继续沿用现行协议，SSH 快捷回调只在收到 control 帧时发布。依据 `apps/engine/src/boot.ts:473–492`、`plugins/agent-cli/src/engine/index.ts:100–121,740`、`packages/herdr-client/src/herdr-core.ts:39–55,198–216`。
- **桌面与 Web 流。** 回环 listener 校验来源和令牌，仅 desktop 可升级终端流。分享 listener 校验 Origin 和邀请 cookie，撤权终止绑定 WS，且 Engine 在分享分支拒绝 `ssh-local-` ID。本地能力另限制 desktop。远端 SSH 和 Agent 仍使用各自的桥。SSH controller map 由桌面和 Web 共用，观察者不能写入或 resize。外部 CLI/MCP 终端由 `PublicShells` 持有。依据 `apps/engine/src/boot.ts:555–577`、`packages/kernel/src/server/http-app.ts:132–150`、`packages/kernel/src/server/web-share.ts:63–79`、`packages/kernel/src/server/ws-workbench.ts:32–69`、`plugins/ssh/src/engine/index.ts:984–1007`。
- **分栏调用层。** 新桥只接收当前控制者的输入与 resize，被动观察者不接管，WS 关闭只 detach。稳定 paneId 保留重排时的 React 实例。快捷目标仅含显示、就绪、未锁定且持有控制回调的分栏，预览再次核对会话和回调身份。桌面使用现有宿主与共用 xterm/WS。依据 `plugins/ssh/src/engine/terminal-bridge.ts:14–68`、`plugins/ssh/src/ui/Workspace{Canvas,RunView}.tsx`、`packages/ui/src/components/TerminalView.tsx:56–60,85–146`。
- **复用、依赖和发行。** Engine 的新增 workspace 依赖与 lock 链接对应，沿用原有 Herdr Node 库和 Electron workspace TS 打包。无新增第三方运行时依赖。Huhu 0.0.1-rc.4，Electron 44.9.1，xterm 6.0.0。Chromium 152.0.7977.167 来自接线证据。Herdr lock、资源标记及 Linux x64 随包二进制 `--version` 同为 0.1.19。缓存归档 SHA-256 与 lock 一致，归档内二进制与当前资源 SHA-256 同为 `d408197a6b85af97b2fe93a10e6f4bee18d3a654307db94df2b35aea277c466f`。编排 CLI 为 0.1.21。Motty 本地 `v0.4.12^{}` 匹配 `102228261703d8f22c5eb98b1c500e2a24889dee`。Herdr 本地上游是浅检出 `ce81486`，用于阅读相邻协议实现。发行行为依据锁定二进制、版本说明和日志。参见 `pnpm-lock.yaml:412–418`、`apps/desktop/electron.vite.config.ts:17–46`、`scripts/herdr.lock.json`、`docs/upstream/ledger.md` R-72–R-77。

## 已知候选缺口与证据

- H3.1 OpenSSH CA、用户证书和缺本机身份时的交互恢复。H3.2 批量路由。H3.3 全局出站代理继承、覆盖、ProxyCommand/ViaShell 和监控、转发路径展示。H3.4 同步只支持一个字面 Host 块，待验实际文件选择及 OpenSSH。H3.5 Linux 远端依赖 `ss`，夹具只验证 CONNECT 接受。H4.3 跨窗口移动与恢复、完整焦点路径。H5.1 IME、宽字符、备用屏、图像和键盘协议。H5.2 快捷库与工具栏操作。H5.3 实时搜索、时间轴与图像回放。H5.4 Windows WSL 和 macOS。H11.3 CLI/HTTP MCP 串联。参见成员 [H-remaining-linux.md](/home/wta/projects/huhu/temp/issue-worktrees/integration/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H-remaining-linux.md)。
- 审查固定两个端点的 63 个文件，核查 `git show --cc ade79b58` 和 `git diff ade79b58 690e9097`。根 `AGENTS.md` 和 `.agents/{system,dev,dev/changes}/AGENTS.md` 适用。目标树在 apps/packages/plugins/tests 下无更深 AGENTS.md。`git diff --check cc671b5f 690e9097` 无输出。排除了并行任务的 #5 文档工作树改动。
- 日志目录 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/`。`h7-merge-vitest.log` 记录 manager 20、外部资源 46、草稿及密钥等 8 项通过。`h7-wiring-static.log` 对应 SSH/Engine 定向类型检查、桥替身 3、目录 2、静态目录 2。 `h7-native-before.log` 记 0.1.19 拒绝过长名称，移除名称后的 `h7-native-after.log` 记 2 项通过，包括停用 Agent 后真实 Shell 打开、resize、同 PID 重挂、邀请浏览器收到 4404，及正常停用 SSH 后 PID 和 socket 消失。`h7-wiring-recheck.log` 对应 3 项桥测试、1 项真实 attach 和 E2E 语法检查。
- `t71-cutover-690e9097.log` 的两项是 Agent 任务自动化派遣和恢复旧监督记录，48 项跳过包括既有 Agent 真 WS、SSH 真 WS 和回环令牌拒绝。此日志能佐证任务组合入口，不能充当终端路径的证据。
- 执行 `zh-modern-web-guidance` 搜索及获取。npm registry DNS 失败后，通过已有缓存 CLI 搜索 `authorize websocket connections`、`observe element resize`，读取 `js,efficient-background-processing` 以对照异步取消和隐藏视图。本轮没有实现改动。

本轮仅静态审查和读取日志，未运行测试、应用、浏览器或打包。此固定 SHA 尚待核对桌面分栏、认证和 CLI/HTTP MCP E2E，桌面/Web 对同一远端 Shell 的接管与撤权，同机两 Vault 双 Core，切 Vault，启动期间取消，异常掉线，进程树回收和 Windows/macOS 随包运行。

## 阻碍与接续

`HC_TERMINAL_ID=t4t`、主机、topic、manifest 的 `t4t/task01.md active`、来信 `t3p` 和报告同号均一致。沙箱对默认 Core Unix socket 的连接返回 `EPERM`，默认与显式 socket 的 `hc get` 均失败，报 Core lock 所在文件系统只读。已在约定的共享根发布报告，实时消息投递受该限制。

## Lead 验收

由 Lead 复核后填写。

已验收项目规范审查。用随包 0.1.19 在隔离临时目录复核，父目录为 1777 时 socket 权限为 0775。此证据进入私有端点与关闭时序的后续修复。其它缺口按 #7 切片继续。
