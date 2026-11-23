# H4.3 把活动 SSH 分栏移至新工作台窗口

| 任务身份 | 值 |
| --- | --- |
| 共享根 | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux` |
| Core / Lead / terminal_address | `wta-ubuntu` / `t3p` / `t5h` |
| task | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/task04.md` |
| report | `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5h/report04.md` |
| 执行结果 | `done`，只读架构分析 |
| 候选 | `31352cae87ad11d5f12c7a3d125bc2fe8aee5189`，下列仓库路径均相对 `/home/wta/projects/huhu/temp/issue-worktrees/integration` |

## 结论与首片

**建议第一片只移动桌面工作区中一个已就绪的活动 SSH Pane。** 用户点击“移至新窗口”，目标工作台打开该运行的指定分栏，显示同一 shell 最近输出并接续实时输出。源窗保留其他分栏。对可输入的分栏，两窗在同一个 Engine 中定向交接输入及 PTY resize 权。对输入已锁定或正在观察的分栏，目标也只观察。成功以目的端实际附着及焦点、源端确实解绑为准。

固定候选已经能建完整 BrowserWindow、独立关闭每个窗、从另一视图重新附着同一个 SSH shell。**尚缺三处连接**：源窗没有面向活分栏的宿主开窗动作，新 renderer 没有按地址选中 SSH 运行/分栏的启动入口，终端桥也没有把控制权定向交给指定观察者的操作。只增加按钮或 URL 会留下“窗口打开但 shell 不对”或“第三个视图接管输入”的可见故障。

需求依据是 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/{source.md,spec.md,design.md,tasks/H4.3-pane-layout.md}`。W05 约束调整布局时的运行与焦点；W06 区分同进程重挂和进程重启；A04 保留模板、顺序、登录命令及保存后拨号的已有语义；A05 要求相邻终端、文件、监控、转发有独立生命周期。本片不修改模板/运行的持久布局。原文另有独立 SFTP 新窗 F01/A07，其来源绑定和验收另属文件工作区。

## 候选中真实可复用的入口

| 调用位置 | 源码事实与对本片的影响 |
| --- | --- |
| `apps/desktop/src/main/index.ts:143,215–281,284–298,314–345,593–660` | `rendererAddress()` 为开发服务器 URL 或 `huhu-app://workbench/index.html`。`createWindow(chrome)` 安装现成 preload、原生装饰、菜单、预览隔离、关窗确认和恢复页，然后加载工作台。生产只在启动或 macOS activate 且无窗时调用；第二实例只恢复/聚焦已开窗口。`setWindowOpenHandler` 拒绝 renderer 自行弹窗。各窗共享 main 的一个 supervisor 和当前 Vault。切换 Vault 会停旧 Engine，不能为了换窗再次调用 vault.open。 |
| `apps/desktop/src/main/{window-chrome,app-menu}.ts`、`preload/index.ts:19`、`renderer/env.d.ts`、`packages/workbench/src/settings/host.ts` | `window-chrome` 已按工作台协议、host、pathname、可信顶层 frame、已登记 BrowserWindow 验证 sender；菜单按窗口保存状态。沿用这条窄桥惯例，并在各 OS 的可信主文档开放新方法。共享 UI 用可选 `host()`，能力探测具体方法。 |
| `apps/desktop/src/renderer/main.tsx:83–114,126–151,248–266,403–462`、`packages/workbench/src/state/ui-store.ts:45–80`、`packages/workbench/src/shell/AppShell.tsx` | DesktopRoot 读 vault.state，DesktopApp 取当前 engine 配置，App 注册 sshUi，每窗拥有自己的 createUiStore。桌面初始模块为 home。已有 `openModule("ssh")` 会经过离开守卫，再次打开当前模块会切换侧栏折叠。必须 await 守卫，且仅在模块未激活时调用。可借鉴 `plugins/mail/src/ui/mail-notification-command.ts` 的“模块未挂载时保留一次待处理目标，再核对 Vault 和端点”做法。 |
| `plugins/ssh/src/ui/{index,SshModule,WorkspaceLibrary,WorkspaceRunView,WorkspaceCanvas}.tsx`、`device-preferences.ts:79–95` | ssh 是模块 ID；工作区是 SshModule 的本地 workspaces 状态。WorkspaceLibrary 查询 `ssh.workspace.runs.list`，runId 来自选择或按 Vault 共享的 localStorage；RunView 默认取第一 Pane。Canvas 按 paneId 保留插槽、支持方向焦点、拖动交换及最大化。仅打开 ssh、写 lastWorkspace 或选第一项都不足以定位目的会话。隐藏插槽仍会调用 render 并可能挂载终端，新窗不可先把其他 Pane 全挂一遍再隐藏。 |
| `plugins/ssh/src/engine/workspace-runs.ts:76–140,191–216`、`shared/workspace.ts:67–96`、`engine/index.ts:474` | 已保存的运行结构在 `.huhu/runtime/ssh/workspace-runs.json`；活 generation、paneId 与 sessionId 在 Engine 内关联。workbench 列表也包含标为 external 的运行，目前只显示其状态。对自己的运行可从该列表找回 ready Pane，无需再 start。changeLayout(close) 会 releasePane→closeShell，runs.close 会释放整组；reconnect 在无原 live generation 时才创建新代次。 |
| `plugins/ssh/src/engine/manager.ts:897–925,934–999,1075`、`engine/terminal-bridge.ts:13–83`、`packages/ui/src/components/TerminalView.tsx:58–151` | Manager 持有原有 SSH channel；attachShell 先回放最近字节再监听实时流，detach 只取消订阅。缓冲以 64 KiB 为目标并按块淘汰，不保证完整滚动历史或 xterm 选择区。终端卸载只关 WS。桥按 shellId 记录唯一控制 socket，单独仲裁 write 和 resize；控制者离开只通知最早可用的候选 `control-free`，对端再重连。显式 observe 不排队，目前也没有“只读附着成功”消息。WS OPEN 可以先于服务端 4404。 |
| `apps/engine/src/boot.ts:557–564`、`packages/kernel/src/server/{http-app,ws-workbench,web-share,web-assets}.ts`、`apps/desktop/src/renderer/web-host.ts` | 桌面回环终端只接受 desktop bearer；Web 监听器核验同源 cookie、支持会话撤销，现有 Web 终端桥排除 ssh-local。Web 已授权用户能从 SSH 模块查看远端运行。浏览器 URL 解析和 SPA 资源路由目前仅额外登记 notes/tasks，不能声称已有 /ssh/... 深链。浏览器没有 huhuHost，Web 的会话、邀请或 HTTP 入口不负责创建本机窗口。 |

