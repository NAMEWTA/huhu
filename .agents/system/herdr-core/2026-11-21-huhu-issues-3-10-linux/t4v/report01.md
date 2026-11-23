# #7 合并与接线的规格审查

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t4v
- 实际执行终端 — t4v，wta-ubuntu 默认 Core，hc 0.1.21
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4v/report01.md
- 执行结果 — done（规格审查已完成，#7 仍有验收缺口）

## 结论

**A14/A15 外部能力验收未通过。** 21 个新动作已登记到同一个描述符目录、清单与授权界面，默认关闭。启用后，活动 handler 可被发现，实际调用仍固定拒绝 CLI、MCP 和外部 HTTP。原外部信任、键盘交互、断开、Shell 和文件的主体检查保留。新增「实际连接路径」卡片把外部 Shell 计入工作台连接，影响展示归属。

**H5.2 的单行快捷文本已接上真实终端桥。** 写入取决于可见分栏、精确 Shell、当前 WebSocket 的明确控制授予及预览是否仍对应当前输入回调。多行插入、焦点与多窗口仍有缺口。Linux 原生 PTY 的创建、重挂、Web 隔离和停用回收已有定向记录。

## 范围和依据

审查范围是 `git diff cc671b5f 690e9097` 的 63 个变更文件。按领域入口追踪差异，并核对 `ade79b58` 的两个父提交 `cc671b5f`、`53e516ca` 及后续接线。目标固定为 `690e90978b6a012cead9f6bdd47ed93f13b65550`。工作目录为 `/home/wta/projects/huhu/temp/issue-worktrees/integration`，未提交的其他切片证据不纳入本次提交审查。本次只发布此报告。

依据 #7 的 `source.md` §5、§6.2、§8、§12、§13、A13–A17/A21、`spec.md`、13 个实施切片、`t34/report01.md`、确认稿及本机日志。核对了确认稿中可见且就绪分栏的广播范围、当前分栏与附属面板、测试草稿以及逐跳信任。原型资源在两个端点一致，确认指纹为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。原型为离线模拟。以下源码定位对应目标提交。

## 已证实缺陷

