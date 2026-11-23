# #7 SSH 运行对象、凭据与移植边界

本设计只针对用户已获授权的主机、账号及本地开发客户端。外部入口遵守 [#6 的调用与授权合同](../../archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/design.md)，SSH 独立认证与 [#9 模块存储合同](../../archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/spec.md)对齐。目标体验见[规格](spec.md)。

## 已核对的实现与来源

当前 checkout 为 `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`，Issue 固定 Huhu 为 `913264045cee1818497a37a57715c664aa85a1ae`。两提交间 `plugins/ssh` 无 Git 差异，公共宿主已有变化。下表中的 Huhu 路径均相对仓库根。

| 当前实现 | 从入口追到的行为 |
| --- | --- |
| `plugins/ssh/src/ui/SshModule.tsx`、`FilesPanel.tsx` | 组件局部持有 connected、prompt、activeShell，监听 ssh.hostKeyPrompt；已有终端列表/TerminalView，但页面重开不能据此还原等待项。FilesPanel 把上传和下载文件作为 Engine 路径。 |
| `plugins/ssh/src/engine/index.ts` 的 apply、`hosts.ts` 的 HostStore / findJumpCycle | apply 登记能力、构造 HostStore/SshManager 并提供 terminalBridge:ssh。manifest 列 21 个动作，均采用 desktop 常量，optionalDeps 有 safe 与 agent-cli，settingsPages 为空。HostStore 对已存主机校验跳板引用/环，逐个 JSON 保存，以 secretRef/passphraseRef 指向 Safe。损坏 JSON 在 list 中被略过，保存接口缺实体版本。 |
| `manager.ts` 的 connect / doConnect / decide / attachShell / disconnect / disposeAll | 并发连接按 hostId 合并，已连接时给出 existing，成功才返回 attemptId。等待回调按 attempt/hop 保存在内存。`known-hosts.ts` 区分首次和密钥变化。Shell 各有 channel、最近 64 KiB 输出；WS 桥用 controllers 仲裁。disconnect(hostId) 会影响该主机全部 Shell。插件 effect 清理 disposeAll。 |
| `sftp.ts`、`manager.ts` 的 withSftp | 单 host 一次传输，预览 2 MiB、传输 512 MiB；有临时文件、覆盖、取消、替换降级与错误处理。现有读文本预览和 Motty 可编辑文档的上限是两个概念。 |
| `packages/ui/src/components/TerminalView.tsx`、`apps/engine/src/boot.ts`、`packages/kernel/src/server/http-app.ts` | UI 用 xterm；boot 按 session 标识转交 SSH 或 Agent bridge，WS 受桌面身份限制。现有桥通往真实 shell。HomeWidget 可作 #10 的消费入口，挂载 Widget 不应主动建立连接。 |
| `plugins/agent-cli/src/engine/herdr-core.ts`、`scripts/fetch-herdr.mjs`、`apps/desktop/scripts/before-pack.cjs` | 可参照固定版本、SHA-256、平台资产及缺件失败的交付流程。HerdrCore.dispose 的 detach 语义与 SSH 卸载不同。打包矩阵见 `apps/desktop/electron-builder.yml` 的 win32-x64、darwin-arm64、linux-x64。 |

开发对照为本地 `temp/sources/motty` 的 `main`（origin/HEAD，`2daa9db582e16edf60a60b7ada26f47f808f973c`）。本次在该提交核对了 `internal/sftpclient/worker.go`、`internal/portforward/forward.go`、`internal/workbench/workspace_launch.go` 与 `go.mod`。Motty 的 go.mod 声明 Go 1.26.11，并通过 `replace github.com/vivaui/viva => ../viva` 使用同级 [Viva 源码](../../../../temp/sources/viva)。Viva 的完整工作树已检出，版本为 `main@a5da67aa63440ee836c37a5aa1c70e3eb317401c`，其中包含 [leaks 实现](../../../../temp/sources/viva/leaks/leaks.go)与[许可证](../../../../temp/sources/viva/LICENSE)。见[批次源码清单](../2026-11-19-huhu-issues-3-10/sources.md)。本次未构建或运行执行器。锁文件和第三方声明中，现有 ssh2 1.17.0、xterm 6.0.0 均标 MIT；优先保留 Huhu 的终端渲染、领域注册、Vault、事件与 UI 组件。Motty 固定 SHA 为 `102228261703d8f22c5eb98b1c500e2a24889dee`（v0.4.12）。下表固定链接保留上一轮来源追溯。H1.2 用这两份现有源码验证候选组件能否构建和运行，H12.2 核对实际分发文件及其许可。

| 来源样本 | 已核对的内容与实施落点 |
| --- | --- |
| 连接与转发 | sshconn 使用 Go SSH 库并描述认证阶段；portforward 的 Config、Status、Start 可作为规则运行语义依据。拟由 SSH 插件私有执行组件承接。[连接源文件](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/conn.go) · [转发源文件](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/portforward/forward.go) |
| 文件与原生依赖 | sftpclient worker 有 TransferSnapshot、冲突/提交语义，并直接引用 Viva leaks；go.mod 把 Viva 指向同级 ../viva。提取前要测清这处生命周期依赖的替换成本。[worker](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sftpclient/worker.go) · [go.mod](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/go.mod) |
| 工作区与监控 | Presets、LayoutSpec.Validate 与 launchWorkspace/rollbackWorkspaceLaunch 对应布局约束与失败回收；monitoring.ValidInterval、ValidRetention 和内存历史支撑取样要求。[布局](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workspace/spec.go) · [启动](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/workspace_launch.go) · [历史](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/monitoring/history.go) |
| 品牌、许可证与资产 | Motty 根 LICENSE 是 Apache-2.0。NOTICE 单列 ConPTY、配色、图标和其他组件；ConPTY 的 NOTICE 有版本、哈希和独立 MIT 声明。Huhu 使用自有品牌。未来实际复制项须在现有 docs/upstream/ledger.md 逐文件列所用默认分支提交、来源、目标、复制/改造/行为复刻、修改说明及第三方通知。Viva、图标、配色及原生再分发材料按选用文件核对。Viva 已在本地，逐文件许可与各平台分发核验尚待 H1/H12。[LICENSE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE) · [NOTICE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/NOTICE) · [ConPTY](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/localshell/conpty/NOTICE.md) |

其他导入器、终端协议、Server Tools、SCP、本地 PTY 与设置的固定来源在 [Issue §14 与索引](source.md)。这些条目仍需针对实际采用文件核对源码、测试和依赖；本轮引用上游截图只用于定位待比对场景。

## 两个实际合同

**修改开发主机并从另一个入口确认连接。** 主机编辑输入 hostId、expectedVersion、非秘密字段与认证补丁，未提供的秘密保持，显式替换/清空分别编码。SSH handler 校验资源归属和版本。成功返回 hostId、version、authKind、configured，发布实体变更。未知或格式非法的 ID、并发冲突、受保护存储不可用有独立错误，失败后旧配置仍可用。连接时仅提交已授权 hostId 与意图 key，即刻返回 attemptId 及当前阶段。新开的用户会话按 attemptId 读快照；待答项绑定一次性 promptId、hop、类型、指纹或问题、有效动作与期限。响应时复核主体/资源、代次和状态。拒绝、逾时或指纹变化给出带 hop 的结束原因。成功产生 connectionId。关闭等待窗口仅离开视图。持久凭据的所有者是 SSH，首次信任只在用户的有效决定后写入。

**场景二：从会话 A 的独立 SFTP 窗口下载一个项目文件，然后切换到 B。** 操作输入 fileSessionId、远端文件标识、目标设备类型、覆盖选择和意图 key。引擎检查来源绑定、权限和路径，登记 transferId。浏览器下载使用用户设备的流，桌面可显式选 Engine 路径，CLI 本地文件由客户端读写。任务快照给出阶段、已传字节、总量（未知时留空）、冲突、可执行动作与终态。切换活动 Pane、关窗重开均查同一 transferId；B 不能改写其目标。取消、目标版本变化或校验失败保全原件。连接中断后只有经同一传输确认的前缀才能续传。完成标志在成功提交目标后产生，客户端保存状态可与服务端传送状态分别表达。

**工具输出和任务保留。** 来源 §12.1 中 Motty 的窗口 HTTP 用 session ID 取可见终端，独立 stdio 的 list_sessions 指保存的 host。两者都有后台 job，stdio 另有文件校验和异步传输，窗口端有可见回滚输出。Huhu 在公共目录分开主机/会话/作业，按 UTF-8 字节游标返回 nextCursor、skipped、truncated、结束原因和可空的退出码。快照有会话归属；相同 token 的不同 MCP 会话不得据猜到的 jobId 查看或停止对方作业。断线重取需恢复到已验证的资源归属。对照基线为 stdio 同时 8 个命令、保留 64 个，传输 4 并发/32 历史，HTTP 已完成作业保留 10 分钟。Huhu 若调整上限须记录实际限制、过载反馈及过期后的返回结果。[上游行为对照](source.md)

## 唯一执行层的选择

| 候选结构 | 对两个合同的影响 | 代价 |
| --- | --- | --- |
| **首选验证** 提取 Motty Go 核心，在 SSH 插件/Vault 生命周期内作为唯一私有进程。TS 留下主机/凭据、审计、公开 schema、事件和 DOM 适配。 | UI、CLI 与适配器看到相同的主机版本、等待项及传输。可以复用已有协议/文件完整性行为与测试。 | 新增构建、三平台资产/校验、IPC 版本与崩溃清理；同级 Viva 已满足源码路径要求；构建时核对实际引入的包，分发时核对原生资产及许可。 |
| 保留单一 ssh2 管理器，按固定行为逐域适配 Huhu 并复用成熟库 | 保留 Node 侧管理与测试，缺少的导入、文件续传、连接共享、终端能力需逐项给出复用来源和对照。 | 打包变化小，但协议特性差异及重写量可能大。只有提取实验给出具体失败和替代的实测结果，才按受影响功能重新评估。 |

拟议 Go 边界使用插件私有 IPC。启动协商版本与功能集；请求携带 Vault 运行代次、操作/实体 ID，响应有状态、错误码及可重取的快照；字节流与控制消息分开，关闭期间拒绝新操作并有界清理。只由一个运行层持有连接池、作业及监听器。旧 ssh2 与候选仅在隔离验证中对照；整合切换时随全部调用者替换旧路径。来源 §13–14 的限制包括不搬 Motty 全局 SQLite、AIHub/MCP 服务、应用外壳或更新器。授权的桌面业务通道已有 Dispatcher。

## 资源与并发不变量

| 所有者 | 对象、事件和恢复行为 |
| --- | --- |
| Vault 中的 SSH 配置 | Host/Key、Route/Proxy、ForwardRule、WorkspaceTemplate、MonitorPanel 等以稳定 ID 和 revision 保存；机器布局/路径与可迁配置分开。规则保存不拨号，仪表盘保存不开始采样。冲突返回现版本和依赖对象，重命名/移动不改 ID。路由编辑在同次写入校验所有引用与无环条件。 |
| SSH 私有凭据 | 以稳定 Vault 身份、模块、实体及凭据版本隔离。建议先落受保护的新凭据版本，再原子提交指向它的配置，成功才回收旧版；失败保留旧引用，重启按已提交引用清理孤立临时版本。运行中不得跨新主机/账户误发前一个目标的凭据。明文不进入 Git、常规包导出、审计、幂等结果或模板；备份内保留的密文与本机解密钥匙分离。跨机缺钥匙给出重新配置状态。实际平台存储及新格式备份恢复边界与 #9 对齐。 |
| 私有执行器/SSH 领域 | Attempt 在任何请求到达客户端前已有可查询记录；连接保存发起时实际路由及认证版本。首次信任与密钥变化分开。Host 可有多个 Connection；共享只在兼容连接身份下发生，用户、端口、认证、路由版本变化不得误借旧连接。Shell/Job 单独标识，输出按有界游标读取，返回 nextCursor、截断及结束原因，退出码未知留空；查状态不再次执行。 |
| 工作区与终端控制 | WorkspaceRun 有独立模板/Tab/Pane 绑定，结构写成功后独立拨号。窗口迁移只解绑/重绑视图。每个 shell 最多一个控制者；桌面、Web、CLI 和工具共享仲裁，观察者不可改 PTY 大小。一个 Pane 关闭释放它拥有的 shell；显式断开 Connection 结束其所属 channel 和借用者。进程重启的重连产生新代次。 |
| 文件、转发与监控 | FileSession 固定连接；Transfer 的暂存、提交、取消和校验单独追踪。ForwardRule 与 ForwardRun 分离，同一活动实例/监听不可重复创建；多个规则可持有专用连接，最后一个释放才关闭。借用连接不延长所有者生命周期，断连仅在显式 Resume 下重建。MonitorSubscription 共享来源/计数，停止一个订阅不停止其他面板或终端。 |
| 插件关闭或 Vault 切换 | 禁新建→终结待答项、释放订阅/流/会话/监听器→停私有进程→公布终态。崩溃时旧对象标失联/unknown，按代次与已保存定义对账；已明确停止的资源不得被恢复。取消与完成竞争时，以已提交的终态为准。视图卸载仅释放自己持有的绑定。 |

外部授权每次使用 #6 的共同判定，资源 ID、调用主体及 Vault 代次须匹配。MCP 与 CLI 复用同一引擎和日志，重试使用同一意图 key，轮询/重复应答无新副作用。协议交互中的秘密输入和终端完整输出不进常规审计。Web 普通文件选择用来源明确的句柄；主题、DataTable、Dialog、TerminalView 及宿主能力来自 Huhu。桌面 Chromium 与 Web Baseline 的核对见 [#6 兼容性与宿主设计](../../archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/design.md)。

## SSH 产品决定与待决范围

> 2026-11-21 用户采纳本表全部推荐项，定案见[批次决定](../2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md)。


| 问题 | 选项与建议 | 前提与阻塞切片 |
| --- | --- | --- |
| Q7-1 删除仍被工作区/路由/转发引用的主机时，如何解决依赖？ | 建议列出全部引用，要求先移除或改绑，再允许删除。备选是一次预览并事务性级联解除；后者批量清理更快，但要定义空模板、停用规则和活连接的处理。 | 已明确引用稳定 ID、可解释依赖；仅阻塞 H2 中“被引用主机删除”的 UI 和验收。 |
| Q7-2 旧路由如何迁入（已结） | 未发布产品采用新路由模型，只保存目标→直接跳板。没有旧配置迁入、兼容解析或手工转存任务。八种第三方配置导入仍按用户主动导入的新配置处理。 | H2 验收外部导入，H3 验收新路由与双向同步；均只用合成数据。 |

共享的主机范围选择由 [#6 Q6-3](../../archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/design.md)维护。新 SSH 记录及其认证由 SSH 管理，不读取旧 Safe。新格式备份恢复使用合成资料。选用哪种执行器属于能力、许可和打包实验证据问题，见[实施计划](plan.md) H1。
