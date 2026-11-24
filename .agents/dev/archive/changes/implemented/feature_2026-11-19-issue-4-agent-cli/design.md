# #4 工作区结构与 Agent CLI 执行边界

## 当前 checkout 的调用链

以下为 2026-11-19 对 `feature/issue-fix@9f870c0` 的静态检查。两个 Issue 的 Huhu 引用固定于 `9132640`。两提交间 Agent CLI、herdr-client、Automations 和 Core 锁文件没有差异；桌面 main/preload、设计规范、Kernel 权限、TaskDetail/TaskEditor 等已有改动。实现前按符号重新定位。

| 当前入口（仓库根相对路径） | 实际行为及复用边界 |
| --- | --- |
| `plugins/agent-cli/src/ui/AgentCliModule.tsx` 的 launch → `agent.sessions.launch` → setActive；`ui/split-layout.ts` 的 fillCells；SplitView、LaunchMenu | session 倒序列表兼作 tab，active 优先填格。全局 huhu.agentcli.layout 只记 1/2/4，launcher 使用 static，分栏固定高度。此链解释位置漂移，其他渲染问题待实机复现。 |
| `plugins/agent-cli/src/engine/index.ts` 的 apply → AgentDetector.detect → resolveAgentLaunch → SessionsService.launch → HerdrCore | detect.ts 探测路径和版本，探测返回 null 仍可能 installed；launch.ts 构造 interactive/headless 的 command、argv、env overlay。sessions.ts 先验证 Space revision，按 requestId 合并并写记录，terminal.run 带 huhu.vault/space/session/launch labels；响应异常后 list 失败的 n=-1 当前落为 failed。同 ID 尚缺内容匹配。 |
| `plugins/agent-cli/src/engine/spaces.ts`、settings.ts、sessions.ts、pins.ts、history/scanner.ts | 当前 apply 把 Space JSON、agents.json、sessions 和 pins 放在 vault.stateDir 下的 agent-cli 域，Core 路径另按 runtime/machine 隔离。HistoryPanel 用 !active 筛选恢复，行操作只有 session 回调；Claude/Codex 扫描已存在。配置 env 有明文路径，shell envRefs 仍取 secretUse。 |
| `packages/herdr-client/src/client.ts` 的 hello、attachTerminal、subscribeEvents；`plugins/agent-cli/src/engine/terminal-bridge.ts` → `packages/ui/src/components/TerminalView.tsx` | 已有合法 socket/pipe、分帧、事件订阅、CREDIT、xterm/FitAddon、ResizeObserver。hello 的模式切换在 await 后；attach 独立连接，桥缓存未 attach 的输入并按 WS bufferedAmount 控制 credit。Core 断开经 closed 消息进入 ended，viewer 的 WS 自断另走 lost。消费反馈、终端真实退出和模型回执仍需接通。 |
| `apps/desktop/src/preload/index.ts`、`packages/workbench/src/engine-client/client.ts`、`packages/kernel/src/server/http-app.ts` → `apps/engine/src/boot.ts` | 桌面用 window.huhuHost 获 Engine 信息/目录选择。能力经 EngineClient 和 Dispatcher，受控 /ws/terminal 路由按 session 分发 terminalBridge:agent 或 terminalBridge:ssh。目前 Web 工作台及浏览器授权终端由 #6 补齐。共享 UI 通过宿主接口获取能力，Web 选择 Engine 主机目录，保留浏览器独立入口。 |
| `engine/waiting.ts`、review.ts、SessionsService.sendComments | 已有 blocked 观察、等待处理、评审意见的 sending 标志和结果未知处理。自动化 Agent 当前只复用 resolver，执行另走 supervisor；任务绑定终端须接到下述统一合同。 |

## 选型与状态所有权

布局可放在 Vault 文件由 Engine 统一写，也可将每台机器的结构交给 Core 文档。选用 Issue 指定的后者，接入既有订阅、CAS 和跨视图镜像。前者虽便于文件备份，却要再实现 Core 客户端间的协调。代价是 Core 文档不可用期间只能看最后确认状态，备份/重置须覆盖隔离 Core 的实际状态目录。每机至多一个结构写在途，先订阅再 get，set 携带已接受 version；冲突、missed、重连均重新读取。只读 Vault 的临时 stateDir 标明生命周期，不宣称永久保存。