| 优先级与来源 | 入口及影响 | 修正与可复用验证 |
| --- | --- | --- |
| **P1 · 接线新增 · A14/A15/A21** | `apps/engine/src/boot.ts:148` 声明静态目录，`plugins/ssh/src/engine/capabilities.ts:75`、`plugins/ssh/huhu-plugin.json:117` 和 `plugins/ssh/src/engine/index.ts:134` 对齐。新增 21 项都标记可开放且默认关闭。`packages/kernel/src/capabilities/system.ts:91,298,394` 接受策略选择并由 `gateway.check` 报允许；`Dispatcher.discover` 和分发共用 `dispatcher.ts:71,352` 的开放判断。十九项的实际 handler 只接受 desktop，覆盖 `ssh.keys.*` 3 项、`ssh.hosts.testDraft`、`ssh.configSync.*` 2 项、`ssh.proxyShare.*` 5 项、`ssh.recordings.*` 4 项、`ssh.local.*` 4 项。另两项 `ssh.authentication.answer` 与 `ssh.workspace.runs.changeLayout` 只接受工作台 caller。活动时外部列表和策略承诺与实际拒绝矛盾。只读 Vault 及缺宿主的录制/PTY 可处于 handler 未绑定状态，另按该状态判断。 | 同一 #6 目录应报告可实际执行的合同。键盘回答已有外部 `ssh.auth.keyboardInteractive.respond`，目录应指明对应入口。外部布局需走原 run、主体、代次、已授权路由及意图。密钥、草稿、同步、代理、录制、PTY 需明确可开放的业务入口与设备边界，保持工作台对象、客户端流和 Engine 本机路径隔离。保留默认关闭。复用 `domain-exposure.engine.test.ts:87–233` 与 `public-resources.engine.test.ts`，对各组补显式开放后发现、调用、隔离与撤权。现有用例只对 settings 完成显式开放后的业务调用。 |
| **P2 · 候选新增 · H3.3** | `plugins/ssh/src/ui/SshModule.tsx:106–109,194,603–606` 取工作台 `connectionId`，却用同主机的混合 `ssh.shells.list` 统计 running Shell。同一主机同时存在外部和工作台连接时，卡片会把外部 Shell 计入工作台连接。原来的列表已经按来源分开，新增卡片引入混计。 | 复用现成的 `ownShells`，需要精确连接计数时从 Manager 的 Shell 与传输绑定计算。复用 `public-resources.engine.test.ts` 的自有 PTY 夹具和 `tests/e2e/ssh/owned.spec.ts`，核对同主机的两类 Shell 分别显示，计数对应工作台连接 ID。 |
| **P2 · 候选新增 · H4.3** | `plugins/ssh/src/engine/workspace-runs.ts:77–89,108–139` 重连只递增 generation，保留 paneId 与 layoutRevision。布局接口只检查 layoutRevision，旧记录以 run.id 代替。上一代的关闭请求在布局未改时仍可作用于已重连的新一代 Shell。 | 给写操作绑定运行代次，或重连时同时更新布局令牌。扩展 `draft-and-keys.test.ts:230` 的双分栏夹具，保存、重开、重连后提交旧代次布局请求，检查冲突及新 Shell 存活。 |
| **P2 · 快捷回调接线后可达 · H5.2** | `packages/ui/src/components/TerminalView.tsx:67–79` 在 bracketed paste 关闭时拒绝随 CR/LF 的「插入」，其余文本直接进入 xterm 的 paste。锁定版 xterm 6 的 `src/browser/Clipboard.ts:13–24,51–57` 对输入做行尾转换与可选封装，快捷文本未过滤终端控制字符。普通多行预览仍始终提供「插入」，部分目标拒绝时只显示成功名单或通用失败。 | 快捷入口按目标判断插入条件，过滤快捷文本中的终端控制字符，分别回报每个目标的结果。沿用 `remaining.spec.ts` 的夹具，以无副作用文本核对多行、安全拒绝、两个目标能力不同和回车独立确认。 |
| **P2 · 接线条件缺口 · H5.4** | `apps/engine/src/boot.ts:479` 未设 `HUHU_HERDR_BIN` 时传裸名 `herdr-core`，共享启动器 `packages/herdr-client/src/herdr-core.ts:70–74` 在 spawn 前用 existsSync 检查这个名字。只有 PATH 上安装二进制、运行目录没有该文件时，列出环境之后仍无法打开 PTY。打包的 Electron 已注入绝对路径时走另一分支，定向测试也显式注入了路径。 | 复用已有可运行文件定位，给 SSH 私有 Core 传已检验的绝对路径。扩展 `apps/engine/test/web-share.test.ts:146`，覆盖仅 PATH 有安装以及真正缺少二进制。 |
| **P3 · 候选新增 · H5.3** | `terminal-recordings.ts:29–32,49–54,99–120` 写入失败后在内存保留已设 endedAt 的录制，领域层可重试 stop。UI 在 `TerminalRecordings.tsx:23–31` 把它视为没有活动录制，按钮调用 start；start 遇同 Shell 的保留记录只返回旧摘要。运行中的 Shell 因此可卡在无法从界面重试保存或新录制。 | 让列表和 UI 表达待保存失败，并用原 Shell 重试停止保存。复用 `manager.test.ts` 的录制夹具，覆盖首次写失败、恢复、再次保存与回读。 |

## 外部主体与工作台归属

- **首次信任和交互。** `index.ts:189–194,669–676` 将外部信任和键盘应答交给 `PublicProbes`，按 caller/subject、授权路由、原 attempt、hop、提示 ID 和修订检查。`manager.ts:232–271,671–752` 的工作台信任拒绝 publicProbe，工作台和外部键盘使用不同待答字段，外部分支优先。两种应答分别消费。外部首次信任不写工作台 Known Hosts，changed-key 继续阻断认证。工作台只收到带来源标志的外部粗粒度状态。
- **断开。** `index.ts:658–665` 外部取消只查本主体原 attempt/routeRevision。工作台无 attemptId 时操作自己的主机连接；显式给外部 attemptId 时沿用 `cc671b5f` 已有的管理关闭 `publicProbes.closeWorkbench`。外部连接不进入 Manager 的工作台 hostId 连接池。
- **Shell 和文件。** `index.ts:747–750,789–798,891–924,984–1007` 保留 PublicShells/PublicFiles 与工作台 Manager/Files 的路径。外部 Shell 读、写、resize 检查自有对象和原连接；外部文件会话与 SFTP 固定原外部连接/远端对象，并拒绝 Engine 路径。工作台保留来源展示与原有管理关闭。新 WS 桥只挂工作台 Shell 或私有本机 Shell；Web 分享拒绝 `ssh-local-*`。实际连接卡片的计数错误限于界面汇总。
- **分栏和路由。** 新分栏 handler 只编辑工作台 WorkspaceRuns，外部运行仍由 PublicWorkspaces 持有。公共授权校验使用共享 routeForHost/directJumpIds 计算当前有效路由，并继续按主体、路由修订和所有实际跳点过滤。停用路由影响新拨号，旧工作台连接保留原快照。开放设置沿用 #6 的策略与 Dispatcher。