已有回归参照也能缩小范围。`tests/e2e/ssh/remaining.spec.ts:94–138` 已有单窗双 Pane 的交换、最大化、输入锁与广播、显式关闭及连接数断言；`tests/e2e/workflows/ssh-workspaces.spec.ts:304–409` 已区分重挂与应用重启；`plugins/ssh/test/terminal-runtime.test.ts:28–95` 已覆盖单写者、resize 及慢视图退出。此处是源码中的断言，未在本次候选上重跑。

## 目标地址与调用示例

1. **桌面移动。** 源窗从实际显示的运行提取严格类型的 `{vaultId, runId, generation, paneId, sessionId}`，连同当前视图模式交给可选 `host()?.workspaceWindow?.move(...)`（建议接口名）。main 管理窗口与文档，SSH Engine 校验运行/活 shell 的关系。对调用方返回 moved、cancelled、stale 或 failed；返回 moved 时目的端已经收到角色确认。源窗窥见其他主体的外部运行、错代、结束的分栏或无效落点，均不能据此请求可写交接。
2. **在另一个文档打开目标。** 建议新窗加载**原工作台入口地址**，生产为 `huhu-app://workbench/index.html`，开发为既有 `ELECTRON_RENDERER_URL`。具体业务地址是上述五元组。main 在 `loadURL` 之前，把地址和一次性操作 ID 绑定到新 BrowserWindow；目标 renderer 就绪后经窄 preload 方法拉取自己的待打开地址。这样保持原 pathname 和 trustedDocument 检查，也不会丢失比订阅更早到达的事件。URL、日志与 localStorage 不携带令牌、任意跳转地址或写权限。普通 Web 入口通过已有 SSH 导航选择当前 Vault 的 run；若共享“显示指定 run/pane”的组件，直接传已授权地址即可。Web 用户看不到宿主开窗按钮，第一片无需增加 Web URL 路由。