| 身份 / 事实 | 唯一写入者与持久边界 |
| --- | --- |
| Vault + machine → Space → 有序 Tab → 递归 Pane 树 | 工作区服务提交到 Huhu 私有命名的 Core 文档。每 Tab 一棵树，节点用稳定 ID、轴、子树和 ratio。保留 Space 公共 façade；布局版本与目录配置 revision 分开。显式工作目录、实时 cwd 和启动快照各自独立。 |
| 焦点、zoom、settled tabs、最近 Space | 本视图的 Vault/machine/window 偏好，重连按存活 ID 恢复。turn 对应的 seen 与 pinned 属于 Core 共享 labels，缺 seen 才用本地规则。 |
| Huhu session、启动 operation、Core address、执行代次 | Agent CLI 持久化启动/输入凭据、归属及原生映射。Core 拥有进程事实、foreground、父子关系、grid、viewer 和序列。session 与 pane 可分别移动或结束。 |
| 原生历史与收藏 | provider 文件是原生会话资料源；Huhu 记录来源/机器、原生标识或 transcript 引用和 pin。只读预览不执行历史内容。 |
| 待派事件、任务轮次、问题、业务完成与评论 | Tasks 持久写入。Agent CLI 只保管受理、执行绑定、发送证明和待交回回执；Automations 只拥有触发与时间。详见 [#5 数据与恢复](../feature_2026-11-19-issue-5-task-automation/design.md)。 |

**重开、备份与重置。** 普通重开按 vault.stateDir/runtime 下本机隔离目录恢复 Core 文档。当前 `packages/vault/src/package/package.ts` 的 EXCLUDED_HUHU 排除 runtime；`plugins/versioning/src/engine/sync.ts` 的 HUHU_INCLUDE 列有旧 agent-cli/spaces/。切换时一起更新这两个消费者的范围说明和测试。数据包是否包含布局见文末待决项；若包含，只能通过 doc.get 取已接受 version 的结构副本，恢复时验证目标机器、目录和身份后显式导入。活进程、凭据、restart_env 和原生历史都不能随布局副本启动或重现。重置只处理专用布局文档和本视图偏好，先展示影响；独立运行记录和原生文件仍可查到。

协议可沿用“每个 attach 一条连接、桥自行选控制者”，或迁入 app 的单一握手/多路 channel 调度。推荐后者，Engine 的唯一客户端承担 generation/feature、事件序列、重连、每流消费 credit。付出通道隔离、先到帧缓存和建立连接失败时的整体恢复成本。底层可用隔离的 hc connect 或等价 socket/pipe，以同一协议套件判定。Core 负责真实 viewer/grid；Agent CLI 的业务输入仲裁负责“这个任务/人在此轮能否发”，只读 viewer 始终禁止输入及抢尺寸。

## 两个调用场景

1. **从右叶子启动交互 Agent。** 桌面已授权执行，传入 (Vault V、机器 M、Space S/rev3、Tab T、leaf P、向右、operation O、导航代次 G) 和显式或继承目录。Engine 检查权限和版本，冻结已解析的启动意图，建立可找回的 operation，Core 返回地址后提交结构绑定。结构 CAS 冲突先核实 O/P；P 已关仍登记原 session 供找回。退出登录提示仍可交互；同 O 改 provider 返回冲突。右侧失败占位显示 detect/resolve/cwd/run/attach 等具体阶段及脱敏 hint。切 Space 只影响当前焦点。
2. **回复正在工作区等候的任务。** Tasks 已持久接受回复，经受信 Dispatcher 发送指定 dispatch、task/run、request/version、期望进程及 inputHash。Agent CLI 在同 session 仲裁，先比对绑定和 CLI 代次，再取得输入所有权。busy 返回待派；只报告 blocked 的 provider 给“前往现场”。接管归还时再核实原实例。支持的适配器以相同 receiptId 重交回执，Tasks 持久接收后补评论一次。若 Core 已将该地址恢复成 shell，inspect 返回原实例丢失或未知，保留原任务和可显式 resume 的资格。

## 两个 Issue 共用的执行合同（拟议）

此节是 Agent CLI 对 Tasks、评审及人工现场的接口定义。能力名为设计名，落地时由 #4 维护 Agent 侧的公共契约、handler、版本化 DTO 及错误语义。#5 维护 Tasks 侧受理及投递；#6 复用这些 handler 决定外露范围，受信执行回传与用户工具分权。

| 操作 | 输入、回执及重放语义 |
| --- | --- |
| agent.targets.list | 限当前 Vault/machine/Space，返回 provider 的 new/existing/resume、结构化 reply/result、取消/现场处理能力及证据或不可用原因。枚举只读。 |
| agent.runs.dispatch | 传 vaultId、taskId、runId、attempt、dispatchId、有序 eventIds、inputSnapshotRef/hash、调用授权和去敏配置身份。目标为 new（spaceId/revision、provider、冻结配置）、existing（spaceId、sessionId、期望 binding）或 resume（spaceId、provider、机器/来源、原生引用及冻结目录），三选一。Agent 先落盘规范化内容指纹及 operation，返回 accepted/busy/unsupported/unknown 或明确错误。accepted 提供持久凭据与已知绑定；尚未取得的地址/原生身份显式为空。可继续 inspect。 |
| 发送与回复 | 同 dispatchId/replyId 同内容返回原凭据及当前事实，超过 Dispatcher 缓存期仍有效。比较绑定、目标、快照、动作和参数；同键异载荷为 conflict。权限重新校验。按受理、输入已写、provider 已接受、轮次结果分别记事实。写入前持久标 sending；断线未确证则 unknown，只有证明未发生才允许重试发送。busy 等资源不新建任务队列。 |
| agent.runs.inspect / cancel | 精确匹配 Vault、机器、task/run/attempt、session、Core address、provider 及当前进程代次。取消携带稳定取消意图和预期绑定，串行于派发/人工接管，先判未发送、已终止、仍属本轮或证据不足。分别返回取消待发、已有终态、已申请中断或不可安全中断。确认停止前保留占用；并发完成先持久回执，晚到取消读取原结果。禁止仅凭 address 杀进程；人工控制/绑定已变则拒绝。 |
| agent.runs.report / 受控适配器 | 绑定本次执行的凭据验证 receiptId、runId、attempt、sessionBinding、kind 和 payload。progress/question/result/no_update/failed 分开；普通问题与原生 deferred 请求有不同类型及版本。适配器在 Agent 接收端离线时持有可重交结果；Agent 持久接收后才给适配器 ACK。Tasks 的 ACK 以同 receiptId 持久消费且可重建 delivery 为条件，之前由 Agent 重送；同 ID 异内容冲突。格式错误只修回执。 |

**故障时的不变量。** 先查长期凭据再创建副作用；单 session 同一时刻只允许一个输入 owner，session.running 不能证明模型可收正文。Core 创建后响应丢失按 launch/Vault/Space/session labels、地址及执行代次对账。唯一可信匹配才认领；多匹配、查询不可用、spawn_pending、仅查到零个但仍可能启动分别留存证据。只有确定未创建才可重试。Core generation、原进程代次和 provider 原生 ID 分开验证；没有可靠信号时关闭自动发送能力。恢复 shell、对账失败、回执缺失、正常退出与业务成功均有独立结果。错误返回阶段、kind、可采取动作、关联 ID 和是否可重试；敏感正文、凭据、完整 env 不进普通日志。

**带秘密和带目录的请求。** 配置快照关联所属模块的秘密项及版本，普通快照只见标识/已配置状态。单次秘密只在本次授权执行期间交付；丢失后要重新提供，旧 dispatch 的未知副作用仍先对账。验证 Core 对 restart_env 的实际落盘行为，含秘密的运行应选能避免长期残留的受控启动/结束方式，在真实结束后按 hasEnv 等持久标记清除可恢复环境记录；清理失败留可重试状态，不提前删除活终端或遗失业务回执。现有 SessionsService.doLaunch 限 command+env 于显式 shell 路径，provider 使用 resolver 的 overlay；现有显式 cwd 还有 realpath/Space 范围校验。跨宿主传入的目录始终指 Engine 机器，必须按来源、选中目录及授权校验。preview 不能创建终端、触发秘密 reveal 或隐式扩大权限。

**协议验收边界。** 保留 plain hello 换行后的原始二进制，再转 framed；测试半帧、合包、早到流、16 MiB payload 上限及初始 256 KiB credit（按选定产物再核）。xterm 实际消费触发 CREDIT，慢 pane 不堵 channel 0。attach 前累计字节/时限有界，超限明确拒绝。区分用户 DATA 与协商后的 AUTOMATIC_INPUT，发送真实 FOCUS/FACTS/RESIZE；观察者按 Core 通知重绘。订阅保留 snapshot/seq/heartbeat/missed，新代次丢弃旧事件。单纯 detach、lost、finished/killed、kept→新 shell 各自可见。

## 来源和平台依据

- Huhu 以当前检出为实施基线，复用 Space 校验、resolver、SessionsService、WaitingWatcher、受权终端桥、文件与评审入口。Huhu 为 GPL-3.0-or-later，xterm 6.0.0 为 MIT。各上游本轮采用的默认分支与完整提交见[批次源码清单](../feature_2026-11-19-huhu-issues-3-10/sources.md)，Issue 内固定链接用于追溯。
- herdr-app `master@317e673f1f15` 和 herdr-core `master@c7517808d64f` 均为 Apache-2.0。工作区状态与同步参考 `src/model.rs`、`src/mirror_sync.rs`，Core 对照 `schema/hc.openrpc.json`、`crates/herdr-core/src/api/run.rs`。Huhu 的打包锁为 0.1.19，本批调度用 hc 为 0.1.21。W0.2 要在声明支持的实际安装包核验 feature、父子进程与收纳后的存活。
- ORCA `main@8bc232f5ed8b` 的本地 LICENSE 为 MIT。已定位 `src/shared/workspace-layout/terminal-topology/terminal-pane-tree.ts` 的 `insertLeafBeside`、`removeLayoutLeaf` 和 `equalizeLayout`：左右对应 vertical，上下对应 horizontal。创建与恢复定位到 `SplitPaneLanding.tsx`、`TabBarCreateEntry.open-focus.test.tsx` 和 `agent-resume-launch-command.ts`。W0.1 追踪本次版本的导入及测试闭包。Huhu 使用自己的导航、组件、主题、图标和文案，只对照授权代码、功能和信息结构。
- 共享前端已检索并取回 tabs、css-layout、dialog、accessibility。按 Huhu 组件实现锚点、焦点回归、选中状态和弹层。长标题的 flex 子项可收缩，隐藏 pane 不报零网格，Tab 的键盘行为有 roving tabindex 回退，避免依赖 focusgroup。桌面锁 Electron 44.9.1 对应 Chromium 152.0.7977.167；Web 以 Baseline Widely available 为下限。原生 modal dialog 可用，新增子属性须单独查证。待实测 Electron appInfo 和 #6 浏览器入口。[Electron 发布记录](https://releases.electronjs.org/release/v44.9.1) · [Web dialog 支持](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) · [Huhu 视觉规范](../../../../notes/context/design-system.md)

## 待产品选择

> 2026-11-21 用户采纳本表全部推荐项，定案见[批次决定](../feature_2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md)。


1. 进程已真实启动、目标 pane 已被关闭、当前用户已离开原 Space；Issue 已要求可找回和不抢焦点。可将进程保留在原 Space 的终端列表，提供“放入此 Tab”；也可在原 Space 后台自动补建独立 Tab 并提示。推荐前者，减少系统擅改布局，但用户需要一次收纳操作。普通 shell 同样须可找回。只阻塞 W2.2 的失效目标展示和相应原型确认。
2. 当用户从 Vault 数据包恢复时，是否也希望恢复分栏结构？推荐纳入已保存的纯布局快照，代价是异机失效目录、未绑定终端要有明确展示；也可维持本机布局只在同机重开恢复，数据包界面说明排除范围。前提为现有包排除 runtime，且 Core 文档始终是运行时的唯一写入目标。只阻塞 W8.1 的布局入包验收，W2 的本机持久化和 CAS 可先做。

ORCA 本轮检出可读。父子生命周期、provider 代次和实际包的特性仍需在 W0.2/W1/W6 取得运行证据。