## 终端快捷输入实际条件

1. `WorkspaceRunView.tsx:83–99,150,229–239` 只选当前显示的工作区及 ready、有 Shell ID、未锁定、有控制回调的分栏。最大化和内部标签下只允许当前分栏。隐藏工作区撤下快捷控件，保留终端视图以免换布局时重建 Shell。
2. `SshTerminal.tsx:13–27` 透传回调。`TerminalView.tsx:84–120,136–146` 收到当前 WS 的明确 control 消息后才发布快捷输入，观察、交接、关闭、清理均撤销。`terminal-bridge.ts:16–37,41–67` 按当前控制 socket 再检查写入和 resize。控制者离开，仅通知原本请求控制的后继重挂。显式观察者不接管。
3. `TerminalActions.tsx:12–27,37–45,65–85` 在提交时核对预览的 paneId、sessionId、输入回调仍对应选择。预览不写。插入通过 xterm paste，发送另外写一个回车。锁定切换重建视图 WS，Shell 仍由 Engine 持有。新增 E2E 检查单行、无隐式回车、显式回车、未选目标及锁定禁用，尚无运行日志。

## 可核对风险

| 条件 | 依据与可复用验证 |
| --- | --- |
| H4.3 方向导航和拖放后的 PTY 焦点 | `WorkspaceCanvas.tsx:88–105,141–155` 的 focus 目标是分栏外层容器。当前分栏与侧栏选择会更新，下一次真实键入是否落到目标 xterm 待验。最大化重排后终端仍是 `ssh.css:1045` 的固定高度。复用分栏 E2E 检查真实键入、焦点、尺寸与原 Shell ID。 |
| H5.4 原生流意外断开 | `local-pty-herdr.ts:36–43,59–81` 用原 client 尽力回收，流关闭统一标为结束。正常重挂和停用记录未覆盖 Core/持有者意外断线。沿用 `t4k/report01.md` 的 0.1.19 close reason 区别，用私有 Core 和原标签核对 PID；存活时重挂或明确确认回收。补验并发打开与关闭、Vault 切换及 Agent Core 存活。 |
| H3.4 文件应用先于同步基线 | `config-sync.ts:163–177,222–228` 先写一端再写基线。已有日志未覆盖应用后取消、基线写失败或外部文件程序与 rename 的并发。复用 `draft-and-keys.test.ts` 的临时文件，在提交边界验明确的部分成功状态与重新预览。 |

## 13 个切片的已知余项