以 **一个 ready Pane 的窗口投影** 做交付边界。目的只渲染该 Pane；源在成功后把原位置表示为“已移至另一窗口”，从可写、可广播和可 resize 的视图集中移除，其他 Pane 继续原样工作。只剩一个 Pane 时源工作台仍可返回运行列表。该显示归属由 main 按窗口和运行代次保留在内存，能跨 renderer reload 重新读取；不写成 Vault 中的结构删除。普通窗口仍可观察运行。整组 Tab 一起 tear-off、任意既有窗口间的拖放和独立文件窗均可另验。上游 Motty 的 `tab_menu.go → tab_drag.go:559` 转移整个 Tab，开窗失败时复原原位置，`internal/workspace/deck_transfer.go` 还会为另一 deck 分配本地 ID。Huhu 已有跨视图稳定的 run/pane/shell ID，适合直接使用。[Motty 固定实现](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/tab_drag.go#L559)

## 交接时序与唯一写者

| 顺序 | 责任方与可观察结果 |
| --- | --- |
| 1. 记录来源 | 源窗从已挂载终端取得本次 attachment 的身份及 Engine 实授的模式，记录 run/pane/session 和焦点。main 校验已登记窗口、可信顶层文档、当前 ready Vault/Engine 实例；按同一源视图限制一次在途移动。无效操作在此结束。 |
| 2. 建真实目标窗 | 用原 createWindow 增加一个小的启动参数，在导航前登记目的；可先隐藏，保留原预览隔离和恢复页。main 保存两端 webContents/文档标识和有限期限。目标只读自己的交接，重新取得 `huhuHost.engine()`，核对 vaultId 和仍是同一 Engine 启动实例。相同路径或相同 vaultId 的 Engine 重启也会使交接失效。 |
| 3. 定位并附着 | App 的 registry/Engine 就绪且 SSH 已启用后，导航到 ssh，令 SshModule 进入工作区；WorkspaceLibrary 精确匹配 runId/generation，RunView 以指定 paneId 激活，检查 ready 且 sessionId 相同。待处理地址优先于 restoreWorkspace，禁止临时渲染旧默认运行。再在原 WS 路径只读附着该 session。目标获得服务端对这个活 shell 和这条 socket 的明确确认；空输出也能确认。曾经存在的 Pane、HTTP 101、ready-to-show、did-finish-load 都不能单独确认就绪。 |
| 4. 定向转交 | 对原控制者，在 SSH bridge 内比较当前 controller 与源 attachment；确认目标是同一 shell 上已准备好的指定 attachment、未离开且绑定仍有效。一次同步提交将 controller 从源 socket 指向目标 socket；源降级，目标收到 control 后才可发送键盘、粘贴、快捷文本、广播及 resize。服务器逐帧检查当前 controller。对于锁定/观察源，只转移视图，目标得到明确 observe 回执，原有其他控制者不变。 |
| 5. 聚焦、收尾 | main 将目标原生窗口 restore（如有需要）、show、focus。renderer 在目标仍可见且布局已提交后使指定 Pane 的终端获得实际键盘焦点（xterm 的 focus），观察模式聚焦可读区域。若窗口管理器拒绝前台激活，显示“已移入，点击聚焦”，区分授权和 OS 焦点结果。源收到对应操作的完成回执，清除该 Pane 的输入/广播回调及 WS，移除其视图或显示占位。已切到其他操作时避免源或迟到回执反抢前台。 |

**桥中需要补的是指定交接，不是第二套终端。** 一个最小做法是沿当前 SSH WS 分配短时、不透明的 attachment 标识。目标以“准备接收”附着并同意此次移动，在确认前只观察且不加入 waiting 队列。main 的双端握手仅把这次目标的标识交回来源；当前拥有者经自己的 socket 提交。桥用操作 ID、同一 shell 上的实际 socket 和非持久有效期做比较；运行校验可在现有 `registerSshTerminalBridge` 注册位置引用 WorkspaceRuns。允许同次查询/重复确认，但每次移动至多生效一次。保留普通 attach、observe 与 control-free 对旧调用者的行为；单独识别由 desktop listener 创建的交接，沿 `boot.ts` 已有两种监听器的入口传递宿主标志。另一个 Web/桌面候选不因两窗移动进入控制空档。此操作不注册为通用 CLI/MCP 能力。

`TerminalView` 当前以 `observe` 布尔值启动，普通请求端可能在收到 mode 之前发送键盘，服务端会拦截非拥有者。迁移模式应显式从不可写开始，支持同一 socket 准备、获准或降级，保持对其它终端后端的兼容。避免单靠切换 observe prop 导致 effect 销毁已确认的目标 WS。目标取得 control 时才应用其终端尺寸；旧回调和延迟二进制帧之后均失效。服务器完成交换是提交点；同一操作的完成消息即使丢失，也只对账原结果。不要因为客户端超时再开一个 shell，或擅自把已提交的控制权交回。

**备选方案的实际代价。** 只复用当前 control-free 并先卸载源，在只有两个视图的演示中可能成功，但已有等待者更早时，它会收到通知；仅挂载观察者又不会收到通知。复制 Run、导出再导入模板或以 hostId 重新开 shell，会重新拨号或重复登录命令。复用当前 BrowserWindow 工厂和 SSH 桥，只有“本窗应显示哪一个 Pane”需要跨文档传递，运行、文件和 SSH 凭据继续由既有 Engine 持有。

## 取消、关窗与恢复

| 事件 | 应得到的结果 |
| --- | --- |
| 用户取消、放到无效位置、窗口创建失败、加载恢复页、插件不可用、附着 4404 或超时 | 未提交时取消准备、解绑目标观察 WS，释放监听和临时地址。源保留原控制、焦点、布局和广播状态。隐藏且仅为此次移动创建的空窗可回收；用户已在其中工作的窗走正常关窗流程。迟到回执按操作与文档代次丢弃。 |
| 两窗请求相同 Pane，另有 Web 观察者／候选；或源由第三方控制 | 同一源操作幂等、不同在途操作只允许一份。提交只匹配源实授角色与确切目的 socket。原观察者只能移动自己的观察视图。提交时源已失去控制则报告冲突，任何视图都不能仅凭窗口焦点升权。 |
| 错 Vault、同 Vault 换 Engine、已换代、Pane 在等待中被关闭 | 在读地址、绑定终端和提交时重新校验。失败时展示已失效，不调用 vault.open、runs.start/reconnect 或 shells.open。若用户另外显式切 Vault 或关闭运行而自然终止旧会话，应显示真实结束状态。 |
| 两端任一 renderer 在提交前 reload、崩溃或主文档离开 | 复用 #3 的顶层文档与 `did-start-navigation`（过滤同文档）、`render-process-gone`、`destroyed` 校验。源文档仍在时继续原控制；源文档本身消失时，释放旧 WS、取消目标的交接资格，shell 在 Engine 中继续。新文档重验后按正常规则重挂，不能沿用失效确认或挤掉现任控制者。 |
| 已提交后失去回执、目标 reload 或关窗 | 先以交接结果和当前绑定对账。main 只保留该窗口的非秘密业务地址及已提交归属，旧交接凭证失效。reload 的目标重新核验同代 shell 并附着；已有其他控制者时只观察。关闭目标窗只解绑它的视图，存活的源窗可恢复该 Pane 的入口，默认先观察，用户可按既有规则重新取得空闲控制。源窗在成功后先关闭时，目标继续工作。 |
| 关闭一个有未保存内容的窗口，或全应用退出 | 沿 `requestWindowExit/canCloseWindow/before-quit`：第一个 close 事件可被取消，不能把它当成窗口已销毁。用户选择保留时恢复 inert 和既有焦点；实际销毁才清除已提交窗口归属。应用退出时逐窗确认，全部放行才停止 supervisor；退出处理中禁止开新交接窗。Linux/Windows 最后一个窗口关闭会 app.quit，这条路径及显式退出之后只能按 W06 重连。 |

显示归属跨 reload 的寿命限于这一轮 main 与 Engine。已移出的源 Pane 再进入工作区时仍应读取该归属，避免通过 localStorage 的“最近工作区”再次自动请求控制。在两窗均存活但一个窗口切换模块时，取消该文档未完成的准备；视图丢失与用户显式“关闭分栏/结束运行”必须走不同处理。

## 建议 write set

下表按一次可交付改动列出，路径为固定候选中的现有文件；括号标明拟新增的单一职责文件。正式实施前可先用两只候选 socket 和第三个排队者，在已有终端桥测试中固定住竞争条件。

| 归属 | 文件 | 修改目标 |
| --- | --- | --- |
| main / preload | `apps/desktop/src/main/{index,window-chrome}.ts`、`apps/desktop/src/preload/index.ts`、`apps/desktop/src/renderer/env.d.ts`、`packages/workbench/src/settings/host.ts`、workbench 现有类型导出入口 | 让 createWindow 在 load 前登记并接收一次启动目标，抽用已登记窗口/主文档校验。增加可选的工作区窗口宿主、小型严格消息类型与有限期状态（可放单文件 `apps/desktop/src/main/workspace-window.ts`）。答复绑定 sender、frame、窗口及 Engine 本次启动。保留 #3 的 chrome、恢复、关窗/退出握手。 |
| renderer / SSH 视图 | `apps/desktop/src/renderer/main.tsx`、`plugins/ssh/src/ui/{index,SshModule,WorkspaceLibrary,WorkspaceRunView}.tsx`，按需向 `WorkspaceCanvas.tsx` 传入本窗插槽显示信息 | 就绪后读取并消费启动目标，尊重导航结果；用原运行/分栏 ID 打开目标，优先级高于设备“最近运行”。单 Pane 投影只挂指定终端，其他终端不进入该窗广播列表。源端占位、取消、可恢复入口及目标焦点均在视图层处理。 |
| 终端及宿主通道 | `packages/ui/src/components/TerminalView.tsx`、`plugins/ssh/src/engine/{terminal-bridge,index,workspace-runs}.ts`、`apps/engine/src/boot.ts` | 以可选回调传递已附着角色和请求焦点；在现有 SSH bridge 定向切换角色，核验同一运行与活 shell，限制为桌面远端 SSH 视图，清除超时/关闭事务。由现有 desktop/Web 封装标记通道来源，保留原 WS URL 与 Agent/本地 PTY 行为。SshTerminal 已透传 TerminalViewProps。 |
| 证据 | `plugins/ssh/test/terminal-runtime.test.ts`、`tests/e2e/ssh/remaining.spec.ts` 或同目录单一换窗专测、需要新增隔离断言时用 `tests/e2e/window-chrome.spec.ts` | 桥测试证明比较交换与取消；一条真实产品按钮驱动的串行 Electron 链证明两窗打开、焦点、字节流和回收。已有 `tests/e2e/workflows/ssh-workspaces.spec.ts` 与 `tests/e2e/knowledge/session-flush.spec.ts` 提供重挂/重启与关窗对照。 |

该方案使用现有 Electron 与 xterm，无需新增原生依赖、多窗口框架、通用开 URL 的 IPC、第二个 Engine 或持久化 schema。H4.3 没有要求重建 ShellManager、SSH 鉴权或 #6 的外部工作区控制接口。

## 串行 E2E 观察点

在同一 ElectronApplication、隔离的临时 Vault、两个受控回环 SSH 主机 A/B 中顺序验证。通过 UI 创建实际运行，再通过 UI 触发移动；main 侧仅观察窗口和注入受控失败。不要在成功路径通过测试直接 new BrowserWindow。等待明确事件或 UI 状态；在点击前注册 Playwright 的新窗等待，避免将已存在窗口认成目标。

1. **建立基线。** 双 Pane 都 ready，选择第二个 B，并让“最近运行”指向另一运行或关闭恢复偏好。记录 runId、generation、layoutRevision、两个 paneId/sessionId（SSH shellId）、connectionId、每台 TCP 接受数、PTY 开启数、登录命令次数。connectionId 用现有连接状态或绑定到 shell 的文件来源取证，不从 hostId 猜测。在 B 写入一段有独特标记的输出，保留相邻 A 终端及已开文件或借用的转发/监控作为对照。
2. **真实两窗。** 点 B 的移动动作，记录两个不同的 BrowserWindow/webContents ID。同一 Vault、同一 shellId/connectionId、同 generation；目的窗口可见 B 的历史标记和随后持续产生的新输出。源 A 仍能输入；源 B 已解绑且退出快捷/广播目标。目标原生窗口被聚焦（Linux/Xvfb 记录窗口管理器状态），目标 renderer 的 activeElement 位于对应终端，直接打入唯一标记并只在 B 的远端输入中出现一次。改变两窗大小，B 的远端只收到现控制者的 resize。核对 0 次额外 SSH、PTY、登录命令和结构写入。
3. **竞争与只读。** 先让第三个已授权视图排队，再移动；记录源/目标/第三方的 mode 和实际输入计数。只有目标能够写，源迟到帧、第三方 resize 均计零。锁定源后重复，目标可读且输入/resize 为零，既有控制者不受影响。Web 入口仍可查看远端工作区，既没有原生动作也收不到本机移窗凭证；预览 iframe／恢复页不能调用该窄桥。
4. **提交前失败。** 分别取消、投到无效位置、令目标无法加载、在目标附着前关窗、用同名另一 Vault、旧代或错误 shell 制造不匹配。对每例检查源焦点/写权限、原结构、远端可达性和第三方均不变；无新增连接、通道及残留交接。模拟同一请求双击、旧文档迟到 ACK，在源窗能观察原尝试的最终状态。
5. **关窗与 reload。** 在准备中及提交后分别 reload 源窗和目标窗，分别关闭单窗（保留另一窗），记录实际回收的 socket。源窗有未保存内容时走一次 #3“保留窗口”，再次关闭才确认。故意丢一次提交回包，断言没有二次夺权、重复 shell 或重拨。若目前没有控制者，可重新从运行列表进入 B；若另有写者则恢复成观察。A 的文件/监控/转发和两个连接继续工作。最后才显式结束 B 的 Pane，检查仅 B 的 shell 结束。
6. **进程边界。** 另一步执行真实全应用退出/重开，同一结构呈 reconnect。明确点重连后 generation 与 shellId 更新，记录新拨号次数。与仅重载 renderer 的不变 ID 并列，分别证明 W06 两种情形。输入、网络计数、焦点和生命周期事件是验收依据；截图辅助说明界面。

## 查阅和观察边界

- #3 资料核对 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-3-desktop-shell/tasks/{S1a-02-retry-close,S1b-01-window-host}.md`。#7 本次核对的是同一个固定 Git 对象中的原文、规划、源代码与既有测试。上游只比对换窗与失败回退的行为。
- `apps/desktop/package.json`、已安装的 `apps/desktop/node_modules/electron/{package.json,electron.d.ts}` 与 Electron 官方发行页对应 44.9.1、Chromium 152.0.7977.167；核对了 BrowserWindow 的显示/聚焦、webContents 的失败加载、进程退出、跨文档导航事件。原生 ready-to-show 反映画面可显示，业务附着仍须独立确认。[Electron 44.9.1](https://releases.electronjs.org/release/v44.9.1) · [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) · [webContents 导航事件](https://www.electronjs.org/docs/latest/api/web-contents#navigation-events)
- 本次仅生成本报告。未启动 Electron、SSH、浏览器或回环夹具，未执行测试或构建。窗口管理器前台激活、目标可输入时刻、断网后同一 shell 的可用性均未作现场观测。

### Modern Web Guidance

我用本机缓存的 modern-web-guidance 执行了 search 和 retrieve，查阅 `accessibility` 与 `move-dom-element-without-losing-state`。焦点验收分别检查目标终端和取消后的原控件；跨 renderer 通过 Engine 重挂。此次没有前端代码改动。

## Lead 验收

由 Lead 追加。

Lead 已核对选定的窄窗口宿主、既有终端附着和单写者控制机制。接受架构交付。跨窗业务装配和真实 Electron 验收仍待实现。