| 切片 | 目标版本行为与剩余验收 |
| --- | --- |
| H2.5 | 密钥库、主机引用、公开摘要已接线，回环验证加密 Ed25519 和引用保护。待桌面文件选择、公钥剪贴板、真实系统 agent、恢复及公开设备边界。复用 `draft-and-keys.test.ts`、`remaining.spec.ts`。 |
| H2.6 | 草稿三态与取消已接线，编辑后旧响应受 AbortController 约束，回环证实无新增目录、信任或会话。待真实客户端三态、点击取消及公开草稿的主机与输入授权。复用 `remaining.spec.ts` 与草稿回环测试。 |
| H3.1 | 工作台多问多轮与既有外部应答并存。专用监控/转发缺工作台键盘应答，CA、用户证书、缺本机身份后恢复仍缺。复用 `trust.spec.ts`、`manager.test.ts` 及公开主体应答夹具。 |
| H3.2 | 逐条修改、启停、拒绝环，旧连接保留快照。批量关联、跳过/覆盖事务仍缺。复用路由回环，补多目标失败回滚。 |
| H3.3 | 工作台有实际逐跳阶段和身份来源。出站代理继承/直连/覆盖、ProxyCommand/ViaShell，监控与转发路径仍缺。复用多跳回环核对阶段、失败 hop 和真实传输 ID。 |
| H3.4 | 手动预览、单字段双向应用已接线；只处理独立字面 Host 块，Include、Match、多值和活跃 ProxyCommand 有报告。待真实 OpenSSH 生效结果、桌面文件选择和提交边界。复用临时配置文件。 |
| H3.5 | 用原工作台连接和远端 `ss` 核对回环监听，有 CONNECT 与停止日志。待真实远端、隧道内 TLS、失败反馈与剪贴板。复用当前代理夹具。 |
| H4.3 | 可换位、最大化和关单栏，回环有保留另一 Shell 的证据。任意分割、拖动比例、跨窗重挂及真实键盘焦点未闭合，关自定义分栏会按剩余数重建分割树。复用分栏 E2E。 |
| H5.1 | 共用 xterm 与新桥已接线，控制/观察、resize 有替身证据，Linux PTY resize 有 Engine 记录。中文 IME、宽字符、全屏、鼠标、图像和键盘协议待实测。 |
| H5.2 | 可见目标和预览/插入/发送已接线。快捷命令库分组排序、工具栏移动/恢复、多行多目标及观察者交接未闭合。复用 `remaining.spec.ts`。 |
| H5.3 | 可显式录制精确 Shell 并按会话查找、文本回放，UTF-8 边界有候选回环记录。实时搜索、时间轴、图像协议以及客户端写失败恢复待做。 |
| H5.4 | Linux 已测停用 Agent 后打开 `/bin/sh`、同 PID 重挂、Web 拒绝与停用回收。包起的 Electron、Windows WSL、macOS、原环境失败、Core 意外退出和切 Vault 仍待验。 |
| H11.3 | 合并阶段已有主体隔离、撤权及分段操作证据。新增 `entry-parity.spec.ts` 两条串联认证更新、信任、SFTP 字节、作业回读及撤权；串联运行和 stdio 对应证据待补。新增动作另需显式开放后的业务结果。 |

## 验证与交接

| 范围 | 已读取的结果 |
| --- | --- |
| 本次静态审查 | 两端与合并父提交存在，`git diff --check cc671b5f 690e9097` 退出 0。 |
| `ade79b58` 合并 | `h7-merge-vitest.log` 中 manager 20、public-resources 46、draft-and-keys 8 项通过，含首次信任、CLI/MCP 键盘、PTY 与 SFTP 主体隔离。该完整资源测试日志对应合并阶段。 |
| 接线 | `h7-wiring-static.log` 中 terminal-runtime 3、domain-exposure 2、capability-catalog 2 项通过。证据文件记录 SSH 与 Engine 单包类型检查通过；目录默认关闭、可选清单和 settings 行有记录。 |
| 真 Linux PTY | `h7-native-before.log` 记录新 PTY 失败，证据文件定位为 0.1.19 名称长度。目标移除名称并保留标签。`h7-native-after.log` 的 Engine web-share 2 项与 `h7-wiring-recheck.log` 的桥 3 项、真实 attach 1 项通过，覆盖禁用 Agent、29×101 resize、同 PID 重挂、Web 4404、停用后 PID 与私有套接字消失。 |

本机已有日志在 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22`，对应 `evidence/H-remaining-linux.md`。日志由候选实现者或 Lead 运行。本轮遵照 task 未运行测试、未启动应用。桌面 Electron 与普通浏览器的新增交互、`remaining.spec.ts`、`entry-parity.spec.ts`、Windows WSL、macOS、打包产物、全量测试以及故障/并发路径仍待对应环境验证。

topic 记录 Lead 为 `t3p`。manifest 为 `t4v / task01.md / active`，主机及环境 `HC_TERMINAL_ID=t4v` 与派发一致。当前沙箱执行 `hc get` 报 Core 锁所在文件系统只读。终稿可通过已约定的共享路径读取。

## Lead 验收

由 Lead 复核后填写。

已验收规格审查。外部草稿试连已有 CLI 与 HTTP MCP 定向回归，剩余外部动作、布局和 UI 回归继续处理。两份报告均不代表 #7 通过。
